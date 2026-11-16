import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { todayInDhaka } from '../data/attendance';
import { money } from '../data/fees';
import {
  type SalaryPayment,
  type SalaryStructure,
  computeSalary,
  listStructures,
  paySalaries,
  paymentsForMonth,
  thisMonth,
} from '../data/payroll';

export default function PaySalary() {
  const { access } = useAuth();
  const navigate = useNavigate();

  const today = todayInDhaka();
  const [month, setMonth] = useState(thisMonth(today));
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState('Bank');
  const [remarks, setRemarks] = useState('');

  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [paid, setPaid] = useState<SalaryPayment[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let live = true;
    setBusy(true);
    Promise.all([listStructures(), paymentsForMonth(month)])
      .then(([s, p]) => {
        if (!live) return;
        const payable = s.filter((x) => computeSalary(x).net > 0);
        setStructures(payable);
        setPaid(p);
        // everyone not yet paid this month is ticked; the already-paid are not
        const already = new Set(p.map((x) => x.staffId));
        setPicked(Object.fromEntries(payable.map((x) => [x.staffId, !already.has(x.staffId)])));
        setProblem('');
      })
      .catch(() => { if (live) setProblem('Could not read the payroll. Only an administrator may.'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [month]);

  const alreadyPaid = (staffId: string) => paid.find((p) => p.staffId === staffId);
  const chosen = structures.filter((s) => picked[s.staffId]);
  const total = chosen.reduce((t, s) => t + computeSalary(s).net, 0);

  async function pay() {
    if (!chosen.length) { setProblem('Nobody is ticked.'); return; }
    setBusy(true);
    setProblem('');
    try {
      await paySalaries({
        month, paidOn, method, remarks,
        paidBy: access.kind === 'staff' ? access.email : '',
        structures: chosen,
      });
      navigate(`/payroll/register?month=${month}`);
    } catch {
      setProblem('That was refused. Only an administrator may pay salaries.');
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>Pay salary</h1>
        <h2>{busy ? 'Working…' : `${structures.length} on the payroll · ${paid.length} already paid this month`}</h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="m">Month</label>
            <input id="m" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="d">Paid on</label>
            <input id="d" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="me">Method</label>
            <select id="me" value={method} onChange={(e) => setMethod(e.target.value)}>
              {['Bank', 'Cash', 'bKash', 'Cheque'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="r">Remarks</label>
            <input id="r" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>
        {problem && <div className="err">{problem}</div>}
      </div>

      <div className="card">
        {structures.map((s) => {
          const { gross, totalDeduction, net } = computeSalary(s);
          const done = alreadyPaid(s.staffId);
          return (
            <div key={s.staffId} style={{
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
              padding: '7px 0', borderBottom: '1px solid var(--line)',
            }}>
              <input type="checkbox" style={{ width: 'auto' }}
                     checked={picked[s.staffId] ?? false}
                     onChange={(e) => setPicked({ ...picked, [s.staffId]: e.target.checked })} />
              <span style={{ flex: '2 1 200px' }}>
                {s.staffName}
                <span style={{ color: 'var(--muted)' }}> · {s.designation ?? '—'}</span>
                {done && <span className="pill" style={{ marginLeft: 8 }}>paid {done.paidOn}</span>}
              </span>
              <span style={{ flex: '0 1 110px', color: 'var(--muted)' }}>{money(gross)}</span>
              <span style={{ flex: '0 1 100px', color: 'var(--muted)' }}>−{money(totalDeduction)}</span>
              <strong style={{ flex: '0 1 110px', textAlign: 'right' }}>{money(net)}</strong>
            </div>
          );
        })}

        {!busy && structures.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            Nobody has a salary set yet — do that under Salary structure.
          </p>
        )}

        <div className="row" style={{ marginTop: 14 }}>
          <span>{chosen.length} to pay</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{money(total)}</span>
        </div>

        <button onClick={pay} disabled={busy || !chosen.length}>
          {busy ? 'Paying…' : `Pay ${money(total)}`}
        </button>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          One payment per person per month: paying a month that has already been paid
          corrects that record rather than paying twice. Anyone already paid is shown
          above and left unticked, so a second run has to be deliberate.
        </p>
      </div>
    </div>
  );
}
