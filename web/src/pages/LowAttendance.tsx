import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { type SchoolSettings, getSettings } from '../data/admin';
import { type SchoolClass, listClasses, todayInDhaka } from '../data/attendance';
import {
  type MonthlyRow,
  belowThreshold,
  marksForMonth,
  monthlySheet,
} from '../data/attendanceReports';
import { type StudentDetail, findStudents } from '../data/people';

/**
 * Who is falling behind. APEX p37.
 *
 * Worst first, with the guardian's number on the row, because the only point of
 * this list is the telephone call that follows it. A student with nothing marked
 * is left out rather than shown at 0% — unmarked is not absent.
 */
export default function LowAttendance() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [school, setSchool] = useState<SchoolSettings | null>(null);

  const [classId, setClassId] = useState('');          // '' = every section
  const [month, setMonth] = useState(todayInDhaka().slice(0, 7));
  const [threshold, setThreshold] = useState(75);

  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [detail, setDetail] = useState<Record<string, StudentDetail>>({});
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    Promise.all([listClasses(), getSettings()])
      .then(([c, s]) => { setClasses(c); setSchool(s); })
      .catch(() => setProblem('Could not read the class list.'))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!classes.length) return;
    const wanted = classId ? classes.filter((c) => c.classId === classId) : classes;
    let live = true;
    setBusy(true);
    (async () => {
      try {
        const all: MonthlyRow[] = [];
        const seen: Record<string, StudentDetail> = {};
        for (const c of wanted) {
          const [roll, marks] = await Promise.all([
            findStudents(c.classId, ''),
            marksForMonth(c.classId, month),
          ]);
          for (const s of roll) seen[s.studentId] = s;
          all.push(...monthlySheet(
            roll.map((s) => ({
              studentId: s.studentId, fullName: s.fullName, rollNo: s.rollNo,
            })),
            marks,
          ));
        }
        if (!live) return;
        setRows(all);
        setDetail(seen);
        setProblem('');
      } catch {
        if (live) setProblem('Could not read the month.');
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [classes, classId, month]);

  const listed = useMemo(() => belowThreshold(rows, threshold), [rows, threshold]);
  const unmarked = rows.filter((r) => r.marked === 0).length;

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Low attendance</h1>
        <h2>Below {threshold}% in {new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
          month: 'long', year: 'numeric', timeZone: 'UTC',
        })}</h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="cl">Section</label>
            <select id="cl" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Every section</option>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.displayName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label htmlFor="mo">Month</label>
            <input id="mo" type="month" value={month}
                   onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label htmlFor="th">Below %</label>
            <input id="th" type="number" min={1} max={100} value={threshold}
                   onChange={(e) => setThreshold(Number(e.target.value))} />
          </div>
        </div>

        {problem && <div className="err">{problem}</div>}
        {busy && <p>Working…</p>}
        {!busy && unmarked > 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            {unmarked} student{unmarked === 1 ? ' has' : 's have'} nothing marked this
            month and so cannot be judged — they are not on this list.
          </p>
        )}

        <button onClick={() => window.print()} disabled={!listed.length}>
          Print {listed.length} row{listed.length === 1 ? '' : 's'}
        </button>
      </div>

      <div className="card">
        <div className="print-sheet">
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {school?.instituteName ?? 'School'}
            </div>
            <div style={{ fontWeight: 600 }}>
              LOW ATTENDANCE — BELOW {threshold}%
            </div>
            <div style={{ fontSize: 12 }}>
              {new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
                month: 'long', year: 'numeric', timeZone: 'UTC',
              })}
              {classId ? ` · ${classes.find((c) => c.classId === classId)?.displayName}` : ''}
            </div>
          </div>

          {!busy && listed.length === 0 && (
            <p style={{ color: 'var(--muted)', margin: 0 }}>
              Nobody is below {threshold}% this month.
            </p>
          )}

          {listed.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                  <th style={{ padding: '5px 4px' }}>#</th>
                  <th style={{ padding: '5px 4px' }}>Name</th>
                  <th style={{ padding: '5px 4px' }}>Class</th>
                  <th style={{ padding: '5px 4px' }}>Roll</th>
                  <th style={{ padding: '5px 4px', textAlign: 'right' }}>Present</th>
                  <th style={{ padding: '5px 4px', textAlign: 'right' }}>Absent</th>
                  <th style={{ padding: '5px 4px', textAlign: 'right' }}>%</th>
                  <th style={{ padding: '5px 4px' }}>Guardian</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((r, i) => {
                  const s = detail[r.studentId];
                  return (
                    <tr key={r.studentId} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '5px 4px' }}>{i + 1}</td>
                      <td style={{ padding: '5px 4px' }}>
                        {/* prints as plain text, so the sheet reads the same on paper */}
                        <Link to={`/students/${r.studentId}`}>{r.fullName}</Link>
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        {s ? `${s.className} - ${s.section}` : '—'}
                      </td>
                      <td style={{ padding: '5px 4px' }}>{r.rollNo}</td>
                      <td style={{ padding: '5px 4px', textAlign: 'right' }}>
                        {r.present}/{r.marked}
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'right' }}>{r.absent}</td>
                      <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 700,
                                   color: '#b00020' }}>
                        {r.percent}
                      </td>
                      <td style={{ padding: '5px 4px' }}>{s?.mobileNo || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {listed.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 34 }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: 3, fontSize: 11 }}>
                {school?.headTeacher ?? 'Head teacher'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
