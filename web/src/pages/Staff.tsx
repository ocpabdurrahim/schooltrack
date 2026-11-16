import { useEffect, useState } from 'react';
import { type StaffRow, listStaff, saveStaff } from '../data/admin';

type Form = Omit<StaffRow, 'staffId'> & { staffId?: string };

const blank: Form = {
  fullName: '', designation: '', mobileNo: '', staffStatus: 'ACTIVE', joinDate: '',
};

const STATUS: Record<StaffRow['staffStatus'], string> = {
  ACTIVE: 'Working',
  ON_LEAVE: 'On leave',
  LEFT: 'Left',
};

export default function Staff() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [form, setForm] = useState<Form>({ ...blank });
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  const load = () =>
    listStaff()
      .then(setRows)
      .catch(() => setProblem('Could not read the staff list. Only an administrator, ' +
                              'the accounts user or the office may see it.'))
      .finally(() => setBusy(false));

  useEffect(() => { load(); }, []);

  const text = (k: keyof Form) => ({
    value: String(form[k] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  async function save() {
    if (!form.fullName.trim()) { setProblem('A staff record needs a name.'); return; }
    setBusy(true);
    setProblem('');
    try {
      await saveStaff(form);
      setForm({ ...blank });
      await load();
    } catch {
      setProblem(
        'That save was refused. Only an administrator may change the staff list.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>Staff</h1>
        <h2>{busy ? 'Working…' : `${rows.length} record${rows.length === 1 ? '' : 's'}`}</h2>

        {rows.map((p) => (
          <div className="row" key={p.staffId}>
            <span style={{ color: 'var(--ink)' }}>
              {p.fullName}
              <span style={{ color: 'var(--muted)', marginLeft: 10 }}>{p.designation}</span>
            </span>
            <span>
              {p.staffStatus !== 'ACTIVE' && (
                <span className="pill none" style={{ marginRight: 10 }}>
                  {STATUS[p.staffStatus] ?? p.staffStatus}
                </span>
              )}
              <button className="link" onClick={() => { setForm(p); setProblem(''); }}>edit</button>
            </span>
          </div>
        ))}

        {!busy && rows.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>No staff records yet.</p>
        )}
      </div>

      <div className="card">
        <h1>{form.staffId ? `Edit ${form.fullName || 'staff member'}` : 'New staff member'}</h1>
        <h2>
          This is the staff register. Letting someone sign in is a separate step,
          on the Users page.
        </h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 240px' }}>
            <label htmlFor="sn">Full name</label>
            <input id="sn" {...text('fullName')} />
          </div>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="des">Designation</label>
            <input id="des" placeholder="Assistant Teacher" {...text('designation')} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor="mob">Mobile</label>
            <input id="mob" {...text('mobileNo')} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="jd">Joined</label>
            <input id="jd" type="date" {...text('joinDate')} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="ss">Status</label>
            <select id="ss" value={form.staffStatus}
                    onChange={(e) => setForm({ ...form, staffStatus: e.target.value as StaffRow['staffStatus'] })}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save staff member'}</button>
        {form.staffId && (
          <button className="link" style={{ marginLeft: 14 }}
                  onClick={() => { setForm({ ...blank }); setProblem(''); }}>
            cancel
          </button>
        )}
        {problem && <div className="err">{problem}</div>}
      </div>
    </div>
  );
}
