import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { STATUS_LABEL, type Status } from '../data/attendance';
import {
  type AttendanceSummary, type StudentDetail,
  attendanceFor, getStudent, startOfMonth, startOfYear,
} from '../data/people';
import { type StudentFees, currentYear, money, studentFees } from '../data/fees';
import { explainPrivilege, normalPrivilege } from '../data/privileges';
import { type Exam, listExams, listSubjects, resultsForStudent } from '../data/exams';
import { type IssuedDocument, documentsFor, typeLabel } from '../data/documents';
import { type Tabulation, gpaText } from '../data/grading';

/**
 * One student, everything SchoolTrack knows.
 *
 * Attendance is here because that module is built. Fees, results and
 * certificates are not yet, and this page says so rather than showing an empty
 * box that looks like "nothing owed" or "no marks".
 */
export default function Student() {
  const { studentId = '' } = useParams();
  const { access } = useAuth();
  // The rules would refuse this anyway; saying so plainly beats
  // "could not load", which reads like a fault in the app.
  const mine = access.kind !== 'guardian' || access.studentIds.includes(studentId);
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [year, setYear] = useState<AttendanceSummary | null>(null);
  const [month, setMonth] = useState<AttendanceSummary | null>(null);
  const [fees, setFees] = useState<StudentFees | null>(null);
  const [results, setResults] = useState<{ exam: Exam; tabulation: Tabulation }[] | null>(null);
  const [docs, setDocs] = useState<IssuedDocument[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error' | 'forbidden'>('loading');

  useEffect(() => {
    if (!mine) { setState('forbidden'); return; }
    (async () => {
      try {
        const s = await getStudent(studentId);
        if (!s) { setState('missing'); return; }
        setStudent(s);
        const [y, m] = await Promise.all([
          attendanceFor(studentId, startOfYear()),
          attendanceFor(studentId, startOfMonth()),
        ]);
        setYear(y); setMonth(m);
        setState('ready');

        // Fees and results are fetched after the page is usable and never
        // allowed to fail it: a teacher may read neither receipts nor the rate
        // card, and a guardian may read receipts but not the rate card.
        setFees(await studentFees(s, currentYear()).catch(() => null));

        // A PARENT SEES PUBLISHED RESULTS ONLY. Staff see everything, so a
        // teacher can check a sheet before it goes out; a parent reading a
        // half-entered result would be reading a number that is going to move.
        const all = await Promise.all([listExams(), listSubjects()])
          .then(([exams, subjects]) => resultsForStudent(s, exams, subjects))
          .catch(() => null);
        setResults(
          all === null ? null
            : access.kind === 'guardian' ? all.filter((r) => r.exam.published)
            : all,
        );

        // The register is the office's, so a teacher's refusal just hides the
        // card rather than failing the page.
        setDocs(await documentsFor(studentId).catch(() => null));
      } catch (e) {
        console.error('student page failed:', e);
        setState('error');
      }
    })();
  }, [studentId, mine]);

  if (state === 'loading') return <div className="wrap"><div className="card">Loading…</div></div>;
  if (state === 'forbidden') return (
    <div className="wrap"><div className="card">
      <h1>Not your student</h1>
      <p style={{ margin: 0 }}>
        This account is linked only to its own children. If that is wrong, the
        school office can correct it. <Link to="/">Back</Link>
      </p>
    </div></div>
  );
  if (state === 'missing') return (
    <div className="wrap"><div className="card">
      <p style={{ margin: 0 }}>No student with id {studentId}. <Link to="/students">Back to the list</Link></p>
    </div></div>
  );
  if (state === 'error' || !student) return (
    <div className="wrap"><div className="card"><div className="err">Could not load this student.</div></div></div>
  );

  const privilege = normalPrivilege(student.privilege);

  const bio: [string, string | undefined][] = [
    ['Roll', String(student.rollNo)],
    ['Class', `${student.className} - ${student.section}`],
    ['Registration', student.regNo],
    ['Group', student.groupName],
    ['Religion', student.religion],
    // Always shown, never filtered out as blank: an office that cannot see
    // the fee arrangement on the record cannot be expected to keep it right.
    ['Privilege', privilege === 'Regular'
      ? 'Regular'
      : `${privilege} — ${explainPrivilege(privilege)}`],
    ['Father', student.fatherName],
    ['Mother', student.motherName],
    ['Date of birth', student.dob],
    ['Blood group', student.bloodGroup],
    ['Mobile', student.mobileNo],
    ['Card', `SMS-STU-${student.studentId}`],
  ];

  return (
    <div className="wrap">
      <div className="card">
        <h1>{student.fullName}</h1>
        <h2>
          {student.className} - {student.section} · Roll {student.rollNo}
          {student.status === 'I' && <> · <span className="pill none">left the school</span></>}
          {' · '}<Link to="/students">all students</Link>
          {access.kind === 'staff' && (access.role === 'ADMIN' || access.role === 'OFFICE') && (
            <> · <Link to={`/students/${student.studentId}/edit`}>edit</Link></>
          )}
        </h2>
        {bio.filter(([, v]) => v).map(([k, v]) => (
          <div className="row" key={k}><span>{k}</span><span>{v}</span></div>
        ))}
      </div>

      <div className="card">
        <h2>Attendance</h2>
        <div className="row">
          <span>This month</span>
          <span>{summarise(month)}</span>
        </div>
        <div className="row">
          <span>Month by month</span>
          <span><Link to={`/students/${studentId}/attendance`}>Attendance report →</Link></span>
        </div>
        <div className="row">
          <span>This year</span>
          <span>{summarise(year)}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0' }}>
          The percentage is of days actually marked, not of every school day —
          a section that started marking late would otherwise look like poor
          attendance rather than a thin register.
        </p>
      </div>

      {year && year.recent.length > 0 && (
        <div className="card">
          <h2>Recent days</h2>
          {year.recent.map((d) => (
            <div className="row" key={d.date}>
              <span>{d.date}</span>
              <span style={{ color: colour(d.status), fontWeight: 600 }}>
                {STATUS_LABEL[d.status]}
                {d.markedVia === 'SCAN' && <span className="pill" style={{ marginLeft: 8 }}>scanned</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {fees && (fees.receipts !== null || fees.expected !== null) && (
        <div className="card">
          <h2>Fees · {currentYear()}</h2>
          <div className="row">
            <span>Head by head</span>
            <span><Link to={`/students/${studentId}/fees`}>Fees report →</Link></span>
          </div>
          <div className="tiles">
            {fees.expected !== null && (
              <div className="tile">
                <div className="tile-value">{money(fees.expected)}</div>
                <div className="tile-label">charged so far</div>
              </div>
            )}
            <div className="tile">
              <div className="tile-value">{money(fees.paid)}</div>
              <div className="tile-label">paid</div>
            </div>
            {fees.discount > 0 && (
              <div className="tile">
                <div className="tile-value">{money(fees.discount)}</div>
                <div className="tile-label">discount</div>
              </div>
            )}
            {fees.due !== null && (
              <div className="tile">
                <div className="tile-value" style={{ color: fees.due > 0 ? 'var(--bad)' : 'var(--accent)' }}>
                  {fees.due > 0 ? money(fees.due) : 'clear'}
                </div>
                <div className="tile-label">due</div>
              </div>
            )}
          </div>

          {(fees.receipts ?? []).length > 0 && (
            <>
              <h2 style={{ marginTop: 18 }}>Receipts</h2>
              {fees.receipts!.map((p) => (
                <div className="row" key={p.receiptNo}>
                  <span style={{ color: 'var(--ink)' }}>
                    {access.kind === 'staff'
                      ? <Link to={`/fees/receipts/${p.receiptNo}`}>{p.receiptNo}</Link>
                      : p.receiptNo}
                    <span style={{ color: 'var(--muted)', marginLeft: 10 }}>{p.paymentDate}</span>
                  </span>
                  <span>{money(p.totalAmount)}</span>
                </div>
              ))}
            </>
          )}

          {(fees.receipts ?? []).length === 0 && (
            <p style={{ color: 'var(--muted)', margin: 0 }}>Nothing has been collected yet.</p>
          )}
        </div>
      )}

      {results !== null && results.length > 0 && (
        <div className="card">
          <h2>Results</h2>
          <div className="row">
            <span>Every exam</span>
            <span><Link to={`/students/${studentId}/results`}>Results report →</Link></span>
          </div>
          {results.map(({ exam, tabulation }) => (
            <div className="row" key={exam.examId}>
              <span style={{ color: 'var(--ink)' }}>
                <Link to={`/report/${exam.examId}/${studentId}`}>{exam.examName} {exam.examYear}</Link>
                {!exam.published && (
                  <span className="pill none" style={{ marginLeft: 8 }}>not published</span>
                )}
              </span>
              <span>
                {tabulation.incomplete
                  ? <span style={{ color: 'var(--muted)' }}>marks not all in</span>
                  : <>
                      <strong style={{
                        color: tabulation.letter === 'F' ? 'var(--bad)' : 'var(--accent)',
                      }}>
                        {gpaText(tabulation.gpa)}
                      </strong>
                      <span style={{ color: 'var(--muted)' }}> · {tabulation.letter}</span>
                      {tabulation.failed.length > 0 && (
                        <span style={{ color: 'var(--bad)' }}> · failed {tabulation.failed.join(', ')}</span>
                      )}
                    </>}
              </span>
            </div>
          ))}
        </div>
      )}

      {docs !== null && (
        <div className="card">
          <h2>Documents</h2>
          {docs.length === 0 && (
            <p style={{ color: 'var(--muted)', margin: 0 }}>
              Nothing has been issued to this student.
            </p>
          )}
          {docs.map((d) => (
            <div className="row" key={d.serialNo}>
              <span style={{ color: 'var(--ink)' }}>
                <Link to={`/certificates/${d.serialNo}`}>{d.serialNo}</Link>
                <span style={{ color: 'var(--muted)', marginLeft: 10 }}>{typeLabel(d.type)}</span>
              </span>
              <span>{d.issueDate}</span>
            </div>
          ))}
          <p style={{ marginTop: 12, marginBottom: 0 }}>
            <Link to="/certificates">Issue a certificate</Link>
            {' · '}
            <Link to="/id-cards">ID cards for this section</Link>
          </p>
        </div>
      )}
    </div>
  );
}

function summarise(a: AttendanceSummary | null) {
  if (!a || a.marked === 0) return <span style={{ color: 'var(--muted)' }}>no days marked</span>;
  const good = (a.percent ?? 0) >= 75;
  return (
    <span>
      <strong style={{ color: good ? 'var(--accent)' : 'var(--bad)' }}>{a.percent}%</strong>
      {' '}<span style={{ color: 'var(--muted)' }}>({a.present} of {a.marked} days)</span>
    </span>
  );
}

function colour(s: Status) {
  return s === 'P' ? '#0a730a' : s === 'A' ? '#c00000' : s === 'L' ? '#b45309' : '#1d4ed8';
}



