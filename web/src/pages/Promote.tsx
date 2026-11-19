import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type Exam,
  type Subject,
  listExams,
  listSubjects,
  marksForExam,
  sheetFor,
} from '../data/exams';
import type { StudentDetail } from '../data/people';
import { type ClassRow, carryOutPromotion, listAllClasses } from '../data/admin';
import { listStudents } from '../data/attendance';
import { marksTotal } from '../data/grading';
import {
  type Candidate,
  type Move,
  nextClassAbove,
  promotionPlan,
  standing,
} from '../data/promotion';

/**
 * Moving a class up at the end of the year.
 *
 * The merit list of the final exam decides next year's roll numbers: first in
 * merit becomes roll 1. Class Ten has nowhere above it, so its students are
 * archived instead.
 *
 * Everything on this screen is a PROPOSAL until the button is pressed. It
 * rewrites every child's class and roll number, which is why it is not done
 * as a side effect of publishing a result — and why the whole plan is on
 * screen, named child by child, before anything is written.
 */
export default function Promote() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<StudentDetail[]>([]);
  const [into, setInto] = useState<StudentDetail[]>([]);
  const [marks, setMarks] = useState<Awaited<ReturnType<typeof marksForExam>>>([]);

  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [takeAnyway, setTakeAnyway] = useState<string[]>([]);

  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    Promise.all([listExams(), listAllClasses(), listSubjects()])
      .then(([e, c, s]) => {
        setExams(e);
        setClasses(c);
        setSubjects(s);
        // Only a final exam can move a class up, and only once published.
        const usable = e.find((x) => x.isFinal && x.published);
        setExamId(usable?.examId ?? '');
      })
      .catch(() => setProblem('Could not load the exams.'))
      .finally(() => setBusy(false));
  }, []);

  const exam = exams.find((e) => e.examId === examId);
  const here = classes.find((c) => c.classId === classId) ?? null;
  const above = useMemo(
    () => (here ? nextClassAbove(
      { classId: here.classId, className: here.className, section: here.section },
      classes.map((c) => ({ classId: c.classId, className: c.className, section: c.section })),
    ) : null),
    [here, classes],
  );

  useEffect(() => {
    let live = true;
    if (!classId || !examId) { setStudents([]); setInto([]); return () => { live = false; }; }
    setBusy(true);
    (async () => {
      try {
        const roll = await listStudents(classId);
        const marks = await marksForExam(examId, classId);
        if (!live) return;
        setStudents(roll as unknown as StudentDetail[]);
        // Who is already sitting in the class above: promoting into an
        // occupied class would hand out roll numbers somebody already has.
        setInto(above ? (await listStudents(above.classId)) as unknown as StudentDetail[] : []);
        setMarks(marks);
        setTakeAnyway([]);
        setNote('');
        setProblem('');
      } catch {
        if (live) setProblem('Could not load that class.');
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [classId, examId, above]);

  const candidates: Candidate[] = useMemo(() => {
    if (!students.length) return [];
    return sheetFor(students, subjects, marks, examId).map((r) => {
      const { obtained } = marksTotal(r.tabulation.subjects);
      return {
        studentId: r.student.studentId,
        fullName: r.student.fullName,
        rollNo: r.student.rollNo,
        gpa: r.tabulation.gpa,
        total: obtained,
        failed: r.tabulation.failed,
        incomplete: r.tabulation.incomplete,
      };
    });
  }, [students, subjects, marks, examId]);

  const plan = useMemo(() => promotionPlan({
    fromClassId: classId,
    toClassId: above?.classId ?? null,
    candidates,
    alreadyThere: into.map((s) => ({ rollNo: s.rollNo, fullName: s.fullName })),
    takeAnyway,
  }), [classId, above, candidates, into, takeAnyway]);

  const goingUp = plan.moves.filter((m) => m.what === 'UP').length;
  const archiving = plan.moves.filter((m) => m.what === 'ARCHIVED').length;
  const staying = plan.moves.filter((m) => m.what === 'STAYS').length;

  function tick(studentId: string, on: boolean) {
    setTakeAnyway((was) => (on ? [...was, studentId] : was.filter((id) => id !== studentId)));
  }

  async function go() {
    if (!plan.moves.length || plan.problem) return;
    setWorking(true); setProblem(''); setNote('');
    try {
      const done = await carryOutPromotion(plan.moves, classes);
      setNote(
        `${done.promoted} student(s) moved up`
        + (done.archived ? ` and ${done.archived} archived` : '')
        + '. Their results stay exactly where they were.',
      );
      // Reload: the class we were looking at has just changed underneath us.
      const roll = await listStudents(classId);
      setStudents(roll as unknown as StudentDetail[]);
      setTakeAnyway([]);
    } catch {
      setProblem('That could not be saved. Nothing was changed.');
    }
    setWorking(false);
  }

  const finals = exams.filter((e) => e.isFinal);

  return (
    <div className="page">
      <div className="card">
        <h1>Move a class up</h1>
        <p className="muted small">
          The merit list of the final exam decides next year&rsquo;s roll
          numbers: first in merit becomes roll 1. Nothing is written until you
          press the button at the bottom, and a student&rsquo;s past results
          are not touched — a result remembers the class and roll it was
          entered under.
        </p>

        {!finals.length && (
          <p className="warn">
            No exam is marked as the final exam of the year. Tick{' '}
            <strong>the final exam of the year</strong> on one, in{' '}
            <Link to="/exams">Exams and subjects</Link>.
          </p>
        )}

        <div className="row3">
          <label>
            Final exam
            <select value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">—</option>
              {finals.map((e) => (
                <option key={e.examId} value={e.examId}>
                  {e.examName} {e.examYear}{e.published ? '' : ' (not published)'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Class
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">—</option>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.displayName}</option>
              ))}
            </select>
          </label>
          <label>
            Moving to
            <input readOnly value={above ? above.className : (here ? 'nowhere — archived' : '—')} />
          </label>
        </div>

        {exam && !exam.published && (
          <p className="warn">
            That exam is not published yet. Publish the result before moving the
            class up, so the merit list everyone can see is the one that decided
            the roll numbers.
          </p>
        )}
        {here && !above && (
          <p className="muted small">
            There is no class above {here.displayName}, so these students have
            finished with the school. They will be archived: kept with all their
            results, and off every register, mark sheet and fee list.
          </p>
        )}
        {problem && <div className="err">{problem}</div>}
        {note && <div className="good">{note}</div>}
      </div>

      {plan.problem && <div className="card"><div className="err">{plan.problem}</div></div>}

      {!busy && !plan.problem && plan.moves.length > 0 && (
        <div className="card">
          {/* Joined rather than concatenated, so a count of nought cannot
              leave a dangling separator at the front. */}
          <h2>
            {[
              goingUp > 0 ? `${goingUp} going up` : '',
              archiving > 0 ? `${archiving} archived` : '',
              staying > 0 ? `${staying} staying down` : '',
            ].filter(Boolean).join(' · ') || 'Nothing to do'}
          </h2>
          {plan.warnings.map((w) => (
            <p key={w} className="warn" style={{ fontSize: 13 }}>{w}</p>
          ))}

          <div className="scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th>Merit</th>
                  <th>Name</th>
                  <th>Roll now</th>
                  <th>GPA</th>
                  <th>Result</th>
                  <th>New roll</th>
                  <th>Take up anyway</th>
                </tr>
              </thead>
              <tbody>
                {plan.moves.map((m: Move, i: number) => {
                  const c = candidates.find((x) => x.studentId === m.studentId);
                  const how = standing(c ?? ({} as Candidate));
                  return (
                    <tr key={m.studentId} className={m.what === 'STAYS' ? 'dim' : ''}>
                      <td>{m.what === 'UP' ? i + 1 : '—'}</td>
                      <td>{m.fullName}</td>
                      <td>{m.fromRoll}</td>
                      <td>{c?.gpa === null || c?.gpa === undefined ? '—' : c.gpa.toFixed(2)}</td>
                      <td className={how === 'PASSED' ? '' : 'bad'}>
                        {how === 'PASSED' ? 'Passed'
                          : how === 'FAILED' ? `Failed ${c?.failed.join(', ')}`
                            : 'No full result yet'}
                      </td>
                      <td>
                        <strong>
                          {m.what === 'UP' ? m.toRoll
                            : m.what === 'ARCHIVED' ? 'archived' : 'stays'}
                        </strong>
                      </td>
                      <td>
                        {how !== 'PASSED' && (
                          <input
                            type="checkbox"
                            checked={takeAnyway.includes(m.studentId)}
                            onChange={(e) => tick(m.studentId, e.target.checked)}
                            aria-label={`Take ${m.fullName} up anyway`}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="actions">
            <button
              type="button"
              onClick={go}
              disabled={working || !!plan.problem || (goingUp + archiving) === 0
                || (exam ? !exam.published : true)}
            >
              {working ? 'Working…'
                : archiving > 0 && goingUp === 0 ? `Archive ${archiving} student${archiving === 1 ? '' : 's'}`
                  : `Move ${goingUp} student${goingUp === 1 ? '' : 's'} up`}
            </button>
            <Link className="btn ghost" to="/results">See the result sheet first</Link>
          </div>
        </div>
      )}
    </div>
  );
}
