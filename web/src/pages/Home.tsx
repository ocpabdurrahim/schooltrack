import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { SCHOOL_ID, db } from '../firebase';

type Ownership = Record<string, string>;

/**
 * The smallest screen that proves the whole chain: sign-in, the access record,
 * the rules, and a real read from Firestore.
 *
 * It also shows settings/ownership, because during the transition "who owns
 * this module" is the single most important thing for a user to know before
 * they type anything (data-model.md §0). A module reading ORACLE means the
 * APEX app is still authoritative and this one must not be used for it.
 */
export default function Home() {
  const { access, logout } = useAuth();
  const [school, setSchool] = useState<string>('');
  const [ownership, setOwnership] = useState<Ownership | null>(null);
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
    })();
  }, []);

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
          <span>Account</span>
          <span>{'email' in access ? access.email : ''}</span>
        </div>
        <div className="row">
          <span>Access</span>
          <span>
            {access.kind === 'staff' && <span className="pill">{access.role}</span>}
            {access.kind === 'guardian' && (
              <span className="pill">
                {access.studentIds.length} student{access.studentIds.length === 1 ? '' : 's'}
              </span>
            )}
            {access.kind === 'none' && <span className="pill none">none</span>}
          </span>
        </div>

        <button className="link" onClick={() => void logout()} style={{ marginTop: 18 }}>
          Sign out
        </button>
      </div>

      {access.kind === 'none' && (
        <div className="card">
          <h2>No access record</h2>
          <p style={{ fontSize: 15, lineHeight: 1.5, margin: 0 }}>
            Your sign-in worked, but nobody has been given access to this school
            under <strong>{access.email}</strong>. An administrator has to add you
            before anything is visible. Signing in by itself grants nothing.
          </p>
        </div>
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
