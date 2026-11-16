import { useEffect, useState } from 'react';
import {
  type GuardianRow,
  type MemberRow,
  listGuardians,
  listMembers,
  saveGuardian,
  saveMember,
} from '../data/admin';
import { type StudentDetail, findStudents, getStudent } from '../data/people';

const ROLES: Record<MemberRow['role'], string> = {
  ADMIN: 'Administrator — everything, including these permissions',
  TEACHER: 'Teacher — attendance and student lookup',
  ACCOUNTS: 'Accounts — fees and expenses',
  OFFICE: 'Office — student records and documents',
};

const blankMember: MemberRow = { email: '', name: '', role: 'TEACHER', active: true };
const blankGuardian: GuardianRow = { email: '', name: '', studentIds: [], active: true };

export default function Users() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [guardians, setGuardians] = useState<GuardianRow[]>([]);
  const [m, setM] = useState<MemberRow>({ ...blankMember });
  const [g, setG] = useState<GuardianRow>({ ...blankGuardian });
  const [children, setChildren] = useState<StudentDetail[]>([]);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<StudentDetail[]>([]);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  const load = () =>
    Promise.all([
      listMembers().catch(() => [] as MemberRow[]),
      listGuardians().catch(() => [] as GuardianRow[]),
    ])
      .then(([ms, gs]) => { setMembers(ms); setGuardians(gs); })
      .finally(() => setBusy(false));

  useEffect(() => { load(); }, []);

  // the child picker searches only when asked, so typing an email never costs reads
  useEffect(() => {
    if (search.trim().length < 2) { setFound([]); return; }
    let live = true;
    const t = setTimeout(() => {
      findStudents(null, search)
        .then((r) => { if (live) setFound(r.slice(0, 8)); })
        .catch(() => { if (live) setFound([]); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [search]);

  async function editGuardian(row: GuardianRow) {
    setG(row);
    setProblem('');
    const kids = await Promise.all(row.studentIds.map((id) => getStudent(id).catch(() => null)));
    setChildren(kids.filter(Boolean) as StudentDetail[]);
  }

  function addChild(s: StudentDetail) {
    if (g.studentIds.includes(s.studentId)) return;
    setG({ ...g, studentIds: [...g.studentIds, s.studentId] });
    setChildren([...children, s]);
    setSearch('');
    setFound([]);
  }

  function removeChild(id: string) {
    setG({ ...g, studentIds: g.studentIds.filter((x) => x !== id) });
    setChildren(children.filter((c) => c.studentId !== id));
  }

  const refused =
    'That save was refused. Only an administrator may change who can sign in.';

  async function saveM() {
    if (!m.email.includes('@')) { setProblem('A member needs the email they sign in with.'); return; }
    setBusy(true); setProblem('');
    try {
      await saveMember(m);
      setM({ ...blankMember });
      await load();
    } catch { setProblem(refused); setBusy(false); }
  }

  async function saveG() {
    if (!g.email.includes('@')) { setProblem('A parent needs the email they sign in with.'); return; }
    if (!g.studentIds.length) { setProblem('Link at least one student, or the parent sees nothing.'); return; }
    setBusy(true); setProblem('');
    try {
      await saveGuardian(g);
      setG({ ...blankGuardian });
      setChildren([]);
      await load();
    } catch { setProblem(refused); setBusy(false); }
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>Who can sign in</h1>
        <h2>
          Signing in grants nothing on its own. Access comes from the records below,
          and only an administrator can write them.
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          The person creates their own account first, with their own password, and
          confirms their email address. You then add that same email here.
        </p>
      </div>

      <div className="card">
        <h1>Staff access</h1>
        <h2>{busy ? 'Working…' : `${members.length} account${members.length === 1 ? '' : 's'}`}</h2>

        {members.map((row) => (
          <div className="row" key={row.email}>
            <span style={{ color: 'var(--ink)' }}>
              {row.name}
              <span style={{ color: 'var(--muted)', marginLeft: 10 }}>{row.email}</span>
            </span>
            <span>
              <span className={row.active ? 'pill' : 'pill none'} style={{ marginRight: 10 }}>
                {row.active ? row.role : 'off'}
              </span>
              <button className="link" onClick={() => { setM(row); setProblem(''); }}>edit</button>
            </span>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 240px' }}>
            <label htmlFor="me">Email</label>
            <input id="me" autoComplete="off" value={m.email}
                   onChange={(e) => setM({ ...m, email: e.target.value })} />
          </div>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="mn">Name</label>
            <input id="mn" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
          </div>
        </div>

        <label htmlFor="mr">Role</label>
        <select id="mr" value={m.role}
                onChange={(e) => setM({ ...m, role: e.target.value as MemberRow['role'] })}>
          {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={m.active}
                 onChange={(e) => setM({ ...m, active: e.target.checked })} />
          Can sign in
        </label>

        <button onClick={saveM} disabled={busy}>Save staff access</button>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          Removing access is done by unticking “can sign in”, not by deleting the record:
          their name stays readable on the attendance they marked.
        </p>
      </div>

      <div className="card">
        <h1>Parent access</h1>
        <h2>{busy ? 'Working…' : `${guardians.length} parent${guardians.length === 1 ? '' : 's'}`}</h2>

        {guardians.map((row) => (
          <div className="row" key={row.email}>
            <span style={{ color: 'var(--ink)' }}>
              {row.name}
              <span style={{ color: 'var(--muted)', marginLeft: 10 }}>{row.email}</span>
            </span>
            <span>
              <span className={row.active ? 'pill' : 'pill none'} style={{ marginRight: 10 }}>
                {row.studentIds.length} linked
              </span>
              <button className="link" onClick={() => editGuardian(row)}>edit</button>
            </span>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 240px' }}>
            <label htmlFor="ge">Email</label>
            <input id="ge" autoComplete="off" value={g.email}
                   onChange={(e) => setG({ ...g, email: e.target.value })} />
          </div>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="gn">Name</label>
            <input id="gn" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} />
          </div>
        </div>

        <label htmlFor="kid">Children</label>
        {children.map((c) => (
          <div className="row" key={c.studentId}>
            <span style={{ color: 'var(--ink)' }}>
              {c.fullName}
              <span style={{ color: 'var(--muted)', marginLeft: 10 }}>
                {c.className} {c.section} · roll {c.rollNo}
              </span>
            </span>
            <button className="link" onClick={() => removeChild(c.studentId)}>remove</button>
          </div>
        ))}

        <input id="kid" placeholder="search a student by name or roll" value={search}
               autoComplete="off" onChange={(e) => setSearch(e.target.value)} />
        {found.map((s) => (
          <div className="row" key={s.studentId}>
            <span style={{ color: 'var(--ink)' }}>
              {s.fullName}
              <span style={{ color: 'var(--muted)', marginLeft: 10 }}>
                {s.className} {s.section} · roll {s.rollNo}
              </span>
            </span>
            <button className="link" onClick={() => addChild(s)}>add</button>
          </div>
        ))}

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={g.active}
                 onChange={(e) => setG({ ...g, active: e.target.checked })} />
          Can sign in
        </label>

        <button onClick={saveG} disabled={busy}>Save parent access</button>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          A parent sees exactly the children listed here and nothing else — the list on
          this record is the only thing that decides it.
        </p>
        {problem && <div className="err">{problem}</div>}
      </div>
    </div>
  );
}
