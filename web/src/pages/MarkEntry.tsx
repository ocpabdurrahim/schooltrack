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
import { gradeFor } from '../data/grading';
import { type StudentDetail, findStudents } from '../data/people';

type Entry = { marks: string; absent: boolean };

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
          return [s.studentId, {
            marks: got?.marks === null || got?.marks === undefined ? '' : String(got.marks),
            absent: got?.absent ?? false,
          }];
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
      setEntries((was) => ({ ...was, ...fill.entries }));
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
        const e = entries[s.studentId] ?? { marks: '', absent: false };
        const value = e.marks.trim() === '' ? null : Number(e.marks);
        return {
          examId, studentId: s.studentId, subjectId: subject.subjectId,
          subjectName: subject.subjectName,
          marks: value !== null && Number.isFinite(value) ? value : null,
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
    ? students.filter((s) => Number(entries[s.studentId]?.marks) > subject.fullMarks).length
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
            <textarea
              className="mono"
              rows={8}
              aria-label="pasted marks"
              value={tally}
              placeholder={`1 78
2 65
3 abs`}
              onChange={(e) => setTally(e.target.value)}
            />
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0' }}>
              A roll and its mark on each line — <strong>1 78</strong>,{' '}
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

      <div className="card">
        <h2>
          {busy ? 'Working…' : `${students.length} student${students.length === 1 ? '' : 's'}`}
          {subject ? ` · out of ${subject.fullMarks}` : ''}
        </h2>

        {students.map((s) => {
          const e = entries[s.studentId] ?? { marks: '', absent: false };
          const value = e.marks.trim() === '' ? null : Number(e.marks);
          const grade = subject ? gradeFor(value, subject.fullMarks, e.absent) : null;
          const tooHigh = subject && value !== null && value > subject.fullMarks;
          return (
            <div key={s.studentId} style={{
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
              padding: '6px 0', borderBottom: '1px solid var(--line)',
            }}>
              <strong style={{ width: 34 }}>{s.rollNo}</strong>
              <span style={{ flex: '2 1 180px' }}>{s.fullName}</span>
              <input
                style={{ flex: '0 1 110px', borderColor: tooHigh ? 'var(--bad)' : undefined }}
                type="number" inputMode="decimal" aria-label={`marks ${s.fullName}`}
                value={e.marks} disabled={e.absent}
                onChange={(ev) => setEntries({
                  ...entries, [s.studentId]: { ...e, marks: ev.target.value },
                })} />
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={e.absent}
                       onChange={(ev) => setEntries({
                         ...entries, [s.studentId]: { ...e, absent: ev.target.checked },
                       })} />
                absent
              </label>
              <span style={{
                width: 34, textAlign: 'right', fontWeight: 600,
                color: grade?.letter === 'F' ? 'var(--bad)' : 'var(--muted)',
              }}>
                {grade?.letter ?? ''}
              </span>
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
