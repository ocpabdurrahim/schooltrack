import QRCode from 'qrcode';
import { Fragment, useEffect, useState } from 'react';
import { type SchoolSettings, getSettings } from '../data/admin';
import { type SchoolClass, listClasses } from '../data/attendance';
import { cardCode } from '../data/documents';
import { PER_SHEET, chunk, mirrored } from '../data/idcards';
import { type StudentDetail, findStudents } from '../data/people';

/**
 * Printable student ID cards — CR80 PORTRAIT, 54 x 86 mm, the size a lanyard
 * holder takes.
 *
 * The QR on the back carries exactly what the gate scanner parses —
 * SMS-STU-<studentId> — and it is generated from the student number itself,
 * so a card can never be printed with a code that does not resolve. That is
 * also why the student number is handed out by a counter and never reused.
 *
 * Two ways to put them on paper, because schools print these two ways:
 *
 *   sheets — nine fronts to a sheet, then the nine matching backs on the next
 *            sheet. The backs are MIRRORED left-to-right within each row, so
 *            that a duplex printer flipping on the long edge lands each back
 *            behind its own front. Cut after printing.
 *   pairs  — one student per row, front beside back, for cutting and gluing
 *            back-to-back before laminating. Three students to a sheet.
 */

export default function IdCards() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<StudentDetail[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [layout, setLayout] = useState<'sheets' | 'pairs'>('sheets');
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    Promise.all([listClasses(), getSettings()])
      .then(([c, s]) => {
        setClasses(c);
        setSchool(s);
        setClassId(c[0]?.classId ?? '');
      })
      .catch(() => setProblem('Could not read the class list.'))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!classId) return;
    let live = true;
    setBusy(true);
    (async () => {
      try {
        const roll = await findStudents(classId, '');
        if (!live) return;
        setStudents(roll);
        // one QR per student, drawn once and kept as a data URL
        const pairs = await Promise.all(roll.map(async (s) => [
          s.studentId,
          await QRCode.toDataURL(cardCode(s.studentId), { margin: 0, width: 360 }),
        ] as const));
        if (live) setCodes(Object.fromEntries(pairs));
        setProblem('');
      } catch {
        if (live) setProblem('Could not build the cards.');
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [classId]);

  const section = classes.find((c) => c.classId === classId);

  // ---------------------------------------------------------------- a card

  const front = (s: StudentDetail | null, key: string) => {
    if (!s) return <div className="idc-card blank" key={key} />;
    return (
      <div className="idc-card" key={key}>
        <div className="idc-head">
          <b>{school?.instituteName ?? 'School'}</b>
          <span>
            {school?.eiin ? `EIIN ${school.eiin}` : 'Student identity card'}
            {school?.sessionLabel ? ` · ${school.sessionLabel}` : ''}
          </span>
        </div>

        <div className="idc-body">
          <div className="idc-photo">PHOTO</div>
          <div className="idc-name">{s.fullName}</div>
          <div className="idc-role">{s.className} - {s.section}</div>

          <div className="idc-rows">
            <div><i>Roll</i><b>{s.rollNo}</b></div>
            {s.regNo && <div><i>Reg</i><b>{s.regNo}</b></div>}
            {s.groupName && <div><i>Group</i><b>{s.groupName}</b></div>}
            {s.dob && <div><i>Date of birth</i><b>{s.dob}</b></div>}
            {s.bloodGroup && <div><i>Blood</i><b>{s.bloodGroup}</b></div>}
          </div>
        </div>

        <div className="idc-foot">{cardCode(s.studentId)}</div>
      </div>
    );
  };

  const back = (s: StudentDetail | null, key: string) => {
    if (!s) return <div className="idc-card blank" key={key} />;
    return (
      <div className="idc-card" key={key}>
        <div className="idc-back-top">{school?.instituteName ?? 'School'}</div>

        <div className="idc-body" style={{ paddingTop: 0 }}>
          {codes[s.studentId] && (
            <img className="idc-qr" src={codes[s.studentId]} alt={cardCode(s.studentId)} />
          )}
          <div className="idc-code">{cardCode(s.studentId)}</div>

          <div className="idc-note">
            <strong>Scan at the gate</strong> to mark attendance.
            {s.fatherName && <><br />Father: {s.fatherName}</>}
            {s.mobileNo && <><br />Mobile: {s.mobileNo}</>}
            {school?.address && <><br />{school.address}</>}
            <br />If found, please return it to the school office.
          </div>

          <div className="idc-sign">
            <i />
            <span>{school?.headTeacher ?? 'Head teacher'}</span>
          </div>
        </div>
      </div>
    );
  };

  const sheets = chunk(students, PER_SHEET);

  return (
    <div className="wrap idc-wrap">
      <div className="card no-print">
        <h1>ID cards</h1>
        <h2>
          {section ? section.displayName : 'Pick a section'} · 54 × 86 mm, portrait
        </h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label htmlFor="cl">Section</label>
            <select id="cl" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.displayName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <label htmlFor="lay">Put on paper as</label>
            <select id="lay" value={layout}
                    onChange={(e) => setLayout(e.target.value as 'sheets' | 'pairs')}>
              <option value="sheets">Sheets — 9 a page, backs on the next page</option>
              <option value="pairs">Pairs — front beside back, 3 a page</option>
            </select>
          </div>
        </div>

        <button onClick={() => window.print()} disabled={busy || !students.length}>
          Print {students.length} card{students.length === 1 ? '' : 's'}
          {students.length > 0 && layout === 'sheets' && ` · ${sheets.length * 2} pages`}
        </button>

        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
          {layout === 'sheets'
            ? 'Nine to a page, the backs on the page after. Print double-sided, flipping on '
              + 'the LONG edge — the backs are mirrored to suit that — or print single-sided '
              + 'and glue each pair back to back before laminating.'
            : 'One student to a row, front beside back: cut both out, glue them back to back '
              + 'and laminate. Three students to a page.'}
          {' '}Keep the printer at A4 and <strong>100% scale</strong> — "fit to page" shrinks
          the cards and they stop fitting a lanyard holder.
          {' '}The QR carries <code>SMS-STU-&lt;student number&gt;</code>, exactly what the gate
          scanner reads. The photo box is left empty to be filled in before lamination.
        </p>
        {problem && <div className="err">{problem}</div>}
      </div>

      {busy && <div className="card no-print"><p>Working…</p></div>}

      {!busy && students.length === 0 && (
        <div className="card no-print">
          <p style={{ color: 'var(--muted)', margin: 0 }}>No students in this section.</p>
        </div>
      )}

      {layout === 'sheets'
        ? sheets.map((sheet, i) => (
          <Fragment key={i}>
            <section className="idc-sheet">
              {sheet.map((s) => front(s, `f-${s.studentId}`))}
            </section>
            <section className="idc-sheet">
              {mirrored(sheet).map((s, j) => back(s, s ? `b-${s.studentId}` : `b-pad-${i}-${j}`))}
            </section>
          </Fragment>
        ))
        : students.map((s) => (
          <div className="idc-pair" key={s.studentId}>
            {front(s, `f-${s.studentId}`)}
            {back(s, `b-${s.studentId}`)}
          </div>
        ))}
    </div>
  );
}
