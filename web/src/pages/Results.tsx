import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { type SchoolClass, listClasses } from '../data/attendance';
import {
  type Exam,
  type StudentResult,
  type Subject,
  listExams,
  listSubjects,
  marksForExam,
  publishExam,
  sheetFor,
  subjectsForClass,
} from '../data/exams';
import { gpaText } from '../data/grading';
import { findStudents } from '../data/people';

export default function Results() {
  const { access } = useAuth();
  const admin = access.kind === 'staff' && access.role === 'ADMIN';

  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<StudentResult[]>([]);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    Promise.all([listExams(), listSubjects(), listClasses()])
      .then(([e, s, c]) => {
        setExams(e); setSubjects(s); setClasses(c);
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
        if (live) setProblem('Could not build the result sheet.');
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [examId, classId, subjects]);

  const className = rows[0]?.student.className ?? '';
  const columns = className ? subjectsForClass(subjects, className) : [];
  const complete = rows.filter((r) => !r.tabulation.incomplete).length;
  const passed = rows.filter((r) => (r.tabulation.gpa ?? 0) > 0).length;

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

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Result sheet</h1>
        <h2>
          {exam ? `${exam.examName} ${exam.examYear}` : 'Pick an exam'}
          {section ? ` · ${section.displayName}` : ''}
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
        </div>

        <button onClick={() => window.print()}>Print</button>
        {admin && exam && (
          <button style={{ marginLeft: 12, background: exam.published ? 'var(--muted)' : undefined }}
                  onClick={togglePublish} disabled={busy}>
            {exam.published ? 'Unpublish' : 'Publish result'}
          </button>
        )}
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
          Publishing does not freeze any number — grades and GPA are always computed from
          the marks, so a correction corrects everything. What it does is close mark entry,
          so a published result cannot drift while parents are reading it.
        </p>
        {problem && <div className="err">{problem}</div>}
      </div>

      <div className="card">
        <h2>
          {busy ? 'Working…' : `${rows.length} student${rows.length === 1 ? '' : 's'} · ${complete} complete · ${passed} passed`}
        </h2>

        {!busy && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 4px' }}>Roll</th>
                  <th style={{ padding: '6px 4px' }}>Name</th>
                  {columns.map((c) => (
                    <th key={c.subjectId} style={{ padding: '6px 4px', textAlign: 'right' }}>
                      {c.subjectName.slice(0, 8)}{c.isOptional ? '*' : ''}
                    </th>
                  ))}
                  <th style={{ padding: '6px 4px', textAlign: 'right' }}>GPA</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right' }}>Grade</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right' }}>Pos</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student.studentId} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '6px 4px' }}>{r.student.rollNo}</td>
                    <td style={{ padding: '6px 4px' }}>
                      <Link to={`/students/${r.student.studentId}`}>{r.student.fullName}</Link>
                      {' '}<Link to={`/report/${examId}/${r.student.studentId}`} className="no-print" style={{ fontSize: 12 }}>report</Link>
                    </td>
                    {columns.map((c) => {
                      const s = r.tabulation.subjects.find((x) => x.subjectId === c.subjectId);
                      return (
                        <td key={c.subjectId} style={{
                          padding: '6px 4px', textAlign: 'right',
                          color: s?.letter === 'F' ? 'var(--bad)' : undefined,
                        }}>
                          {s?.absent ? 'abs' : s?.marks ?? '—'}
                        </td>
                      );
                    })}
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 700 }}>
                      {gpaText(r.tabulation.gpa)}
                    </td>
                    <td style={{
                      padding: '6px 4px', textAlign: 'right',
                      color: r.tabulation.letter === 'F' ? 'var(--bad)' : undefined,
                    }}>
                      {r.tabulation.letter}
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                      {r.position ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!busy && rows.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>No students in this section.</p>
        )}

        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14, marginBottom: 0 }}>
          A dash is a mark not yet entered, and a student with one has no GPA and no
          position — ranking them would put them last for no reason. * marks the optional
          subject: it only ever adds.
        </p>
      </div>
    </div>
  );
}

