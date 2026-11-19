import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { type ClassRow, type SchoolSettings, getSettings, listAllClasses } from '../data/admin';
import {
  type Exam,
  type Subject,
  getExam,
  listSubjects,
  marksForExam,
  marksForStudent,
  sheetFor,
} from '../data/exams';
import { type Tabulation, gpaText } from '../data/grading';
import { type Sitting, satAs, sittingName } from '../data/sitting';
import {
  type AttendanceSummary,
  type StudentDetail,
  attendanceFor,
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
  const [sat, setSat] = useState<Sitting | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
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

        const marks = await marksForStudent(s.studentId);
        const own = sheetFor([s], subjects, marks, examId)[0];
        setTabulation(own.tabulation);

        // Where this exam was SAT, from its own marks — not where the student
        // is now. Everything below that names a class uses this.
        const where = satAs(marks.filter((m) => m.examId === examId));
        setSat(where);
        // listAllClasses, not the active ones: a class that has been moved up
        // is archived, and its name is exactly what an older report needs.
        setClasses(await listAllClasses().catch(() => []));

        // The position belongs to the cohort that SAT it, so the classmates
        // are read from the class on the marks. After a promotion that class
        // holds different children, who have no marks for this exam —
        // sheetFor refuses to rank an incomplete result, so they fall out of
        // the ranking rather than flattering the position.
        // The cohort comes from the MARKS, not from the class roster.
        //
        // A roster is who is in the class TODAY, which is the wrong question
        // about an exam sat last year: a student who has been moved up is
        // missing from it, and a new intake is in it. Both were visible —
        // the promoted student lost their position entirely, and the
        // classmates they beat were ranked "of 4" for an exam five of them
        // sat. Everyone whose marks for this exam carry this class sat it,
        // and nobody else did.
        const cohortMarks = await marksForExam(examId, where?.classId ?? s.classId);
        const ids = [...new Set(cohortMarks.map((m) => m.studentId))];
        const classmates = (await Promise.all(ids.map((id) => getStudent(id))))
          .filter(Boolean) as StudentDetail[];

        // position needs the section; a guardian cannot read it, so it is
        // simply left off their copy rather than failing the page
        if (classmates.length > 1) {
          try {
            const sheet = sheetFor(classmates, subjects, cohortMarks, examId);
            // Out of how many SAT it, not how many are on the roster. A
            // section of 40 where two were absent all week is a position out
            // of 38, and after a promotion it stops the old exam being
            // ranked against next year's intake.
            const ranked = sheet.filter((r) => r.position !== null).length;
            setPosition(ranked > 1
              ? sheet.find((r) => r.student.studentId === s.studentId)?.position ?? null
              : null);
            setOutOf(ranked);
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
          {/* The class this exam was SAT in. A promoted student's older
              report used to print their new class here, which is the right
              marks under the wrong heading. */}
          <div className="row">
            <span>Class</span>
            <span>
              {sittingName(sat, classes, `${student.className} - ${student.section}`) || '—'}
              {' · Roll '}{sat?.rollNo ?? student.rollNo}
            </span>
          </div>
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
