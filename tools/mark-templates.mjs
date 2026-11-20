/**
 * A mark-entry spreadsheet per subject, with the section's real roll numbers
 * already in it.
 *
 *   node mark-templates.mjs                 writes them into ../Mark entry templates
 *   node mark-templates.mjs --out "C:\\somewhere"
 *
 * THE LAYOUT IS THE APP'S, not a guess at it. Mark entry reads a spreadsheet
 * with parseMarkParts(), which looks for the first row carrying a roll
 * heading AND at least one column it wants, then reads those columns by name:
 *
 *   - a paper marked in parts wants one column per part (CQ, MCQ, Practical);
 *   - a paper marked out of one number wants Marks, Mark, Total, Obtained or
 *     Score, whichever the sheet used.
 *
 * Three things follow from how that parser works, and all three are used
 * here:
 *
 *   - A COLUMN IT DOES NOT WANT IS IGNORED. So Name and Group can sit in the
 *     sheet for the person filling it in, and the app never looks at them.
 *   - THE HEADING ROW DOES NOT HAVE TO BE FIRST. So row 1 says what the file
 *     is and row 2 holds the headings.
 *   - headingKey() STRIPS ANYTHING IN BRACKETS. So "CQ (70)" still matches
 *     the part called CQ, and the teacher can see what each column is out of.
 *
 * AN EMPTY CELL IS NOT A ZERO, in the app and therefore here. Every student
 * of the section is listed in every subject's file; a child who does not sit
 * this paper is simply left blank, and nothing is written for them. That is
 * why this does not try to work out who takes what — getting that wrong in a
 * template would quietly drop a child's marks, and leaving it to the blank
 * cell cannot.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { deflateRawSync, crc32 } from 'node:zlib';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHOOL = 'matkhola';
const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
// fileURLToPath, not url.pathname: a path with a space in it comes back
// percent-encoded otherwise, and "For%20Claude%20Project" is not a folder.
const OUT = outAt >= 0
  ? args[outAt + 1]
  : fileURLToPath(new URL('../Mark entry templates/', import.meta.url));

// ---------------------------------------------------------------------------
// an .xlsx, with the standard library
//
// A zip of five XML files. Written by hand for the same reason ocr/workbook.py
// is: a school's office machine should not need a spreadsheet library to get a
// blank form, and a dependency added for one file is a dependency for ever.

const XML = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Marks" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
};

const columnName = (i) => {
  let name = '';
  let n = i;
  for (;;) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
    if (n < 0) return name;
  }
};

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const cellXml = (ref, value) => {
  // An empty cell is written as nothing at all, which is how a spreadsheet
  // says "blank" and how the app's reader reads it.
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`;
};

const sheetXml = (rows) => {
  const body = rows.map((row, r) => {
    const cells = row.map((v, c) => cellXml(`${columnName(c)}${r + 1}`, v)).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<sheetData>${body}</sheetData></worksheet>`;
};

/** A zip, deflated, written by hand. */
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    const packed = deflateRawSync(data);
    const sum = crc32(data) >>> 0;
    const nameBytes = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0, 6);            // flags
    local.writeUInt16LE(8, 8);            // deflated
    local.writeUInt16LE(0, 10);           // time
    local.writeUInt16LE(0x21, 12);        // date: 1980-01-01, so files compare equal
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBytes, packed);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0x21, 14);
    dir.writeUInt32LE(sum, 16);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBytes.length, 28);
    dir.writeUInt32LE(offset, 42);        // where the local header is
    central.push(Buffer.concat([dir, nameBytes]));

    offset += local.length + nameBytes.length + packed.length;
  }

  const dirBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(dirBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, dirBytes, end]);
}

const writeXlsx = (path, rows) =>
  writeFileSync(path, zip({ ...XML, 'xl/worksheets/sheet1.xml': sheetXml(rows) }));

// ---------------------------------------------------------------------------
// the school

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const key = JSON.parse(readFileSync(new URL('./serviceAccount.json', import.meta.url), 'utf8'));
  initializeApp({ credential: cert(key) });
} else {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'schooltrack-1941' });
}
const db = getFirestore();
const school = db.doc(`schools/${SCHOOL}`);

const subjects = (await school.collection('subjects').get()).docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    || String(a.subjectName).localeCompare(String(b.subjectName)));

const classes = (await school.collection('classes').get()).docs
  .map((d) => ({ classId: d.id, ...d.data() }))
  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

const students = (await school.collection('students').get()).docs
  .map((d) => d.data())
  .filter((s) => (s.status ?? 'A') === 'A');

const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

mkdirSync(OUT, { recursive: true });
let made = 0;
// What each file expects the app to read from it, so the round trip can be
// checked afterwards without guessing at the headings.
const manifest = [];

for (const cls of classes) {
  const roll = students
    .filter((s) => s.classId === cls.classId)
    .sort((a, b) => (a.rollNo ?? 0) - (b.rollNo ?? 0));
  if (!roll.length) continue;

  // A subject is for this class when it says so. One that names no class at
  // all is taken to be for every class, which is what the app does too.
  const theirs = subjects.filter((s) =>
    !Array.isArray(s.classNames) || s.classNames.length === 0
    || s.classNames.includes(cls.className));

  for (const subject of theirs) {
    const comps = Array.isArray(subject.components) ? subject.components : [];
    const full = Number(subject.fullMarks) || 100;

    // The columns the app will actually read, labelled with what each is out
    // of. headingKey() strips the brackets, so "CQ (70)" still matches CQ.
    const markColumns = comps.length
      ? comps.map((c) => `${c.name} (${Number(c.max) || ''})`.replace(' ()', ''))
      : [`Marks (${full})`];

    const headings = ['Roll', 'Name', 'Group', ...markColumns];
    if (comps.length) headings.push(`Total (${full})`);   // for a person; the app ignores it

    const rows = [
      [`${subject.subjectName} — ${cls.displayName} — fill in the `
        + `${comps.length ? comps.map((c) => c.name).join(' and ') : 'Marks'} column`
        + `${comps.length > 1 ? 's' : ''}. Leave a box empty for a student who did not sit it. `
        + `"A" means absent.`],
      headings,
      ...roll.map((s) => [
        s.rollNo ?? '',
        s.fullName ?? '',
        s.groupName ?? '',
        ...markColumns.map(() => ''),
        ...(comps.length ? [''] : []),
      ]),
    ];

    const name = `${safe(cls.displayName)} — ${safe(subject.subjectName)}.xlsx`;
    writeXlsx(join(OUT, name), rows);
    manifest.push({
      file: name,
      wanted: comps.length ? comps.map((x) => x.name) : ['Marks'],
      rolls: roll.map((x) => x.rollNo),
    });
    made += 1;
  }
  console.log(`  ${cls.displayName}: ${theirs.length} subject(s), ${roll.length} student(s)`);
}

writeFileSync(join(OUT, '_what-the-app-reads.json'), JSON.stringify(manifest, null, 2));
console.log(`\n  ${made} template(s) written to ${OUT}`);
