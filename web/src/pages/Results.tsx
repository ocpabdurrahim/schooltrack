import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { type SchoolSettings, getSettings } from '../data/admin';
import { type SchoolClass, listClasses } from '../data/attendance';
import {
  type Exam,
  type StudentResult,
  type Subject,
  gradeDistribution,
  listExams,
  listSubjects,
  marksForExam,
  meritOrder,
  publishExam,
  sheetFor,
  subjectStats,
  sheetColumns,
  totalMarks,
} from '../data/exams';
import { enteredSoFar, gpaText } from '../data/grading';
import { findStudents } from '../data/people';

type View = 'tabulation' | 'sheet';

/**
 * Two sheets over one set of marks.
 *
 *   TABULATION — the working grid: every subject's mark and grade, the total,
 *   GPA, grade and position, with subject statistics at the foot. Printed
 *   landscape because a section with eight subjects will not fit portrait.
 *
 *   RESULT SHEET — what goes on the noticeboard: merit order, GPA, grade,
 *   passed or failed, with the grade distribution at the foot.
 *
 * Neither stores anything. Correct a mark and both correct themselves.
 */
export default function Results() {
  const { access } = useAuth();
  const admin = access.kind === 'staff' && access.role === 'ADMIN';

  const [view, setView] = useState<View>('tabulation');
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<StudentResult[]>([]);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    Promise.all([listExams(), listSubjects(), listClasses(), getSettings()])
      .then(([e, s, c, set]) => {
        setExams(e); setSubjects(s); setClasses(c); setSchool(set);
        setExamId(e[0]?.examId ?? '');
        setClassId(c[0]?.classId ?? '');
      })
      .catch(() => setProblem('Could not read the exams.'))
      .finally(() => setBusy(false));
  }, []);

  const exam = exams.find((e) => e.examId === examId);
  const section = classes.find((c) => c.classId === classId);

  useEffect(() => {
    if (!examId || !classId) return;
    let live = true;
    setBusy(true);
    (async () => {
      try {
        const [students, marks] = await Promise.all([
          findStudents(classId, ''),
          marksForExam(examId, classId),
        ]);
        if (live) { setRows(sheetFor(students, subjects, marks, examId)); setProblem(''); }
      } catch {
        if (live) setProblem('Could not build the sheet.');
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [examId, classId, subjects]);

  const className = rows[0]?.student.className ?? '';
  const columns = className ? sheetColumns(subjects, className) : [];
  const complete = rows.filter((r) => !r.tabulation.incomplete).length;
  const passed = rows.filter((r) => (r.tabulation.gpa ?? 0) > 0).length;
  const stats = subjectStats(rows, columns);
  const distribution = gradeDistribution(rows);
  const merit = meritOrder(rows);

  /**
   * A tabulation with eight subjects will not fit portrait. @page cannot be
   * scoped to an element or switched by a class, so the rule is injected for
   * the duration of the print and taken out again.
   */
  function print(landscape: boolean) {
    if (!landscape) { window.print(); return; }
    const style = document.createElement('style');
    style.textContent = '@page { size: A4 landscape; margin: 10mm; }';
    document.head.appendChild(style);
    try {
      window.print();
    } finally {
      document.head.removeChild(style);
    }
  }

  async function togglePublish() {
    if (!exam) return;
    setBusy(true);
    try {
      await publishExam(exam.examId, !exam.published);
      setExams(await listExams());
    } catch {
      setProblem('That change was refused. Only an administrator may publish a result.');
    }
    setBusy(false);
  }

  const heading = (
    <div style={{ textAlign: 'center', marginBottom: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{school?.instituteName ?? 'School'}</div>
      <div style={{ fontWeight: 600 }}>
        {view === 'tabulation' ? 'TABULATION SHEET' : 'RESULT SHEET'}
        {exam ? ` — ${exam.examName.toUpperCase()} ${exam.examYear}` : ''}
      </div>
      <div style={{ fontSize: 13 }}>{section?.displayName}</div>
    </div>
  );

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>{view === 'tabulation' ? 'Tabulation sheet' : 'Result sheet'}</h1>
        <h2>
          {exam ? `${exam.examName} ${exam.examYear}` : 'Pick an exam'}
          {section ? ` · ${section.displayName}` : ''}
          {exam?.published && ' · published'}
          {/* People look for "upload results" here, where the results are.
              The marks themselves are entered one subject at a time, and a
              file is read in on that screen. */}
          {' · '}<Link to="/marks">enter or upload marks</Link>
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
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor="cl">Section</label>
            <select id="cl" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.displayName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor="vw">Sheet</label>
            <select id="vw" value={view} onChange={(e) => setView(e.target.value as View)}>
              <option value="tabulation">Tabulation (marks and grades)</option>
              <option value="sheet">Result sheet (merit order)</option>
            </select>
          </div>
        </div>

        <button onClick={() => print(view === 'tabulation')}>
          Print {view === 'tabulation' ? 'landscape' : 'portrait'}
        </button>
        {admin && exam && (
          <button style={{ marginLeft: 12, background: exam.published ? 'var(--muted)' : undefined }}
                  onClick={togglePublish} disabled={busy}>
            {exam.published ? 'Unpublish' : 'Publish result'}
          </button>
        )}
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
          Publishing freezes no figure — everything is computed from the marks, so a
          correction corrects both sheets and every progress report. What it does is
          close mark entry and let parents see the result.
        </p>
        {problem && <div className="err">{problem}</div>}
      </div>

      <div className="card">
        <div className="print-sheet">
          {heading}

          <div className="no-print" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>
              {busy ? 'Working…'
                : `${rows.length} student${rows.length === 1 ? '' : 's'} · ${complete} complete · ${passed} passed`}
            </h2>
          </div>

          {!busy && rows.length > 0 && view === 'tabulation' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 4px' }}>Roll</th>
                    <th style={{ padding: '6px 4px' }}>Name</th>
                    {columns.map((c) => (
                      <th key={c.subjectId} style={{ padding: '6px 4px', textAlign: 'center' }}>
                        {c.subjectName.slice(0, 10)}{c.isOptional ? '*' : ''}
                        <span style={{ display: 'block', fontWeight: 400, color: 'var(--muted)' }}>
                          /{c.fullMarks}
                        </span>
                      </th>
                    ))}
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>GPA</th>
                    <th style={{ padding: '6px 4px', textAlign: 'center' }}>Grade</th>
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>Pos</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.student.studentId} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '5px 4px' }}>{r.student.rollNo}</td>
                      <td style={{ padding: '5px 4px' }}>
                        <Link to={`/students/${r.student.studentId}`}>{r.student.fullName}</Link>
                      </td>
                      {columns.map((c) => {
                        const s = r.tabulation.subjects.find((x) => x.subjectId === c.subjectId);
                        // No entry at all means the student does not sit this
                        // paper — a Humanities row under Physics. That is not
                        // the same as a mark nobody has typed yet, and reading
                        // it as one is how a whole group ends up looking
                        // unfinished. A blank says "not theirs"; "—" says
                        // "theirs, still missing".
                        if (!s) {
                          return (
                            <td key={c.subjectId} style={{
                              padding: '5px 4px', textAlign: 'center', color: 'var(--line)',
                            }}>·</td>
                          );
                        }
                        // A subject that is half in has no mark yet — Bangla
                        // first and second paper are ONE subject out of 200 —
                        // but it must not print the same dash as a subject
                        // nobody has touched, or the teacher who just keyed in
                        // one of the two papers thinks it went nowhere.
                        const sofar = s.marks === null && !s.absent ? enteredSoFar(s) : null;
                        return (
                          <td key={c.subjectId} style={{
                            padding: '5px 4px', textAlign: 'center',
                            color: s.letter === 'F' ? 'var(--bad)'
                              : sofar !== null ? 'var(--muted)' : undefined,
                          }}>
                            {s.absent ? 'abs' : s.marks ?? (sofar !== null ? `(${sofar})` : '—')}
                            {!s.absent && s.marks !== null && (
                              <span style={{ color: 'var(--muted)' }}> {s.letter}</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ padding: '5px 4px', textAlign: 'right' }}>
                        {totalMarks(r.tabulation) ?? '—'}
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 700 }}>
                        {gpaText(r.tabulation.gpa)}
                      </td>
                      <td style={{
                        padding: '5px 4px', textAlign: 'center',
                        color: r.tabulation.letter === 'F' ? 'var(--bad)' : undefined,
                      }}>
                        {r.tabulation.letter}
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'right' }}>
                        {r.position ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--line)', color: 'var(--muted)' }}>
                    <td colSpan={2} style={{ padding: '6px 4px' }}>Highest</td>
                    {stats.map((s) => (
                      <td key={s.subjectId} style={{ padding: '6px 4px', textAlign: 'center' }}>
                        {s.highest ?? '—'}
                      </td>
                    ))}
                    <td colSpan={4} />
                  </tr>
                  <tr style={{ color: 'var(--muted)' }}>
                    <td colSpan={2} style={{ padding: '2px 4px' }}>Lowest</td>
                    {stats.map((s) => (
                      <td key={s.subjectId} style={{ padding: '2px 4px', textAlign: 'center' }}>
                        {s.lowest ?? '—'}
                      </td>
                    ))}
                    <td colSpan={4} />
                  </tr>
                  <tr style={{ color: 'var(--muted)' }}>
                    <td colSpan={2} style={{ padding: '2px 4px' }}>Average</td>
                    {stats.map((s) => (
                      <td key={s.subjectId} style={{ padding: '2px 4px', textAlign: 'center' }}>
                        {s.average ?? '—'}
                      </td>
                    ))}
                    <td colSpan={4} />
                  </tr>
                  <tr style={{ color: 'var(--muted)' }}>
                    <td colSpan={2} style={{ padding: '2px 4px' }}>Failed</td>
                    {stats.map((s) => (
                      <td key={s.subjectId} style={{ padding: '2px 4px', textAlign: 'center' }}>
                        {s.failed}
                      </td>
                    ))}
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
                * optional subject — it adds to the total, and to the GPA only above 2.00.
                A dash is a mark not entered; that student has no total, no GPA and no
                position. A number in brackets, like (50), means part of that subject is
                in and part is not — the two Bangla papers are one subject out of 200, so
                it has no mark of its own until both are entered. A dot is a paper that
                student does not sit. Statistics ignore a mark that has not been entered,
                and count an absence as a fail.
              </p>
            </div>
          )}

          {!busy && rows.length > 0 && view === 'sheet' && (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 4px' }}>Position</th>
                    <th style={{ padding: '6px 4px' }}>Roll</th>
                    <th style={{ padding: '6px 4px' }}>Name</th>
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>GPA</th>
                    <th style={{ padding: '6px 4px', textAlign: 'center' }}>Grade</th>
                    <th style={{ padding: '6px 4px' }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {merit.map((r) => (
                    <tr key={r.student.studentId} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 4px' }}>{r.position ?? '—'}</td>
                      <td style={{ padding: '6px 4px' }}>{r.student.rollNo}</td>
                      <td style={{ padding: '6px 4px' }}>
                        <Link to={`/students/${r.student.studentId}`}>{r.student.fullName}</Link>
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                        {totalMarks(r.tabulation) ?? '—'}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 700 }}>
                        {gpaText(r.tabulation.gpa)}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                        {r.tabulation.letter}
                      </td>
                      <td style={{ padding: '6px 4px' }}>
                        {r.tabulation.incomplete
                          ? <span style={{ color: 'var(--muted)' }}>marks not all in</span>
                          : r.tabulation.letter === 'F'
                            ? <span style={{ color: 'var(--bad)' }}>
                                Failed{r.tabulation.failed.length ? ` — ${r.tabulation.failed.join(', ')}` : ''}
                              </span>
                            : <span style={{ color: 'var(--accent)' }}>Passed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: 18 }}>
                <h2>Summary</h2>
                <div className="row">
                  <span>Appeared</span><span>{rows.length}</span>
                </div>
                <div className="row">
                  <span>Passed</span>
                  <span>
                    {passed}
                    {complete > 0 && (
                      <span style={{ color: 'var(--muted)' }}>
                        {' '}({Math.round((passed / complete) * 100)}% of those complete)
                      </span>
                    )}
                  </span>
                </div>
                {distribution.map((d) => (
                  <div className="row" key={d.letter}>
                    <span>{d.letter}</span><span>{d.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {!busy && rows.length === 0 && (
            <p style={{ color: 'var(--muted)', margin: 0 }}>No students in this section.</p>
          )}

          {rows.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
                Class teacher
              </div>
              <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
                {school?.headTeacher ?? 'Head teacher'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
