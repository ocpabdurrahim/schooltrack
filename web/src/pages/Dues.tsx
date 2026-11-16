import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type SchoolClass, listClasses } from '../data/attendance';
import { type Dues as Row, currentYear, duesFor, money } from '../data/fees';
import { findStudents } from '../data/people';

export default function Dues() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [year, setYear] = useState(currentYear());
  const [rows, setRows] = useState<Row[]>([]);
  const [onlyOwing, setOnlyOwing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    listClasses()
      .then((c) => { setClasses(c); if (c.length) setClassId(c[0].classId); })
      .catch(() => setProblem('Could not read the class list.'));
  }, []);

  useEffect(() => {
    if (!classId) return;
    let live = true;
    setBusy(true);
    (async () => {
      try {
        const students = await findStudents(classId, '');
        const d = await duesFor(students, year);
        if (live) { setRows(d); setProblem(''); }
      } catch {
        if (live) setProblem('Could not work out the dues. Only the head and accounts may see them.');
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [classId, year]);

  const shown = onlyOwing ? rows.filter((r) => r.due > 0) : rows;
  const owed = rows.reduce((t, r) => t + r.due, 0);
  const collected = rows.reduce((t, r) => t + r.paid, 0);
  const allowed = rows.reduce((t, r) => t + r.discount, 0);

  return (
    <div className="wrap">
      <div className="card">
        <h1>Dues</h1>
        <h2>What is still owed for the session</h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="c">Section</label>
            <select id="c" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.displayName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label htmlFor="y">Session</label>
            <input id="y" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={onlyOwing}
                 onChange={(e) => setOnlyOwing(e.target.checked)} />
          Only those who owe
        </label>
        {problem && <div className="err">{problem}</div>}
      </div>

      <div className="card">
        <h2>{busy ? 'Working…' : `${shown.length} of ${rows.length} student${rows.length === 1 ? '' : 's'}`}</h2>
        <div className="tiles">
          <div className="tile">
            <div className="tile-value">{money(owed)}</div>
            <div className="tile-label">outstanding</div>
          </div>
          <div className="tile">
            <div className="tile-value">{money(collected)}</div>
            <div className="tile-label">collected</div>
          </div>
          {allowed > 0 && (
            <div className="tile">
              <div className="tile-value">{money(allowed)}</div>
              <div className="tile-label">discount allowed</div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        {!busy && shown.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            {onlyOwing ? 'Nobody in this section owes anything.' : 'No students here.'}
          </p>
        )}
        {shown
          .sort((a, b) => b.due - a.due || a.student.rollNo - b.student.rollNo)
          .map((r) => (
            <div className="row" key={r.student.studentId}>
              <span style={{ color: 'var(--ink)' }}>
                <strong style={{ display: 'inline-block', width: 38 }}>{r.student.rollNo}</strong>
                <Link to={`/students/${r.student.studentId}`}>{r.student.fullName}</Link>
              </span>
              <span>
                <span style={{ color: 'var(--muted)', marginRight: 12 }}>
                  paid {money(r.paid)} of {money(r.expected)}
                  {r.discount > 0 && ` · ${money(r.discount)} allowed`}
                </span>
                <strong style={{ color: r.due > 0 ? 'var(--bad)' : 'var(--accent)' }}>
                  {r.due > 0 ? money(r.due) : 'clear'}
                </strong>
              </span>
            </div>
          ))}

        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14, marginBottom: 0 }}>
          Monthly fees are counted up to this month only, so nobody is shown owing
          for months that have not happened. Exam fees are not predicted — they
          appear here once collected, never as a forecast.
        </p>
      </div>
    </div>
  );
}
