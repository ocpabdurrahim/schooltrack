import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  STATUS_LABEL, type RegisterRow, type SchoolClass, type Status,
  listClasses, loadRegister, mark, openSession, sessionOpened, todayInDhaka,
} from '../data/attendance';

export default function Attendance() {
  const { access } = useAuth();
  const email = 'email' in access ? access.email : '';
  const canMark = access.kind === 'staff' && ['ADMIN', 'TEACHER'].includes(access.role);

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState<string>('');
  const [date, setDate] = useState(todayInDhaka());
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    listClasses()
      .then((c) => {
        setClasses(c);
        if (c.length && !classId) setClassId(c[0].classId);
      })
      .catch(() => setProblem('Could not read the class list.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    if (!classId) return;
    setBusy(true);
    setProblem('');
    try {
      const [r, o] = await Promise.all([loadRegister(classId, date), sessionOpened(date)]);
      setRows(r);
      setOpened(o);
    } catch {
      setProblem('Could not load the register.');
    } finally {
      setBusy(false);
    }
  }, [classId, date]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function setStatus(row: RegisterRow, status: Status) {
    if (!canMark) return;
    setRows((rs) => rs.map((r) => (r.studentId === row.studentId ? { ...r, status, via: 'MANUAL' } : r)));
    try {
      if (!opened) { await openSession(date, email); setOpened(true); }
      await mark(row, date, status, 'MANUAL', email);
    } catch {
      setProblem('That change was refused. Your account may not mark attendance.');
      void refresh();
    }
  }

  const present = rows.filter((r) => r.status === 'P' || r.status === 'L').length;

  return (
    <div className="wrap">
      <div className="card">
        <h1>Attendance</h1>
        <h2>
          {opened ? `${present} of ${rows.length} present` : 'Not taken yet for this day'}
          {' Â· '}
          <Link to="/scan">scan cards instead</Link>
        </h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor="cls">Section</label>
            <select id="cls" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.displayName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor="dt">Date</label>
            <input id="dt" type="date" value={date} max={todayInDhaka()}
                   onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      </div>

      {problem && <div className="card"><div className="err">{problem}</div></div>}

      <div className="card">
        {busy && <p style={{ color: 'var(--muted)' }}>Loadingâ€¦</p>}
        {!busy && rows.length === 0 && <p style={{ color: 'var(--muted)' }}>No active students in this section.</p>}

        {rows.map((r) => (
          <div className="row" key={r.studentId} style={{ alignItems: 'center' }}>
            <span style={{ color: 'var(--ink)' }}>
              <strong style={{ display: 'inline-block', width: 38 }}>{r.rollNo}</strong>
              {r.fullName}
              {r.via === 'SCAN' && <span className="pill" style={{ marginLeft: 8 }}>scanned</span>}
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              {(['P', 'A', 'L', 'E'] as Status[]).map((s) => (
                <button
                  key={s}
                  onClick={() => void setStatus(r, s)}
                  disabled={!canMark}
                  title={STATUS_LABEL[s]}
                  style={{
                    margin: 0, padding: '5px 11px', fontSize: 14,
                    background: r.status === s ? statusColour(s) : '#eef0f4',
                    color: r.status === s ? '#fff' : 'var(--muted)',
                  }}
                >
                  {s}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>

      {!canMark && (
        <div className="card">
          <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
            You can see this register but not change it â€” marking attendance is for
            teachers and administrators.
          </p>
        </div>
      )}
    </div>
  );
}

function statusColour(s: Status) {
  return s === 'P' ? '#0a730a' : s === 'A' ? '#c00000' : s === 'L' ? '#b45309' : '#1d4ed8';
}
