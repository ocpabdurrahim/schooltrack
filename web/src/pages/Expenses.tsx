import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { todayInDhaka } from '../data/attendance';
import {
  type Expense,
  type ExpenseHead,
  expenseBreakdown,
  expensesBetween,
  listExpenseHeads,
  recordExpense,
  saveExpenseHead,
} from '../data/expenses';
import { money } from '../data/fees';

export default function Expenses() {
  const { access } = useAuth();
  const admin = access.kind === 'staff' && access.role === 'ADMIN';
  const today = todayInDhaka();

  const [heads, setHeads] = useState<ExpenseHead[]>([]);
  const [headForm, setHeadForm] = useState({ headCode: '', headName: '', active: true, sortOrder: 0 });

  const [headId, setHeadId] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(today);
  const [paidTo, setPaidTo] = useState('');
  const [method, setMethod] = useState('Cash');
  const [remarks, setRemarks] = useState('');

  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<Expense[]>([]);
  const [busy, setBusy] = useState(true);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');

  const loadHeads = () =>
    listExpenseHeads()
      .then((h) => { setHeads(h); if (!headId && h.length) setHeadId(h[0].expenseHeadId); })
      .catch(() => setProblem('Could not read the expense heads. Only the head and accounts may.'));

  useEffect(() => { loadHeads().finally(() => setBusy(false)); }, []);

  useEffect(() => {
    let live = true;
    expensesBetween(from, to)
      .then((r) => { if (live) setRows(r); })
      .catch(() => { if (live) setProblem('Could not read the expenses.'); });
    return () => { live = false; };
  }, [from, to, note]);

  const head = heads.find((h) => h.expenseHeadId === headId);
  const sum = expenseBreakdown(rows);

  async function addHead() {
    if (!headForm.headCode.trim() || !headForm.headName.trim()) {
      setProblem('An expense head needs a code and a name.');
      return;
    }
    setBusy(true); setProblem('');
    try {
      await saveExpenseHead({ ...headForm, sortOrder: (heads.at(-1)?.sortOrder ?? 0) + 1 });
      setHeadForm({ headCode: '', headName: '', active: true, sortOrder: 0 });
      await loadHeads();
    } catch {
      setProblem('That was refused. Only an administrator may change the expense heads.');
    }
    setBusy(false);
  }

  async function record() {
    if (!head) { setProblem('Pick an expense head.'); return; }
    if (!(Number(amount) > 0)) { setProblem('Enter an amount.'); return; }
    setBusy(true); setProblem(''); setNote('');
    try {
      const voucherNo = await recordExpense({
        head,
        amount: Number(amount),
        expenseDate,
        paidTo,
        method,
        remarks,
        enteredBy: access.kind === 'staff' ? access.email : '',
      });
      setAmount(''); setPaidTo(''); setRemarks('');
      setNote(`Recorded as ${voucherNo}.`);
    } catch {
      setProblem('That was refused. Only the head or the accounts user may record an expense.');
    }
    setBusy(false);
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>Expenses</h1>
        <h2>What the school spends, and on what</h2>
        {problem && <div className="err">{problem}</div>}
        {note && <div style={{ color: 'var(--accent)', fontSize: 14 }}>{note}</div>}
      </div>

      <div className="card">
        <h2>Record a payment</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="h">Head</label>
            <select id="h" value={headId} onChange={(e) => setHeadId(e.target.value)}>
              {heads.filter((h) => h.active !== false).map((h) => (
                <option key={h.expenseHeadId} value={h.expenseHeadId}>{h.headName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label htmlFor="a">Amount</label>
            <input id="a" type="number" inputMode="decimal" value={amount}
                   onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="d">Date</label>
            <input id="d" type="date" value={expenseDate}
                   onChange={(e) => setExpenseDate(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="pt">Paid to</label>
            <input id="pt" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="me">Method</label>
            <select id="me" value={method} onChange={(e) => setMethod(e.target.value)}>
              {['Cash', 'bKash', 'Bank', 'Cheque'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="rm">Remarks</label>
            <input id="rm" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>

        <button onClick={record} disabled={busy || !heads.length}>Record expense</button>
        {!heads.length && !busy && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            No expense heads yet{admin ? ' — add one below.' : '; an administrator has to add them.'}
          </p>
        )}
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
          The voucher number is given as the entry is written, in one transaction. An
          expense is never deleted: one entered wrongly is corrected by another entry,
          so the ledger still adds up to what was actually spent.
        </p>
      </div>

      <div className="card">
        <h2>{from === to ? `Spent on ${from}` : `Spent from ${from} to ${to}`}</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="f">From</label>
            <input id="f" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="t">To</label>
            <input id="t" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="tiles" style={{ marginTop: 14 }}>
          <div className="tile">
            <div className="tile-value">{money(sum.total)}</div>
            <div className="tile-label">spent</div>
          </div>
          <div className="tile">
            <div className="tile-value">{sum.count}</div>
            <div className="tile-label">vouchers</div>
          </div>
        </div>

        {sum.byHead.length > 0 && (
          <>
            <h2 style={{ marginTop: 18 }}>By head</h2>
            {sum.byHead.map((h) => (
              <div className="row" key={h.expenseHeadId}>
                <span>{h.headName}</span><span>{money(h.amount)}</span>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <h2>Vouchers</h2>
        {rows.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>Nothing was spent in this period.</p>
        )}
        {rows.map((e) => (
          <div className="row" key={e.voucherNo}>
            <span style={{ color: 'var(--ink)' }}>
              {e.voucherNo}
              <span style={{ color: 'var(--muted)', marginLeft: 10 }}>
                {e.headName}{e.paidTo ? ` · ${e.paidTo}` : ''}
              </span>
            </span>
            <span>
              <span style={{ color: 'var(--muted)', marginRight: 12 }}>
                {e.expenseDate} · {e.method}
              </span>
              <strong>{money(e.amount)}</strong>
            </span>
          </div>
        ))}
      </div>

      {admin && (
        <div className="card">
          <h2>Expense heads</h2>
          {heads.map((h) => (
            <div className="row" key={h.expenseHeadId}>
              <span style={{ color: 'var(--ink)' }}>
                {h.headName}
                <span style={{ color: 'var(--muted)', marginLeft: 10 }}>{h.headCode}</span>
              </span>
              <span>
                {h.active === false && <span className="pill none">off</span>}
                <button className="link" style={{ marginLeft: 10 }}
                        onClick={() => setHeadForm(h)}>edit</button>
              </span>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 140px' }}>
              <label htmlFor="hc">Code</label>
              <input id="hc" placeholder="REPAIR" value={headForm.headCode}
                     onChange={(e) => setHeadForm({ ...headForm, headCode: e.target.value })} />
            </div>
            <div style={{ flex: '2 1 200px' }}>
              <label htmlFor="hn">Name</label>
              <input id="hn" placeholder="Repair and maintenance" value={headForm.headName}
                     onChange={(e) => setHeadForm({ ...headForm, headName: e.target.value })} />
            </div>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={headForm.active}
                   onChange={(e) => setHeadForm({ ...headForm, active: e.target.checked })} />
            In use
          </label>
          <button onClick={addHead} disabled={busy}>Save head</button>
        </div>
      )}
    </div>
  );
}
