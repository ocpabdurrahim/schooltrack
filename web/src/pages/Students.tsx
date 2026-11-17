import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { type SchoolClass, listClasses } from '../data/attendance';
import { type StudentDetail, findStudents } from '../data/people';

export default function Students() {
  const { access } = useAuth();
  const mayEdit = access.kind === 'staff' && (access.role === 'ADMIN' || access.role === 'OFFICE');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [text, setText] = useState('');
  const [includeLeft, setIncludeLeft] = useState(false);
  const [rows, setRows] = useState<StudentDetail[]>([]);
  const [busy, setBusy] = useState(true);
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
        {rows.map((s) => (
          <div className="row" key={s.studentId}>
            <span style={{ color: 'var(--ink)' }}>
              <strong style={{ display: 'inline-block', width: 38 }}>{s.rollNo}</strong>
              <Link to={`/students/${s.studentId}`}>{s.fullName}</Link>
              {s.status === 'I' && <span className="pill none" style={{ marginLeft: 8 }}>left</span>}
            </span>
            <span>{s.className} - {s.section}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
