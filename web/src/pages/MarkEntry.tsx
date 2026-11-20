import { useEffect, useState } from 'react';
import { type SchoolClass, listClasses } from '../data/attendance';
import {
  type Exam,
  type ResultRow,
  type Subject,
  listExams,
  listSubjects,
  marksForExam,
  saveMarks,
  sitsSubject,
  subjectsForClass,
} from '../data/exams';
import {
  type PartsSheet,
  MARK_HEADINGS,
  parseMarkParts,
  singleMark,
} from '../data/batch';
import { SHEET_ACCEPT, readSheetGrid } from '../data/sheet';
import { templateFileName, templateRows } from '../data/marktemplate';
// `save` here would collide with this page's own save() for marks.
import { safeFileName, save as saveFile, xlsxOf, zip } from '../data/xlsx';
import { gradeForSubject } from '../data/grading';
import {
  type Typed,
  blankTyped,
  numOrNull,
  overMax,
  partsAndTotal,
  typedFrom,
} from '../data/markentry';
import { type StudentDetail, findStudents } from '../data/people';

/** One student's boxes for this subject — the shared shape, so the two mark
 * entry screens and both apps agree on what a typed box means. */
type Entry = Typed;

/**
 * Enter moves straight down the column, to the same box for the next student.
 *
 * That is the whole point of a quick entry: a teacher with a bundle of scripts
 * types a number, presses Enter, types the next, and never reaches for the
 * mouse. Tab still moves across the row, for the two or three parts of one
 * student's paper.
 */
function downOnEnter(ev: React.KeyboardEvent, row: number, col: number) {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  const next = document.getElementById(`mk-${row + 1}-${col}`) as HTMLInputElement | null;
  if (next) { next.focus(); next.select(); }
}

export default function MarkEntry() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);

  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const [students, setStudents] = useState<StudentDetail[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [busy, setBusy] = useState(true);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');


  useEffect(() => {
    Promise.all([listExams(), listSubjects(), listClasses()])
      .then(([e, s, c]) => {
        setExams(e);
        setSubjects(s);
        setClasses(c);
        setExamId(e.find((x) => !x.published)?.examId ?? e[0]?.examId ?? '');
        setClassId(c[0]?.classId ?? '');
      })
      .catch(() => setProblem('Could not read the exams.'))
      .finally(() => setBusy(false));
  }, []);

  const exam = exams.find((e) => e.examId === examId);
  const section = classes.find((c) => c.classId === classId);
  const className = students[0]?.className ?? '';
  const classSubjects = className ? subjectsForClass(subjects, className) : subjects;
  const subject = classSubjects.find((s) => s.subjectId === subjectId);

  /**
   * The students who actually sit this paper.
   *
   * A Science paper is not handed to the Humanities half of the class, and a
   * sheet that listed them would invite a mark for a paper they never sat —
   * which the tabulation would then have to explain away.
   */
  const sitters = subject
    ? students.filter((s) => sitsSubject(subject, s))
    : students;
  const notSitting = students.length - sitters.length;

  const [zipping, setZipping] = useState(false);

  /** The blank form for the subject on screen, with this section's rolls. */
  function downloadForm() {
    if (!subject) return;
    const label = section?.displayName ?? className;
    saveFile(
      safeFileName(templateFileName(label, subject.subjectName)),
      xlsxOf(templateRows(subject, sitters, label)),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  }

  /**
   * One form per subject this class takes, as a single zip.
   *
   * Each sheet carries only the students who SIT that paper — the same rule
   * the grid below uses — so the Humanities half of a year is not handed a
   * Physics sheet to leave blank.
   */
  function downloadAllForms() {
    const label = section?.displayName ?? className;
    setZipping(true);
    try {
      const files = classSubjects.map((s) => ({
        name: safeFileName(templateFileName(label, s.subjectName)),
        data: xlsxOf(templateRows(s, students.filter((st) => sitsSubject(s, st)), label)),
      }));
      saveFile(`${safeFileName(label)} — blank mark sheets.zip`, zip(files), 'application/zip');
    } finally {
      setZipping(false);
    }
  }

  // the roll, and whatever has already been entered for this exam + subject
  useEffect(() => {
    if (!classId || !examId) return;
    let live = true;
    setBusy(true);
    (async () => {
      try {
        const [roll, marks] = await Promise.all([
          findStudents(classId, ''),
          marksForExam(examId, classId),
        ]);
        if (!live) return;
        setStudents(roll);
        const mine = marks.filter((m) => m.subjectId === subjectId);
        setEntries(Object.fromEntries(roll.map((s) => {
          const got = mine.find((m) => m.studentId === s.studentId);
          return [s.studentId, typedFrom(got?.marks, got?.parts, got?.absent ?? false)];
        })));
        setProblem('');
        setPartsRead(null);
      } catch {
        if (live) setProblem('Could not load the marks.');
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [classId, examId, subjectId]);

  // pick a sensible subject once the class is known
  useEffect(() => {
    if (!classSubjects.length) { setSubjectId(''); return; }
    if (!classSubjects.some((s) => s.subjectId === subjectId)) {
      setSubjectId(classSubjects[0].subjectId);
    }
  }, [className, subjects]);

  /** A chosen file only fills the box; the boxes are still filled by hand. */
  // A spreadsheet of parts, for a subject marked in CQ/MCQ/Prac.
  const [partsRead, setPartsRead] = useState<PartsSheet | null>(null);
  const [partsFilled, setPartsFilled] = useState(0);
  // Rolls the file named that this section has not got.
  const [strangers, setStrangers] = useState<number[]>([]);

  /**
   * A spreadsheet with one column per part, into the boxes below.
   *
   * Filling is not saving: this changes what is on screen, and the ordinary
   * Save marks button is still the only thing that writes anything.
   */
  // The mark columns this paper wants in a spreadsheet.
  const parts = (subject?.components ?? []).map((c) => c.name);

  async function pickPartsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !subject) return;
    setPartsRead(null); setProblem(''); setNote('');

    // A paper marked in parts wants a column per part; a paper marked out of
    // one number wants whichever word the sheet used for it.
    const comps = (subject.components ?? []).map((c) => c.name);
    const wanted = comps.length ? comps : MARK_HEADINGS;

    let got;
    try {
      got = parseMarkParts(await readSheetGrid(file), wanted);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That file could not be read.');
      return;
    }
    setPartsRead(got);
    if (got.problem) return;

    const byRoll = new Map(sitters.map((s) => [s.rollNo, s.studentId]));
    let filled = 0;
    const strangers: number[] = [];
    const next: Record<string, Typed> = {};
    for (const row of got.rows) {
      const id = row.rollNo === null ? undefined : byRoll.get(row.rollNo);
      // A roll this section has not got is left alone rather than guessed at
      // -- but it is SAID, not silently dropped. A sheet of the wrong class's
      // rolls would otherwise report "4 students filled in" off five rows and
      // leave the teacher to notice the missing one themselves.
      if (!id) {
        if (row.rollNo !== null) strangers.push(row.rollNo);
        continue;
      }
      const was = entries[id] ?? blankTyped();

      if (comps.length) {
        const parts = { ...was.parts };
        for (const [name, v] of Object.entries(row.parts)) parts[name] = String(v);
        next[id] = { ...was, parts, absent: row.absent };
      } else {
        const one = singleMark(row);
        if (one === null && !row.absent) continue;
        next[id] = {
          ...was,
          marks: one === null ? '' : String(one),
          absent: row.absent,
        };
      }
      filled += 1;
    }
    setPartsFilled(filled);
    setStrangers(strangers);
    if (filled > 0) setEntries((was) => ({ ...was, ...next }));
  }

  async function save() {
    if (!exam || !subject) return;
    if (exam.published) {
      setProblem('That exam is published. Unpublish it first if a mark must be corrected.');
      return;
    }
    setBusy(true); setProblem(''); setNote('');
    try {
      const rows: ResultRow[] = sitters.map((s) => {
        const e = entries[s.studentId] ?? blankTyped();
        const { parts, marks } = partsAndTotal(subject, e);
        return {
          examId, studentId: s.studentId, subjectId: subject.subjectId,
          subjectName: subject.subjectName,
          marks,
          parts,
          absent: e.absent,
          classId, rollNo: s.rollNo,
          fullMarks: subject.fullMarks,
          isOptional: subject.isOptional,
        };
      });
      await saveMarks(rows);
      setNote(`${rows.length} mark${rows.length === 1 ? '' : 's'} saved.`);
    } catch {
      setProblem('That save was refused. Only a teacher or the head may enter marks.');
    }
    setBusy(false);
  }

  const over = subject
    ? sitters.filter((s) => overMax(subject, entries[s.studentId] ?? blankTyped())).length
    : 0;

  return (
    <div className="wrap">
      <div className="card">
        <h1>Mark entry</h1>
        <h2>
          {exam ? `${exam.examName} ${exam.examYear}` : 'Pick an exam'}
          {section ? ` · ${section.displayName}` : ''}
          {subject ? ` · ${subject.subjectName}` : ''}
        </h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="ex">Exam</label>
            <select id="ex" value={examId} onChange={(e) => setExamId(e.target.value)}>
              {exams.map((e) => (
                <option key={e.examId} value={e.examId}>
                  {e.examName} {e.examYear}{e.published ? ' (published)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="cl">Section</label>
            <select id="cl" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.displayName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '2 1 180px' }}>
            <label htmlFor="su">Subject</label>
            <select id="su" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {classSubjects.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {s.subjectName}{s.isOptional ? ' (4th)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {exam?.published && (
          <div className="err">
            This exam is published. Marks are shown but not saved until it is unpublished.
          </div>
        )}
        {classSubjects.length === 0 && (
          <div className="err">
            No subject is assigned to this class yet — set that up under Exams and subjects.
          </div>
        )}
        {problem && <div className="err">{problem}</div>}
      </div>

      {/*
        ONE way in, for every paper: a spreadsheet.

        The paste box is gone. It could only ever carry one number per
        student, which is fine for a paper marked out of 100 and useless for
        one marked CQ + MCQ -- and on Android it quietly filled a field the
        screen does not even show. A spreadsheet says which column a number
        came from, because it has columns, and it is the same shape as the
        paper form the teacher fills in. Marks can still be typed box by box
        in the grid below; this is the faster way in, not the only one.
      */}
      <div className="card">
        <h2>A spreadsheet of marks</h2>

        {/*
          The blank form comes from here rather than from somebody's old copy,
          so the columns are always the ones this subject is actually marked
          in and the rolls are always this section's. A form that is a year out
          of date is the thing that makes an upload land on the wrong child.
        */}
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button className="ghost" disabled={!subject || !sitters.length}
                  onClick={downloadForm}>
            Blank form for {subject?.subjectName ?? 'this subject'}
          </button>
          <button className="ghost" disabled={!classSubjects.length || !students.length}
                  onClick={downloadAllForms}>
            {zipping ? 'Building…' : `Every subject in ${section?.displayName ?? 'this class'}`}
          </button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 10px' }}>
          {parts.length
            ? `${subject?.subjectName} is marked in ${parts.join(' and ')}, so the
               sheet needs a column for each.`
            : 'Marks for a whole section at once, off an .xlsx or a CSV.'}
          {' '}Nothing is saved until you press Save marks.
        </p>

        <label htmlFor="pfile">An Excel file (.xlsx) or a CSV</label>
        <input id="pfile" type="file" accept={SHEET_ACCEPT} onChange={pickPartsFile} />

        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0' }}>
          One heading row, then a row per student: <strong>Roll</strong>, then{' '}
          {parts.length
            ? parts.map((c) => <strong key={c}>{c} </strong>)
            : <strong>Marks</strong>}
          {parts.length ? <>and a <strong>Total</strong> if you like — it is ignored
            here, because it is worked out from the parts.</> : null}
          {' '}Write <strong>A</strong> for absent. Leave a box empty rather than
          writing 0 in it: a zero is a mark.
        </p>

        {partsRead && (
          <>
            {partsRead.problem && <div className="err">{partsRead.problem}</div>}
            {!partsRead.problem && (
              <p style={{ margin: '12px 0 0' }} className="good">
                <strong>
                  {partsFilled} student{partsFilled === 1 ? '' : 's'} filled in
                </strong>{' '}
                <span style={{ color: 'var(--muted)' }}>
                  from {Object.keys(partsRead.columns).join(' and ')}. Check them
                  below, then press Save marks.
                </span>
              </p>
            )}
            {strangers.length > 0 && (
              <p className="warn" style={{ margin: '6px 0 0', fontSize: 13 }}>
                This section has no roll {strangers.join(', ')} — those rows were
                left out. Is the file for a different class?
              </p>
            )}
            {partsRead.rows.filter((r) => r.problem).map((r) => (
              <p key={r.line} className="warn" style={{ margin: '6px 0 0', fontSize: 13 }}>
                Row {r.line}: {r.problem}
              </p>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <h2>
          {busy ? 'Working…' : `${sitters.length} student${sitters.length === 1 ? '' : 's'}`}
          {subject ? ` · out of ${subject.fullMarks}` : ''}
          {notSitting > 0 && (subject?.groupNames?.length || subject?.religions?.length)
            ? ` · ${notSitting} not shown — only ` +
              `${[...(subject.groupNames ?? []), ...(subject.religions ?? [])].join(' and ')} ` +
              'students sit this paper'
            : ''}
        </h2>

        {subject?.components?.length ? (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            padding: '4px 0', color: 'var(--muted)', fontSize: 13,
          }}>
            <span style={{ width: 34 }}>Roll</span>
            <span style={{ flex: '2 1 180px' }}>Name</span>
            {subject.components.map((c) => (
              <span key={c.name} style={{ flex: '0 1 96px' }}>
                {c.name} /{c.max} · pass {c.pass}
              </span>
            ))}
            <span style={{ flex: '0 1 76px', textAlign: 'right' }}>Total</span>
          </div>
        ) : null}

        {sitters.map((s, row) => {
          const e = entries[s.studentId] ?? blankTyped();
          const comps = subject?.components ?? [];
          const got = subject ? partsAndTotal(subject, e) : { parts: null, marks: null };
          const grade = subject
            ? gradeForSubject({
              subjectId: subject.subjectId,
              subjectName: subject.subjectName,
              fullMarks: subject.fullMarks,
              marks: got.marks,
              parts: got.parts ?? undefined,
              components: comps.length ? comps : undefined,
              absent: e.absent,
            })
            : null;
          const setPart = (name: string, v: string) => setEntries({
            ...entries, [s.studentId]: { ...e, parts: { ...e.parts, [name]: v } },
          });
          return (
            <div key={s.studentId} style={{
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
              padding: '6px 0', borderBottom: '1px solid var(--line)',
            }}>
              <strong style={{ width: 34 }}>{s.rollNo}</strong>
              <span style={{ flex: '2 1 180px' }}>{s.fullName}</span>

              {comps.length === 0 ? (
                <input
                  id={`mk-${row}-0`}
                  style={{
                    flex: '0 1 110px',
                    borderColor: (numOrNull(e.marks) ?? 0) > (subject?.fullMarks ?? 100)
                      ? 'var(--bad)' : undefined,
                  }}
                  type="number" inputMode="decimal" aria-label={`marks ${s.fullName}`}
                  value={e.marks} disabled={e.absent}
                  onKeyDown={(ev) => downOnEnter(ev, row, 0)}
                  onChange={(ev) => setEntries({
                    ...entries, [s.studentId]: { ...e, marks: ev.target.value },
                  })} />
              ) : comps.map((c, col) => {
                const v = numOrNull(e.parts[c.name] ?? '');
                const tooHigh = v !== null && v > c.max;
                const belowPass = v !== null && v < c.pass;
                return (
                  <input
                    key={c.name}
                    id={`mk-${row}-${col}`}
                    style={{
                      flex: '0 1 96px',
                      borderColor: tooHigh || belowPass ? 'var(--bad)' : undefined,
                    }}
                    type="number" inputMode="decimal"
                    aria-label={`${c.name} ${s.fullName}`}
                    title={belowPass && !tooHigh
                      ? `Below the ${c.name} pass mark of ${c.pass} — this fails the subject`
                      : undefined}
                    value={e.parts[c.name] ?? ''} disabled={e.absent}
                    onKeyDown={(ev) => downOnEnter(ev, row, col)}
                    onChange={(ev) => setPart(c.name, ev.target.value)} />
                );
              })}

              {comps.length > 0 && (
                <span style={{
                  flex: '0 1 76px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  color: got.marks === null ? 'var(--muted)' : undefined,
                }}>
                  {got.marks === null ? '—' : `${got.marks}/${subject?.fullMarks ?? 0}`}
                </span>
              )}

              <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={e.absent}
                       onChange={(ev) => setEntries({
                         ...entries, [s.studentId]: { ...e, absent: ev.target.checked },
                       })} />
                absent
              </label>

              <span style={{
                width: 58, textAlign: 'right', fontWeight: 600,
                color: grade?.letter === 'F' ? 'var(--bad)' : 'var(--muted)',
              }}>
                {grade?.letter ?? ''}
                {grade && grade.letter !== '-' && grade.letter !== 'F'
                  ? ` ${grade.point.toFixed(1)}` : ''}
              </span>

              {grade && grade.failedParts.length > 0 && (
                <span style={{ color: 'var(--bad)', fontSize: 13, flexBasis: '100%' }}>
                  {grade.failedParts.join(' and ')} below the pass mark — the subject is F
                  at {got.marks} out of {subject?.fullMarks}.
                </span>
              )}
            </div>
          );
        })}

        {over > 0 && (
          <div className="err">
            {over} mark{over === 1 ? ' is' : 's are'} above the full marks for this subject.
          </div>
        )}

        <button onClick={save}
                disabled={busy || !subject || !sitters.length || exam?.published || over > 0}>
          {busy ? 'Saving…' : 'Save marks'}
        </button>
        {note && <span style={{ marginLeft: 12, color: 'var(--accent)' }}>{note}</span>}

        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          A blank box means “not entered yet”, which is not the same as a zero: a student
          with a blank mark has no GPA at all until it is filled in, rather than a GPA
          that will change later. Saving the same sheet again corrects it.
        </p>
      </div>
    </div>
  );
}
