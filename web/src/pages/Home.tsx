import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { SCHOOL_ID, db } from '../firebase';
import { todayInDhaka } from '../data/attendance';
import { type SchoolStats, schoolStats } from '../data/people';

type Ownership = Record<string, string>;

export default function Home() {
  const { access, logout } = useAuth();
  const staff = access.kind === 'staff';

  const [school, setSchool] = useState('');
  const [ownership, setOwnership] = useState<Ownership | null>(null);
  const [stats, setStats] = useState<SchoolStats | null>(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await getDoc(doc(db, 'schools', SCHOOL_ID));
        setSchool((s.data()?.name as string) ?? SCHOOL_ID);

        const o = await getDoc(doc(db, 'schools', SCHOOL_ID, 'settings', 'ownership'));
        setOwnership(o.exists() ? (o.data() as Ownership) : {});

      } catch {
        setProblem('Could not read the school record — your account may have no access yet.');
      }

      // Counts are best-effort and independent: a teacher cannot read the
      // staff collection, and that must not blank the rest of the dashboard.
      if (staff) {
        try { setStats(await schoolStats()); } catch { /* tiles simply do not render */ }
      }
    })();
  }, [staff]);

  const modules = ['attendance', 'fees', 'people', 'results', 'payroll', 'expenses'];

  return (
    <div className="wrap">
      <div className="card">
        <h1>{school || 'SchoolTrack'}</h1>
        <h2>
          {access.kind === 'staff' && <>Signed in as {access.name}</>}
          {access.kind === 'guardian' && <>Guardian — {access.name}</>}
          {access.kind === 'none' && <>Signed in, no access granted</>}
        </h2>
        <div className="row">
          <span>Account</span><span>{'email' in access ? access.email : ''}</span>
        </div>
        <div className="row">
          <span>Access</span>
          <span>
            {access.kind === 'staff' && <span className="pill">{access.role}</span>}
            {access.kind === 'guardian' && (
              <span className="pill">{access.studentIds.length} student
                {access.studentIds.length === 1 ? '' : 's'}</span>
            )}
            {access.kind === 'none' && <span className="pill none">none</span>}
          </span>
        </div>
        <button className="link" onClick={() => void logout()} style={{ marginTop: 18 }}>Sign out</button>
      </div>

      {access.kind === 'none' && (
        <div className="card">
          <h2>No access record</h2>
          <p style={{ fontSize: 15, lineHeight: 1.5, margin: 0 }}>
            Your sign-in worked, but nobody has been given access to this school
            under <strong>{access.email}</strong>. An administrator has to add you
            first — signing in by itself grants nothing.
          </p>
        </div>
      )}

      {stats && (
        <>
          <div className="card">
            <h2>Today — {todayInDhaka()}</h2>
            {stats.takenToday ? (
              <div className="row">
                <span>Attendance</span>
                <span>
                  <strong style={{ color: 'var(--accent)' }}>{stats.presentToday ?? '—'}</strong>
                  <span style={{ color: 'var(--muted)' }}>
                    {' '}present{stats.students !== null ? ` of ${stats.students}` : ''} ·{' '}
                  </span>
                  {stats.markedToday ?? '—'} marked
                </span>
              </div>
            ) : (
              <div className="row">
                <span>Attendance</span>
                <span style={{ color: 'var(--bad)', fontWeight: 600 }}>
                  Not taken yet · <Link to="/scan">scan</Link> or <Link to="/attendance">mark</Link>
                </span>
              </div>
            )}
          </div>

          <div className="card">
            <h2>At a glance</h2>
            <div className="tiles">
              {stats.students !== null && <Tile value={stats.students} label="Students" to="/students" />}
              {stats.staff !== null && <Tile value={stats.staff} label="Staff" />}
              {stats.classes !== null && <Tile value={stats.classes} label="Sections" />}
            </div>
          </div>
        </>
      )}

      {ownership && (
        <div className="card">
          <h2>Which system owns what</h2>
          {modules.map((m) => {
            const owner = ownership[m] ?? 'ORACLE';
            return (
              <div className="row" key={m}>
                <span style={{ textTransform: 'capitalize' }}>{m}</span>
                <span className={owner === 'APP' ? 'pill' : 'pill none'}>
                  {owner === 'APP' ? 'SchoolTrack' : 'APEX (read-only here)'}
                </span>
              </div>
            );
          })}
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 0, marginTop: 14 }}>
            A module marked APEX is still recorded in the old system. SchoolTrack
            can show it, but cannot change it — the rules refuse the write.
          </p>
        </div>
      )}

      {problem && <div className="card"><div className="err">{problem}</div></div>}
    </div>
  );
}

function Tile({ value, label, to }: { value: number; label: string; to?: string }) {
  const body = (
    <div className="tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{body}</Link> : body;
}
