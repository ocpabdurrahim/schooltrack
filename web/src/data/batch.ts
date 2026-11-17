/**
 * Reading a pasted list.
 *
 * Two jobs a school office does in bulk, and only in bulk: typing in a whole
 * section of students at the start of a year, and copying a column of marks off
 * an answer-script tally. Both already exist here one at a time, and one at a
 * time is right for a correction — it is wrong for forty students.
 *
 * Everything in this file is pure text in, rows out. Nothing here writes: the
 * screens show what was read, let it be corrected, and save it through the same
 * saveStudent / saveMarks the single forms use, so the rules, the student
 * numbering and the audit stamp are all identical. A bulk path with its own
 * writes would be a second set of rules to get wrong.
 *
 * The parsing is deliberately forgiving about SHAPE and strict about MEANING.
 * A list pasted out of Excel arrives tab-separated; one typed by hand arrives
 * with commas or just spaces; one copied off a printed sheet arrives as names
 * alone. All of those are read. But a date it cannot read is dropped and said
 * so, and a roll number that is not a number stops its row: a silently wrong
 * register is worse than a rejected paste.
 */

// ---------------------------------------------------------------------------
// students

export type StudentRow = {
  /** 1-based line in the pasted text, so a problem can be pointed at. */
  line: number;
  fullName: string;
  /** null until prepareStudentRows gives it the next free number. */
  rollNo: number | null;
  regNo: string;
  groupName: string;
  gender: string;
  dob: string;
  fatherName: string;
  motherName: string;
  bloodGroup: string;
  mobileNo: string;
  /** Not empty: this row cannot be saved. */
  problem: string;
  /** Not empty: it will be saved, but something was dropped or guessed. */
  note: string;
};

type Field = Exclude<keyof StudentRow, 'line' | 'problem' | 'note'>;

/** Header spellings, normalised to letters only. */
const HEADERS: Record<string, Field> = {
  roll: 'rollNo', rollno: 'rollNo', rollnumber: 'rollNo',
  name: 'fullName', fullname: 'fullName', student: 'fullName',
  studentname: 'fullName', studentsname: 'fullName',
  father: 'fatherName', fathername: 'fatherName', fathersname: 'fatherName',
  mother: 'motherName', mothername: 'motherName', mothersname: 'motherName',
  mobile: 'mobileNo', mobileno: 'mobileNo', phone: 'mobileNo', phoneno: 'mobileNo',
  contact: 'mobileNo', contactno: 'mobileNo', guardianmobile: 'mobileNo',
  guardiansmobile: 'mobileNo',
  dob: 'dob', dateofbirth: 'dob', birth: 'dob', birthdate: 'dob', birthday: 'dob',
  gender: 'gender', sex: 'gender',
  blood: 'bloodGroup', bloodgroup: 'bloodGroup',
  reg: 'regNo', regno: 'regNo', registration: 'regNo', registrationno: 'regNo',
  registrationnumber: 'regNo',
  group: 'groupName', groupname: 'groupName',
};

/** What a list without a header line is taken to be. */
const ROLL_FIRST: Field[] = ['rollNo', 'fullName', 'fatherName', 'motherName', 'mobileNo', 'dob'];
// A list that does not lead with a roll number is taken to have no rolls in it
// at all — anyone who had them would have put them first. So the column after
// the name is the father's, not a roll, and the rolls are given out afterwards.
const NAME_FIRST: Field[] = ['fullName', 'fatherName', 'motherName', 'mobileNo', 'dob'];

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

type Split = { cells: string[]; loose: boolean };

/**
 * Cuts a line into cells.
 *
 * A tab beats a comma beats a run of spaces, because that is the order of
 * certainty: a tab is only ever a column break, a comma almost always is, two
 * spaces usually are. A line separated by SINGLE spaces is left whole and
 * marked loose — "12 Ayesha Begum" has one break in it, not two, and only the
 * reader of the row knows which.
 */
function splitCells(line: string): Split {
  if (line.includes('\t')) return { cells: line.split('\t'), loose: false };
  if (line.includes(',')) return { cells: line.split(','), loose: false };
  if (/\s{2,}/.test(line.trim())) return { cells: line.trim().split(/\s{2,}/), loose: false };
  return { cells: [line.trim()], loose: true };
}

/** The columns a header line names, or null if it is not a header line. */
function headerOrder(cells: string[]): Field[] | null {
  const named = cells.map((c) => HEADERS[letters(c)]);
  if (named.filter(Boolean).length < 2) return null;
  // Every filled cell must name a column. A data line never does: "1" and
  // "Ayesha" are not column names, so real data is never eaten as a header.
  if (cells.some((c, i) => c.trim() !== '' && !named[i])) return null;
  return named as Field[];
}

/**
 * A date as a school writes it, as the app stores it (YYYY-MM-DD).
 *
 * 05/03/2012 is read as 5 March, not 5 May: this is a Bangladeshi school and
 * day-first is what its own paperwork uses. A date it cannot read comes back
 * empty and the row says so, rather than guessing a month.
 */
export function normalDate(raw: string): string {
  const s = raw.trim();
  if (s === '') return '';
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  let y = 0;
  let m = 0;
  let d = 0;
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; } else if (dmy) {
    d = +dmy[1]; m = +dmy[2]; y = +dmy[3];
  } else return '';
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
}

function normalGender(raw: string): string {
  const s = letters(raw);
  if (s === 'm' || s === 'male' || s === 'boy' || s === 'b') return 'M';
  if (s === 'f' || s === 'female' || s === 'girl' || s === 'g') return 'F';
  return '';
}

const also = (had: string, add: string) => (had ? `${had}; ${add}` : add);

function blankRow(line: number): StudentRow {
  return {
    line,
    fullName: '',
    rollNo: null,
    regNo: '',
    groupName: '',
    gender: '',
    dob: '',
    fatherName: '',
    motherName: '',
    bloodGroup: '',
    mobileNo: '',
    problem: '',
    note: '',
  };
}

function assign(row: StudentRow, field: Field | undefined, cell: string) {
  const v = cell.trim();
  if (!field || v === '') return;
  switch (field) {
    case 'rollNo':
      if (/^\d+$/.test(v)) row.rollNo = Number(v);
      else {
        row.problem = also(
          row.problem,
          `"${v}" is not a roll number. If the columns are in another order, put a `
          + 'header line at the top naming them.',
        );
      }
      break;
    case 'dob': {
      const d = normalDate(v);
      if (d) row.dob = d;
      else row.note = also(row.note, `the date "${v}" could not be read, so it was left out`);
      break;
    }
    case 'gender': {
      const g = normalGender(v);
      if (g) row.gender = g;
      else row.note = also(row.note, `"${v}" is not male or female, so it was left out`);
      break;
    }
    default:
      row[field] = v;
  }
}

/** Reads a pasted list of students. Nothing is checked against the school yet. */
export function parseStudentRows(text: string): StudentRow[] {
  const lines = text.split(/\r?\n/)
    .map((raw, i) => ({ no: i + 1, raw }))
    .filter((l) => l.raw.trim() !== '');
  if (lines.length === 0) return [];

  const header = headerOrder(splitCells(lines[0].raw).cells);
  const body = header ? lines.slice(1) : lines;
  if (body.length === 0) return [];

  // Without a header: a line that starts with a number is a roll list, a line
  // that starts with a word is a name list. Decided once from the first line
  // and used for all of them — a list read as two different shapes halfway
  // down would be worse than one read the same wrong way throughout.
  const first = splitCells(body[0].raw);
  const order = header
    ?? (first.cells.length >= 2 && /^\d+$/.test(first.cells[0].trim()) ? ROLL_FIRST : NAME_FIRST);

  return body.map((l) => {
    const row = blankRow(l.no);
    const split = splitCells(l.raw);

    if (split.loose) {
      // One line, single spaces: at most a roll and a name.
      const m = /^(\d+)\s+(.+)$/.exec(split.cells[0]);
      if (m) { row.rollNo = Number(m[1]); row.fullName = m[2].trim(); } else {
        row.fullName = split.cells[0];
      }
    } else {
      split.cells.forEach((cell, i) => assign(row, order[i], cell));
      if (split.cells.filter((c) => c.trim() !== '').length > order.length) {
        row.note = also(
          row.note,
          `only the first ${order.length} columns were read — name the rest in a header line`,
        );
      }
    }

    if (row.fullName === '' && row.problem === '') row.problem = 'No name on this line.';
    return row;
  });
}

/**
 * Settles the roll numbers against the section as it stands.
 *
 * A roll typed twice in the same paste is a typo and stops its row. A roll an
 * existing student already has is only flagged: that student may have left, and
 * the office knows which is which. A row with no roll at all is given the next
 * one after the highest in use — not the first gap, because a gap is usually a
 * student who left and whose number is better left alone.
 */
export function prepareStudentRows(rows: StudentRow[], takenRolls: number[]): StudentRow[] {
  const taken = new Set(takenRolls);
  const used = new Set<number>();
  const out = rows.map((r) => ({ ...r }));

  for (const r of out) {
    if (r.problem || r.rollNo === null) continue;
    if (used.has(r.rollNo)) {
      r.problem = `Roll ${r.rollNo} is on more than one line of this list.`;
      continue;
    }
    used.add(r.rollNo);
    if (taken.has(r.rollNo)) {
      r.note = also(r.note, `roll ${r.rollNo} is already used in this section`);
    }
  }

  let next = Math.max(0, ...takenRolls, ...[...used]);
  for (const r of out) {
    if (r.problem || r.rollNo !== null) continue;
    do { next += 1; } while (used.has(next) || taken.has(next));
    r.rollNo = next;
    used.add(next);
    r.note = also(r.note, `roll ${next} given automatically`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// marks

export type MarkRow = {
  line: number;
  /** null in a list of marks with no rolls beside them. */
  rollNo: number | null;
  marks: number | null;
  absent: boolean;
  problem: string;
};

export type MarkPaste = {
  /** ROLLS: every line names its roll. MARKS_ONLY: a bare column, in roll order. */
  kind: 'ROLLS' | 'MARKS_ONLY';
  rows: MarkRow[];
};

const ABSENT = ['a', 'ab', 'abs', 'absent'];
/** Written in a tally to mean "nothing for this one". */
const BLANK = ['-', '--', 'x', 'nil', 'na'];

function markValue(tok: string): { marks: number | null; absent: boolean } | null {
  const s = tok.trim();
  const low = s.toLowerCase();
  if (ABSENT.includes(low)) return { marks: null, absent: true };
  if (BLANK.includes(low)) return { marks: null, absent: false };
  if (/^\d+(\.\d+)?$/.test(s)) return { marks: Number(s), absent: false };
  return null;
}

/**
 * Reads a pasted tally of marks.
 *
 * Either shape is accepted: a roll and its mark on each line ("12 78", "12=78",
 * or the roll, the name and the mark as three copied columns), or a bare column
 * of marks in roll order. The bare column is what an answer-script tally
 * actually produces, and it is the one that can go wrong — one line missing and
 * every mark below it belongs to the wrong child — so applyMarkPaste refuses to
 * fill a bare column whose length does not match the section exactly.
 */
export function parseMarkPaste(text: string): MarkPaste {
  const all = text.split(/\r?\n/)
    .map((raw, i) => ({ no: i + 1, raw }))
    .filter((l) => l.raw.trim() !== '');

  // A heading line off a spreadsheet ("Roll  Name  Marks") carries no digit,
  // and no line of marks is without one. Dropping it beats making the person
  // delete it, and beats reporting it as a line that is not a mark.
  const lines = all.length > 1 && !/\d/.test(all[0].raw) ? all.slice(1) : all;

  const rows: MarkRow[] = lines.map((l) => {
    const row: MarkRow = {
      line: l.no, rollNo: null, marks: null, absent: false, problem: '',
    };
    const tok = l.raw.split(/[\t,=|]|\s+/).map((t) => t.trim()).filter((t) => t !== '');
    if (tok.length === 0) return row;

    if (tok.length === 1) {
      const v = markValue(tok[0]);
      if (!v) row.problem = `"${tok[0]}" is not a mark.`;
      else { row.marks = v.marks; row.absent = v.absent; }
      return row;
    }

    // The first token is the roll and the last is the mark: anything in between
    // is the name that came along with the copied columns.
    if (!/^\d+$/.test(tok[0])) {
      row.problem = `This line does not start with a roll number ("${tok[0]}").`;
      return row;
    }
    row.rollNo = Number(tok[0]);
    const v = markValue(tok[tok.length - 1]);
    if (!v) row.problem = `"${tok[tok.length - 1]}" is not a mark.`;
    else { row.marks = v.marks; row.absent = v.absent; }
    return row;
  });

  const kind = rows.length > 0 && rows.every((r) => r.rollNo === null) ? 'MARKS_ONLY' : 'ROLLS';
  if (kind === 'ROLLS') {
    for (const r of rows) {
      if (r.rollNo === null && r.problem === '') {
        r.problem = 'No roll number on this line, and the other lines have one.';
      }
    }
  }
  return { kind, rows };
}

export type MarkFill = {
  /** Keyed by studentId, shaped like the grid the mark screen already holds. */
  entries: Record<string, { marks: string; absent: boolean }>;
  filled: number;
  /** Rolls in the paste that this section does not have. */
  unknownRolls: number[];
  /** Rolls given more than the subject's full marks. */
  overRolls: number[];
  /** Not empty: nothing was filled, and this says why. */
  problem: string;
};

/**
 * Turns a parsed tally into the grid, for review before anything is saved.
 *
 * Filling is not saving. The screen shows the marks in the boxes, over-marks and
 * unknown rolls named, and the person presses Save as usual — the same save the
 * single-subject grid has always used.
 */
export function applyMarkPaste(
  paste: MarkPaste,
  students: { studentId: string; rollNo: number }[],
  fullMarks: number | null,
): MarkFill {
  const out: MarkFill = {
    entries: {}, filled: 0, unknownRolls: [], overRolls: [], problem: '',
  };
  if (paste.rows.length === 0) { out.problem = 'There is nothing in the box.'; return out; }
  const usable = paste.rows.filter((r) => r.problem === '');

  // filled counts BOXES, not lines: two lines for one roll fill one box.
  const put = (studentId: string, rollNo: number, r: MarkRow) => {
    out.entries[studentId] = {
      marks: r.marks === null ? '' : String(r.marks),
      absent: r.absent,
    };
    out.filled = Object.keys(out.entries).length;
    if (fullMarks !== null && r.marks !== null && r.marks > fullMarks) out.overRolls.push(rollNo);
  };

  if (paste.kind === 'MARKS_ONLY') {
    if (usable.length !== paste.rows.length) {
      out.problem = 'Fix the lines below first: a column of marks with no rolls is '
        + 'matched by position, so one bad line moves every mark under it.';
      return out;
    }
    if (paste.rows.length !== students.length) {
      out.problem = `That is ${paste.rows.length} mark${paste.rows.length === 1 ? '' : 's'} `
        + `for ${students.length} student${students.length === 1 ? '' : 's'}. A bare column is `
        + 'read in roll order, so it has to match the section exactly — or put the roll number '
        + 'in front of each mark.';
      return out;
    }
    students.forEach((s, i) => put(s.studentId, s.rollNo, paste.rows[i]));
    return out;
  }

  const byRoll = new Map<number, string>();
  for (const s of students) if (!byRoll.has(s.rollNo)) byRoll.set(s.rollNo, s.studentId);

  for (const r of usable) {
    const studentId = r.rollNo === null ? undefined : byRoll.get(r.rollNo);
    if (studentId === undefined) {
      if (r.rollNo !== null) out.unknownRolls.push(r.rollNo);
      continue;
    }
    put(studentId, r.rollNo as number, r);
  }
  if (out.filled === 0 && out.problem === '') out.problem = 'None of those rolls are in this section.';
  return out;
}
