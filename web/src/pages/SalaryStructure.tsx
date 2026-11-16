import { useEffect, useState } from 'react';
import { type StaffRow, listStaff } from '../data/admin';
import { todayInDhaka } from '../data/attendance';
import { money } from '../data/fees';
import {
  type SalaryStructure as Structure,
  applyIncrement,
  computeSalary,
  dueForIncrement,
  emptyStructure,
  listStructures,
  saveStructure,
} from '../data/payroll';

const FIELDS: { key: keyof Structure; label: string; deduction?: boolean }[] = [
  { key: 'basic', label: 'Basic' },
  { key: 'houseRent', label: 'House rent' },
  { key: 'medical', label: 'Medical' },
  { key: 'transport', label: 'Transport' },
  { key: 'otherAllowance', label: 'Other allowance' },
  { key: 'providentFund', label: 'Provident fund', deduction: true },
  { key: 'tax', label: 'Tax', deduction: true },
  { key: 'otherDeduction', label: 'Other deduction', deduction: true },
];

export default function SalaryStructure() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [structures, setStructures] = useState<Structure[]>([]);
  const [editing, setEditing] = useState<Structure | null>(null);
  const [busy, setBusy] = useState(true);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');

  const today = todayInDhaka();

  const load = async () => {
    const [st, structs] = await Promise.all([listStaff(), listStructures()]);
    setStaff(st.filter((s) => s.staffStatus !== 'LEFT'));
    setStructures(structs);
    setBusy(false);
  };

  useEffect(() => {
    load().catch(() => {
      setProblem('Could not read the payroll. Only an administrator may.');
      setBusy(false);
    });
  }, []);

  const structureFor = (s: StaffRow) =>
    structures.find((x) => x.staffId === s.staffId)
    ?? { ...emptyStructure(s.staffId, s.fullName), designation: s.designation };

  async function save(s: Structure) {
    setBusy(true); setProblem(''); setNote('');
    try {
      await saveStructure(s);
      setEditing(null);
      await load();
      setNote(`${s.staffName}'s salary saved.`);
    } catch {
      setProblem('That save was refused. Only an administrator may set salaries.');
      setBusy(false);
    }
  }

  async function giveIncrement(s: Structure) {
    await save(applyIncrement(s, today));
  }

  const due = staff.filter((s) => dueForIncrement(structureFor(s), today));

  return (
    <div className="wrap">
      <div className="card">
        <h1>Salary structure</h1>
        <h2>What each member of staff is paid each month</h2>
        {problem && <div className="err">{problem}</div>}
        {note && <div style={{ color: 'var(--accent)', fontSize: 14 }}>{note}</div>}
      </div>

      {due.length > 0 && (
        <div className="card">
          <h2>Annual increment due</h2>
          {due.map((s) => {
            const st = structureFor(s);
            return (
              <div className="row" key={s.staffId}>
                <span style={{ color: 'var(--ink)' }}>
                  {s.fullName}
                  <span style={{ color: 'var(--muted)', marginLeft: 10 }}>
                    {st.lastIncrementDate ? `last ${st.lastIncrementDate}` : 'never given'}
                  </span>
                </span>
                <span>
                  <span style={{ color: 'var(--muted)', marginRight: 12 }}>
                    +{money(st.incrementAmount)}
                  </span>
                  <button className="link" onClick={() => giveIncrement(st)}>give it</button>
                </span>
              </div>
            );
          })}
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
            Due twelve months after the last one, not every January — staff join in
            different months, and a January-for-everyone rule gives someone who joined
            in November a thirteen-month first year.
          </p>
        </div>
      )}

      <div className="card">
        <h2>{busy ? 'Working…' : `${staff.length} on the payroll`}</h2>
        {staff.map((s) => {
          const st = structureFor(s);
          const { gross, net } = computeSalary(st);
          return (
            <div className="row" key={s.staffId}>
              <span style={{ color: 'var(--ink)' }}>
                {s.fullName}
                <span style={{ color: 'var(--muted)', marginLeft: 10 }}>{s.designation}</span>
              </span>
              <span>
                <span style={{ color: 'var(--muted)', marginRight: 12 }}>
                  {gross ? `gross ${money(gross)}` : 'no salary set'}
                </span>
                <strong>{net ? money(net) : '—'}</strong>
                <button className="link" style={{ marginLeft: 12 }}
                        onClick={() => { setEditing(st); setProblem(''); }}>edit</button>
              </span>
            </div>
          );
        })}
        {!busy && staff.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            No staff yet — add them under Staff first.
          </p>
        )}
      </div>

      {editing && (
        <div className="card">
          <h2>{editing.staffName}</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {FIELDS.map((f) => (
              <div key={f.key} style={{ flex: '1 1 150px' }}>
                <label htmlFor={f.key}>
                  {f.label}{f.deduction ? ' (−)' : ''}
                </label>
                <input id={f.key} type="number" inputMode="decimal"
                       value={String(editing[f.key] ?? 0)}
                       onChange={(e) => setEditing({ ...editing, [f.key]: Number(e.target.value) })} />
              </div>
            ))}
            <div style={{ flex: '1 1 150px' }}>
              <label htmlFor="inc">Annual increment</label>
              <input id="inc" type="number" inputMode="decimal" value={editing.incrementAmount}
                     onChange={(e) => setEditing({ ...editing, incrementAmount: Number(e.target.value) })} />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label htmlFor="lastinc">Last increment</label>
              <input id="lastinc" type="date" value={editing.lastIncrementDate ?? ''}
                     onChange={(e) => setEditing({ ...editing, lastIncrementDate: e.target.value })} />
            </div>
          </div>

          <div className="tiles" style={{ marginTop: 16 }}>
            <div className="tile">
              <div className="tile-value">{money(computeSalary(editing).gross)}</div>
              <div className="tile-label">gross</div>
            </div>
            <div className="tile">
              <div className="tile-value">{money(computeSalary(editing).totalDeduction)}</div>
              <div className="tile-label">deductions</div>
            </div>
            <div className="tile">
              <div className="tile-value">{money(computeSalary(editing).net)}</div>
              <div className="tile-label">net</div>
            </div>
          </div>

          <button onClick={() => save(editing)} disabled={busy}>Save salary</button>
          <button className="link" style={{ marginLeft: 14 }}
                  onClick={() => setEditing(null)}>cancel</button>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Allowances are amounts, not percentages of the basic. A percentage would
            quietly rewrite what someone was paid last year the moment their basic
            changed.
          </p>
        </div>
      )}
    </div>
  );
}
