import { useEffect, useState } from 'react';
import { todayInDhaka } from '../data/attendance';
import { type MonthSummary, incomeExpense, lastMonths } from '../data/expenses';
import { money } from '../data/fees';
import { monthLabel } from '../data/payroll';

/**
 * Income against expense, month by month — the figure the head teacher
 * actually asks for. APEX page 1's strip, given a page of its own.
 *
 * Income is what was COLLECTED, never what was charged: dues are a hope, and
 * setting them beside real spending would make the school look solvent on
 * money nobody has handed over.
 */
export default function IncomeExpense() {
  const today = todayInDhaka();
  const [count, setCount] = useState(6);
  const [rows, setRows] = useState<MonthSummary[]>([]);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let live = true;
    setBusy(true);
    incomeExpense(lastMonths(today, count))
      .then((r) => { if (live) { setRows(r); setProblem(''); } })
      .catch(() => { if (live) setProblem('Could not build the report. Only the head and accounts may.'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [count]);

  const income = rows.reduce((t, r) => t + r.income, 0);
  const expense = rows.reduce((t, r) => t + r.expense, 0);
  // null all the way through when payroll is not this user's to read, so the
  // screen can say "not shown" instead of printing a confident zero.
  const salaryShown = rows.some((r) => r.salary !== null);
  const salary = rows.reduce((t, r) => t + (r.salary ?? 0), 0);
  const net = income - expense - salary;
  const spentPerMonth = (r: MonthSummary) => r.expense + (r.salary ?? 0);
  const peak = Math.max(1, ...rows.map((r) => Math.max(r.income, spentPerMonth(r))));

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Income and expense</h1>
        <h2>Fees collected against money spent</h2>

        <label htmlFor="n">Months</label>
        <select id="n" style={{ width: 'auto' }} value={count}
                onChange={(e) => setCount(Number(e.target.value))}>
          {[3, 6, 12].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>

        <button onClick={() => window.print()} disabled={!rows.length}>Print</button>
        {problem && <div className="err">{problem}</div>}
      </div>

      <div className="card">
        <div className="print-sheet">
          <h2 style={{ textAlign: 'center' }}>
            Income and expense — {rows.length ? `${monthLabel(rows[0].month)} to ${monthLabel(rows[rows.length - 1].month)}` : ''}
          </h2>

          <div className="tiles">
            <div className="tile">
              <div className="tile-value" style={{ color: 'var(--accent)' }}>{money(income)}</div>
              <div className="tile-label">collected</div>
            </div>
            <div className="tile">
              <div className="tile-value" style={{ color: 'var(--bad)' }}>{money(expense)}</div>
              <div className="tile-label">on vouchers</div>
            </div>
            <div className="tile">
              <div className="tile-value" style={{ color: salaryShown ? 'var(--bad)' : 'var(--muted)' }}>
                {salaryShown ? money(salary) : '—'}
              </div>
              <div className="tile-label">{salaryShown ? 'on salaries' : 'salaries not shown'}</div>
            </div>
            <div className="tile">
              <div className="tile-value" style={{ color: net < 0 ? 'var(--bad)' : 'var(--ink)' }}>
                {money(net)}
              </div>
              <div className="tile-label">{net < 0 ? 'short' : 'left'}</div>
            </div>
          </div>

          {busy && <p style={{ marginTop: 16 }}>Working…</p>}

          {!busy && rows.map((r) => (
            <div key={r.month} style={{ marginTop: 16 }}>
              <div className="row" style={{ borderBottom: 0, paddingBottom: 2 }}>
                <span style={{ color: 'var(--ink)' }}>{monthLabel(r.month)}</span>
                <span>
                  <span style={{ color: 'var(--accent)' }}>{money(r.income)}</span>
                  {' − '}
                  <span style={{ color: 'var(--bad)' }}>{money(spentPerMonth(r))}</span>
                  {r.salary !== null && r.salary > 0 && (
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {' '}(incl. {money(r.salary)} salary)
                    </span>
                  )}
                  {' = '}
                  <strong style={{ color: r.net < 0 ? 'var(--bad)' : 'var(--ink)' }}>
                    {money(r.net)}
                  </strong>
                </span>
              </div>

              {/* two bars, drawn to the same scale so the months compare */}
              <div style={{ height: 8, background: '#e6f4ea', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${(r.income / peak) * 100}%`, height: '100%', background: 'var(--accent)',
                }} />
              </div>
              <div style={{ height: 8, background: '#fdecea', borderRadius: 4, marginTop: 3, overflow: 'hidden' }}>
                <div style={{
                  width: `${(spentPerMonth(r) / peak) * 100}%`, height: '100%', background: 'var(--bad)',
                }} />
              </div>
            </div>
          ))}

          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 20, marginBottom: 0 }}>
            Income is what was actually collected in the month, not what was billed —
            unpaid dues are not income. Salaries are counted in the month they were
            <strong> paid</strong>, not the month they were earned, so that both sides of
            a month are money that actually moved. They come straight from the payroll
            screen: do not enter a salary as an expense voucher as well, or it will be
            counted twice.
            {!salaryShown && (
              <>
                {' '}
                <strong>Salaries are not included in these figures</strong>, because what
                each member of staff is paid is the head teacher's to see. The totals
                above are fees against vouchers only.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
