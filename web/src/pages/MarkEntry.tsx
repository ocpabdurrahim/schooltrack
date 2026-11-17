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
  subjectsForClass,
} from '../data/exams';
import {
  type MarkFill,
  type MarkPaste,
  applyMarkPaste,
  parseMarkPaste,
} from '../data/batch';
import { SHEET_ACCEPT, readSheetFile } from '../data/sheet';
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

  // the paste panel: a tally read, filled into the grid, and saved by the
  // ordinary Save button like anything typed in by hand
  const [pasteOpen, setPasteOpen] = useState(false);
  const [tally, setTally] = useState('');
  const [read, setRead] = useState<{ paste: MarkPaste; fill: MarkFill } | null>(null);
  const [fromFile, setFromFile] = useState('');

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
        setRead(null);
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
  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRead(null); setProblem(''); setFromFile('');
    try {
      const loaded = await readSheetFile(file);
      if (!loaded.trim()) { setProblem(`There is nothing in ${file.name}.`); return; }
      setTally(loaded);
      setFromFile(file.name);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That file could not be read.');
    }
  }

  function fillFromTally() {
    const paste = parseMarkPaste(tally);
    const fill = applyMarkPaste(
      paste,
      students.map((s) => ({ studentId: s.studentId, rollNo: s.rollNo })),
      subject?.fullMarks ?? null,
    );
    setRead({ paste, fill });
    // Filling is not saving: the boxes change, the sheet does not, and the
    // ordinary Save button below is still what writes it.
    if (fill.filled > 0) {
      setEntries((was) => ({
        ...was,
        ...Object.fromEntries(
          Object.entries(fill.entries)
            .map(([id, v]) => [id, { ...(was[id] ?? blankTyped()), ...v }]),
        ),
      }));
      setNote('');
    }
  }

  async function save() {
    if (!exam || !subject) return;
    if (exam.published) {
      setProblem('That exam is published. Unpublish it first if a mark must be corrected.');
      return;
    }
    setBusy(true); setProblem(''); setNote('');
    try {
      const rows: ResultRow[] = students.map((s) => {
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
    ? students.filter((s) => overMax(subject, entries[s.studentId] ?? blankTyped())).length
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

      {subject?.components?.length ? (
        <div className="card">
          <h2>Paste a tally</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
            Not for this paper. {subject.subjectName} is marked in
            {' '}{subject.components.map((c) => c.name).join(' and ')}, and a pasted tally
            carries one number per student — there is no way to tell which part it is.
            Type the parts below, or paste into a subject that is marked as one mark.
          </p>
        </div>
      ) : (
      <div className="card">
        <h2>
          Paste a tally
          <button
            className="link"
            style={{ marginLeft: 12 }}
            onClick={() => { setPasteOpen(!pasteOpen); setRead(null); }}
          >
            {pasteOpen ? 'close' : 'open'}
          </button>
        </h2>

        {!pasteOpen && (
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
            Marks off an answer-script tally, a whole section at a time, instead
            of box by box. Nothing is saved until you press Save marks.
          </p>
        )}

        {pasteOpen && (
          <>
            <label htmlFor="mfile">A file, if you have one</label>
            <input id="mfile" type="file" accept={SHEET_ACCEPT} onChange={pickFile} />
            <label htmlFor="tally" style={{ marginTop: 12 }}>
              The marks
              {fromFile && <span style={{ color: 'var(--accent)' }}> · read from {fromFile}</span>}
            </label>
            <textarea
              id="tally"
              className="mono"
              rows={8}
              aria-label="pasted marks"
              value={tally}
              placeholder={`1 78
2 65
3 abs`}
              onChange={(e) => { setTally(e.target.value); setFromFile(''); }}
            />
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0' }}>
              An Excel file (.xlsx) or a CSV, or typed in:
              a roll and its mark on each line — <strong>1 78</strong>,{' '}
              <strong>1=78</strong>, <strong>1, Ayesha, 78</strong> — or a bare
              column of marks in roll order, which has to match this section
              exactly. Write <strong>A</strong> for absent and <strong>-</strong>{' '}
              to clear a mark.
            </p>
            <button onClick={fillFromTally} disabled={busy || !students.length}>
              Fill the boxes
            </button>

            {read && (
              <>
                {read.fill.problem && <div className="err">{read.fill.problem}</div>}
                {!read.fill.problem && (
                  <p style={{ margin: '12px 0 0' }} className="good">
                    <strong>
                      {read.fill.filled} box{read.fill.filled === 1 ? '' : 'es'} filled in.
                    </strong>{' '}
                    <span style={{ color: 'var(--muted)' }}>
                      Check them below, then press Save marks.
                    </span>
                  </p>
                )}
                {read.fill.unknownRolls.length > 0 && (
                  <div className="err">
                    This section has no roll {read.fill.unknownRolls.join(', ')} — those
                    lines were left out.
                  </div>
                )}
                {read.fill.overRolls.length > 0 && (
                  <div className="err">
                    Roll {read.fill.overRolls.join(', ')} got more than the full marks.
                  </div>
                )}
                {read.paste.rows.filter((r) => r.problem).map((r) => (
                  <div className="err" key={r.line}>Line {r.line}: {r.problem}</div>
                ))}
              </>
            )}
          </>
        )}
      </div>
      )}

      <div className="card">
        <h2>
          {busy ? 'Working…' : `${students.length} student${students.length === 1 ? '' : 's'}`}
          {subject ? ` · out of ${subject.fullMarks}` : ''}
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

        {students.map((s, row) => {
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
                disabled={busy || !subject || !students.length || exam?.published || over > 0}>
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
