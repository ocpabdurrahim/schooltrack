import { useEffect, useState } from 'react';
import { type ClassRow, classIdFor, listAllClasses, saveClass } from '../data/admin';

const blank = { className: '', section: '', sortOrder: 0, active: true };

export default function Classes() {
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [form, setForm] = useState({ ...blank });
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  const load = () =>
    listAllClasses()
      .then(setRows)
      .catch(() => setProblem('Could not read the classes.'))
      .finally(() => setBusy(false));

  useEffect(() => { load(); }, []);

  // The id is derived from the name while adding, and frozen once saved: the
  // attendance marks and every student point at it by id, and renaming a
  // section must not strand that history.
  const newId = classIdFor(form.className, form.section);

  function startEdit(c: ClassRow) {
    setEditing(c);
    setForm({
      className: c.className,
      section: c.section,
      sortOrder: c.sortOrder ?? 0,
      active: c.active !== false,
    });
    setProblem('');
  }

  function startNew() {
    setEditing(null);
    setForm({ ...blank, sortOrder: (rows.at(-1)?.sortOrder ?? 0) + 1 });
    setProblem('');
  }

  async function save() {
    if (!form.className.trim() || !form.section.trim()) {
      setProblem('A class needs both a name and a section.');
      return;
    }
    const classId = editing?.classId ?? newId;
    if (!editing && rows.some((r) => r.classId === classId)) {
      setProblem(`There is already a section with the id ${classId}.`);
      return;
    }

    setBusy(true);
    setProblem('');
    try {
      await saveClass({ classId, ...form });
      setEditing(null);
      setForm({ ...blank });
      await load();
    } catch {
      setProblem(
        'That save was refused. Only an administrator may change the class list.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>Classes and sections</h1>
        <h2>{busy ? 'Working…' : `${rows.length} section${rows.length === 1 ? '' : 's'}`}</h2>

        {rows.map((c) => (
          <div className="row" key={c.classId}>
            <span style={{ color: 'var(--ink)' }}>
              {c.displayName}
              {c.active === false && <span className="pill none" style={{ marginLeft: 8 }}>retired</span>}
            </span>
            <span>
              <code style={{ color: 'var(--muted)', marginRight: 12 }}>{c.classId}</code>
              <button className="link" onClick={() => startEdit(c)}>edit</button>
            </span>
          </div>
        ))}

        {!busy && rows.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            No sections yet. Add the first one below — students cannot be added until a
            section exists to put them in.
          </p>
        )}

        <button onClick={startNew} disabled={busy}>Add a section</button>
      </div>

      <div className="card">
        <h1>{editing ? `Edit ${editing.displayName}` : 'New section'}</h1>
        <h2>{editing ? editing.classId : (newId || 'the id is made from the name')}</h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="cn">Class name</label>
            <input id="cn" placeholder="Class 6" value={form.className}
                   onChange={(e) => setForm({ ...form, className: e.target.value })} />
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label htmlFor="sec">Section</label>
            <input id="sec" placeholder="A" value={form.section}
                   onChange={(e) => setForm({ ...form, section: e.target.value })} />
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label htmlFor="ord">Order</label>
            <input id="ord" type="number" value={form.sortOrder}
                   onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
          </div>
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={form.active}
                 onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          In use
        </label>

        <button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save section'}</button>
        {editing && (
          <button className="link" style={{ marginLeft: 14 }}
                  onClick={() => { setEditing(null); setForm({ ...blank }); }}>
            cancel
          </button>
        )}
        {problem && <div className="err">{problem}</div>}
      </div>
    </div>
  );
}
