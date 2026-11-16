import { useEffect, useMemo, useState } from 'react';
import { type SchoolSettings, getSettings } from '../data/admin';
import {
  STATUS_LABEL,
  type SchoolClass,
  type Status,
  listClasses,
  listStudents,
  todayInDhaka,
} from '../data/attendance';
import {
  type Holiday,
  daysInMonth,
  holidayMap,
  kindOf,
  listHolidays,
  marksForMonth,
  monthlySheet,
  workingDays,
} from '../data/attendanceReports';

/**
 * The monthly attendance register. APEX p36.
 *
 * One row per student, one column per day, printed landscape because thirty-one
 * columns will not fit portrait. Weekends and holidays are shaded rather than
 * left blank, so a reader can tell a day off from a day nobody marked.
 */
export default function AttendanceMonthly() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  const [classId, setClassId] = useState('');
  const [month, setMonth] = useState(todayInDhaka().slice(0, 7));
  const [students, setStudents] = useState<{ studentId: string; fullName: string; rollNo: number }[]>([]);
  const [marks, setMarks] = useState<{ studentId: string; date: string; status: Status }[]>([]);

  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    Promise.all([listClasses(), getSettings()])
      .then(([c, s]) => {
        setClasses(c); setSchool(s);
        setClassId(c[0]?.classId ?? '');
      })
      .catch(() => setProblem('Could not read the class list.'))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    const days = daysInMonth(month);
    listHolidays(days[0], days[days.length - 1])
      .then(setHolidays)
      .catch(() => setHolidays([]));
  }, [month]);

  useEffect(() => {
    if (!classId) return;
    let live = true;
    setBusy(true);
    Promise.all([listStudents(classId), marksForMonth(classId, month)])
      .then(([roll, m]) => {
        if (!live) return;
        setStudents(roll.map((s) => ({
          studentId: s.studentId, fullName: s.fullName, rollNo: s.rollNo,
        })));
        setMarks(m);
        setProblem('');
      })
      .catch(() => { if (live) setProblem('Could not read the month.'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [classId, month]);

  const days = useMemo(() => daysInMonth(month), [month]);
  const weekend = school?.weekendDays ?? ['FRI', 'SAT'];
  const map = useMemo(() => holidayMap(holidays), [holidays]);
  const working = useMemo(() => workingDays(month, weekend, map), [month, weekend, map]);
  const rows = useMemo(() => monthlySheet(students, marks), [students, marks]);

  const section = classes.find((c) => c.classId === classId);

  /** @page cannot be scoped, so the landscape rule is injected for the print. */
  function print() {
    const style = document.createElement('style');
    style.textContent = '@page { size: A4 landscape; margin: 8mm; }';
    document.head.appendChild(style);
    try {
      window.print();
    } finally {
      document.head.removeChild(style);
    }
  }

  const shade = (date: string) => {
    const kind = kindOf(date, weekend, map);
    if (kind === 'holiday') return '#fde9e9';
    if (kind === 'weekend') return '#f1f1f1';
    return undefined;
  };

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Monthly attendance</h1>
        <h2>{section ? section.displayName : 'Pick a section'}</h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="cl">Section</label>
            <select id="cl" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.displayName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="mo">Month</label>
            <input id="mo" type="month" value={month}
                   onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>

        <div className="row">
          <span>Working days this month</span>
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{working.length}</span>
        </div>
        {holidays.length > 0 && (
          <div className="row">
            <span>Holidays</span>
            <span>{holidays.map((h) => `${h.date.slice(8)} ${h.name}`).join(', ')}</span>
          </div>
        )}

        {problem && <div className="err">{problem}</div>}
        {busy && <p>Working…</p>}

        <button onClick={print} disabled={!rows.length}>Print landscape</button>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
          P present, L late (counted present), A absent, E leave. The percentage is
          of the days actually marked, not of the working days — a fortnight nobody
          marked would otherwise read as a fortnight of truancy.
        </p>
      </div>

      <div className="card">
        <div className="print-sheet">
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {school?.instituteName ?? 'School'}
            </div>
            <div style={{ fontWeight: 600 }}>
              MONTHLY ATTENDANCE — {section?.displayName ?? ''}
            </div>
            <div style={{ fontSize: 12 }}>
              {new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
                month: 'long', year: 'numeric', timeZone: 'UTC',
              })} · {working.length} working days
            </div>
          </div>

          {rows.length === 0 && !busy && (
            <p style={{ color: 'var(--muted)', margin: 0 }}>No students in this section.</p>
          )}

          {rows.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid var(--line)', padding: '2px 3px' }}>Roll</th>
                  <th style={{ border: '1px solid var(--line)', padding: '2px 4px',
                               textAlign: 'left' }}>Name</th>
                  {days.map((d) => (
                    <th key={d} style={{
                      border: '1px solid var(--line)', padding: '2px 1px',
                      background: shade(d), width: 14,
                    }} title={map.get(d) ?? ''}>
                      {Number(d.slice(8))}
                    </th>
                  ))}
                  <th style={{ border: '1px solid var(--line)', padding: '2px 3px' }}>P</th>
                  <th style={{ border: '1px solid var(--line)', padding: '2px 3px' }}>A</th>
                  <th style={{ border: '1px solid var(--line)', padding: '2px 3px' }}>E</th>
                  <th style={{ border: '1px solid var(--line)', padding: '2px 3px' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId}>
                    <td style={{ border: '1px solid var(--line)', padding: '2px 3px',
                                 textAlign: 'center' }}>{r.rollNo}</td>
                    <td style={{ border: '1px solid var(--line)', padding: '2px 4px',
                                 whiteSpace: 'nowrap' }}>{r.fullName}</td>
                    {days.map((d) => (
                      <td key={d} style={{
                        border: '1px solid var(--line)', padding: '2px 1px',
                        textAlign: 'center', background: shade(d),
                        color: r.byDay[d] === 'A' ? '#b00020' : undefined,
                        fontWeight: r.byDay[d] === 'A' ? 700 : undefined,
                      }} title={r.byDay[d] ? STATUS_LABEL[r.byDay[d]] : ''}>
                        {r.byDay[d] ?? ''}
                      </td>
                    ))}
                    <td style={{ border: '1px solid var(--line)', padding: '2px 3px',
                                 textAlign: 'center' }}>{r.present}</td>
                    <td style={{ border: '1px solid var(--line)', padding: '2px 3px',
                                 textAlign: 'center' }}>{r.absent}</td>
                    <td style={{ border: '1px solid var(--line)', padding: '2px 3px',
                                 textAlign: 'center' }}>{r.leave}</td>
                    <td style={{ border: '1px solid var(--line)', padding: '2px 3px',
                                 textAlign: 'center', fontWeight: 700 }}>
                      {r.percent === null ? '—' : r.percent}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {rows.length > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', marginTop: 34, fontSize: 11,
            }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: 3, minWidth: 150 }}>
                Class teacher
              </div>
              <div style={{ borderTop: '1px solid #000', paddingTop: 3, minWidth: 150,
                            textAlign: 'right' }}>
                {school?.headTeacher ?? 'Head teacher'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
