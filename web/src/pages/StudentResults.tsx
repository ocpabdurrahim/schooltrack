import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { type SchoolSettings, getSettings } from '../data/admin';
import {
  type Exam,
  listExams,
  listSubjects,
  resultLines,
  resultsForStudent,
} from '../data/exams';
import { MAX_GPA, type Tabulation, gpaText } from '../data/grading';
import { type StudentDetail, getStudent } from '../data/people';

/**
 * Every exam a child has sat, in one place — the results report a parent opens.
 *
 * A PARENT SEES PUBLISHED EXAMS ONLY, the same rule the student page follows:
 * a result still being entered is a number that is going to move, and a parent
 * reading it has no way of knowing that. Staff see everything, marked as such.
 *
 * Progress runs oldest first, because that is the direction a parent reads it.
 * The per-subject marks are here too, so the common question — "where did she
 * lose it?" — is answered without opening four separate report cards.
 */
export default function StudentResults() {
  const { studentId = '' } = useParams();
  const { access } = useAuth();
  const guardian = access.kind === 'guardian';
  const mine = !guardian || access.studentIds.includes(studentId);

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [results, setResults] = useState<{ exam: Exam; tabulation: Tabulation }[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'forbidden' | 'error'>('loading');

  useEffect(() => {
    if (!mine) { setState('forbidden'); return; }
    (async () => {
      try {
        const [s, settings] = await Promise.all([getStudent(studentId), getSettings()]);
        if (!s) { setState('missing'); return; }
        setStudent(s);
        setSchool(settings);

        const [exams, subjects] = await Promise.all([listExams(), listSubjects()]);
        const all = await resultsForStudent(s, exams, subjects);
        setResults(guardian ? all.filter((r) => r.exam.published) : all);
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [studentId, mine, guardian]);

  if (state === 'forbidden') {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Not your student</h1>
          <p className="panel-note">
            This account may only see the children listed against it. If that is
            wrong, the school has to add them.
          </p>
        </div>
      </div>
    );
  }
  if (state === 'loading') return <div className="wrap"><div className="card">Loading…</div></div>;
  if (state === 'missing') return <div className="wrap"><div className="card">No such student.</div></div>;
  if (state === 'error') return <div className="wrap"><div className="card err">Could not read those results.</div></div>;

  const lines = resultLines(results);
  const byExam = new Map(results.map((r) => [r.exam.examId, r.tabulation]));

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Results report</h1>
        <h2>
          {student?.fullName} · {student?.className} - {student?.section} · Roll {student?.rollNo}
        </h2>
        <button onClick={() => window.print()}>Print</button>
        <Link to={`/students/${studentId}`} style={{ marginLeft: 14, fontSize: 14 }}>
          Back to the student
        </Link>
      </div>

      {lines.length === 0 && (
        <div className="card">
          <h2>Nothing published yet</h2>
          <p className="panel-note" style={{ lineHeight: 1.55 }}>
            {guardian
              ? 'No exam results have been published for this student yet. They appear here as soon as the school publishes each exam.'
              : 'This student has no marks entered for any exam yet.'}
          </p>
        </div>
      )}

      {lines.length > 0 && (
        <div className="card print-sheet">
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <strong style={{ fontSize: 17 }}>{school?.instituteName ?? 'SchoolTrack'}</strong>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>RESULTS</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>
              {student?.fullName} · {student?.className} - {student?.section} · Roll {student?.rollNo}
              {school?.sessionLabel && <> · Session {school.sessionLabel}</>}
            </div>
          </div>

          <table className="sheet">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Exam</th>
                <th>Marks</th>
                <th>%</th>
                <th>GPA</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.examId}>
                  <td style={{ textAlign: 'left' }}>
                    {line.examName} {line.examYear}
                    {!line.published && <span className="pill none" style={{ marginLeft: 8 }}>not published</span>}
                  </td>
                  <td>{line.obtained === null ? '—' : `${line.obtained} / ${line.outOf}`}</td>
                  <td>{line.percent === null ? '—' : `${line.percent}%`}</td>
                  <td><strong>{gpaText(line.gpa)}</strong></td>
                  <td className={line.letter === 'F' ? 'poor' : 'good'}><strong>{line.letter}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>

          {lines.length > 1 && (
            <>
              {/* NOT called progress: an exam carries no date, so two exams in
                  the same year are ordered by name, and a chart labelled
                  "progress" would read as a rise or a fall that the data does
                  not actually know about. */}
              <h2 style={{ marginTop: 20 }}>GPA by exam</h2>
              <div className="bars" style={{ height: 110 }}>
                {lines.map((line) => (
                  <div className="bar-col" key={line.examId} title={`${line.examName} ${line.examYear}`}>
                    <span className="bar-pct">{gpaText(line.gpa)}</span>
                    <div
                      className={`bar${line.letter === 'F' ? ' none' : ''}`}
                      // out of 5, not out of the best of the set: scaling to the
                      // best turns a 4.83 against a 4.17 into a cliff
                      style={{ height: `${Math.max(4, ((line.gpa ?? 0) / MAX_GPA) * 100)}%` }}
                    />
                    <span className="bar-cap">
                      <b>{line.examName.slice(0, 8)}</b>{line.examYear}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {lines.map((line) => {
            const tabulation = byExam.get(line.examId);
            if (!tabulation) return null;
            return (
              <div key={line.examId} style={{ marginTop: 22 }}>
                <h2>
                  {line.examName} {line.examYear}
                  {' · '}
                  <span className={line.letter === 'F' ? 'poor' : 'good'}>
                    GPA {gpaText(line.gpa)} ({line.letter})
                  </span>
                </h2>
                <table className="sheet">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Subject</th>
                      <th>Marks</th>
                      <th>Out of</th>
                      <th>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabulation.subjects.map((s) => (
                      <tr key={s.subjectId}>
                        <td style={{ textAlign: 'left' }}>
                          {s.subjectName}
                          {s.isOptional && <span className="pill" style={{ marginLeft: 8 }}>optional</span>}
                        </td>
                        <td>{s.absent ? 'absent' : s.marks ?? '—'}</td>
                        <td>{s.fullMarks}</td>
                        <td className={s.letter === 'F' ? 'poor' : undefined}>{s.letter}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {line.failed.length > 0 && (
                  <p className="panel-note" style={{ color: 'var(--bad)', marginTop: 8 }}>
                    Failed: {line.failed.join(', ')}
                  </p>
                )}
                <p className="panel-note no-print" style={{ marginTop: 8 }}>
                  <Link to={`/report/${line.examId}/${studentId}`}>Full progress report →</Link>
                </p>
              </div>
            );
          })}

          <p className="panel-note" style={{ marginTop: 20, lineHeight: 1.55 }}>
            How the grade is worked out: one F in a compulsory subject fails the
            exam whatever the other marks are, and the optional subject only ever
            helps — points above 2.00 are added, and failing it costs nothing. A
            total is shown only once every subject's mark is in, so a part-entered
            exam cannot read as a poor one.
          </p>
        </div>
      )}
    </div>
  );
}
