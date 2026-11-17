import { useEffect, useRef, useState } from 'react';
import { type SchoolClass, listClasses } from '../data/attendance';
import {
  type Exam,
  type ResultRow,
  type Subject,
  listExams,
  listSubjects,
  marksForExam,
  saveMarks,
  subjectMarkFor,
  subjectsForClass,
} from '../data/exams';
import { type SubjectMark, gpaText, gradeForSubject, tabulate } from '../data/grading';
import {
  type Typed,
  blankTyped,
  overMax,
  partsAndTotal,
  typedFrom,
} from '../data/markentry';
import { type StudentDetail, findStudents } from '../data/people';

/**
 * Quick entry, one student at a time.
 *
 * The other two screens go down a column: one subject, forty students. This
 * one goes across — one student, every subject — which is what the office
 * wants when a child sat an exam late, when a mark is being corrected, or when
 * a single marksheet has to be keyed in from paper.
 *
 * Type a roll, press Enter, fill the boxes, press Save. The GPA at the bottom
 * is the real tabulation — combined papers, component pass marks and all — so
 * a mistake shows up before it is saved rather than on the printed sheet.
 */
export default function QuickByStudent() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);

  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [roll, setRoll] = useState('');

  const [students, setStudents] = useState<StudentDetail[]>([]);
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [typed, setTyped] = useState<Record<string, Typed>>({});

  const [busy, setBusy] = useState(true);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const rollBox = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!classId) return;
    let live = true;
    findStudents(classId, '')
      .then((r) => { if (live) setStudents(r); })
      .catch(() => { if (live) setProblem('Could not read the roll.'); });
    return () => { live = false; };
  }, [classId]);

  const exam = exams.find((e) => e.examId === examId);
  const section = classes.find((c) => c.classId === classId);
  const mySubjects = student ? subjectsForClass(subjects, student.className) : [];

  /** Finds the roll in this section and reads whatever it already has. */
  async function open(rollNo: string) {
    const found = students.find((s) => String(s.rollNo) === rollNo.trim());
    if (!found) {
      setStudent(null);
      setProblem(`No roll ${rollNo.trim()} in ${section?.displayName ?? 'this section'}.`);
      return;
    }
    setBusy(true); setProblem(''); setNote('');
    try {
      const marks = await marksForExam(examId, classId);
      const mine = marks.filter((m) => m.studentId === found.studentId);
      setStudent(found);
      setTyped(Object.fromEntries(subjectsForClass(subjects, found.className).map((s) => {
        const got = mine.find((m) => m.subjectId === s.subjectId);
        return [s.subjectId, typedFrom(got?.marks, got?.parts, got?.absent ?? false)];
      })));
    } catch {
      setProblem('Could not read that student’s marks.');
    }
    setBusy(false);
  }

  /** The live tabulation, exactly as the marksheet will compute it. */
  const liveMarks: SubjectMark[] = mySubjects.map((s) => {
    const t = typed[s.subjectId] ?? blankTyped();
    const { parts, marks } = partsAndTotal(s, t);
    return {
      ...subjectMarkFor(s, null),
      marks,
      parts: parts ?? undefined,
      absent: t.absent,
    };
  });
  const live = tabulate(liveMarks);
  const over = mySubjects.some((s) => overMax(s, typed[s.subjectId] ?? blankTyped()));

  async function save(thenNext: boolean) {
    if (!student || !exam) return;
    if (exam.published) {
      setProblem('That exam is published. Unpublish it first if a mark must be corrected.');
      return;
    }
    setBusy(true); setProblem(''); setNote('');
    try {
      const rows: ResultRow[] = mySubjects.map((s) => {
        const t = typed[s.subjectId] ?? blankTyped();
        const { parts, marks } = partsAndTotal(s, t);
        return {
          examId,
          studentId: student.studentId,
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          marks,
          parts,
          absent: t.absent,
          classId,
          rollNo: student.rollNo,
          fullMarks: s.fullMarks,
          isOptional: s.isOptional,
        };
      });
      await saveMarks(rows);
      setNote(`Roll ${student.rollNo} saved — ${rows.length} subjects.`);
      if (thenNext) {
        const next = students.find((s) => s.rollNo > student.rollNo);
        setStudent(null);
        setTyped({});
        setRoll(next ? String(next.rollNo) : '');
        rollBox.current?.focus();
        rollBox.current?.select();
        if (next) await open(String(next.rollNo));
      }
    } catch {
      setProblem('That save was refused. Only a teacher or the head may enter marks.');
    }
    setBusy(false);
  }

  let box = 0;   // a running number, so Enter can walk down every box on the form

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="qex">Exam</label>
            <select id="qex" value={examId} onChange={(e) => {
              setExamId(e.target.value); setStudent(null);
            }}>
              {exams.map((e) => (
                <option key={e.examId} value={e.examId}>
                  {e.examName} {e.examYear}{e.published ? ' (published)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="qcl">Section</label>
            <select id="qcl" value={classId} onChange={(e) => {
              setClassId(e.target.value); setStudent(null);
            }}>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.displayName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label htmlFor="qroll">Roll</label>
            <input
              id="qroll" ref={rollBox} type="number" inputMode="numeric"
              placeholder="12" value={roll}
              onChange={(e) => setRoll(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); open(roll); } }} />
          </div>
          <div style={{ flex: '0 1 120px', alignSelf: 'end' }}>
            <button onClick={() => open(roll)} disabled={busy || !roll.trim()}>Open</button>
          </div>
        </div>

        {exam?.published && (
          <div className="err">
            This exam is published. Marks are shown but not saved until it is unpublished.
          </div>
        )}
        {problem && <div className="err">{problem}</div>}
      </div>

      {student && (
        <div className="card">
          <h2>
            {student.rollNo} · {student.fullName}
            <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
              {' '}· {student.className}{student.groupName ? ` · ${student.groupName}` : ''}
            </span>
          </h2>

          {mySubjects.length === 0 && (
            <div className="err">
              No subject is assigned to {student.className} yet — set that up under
              Exams and subjects.
            </div>
          )}

          {mySubjects.map((s) => {
            const t = typed[s.subjectId] ?? blankTyped();
            const { parts, marks } = partsAndTotal(s, t);
            const grade = gradeForSubject({
              ...subjectMarkFor(s, null),
              marks,
              parts: parts ?? undefined,
              absent: t.absent,
            });
            const set = (next: Typed) => setTyped({ ...typed, [s.subjectId]: next });
            return (
              <div key={s.subjectId} style={{
                display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
                padding: '6px 0', borderBottom: '1px solid var(--line)',
              }}>
                <span style={{ flex: '2 1 200px' }}>
                  {s.subjectName}
                  {s.isOptional && <span className="pill" style={{ marginLeft: 8 }}>4th</span>}
                  {s.combineGroup && (
                    <span style={{ color: 'var(--muted)' }}> · with {s.combineGroup}</span>
                  )}
                </span>

                {s.components?.length ? s.components.map((c) => {
                  const mine = box;
                  box += 1;
                  const v = t.parts[c.name] ?? '';
                  const n = v.trim() === '' ? null : Number(v);
                  const bad = n !== null && Number.isFinite(n) && (n > c.max || n < c.pass);
                  return (
                    <span key={c.name} style={{ flex: '0 1 104px' }}>
                      <label htmlFor={`qk-${mine}`} style={{ fontSize: 12, margin: 0 }}>
                        {c.name} /{c.max}
                      </label>
                      <input
                        id={`qk-${mine}`} type="number" inputMode="decimal"
                        style={{ borderColor: bad ? 'var(--bad)' : undefined }}
                        value={v} disabled={t.absent}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          document.getElementById(`qk-${mine + 1}`)?.focus();
                        }}
                        onChange={(e) => set({
                          ...t, parts: { ...t.parts, [c.name]: e.target.value },
                        })} />
                    </span>
                  );
                }) : (() => {
                  const mine = box;
                  box += 1;
                  return (
                    <span style={{ flex: '0 1 104px' }}>
                      <label htmlFor={`qk-${mine}`} style={{ fontSize: 12, margin: 0 }}>
                        out of {s.fullMarks}
                      </label>
                      <input
                        id={`qk-${mine}`} type="number" inputMode="decimal"
                        value={t.marks} disabled={t.absent}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          document.getElementById(`qk-${mine + 1}`)?.focus();
                        }}
                        onChange={(e) => set({ ...t, marks: e.target.value })} />
                    </span>
                  );
                })()}

                <span style={{
                  flex: '0 1 80px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  color: marks === null ? 'var(--muted)' : undefined,
                }}>
                  {marks === null ? '—' : `${marks}/${s.fullMarks}`}
                </span>

                <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={t.absent}
                         onChange={(e) => set({ ...t, absent: e.target.checked })} />
                  absent
                </label>

                <span style={{
                  width: 34, textAlign: 'right', fontWeight: 600,
                  color: grade.letter === 'F' ? 'var(--bad)' : 'var(--muted)',
                }}>
                  {grade.letter}
                </span>

                {grade.failedParts.length > 0 && (
                  <span style={{ color: 'var(--bad)', fontSize: 13, flexBasis: '100%' }}>
                    {grade.failedParts.join(' and ')} below the pass mark — this subject is F.
                  </span>
                )}
              </div>
            );
          })}

          <div style={{ marginTop: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>
              GPA {gpaText(live.gpa)}
              {live.gpa !== null && <span style={{ marginLeft: 8 }}>{live.letter}</span>}
            </strong>
            {live.incomplete && (
              <span style={{ color: 'var(--muted)' }}>
                not every subject has a mark yet, so there is no GPA
              </span>
            )}
            {live.failed.length > 0 && (
              <span style={{ color: 'var(--bad)' }}>failed {live.failed.join(', ')}</span>
            )}
          </div>

          {over && <div className="err">A mark is above what that part is out of.</div>}

          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => save(false)}
                    disabled={busy || exam?.published || over || !mySubjects.length}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button className="ghost" onClick={() => save(true)}
                    disabled={busy || exam?.published || over || !mySubjects.length}>
              Save and next roll
            </button>
            {note && <span style={{ color: 'var(--accent)', alignSelf: 'center' }}>{note}</span>}
          </div>

          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Enter moves to the next box, so a whole marksheet can be keyed in without
            the mouse. A blank box is “not entered yet”, not a zero.
          </p>
        </div>
      )}
    </>
  );
}
