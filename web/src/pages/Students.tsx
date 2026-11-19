import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { type SchoolClass, listClasses } from '../data/attendance';
import { type AttendanceTotal, attendanceTotals, marksBetween } from '../data/attendanceReports';
import { type Dues, currentYear, duesFor, money } from '../data/fees';
import { type StudentDetail, findStudents, startOfMonth, startOfYear } from '../data/people';
import { todayInDhaka } from '../data/attendance';

/**
 * The student list, with the figures the office is usually about to look up
 * anyway: which stream the child is in, how much of the register they have
 * been present for, and what is still owed.
 *
 * Those two figures are the reason this page is careful about WHEN it fetches
 * them. Attendance is one query per section, so it waits until a section is
 * chosen rather than pulling a year of marks for the whole school; the money
 * is three queries for everybody at once, however many students there are.
 * A list that cost a read per student would be fine at 78 and unusable at 400.
 */
export default function Students() {
  const { access } = useAuth();
  const mayEdit = access.kind === 'staff' && (access.role === 'ADMIN' || access.role === 'OFFICE');
  // ADMIN and ACCOUNTS only, exactly as the rules have it: /payments is closed
  // to OFFICE, so offering them the columns would only earn a refusal.
  const maySeeMoney = access.kind === 'staff'
    && (access.role === 'ADMIN' || access.role === 'ACCOUNTS');

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [text, setText] = useState('');
  const [includeLeft, setIncludeLeft] = useState(false);
  const [since, setSince] = useState<'month' | 'year'>('month');
  const [rows, setRows] = useState<StudentDetail[]>([]);
  const [attendance, setAttendance] = useState<Map<string, AttendanceTotal>>(new Map());
  const [fees, setFees] = useState<Map<string, Dues>>(new Map());
  const [busy, setBusy] = useState(true);
  const [extras, setExtras] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => { listClasses().then(setClasses).catch(() => {}); }, []);

  useEffect(() => {
    let live = true;
    setBusy(true);
    findStudents(classId || null, text, includeLeft)
      .then((r) => { if (live) { setRows(r); setProblem(''); } })
      .catch(() => { if (live) setProblem('Could not read the student list.'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [classId, text, includeLeft]);

  // Attendance, once there is a section to fetch it for: it is one query per
  // section, and a year of marks for the whole school is not worth pulling to
  // decorate a list. Separate from the list itself so typing a name never
  // waits on it.
  useEffect(() => {
    if (!classId || rows.length === 0) { setAttendance(new Map()); return; }
    let live = true;
    setExtras(true);
    const from = since === 'year' ? startOfYear() : startOfMonth();
    marksBetween(classId, from, todayInDhaka())
      .then((m) => { if (live) setAttendance(attendanceTotals(rows, m)); })
      .catch(() => { if (live) setProblem('The list is here, but attendance could not be read.'); })
      .finally(() => { if (live) setExtras(false); });
    return () => { live = false; };
  }, [classId, rows, since]);

  // The money, for anybody allowed to see it. Three queries however many
  // students are listed, so this one does not need a section first.
  useEffect(() => {
    if (!maySeeMoney || rows.length === 0) { setFees(new Map()); return; }
    let live = true;
    duesFor(rows, currentYear())
      .then((d) => { if (live) setFees(new Map(d.map((x) => [x.student.studentId, x]))); })
      .catch(() => { if (live) setProblem('The list is here, but the fees could not be read.'); });
    return () => { live = false; };
  }, [rows, maySeeMoney]);

  return (
    <div className="wrap">
      <div className="card">
        <h1>Students</h1>
        <h2>{busy ? 'Searching…' : `${rows.length} student${rows.length === 1 ? '' : 's'}`}</h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 240px' }}>
            <label htmlFor="q">Name, roll or registration number</label>
            <input id="q" value={text} onChange={(e) => setText(e.target.value)}
                   placeholder="Ayesha, or 3, or R-1001" autoComplete="off" />
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor="cls">Section</label>
            <select id="cls" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">All sections</option>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.displayName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="since">Attendance</label>
            <select id="since" value={since}
                    onChange={(e) => setSince(e.target.value as 'month' | 'year')}>
              <option value="month">This month</option>
              <option value="year">This year</option>
            </select>
          </div>
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={includeLeft}
                 onChange={(e) => setIncludeLeft(e.target.checked)} />
          Include students who have left
        </label>

        {mayEdit && (
          <p style={{ marginTop: 14, marginBottom: 0 }}>
            <Link to="/students/new">Add a student</Link>
            {' · '}
            <Link to="/students/batch">Add many at once</Link>
          </p>
        )}
      </div>

      {problem && <div className="card"><div className="err">{problem}</div></div>}

      <div className="card">
        {!busy && rows.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>Nobody matches that.</p>
        )}

        {rows.length > 0 && (
          <table className="stu">
            <thead>
              <tr>
                <th>Roll</th>
                <th>Name</th>
                <th>Class</th>
                <th>Group</th>
                <th className="num">
                  Days present
                  <small>{since === 'year' ? 'this year' : 'this month'}</small>
                </th>
                {maySeeMoney && <th className="num">Paid</th>}
                {maySeeMoney && <th className="num">Due</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const a = attendance.get(s.studentId);
                const m = fees.get(s.studentId);
                // Below 70% is the figure the school chases, so it is the one
                // worth seeing from across the room.
                const thin = a?.percent !== null && a !== undefined && a.percent < 70;
                return (
                  <tr key={s.studentId}>
                    <td data-label="Roll" className="num stu-roll">{s.rollNo}</td>
                    <td data-label="Name" className="stu-head">
                      <Link to={`/students/${s.studentId}`}>{s.fullName}</Link>
                      {s.status === 'I' && <span className="pill none" style={{ marginLeft: 8 }}>left</span>}
                    </td>
                    <td data-label="Class" className="muted">{s.className} - {s.section}</td>
                    <td data-label="Group">
                      {s.groupName
                        ? <span className="chip">{s.groupName}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td data-label="Days present" className={`num${thin ? ' bad' : ''}`}>
                      {!classId
                        ? <span className="muted">pick a section</span>
                        : a === undefined || a.percent === null
                          ? <span className="muted">
                              {extras ? '…' : 'register not taken'}
                            </span>
                          : (
                            <span title={`Present on ${a.present} of the ${a.marked} day`
                              + `${a.marked === 1 ? '' : 's'} the register was taken`
                              + ' (late counts as present)'}>
                              {a.percent}%
                              <span className="of">
                                {a.present} of {a.marked} day{a.marked === 1 ? '' : 's'}
                              </span>
                            </span>
                          )}
                    </td>
                    {maySeeMoney && (
                      <td data-label="Paid" className="num">
                        {m ? money(m.paid) : <span className="muted">—</span>}
                      </td>
                    )}
                    {maySeeMoney && (
                      <td data-label="Due" className={`num${m && m.due > 0 ? ' bad' : ''}`}>
                        {m ? money(m.due) : <span className="muted">—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {rows.length > 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
            {classId
              ? '“2 of 25 days” counts only the days the register was actually taken, not '
                + 'every working day — a week nobody marked is not a week of truancy. Late '
                + 'counts as present. Money is this year’s: what has been taken, and what is '
                + 'still owed up to this month.'
              : 'Pick a section above to see how many days each child was present: that is '
                + 'one query for the whole section, and a year of marks for the whole school '
                + 'is not worth fetching to show a list.'}
          </p>
        )}
      </div>
    </div>
  );
}
