import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { type SchoolSettings, getSettings } from '../data/admin';
import {
  type Exam,
  type Subject,
  getExam,
  listSubjects,
  marksForStudent,
  sheetFor,
} from '../data/exams';
import { type Tabulation, gpaText } from '../data/grading';
import {
  type AttendanceSummary,
  type StudentDetail,
  attendanceFor,
  findStudents,
  getStudent,
  startOfYear,
} from '../data/people';

/**
 * One student's progress report, laid out to be printed — the equivalent of
 * APEX page 43.
 *
 * Attendance is on it because a report card without it tells half the story,
 * and this app owns both. The position comes from the whole section, so the
 * section's marks are read even though only one student is shown.
 */
export default function ReportCard() {
  const { examId = '', studentId = '' } = useParams();
  const { access } = useAuth();

  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [tabulation, setTabulation] = useState<Tabulation | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [outOf, setOutOf] = useState(0);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'forbidden'>('loading');

  const mine = access.kind !== 'guardian' || access.studentIds.includes(studentId);

  useEffect(() => {
    if (!mine) { setState('forbidden'); return; }
    (async () => {
      try {
        const [s, e, subjects, settings] = await Promise.all([
          getStudent(studentId),
          getExam(examId),
          listSubjects() as Promise<Subject[]>,
          getSettings(),
        ]);
        if (!s || !e) { setState('error'); return; }
        setStudent(s); setExam(e); setSchool(settings);

        // A parent must not read a result that is still being entered.
        if (access.kind === 'guardian' && !e.published) { setState('forbidden'); return; }

        const classmates = await findStudents(s.classId, '').catch(() => [s]);
        const marks = await marksForStudent(s.studentId);
        const own = sheetFor([s], subjects, marks, examId)[0];
        setTabulation(own.tabulation);

        // position needs the section; a guardian cannot read it, so it is
        // simply left off their copy rather than failing the page
        if (classmates.length > 1) {
          try {
            const all = await Promise.all(
              classmates.map((c) => marksForStudent(c.studentId)),
            );
            const sheet = sheetFor(classmates, subjects, all.flat(), examId);
            setPosition(sheet.find((r) => r.student.studentId === s.studentId)?.position ?? null);
            setOutOf(classmates.length);
          } catch { /* no position on this copy */ }
        }

        setAttendance(await attendanceFor(studentId, startOfYear()).catch(() => null));
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [examId, studentId, mine]);

  if (state === 'loading') return <div className="wrap"><div className="card">Loading…</div></div>;
  if (state === 'forbidden') return (
    <div className="wrap"><div className="card">
      <h1>Not available</h1>
      <p style={{ margin: 0 }}>
        This report is either not yours or not published yet. <Link to="/">Back</Link>
      </p>
    </div></div>
  );
  if (state === 'error' || !student || !exam || !tabulation) return (
    <div className="wrap"><div className="card"><div className="err">
      Could not build this report.
    </div></div></div>
  );

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Progress report</h1>
        <h2>
          {student.fullName} · {exam.examName} {exam.examYear}
          {' · '}<Link to={`/students/${student.studentId}`}>student page</Link>
        </h2>
        <button onClick={() => window.print()}>Print</button>
        {!exam.published && (
          <p style={{ color: 'var(--bad)', fontSize: 14, marginBottom: 0 }}>
            This exam is not published yet — parents cannot see this report.
          </p>
        )}
      </div>

      <div className="card">
        <div className="print-sheet">
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {school?.instituteName ?? 'School'}
            </div>
            {school?.address && <div style={{ fontSize: 13 }}>{school.address}</div>}
            <div style={{ marginTop: 8, fontWeight: 600 }}>
              PROGRESS REPORT — {exam.examName.toUpperCase()} {exam.examYear}
            </div>
          </div>

          <div className="row"><span>Name</span><span>{student.fullName}</span></div>
          <div className="row"><span>Class</span><span>{student.className} - {student.section} · Roll {student.rollNo}</span></div>
          {student.fatherName && (
            <div className="row"><span>Father</span><span>{student.fatherName}</span></div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                <th style={{ padding: '6px 0' }}>Subject</th>
                <th style={{ padding: '6px 0', textAlign: 'right' }}>Full</th>
                <th style={{ padding: '6px 0', textAlign: 'right' }}>Marks</th>
                <th style={{ padding: '6px 0', textAlign: 'right' }}>Grade</th>
              </tr>
            </thead>
            <tbody>
              {tabulation.subjects.map((s) => (
                <tr key={s.subjectId} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px 0' }}>
                    {s.subjectName}{s.isOptional ? ' (optional)' : ''}
                  </td>
                  <td style={{ padding: '6px 0', textAlign: 'right' }}>{s.fullMarks}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right' }}>
                    {s.absent ? 'absent' : s.marks ?? '—'}
                  </td>
                  <td style={{
                    padding: '6px 0', textAlign: 'right',
                    color: s.letter === 'F' ? 'var(--bad)' : undefined,
                  }}>
                    {s.letter}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="tiles" style={{ marginTop: 16 }}>
            <div className="tile">
              <div className="tile-value">{gpaText(tabulation.gpa)}</div>
              <div className="tile-label">GPA</div>
            </div>
            <div className="tile">
              <div className="tile-value">{tabulation.letter}</div>
              <div className="tile-label">grade</div>
            </div>
            {position !== null && (
              <div className="tile">
                <div className="tile-value">{position}</div>
                <div className="tile-label">of {outOf} in the section</div>
              </div>
            )}
            {attendance && attendance.marked > 0 && (
              <div className="tile">
                <div className="tile-value">{attendance.percent}%</div>
                <div className="tile-label">attendance</div>
              </div>
            )}
          </div>

          {tabulation.failed.length > 0 && (
            <p style={{ color: 'var(--bad)', marginTop: 14 }}>
              Failed: {tabulation.failed.join(', ')}
            </p>
          )}
          {tabulation.incomplete && (
            <p style={{ color: 'var(--muted)', marginTop: 14 }}>
              Some marks have not been entered, so there is no GPA yet.
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
              Class teacher
            </div>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
              {school?.headTeacher ?? 'Head teacher'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
