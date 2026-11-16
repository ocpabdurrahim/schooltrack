import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { todayInDhaka } from '../data/attendance';
import { money } from '../data/fees';
import {
  type SalaryPayment,
  monthLabel,
  paymentId,
  paymentsForMonth,
  thisMonth,
} from '../data/payroll';

/** The month's payroll, and the way to each payslip. APEX page 51. */
export default function SalaryRegister() {
  const [params, setParams] = useSearchParams();
  const [month, setMonth] = useState(params.get('month') ?? thisMonth(todayInDhaka()));
  const [rows, setRows] = useState<SalaryPayment[]>([]);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let live = true;
    setBusy(true);
    paymentsForMonth(month)
      .then((r) => { if (live) { setRows(r.sort((a, b) => a.staffName.localeCompare(b.staffName))); setProblem(''); } })
      .catch(() => { if (live) setProblem('Could not read the register. Only an administrator may.'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [month]);

  const gross = rows.reduce((t, r) => t + r.gross, 0);
  const deductions = rows.reduce((t, r) => t + r.totalDeduction, 0);
  const net = rows.reduce((t, r) => t + r.net, 0);

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Salary register</h1>
        <h2>{monthLabel(month)}</h2>

        <label htmlFor="m">Month</label>
        <input id="m" type="month" value={month}
               onChange={(e) => { setMonth(e.target.value); setParams({ month: e.target.value }); }} />

        <button onClick={() => window.print()} disabled={!rows.length}>Print</button>
        {problem && <div className="err">{problem}</div>}
      </div>

      <div className="card">
        <div className="print-sheet">
          <h2 style={{ textAlign: 'center' }}>
            Salary register — {monthLabel(month)}
          </h2>

          {busy && <p>Working…</p>}
          {!busy && rows.length === 0 && (
            <p style={{ color: 'var(--muted)', margin: 0 }}>
              Nothing has been paid for this month.
            </p>
          )}

          {rows.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 4px' }}>Name</th>
                  <th style={{ padding: '6px 4px' }}>Designation</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right' }}>Gross</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right' }}>Deductions</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right' }}>Net</th>
                  <th style={{ padding: '6px 4px' }} className="no-print">Payslip</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.staffId} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '6px 4px' }}>{r.staffName}</td>
                    <td style={{ padding: '6px 4px' }}>{r.designation ?? '—'}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right' }}>{money(r.gross)}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right' }}>{money(r.totalDeduction)}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 700 }}>
                      {money(r.net)}
                    </td>
                    <td style={{ padding: '6px 4px' }} className="no-print">
                      <Link to={`/payroll/payslip/${paymentId(r.staffId, month)}`}>open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td colSpan={2} style={{ padding: '10px 4px' }}>
                    {rows.length} paid
                  </td>
                  <td style={{ padding: '10px 4px', textAlign: 'right' }}>{money(gross)}</td>
                  <td style={{ padding: '10px 4px', textAlign: 'right' }}>{money(deductions)}</td>
                  <td style={{ padding: '10px 4px', textAlign: 'right' }}>{money(net)}</td>
                  <td className="no-print" />
                </tr>
              </tfoot>
            </table>
          )}

          {rows.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 56 }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
                Prepared by
              </div>
              <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
                Head teacher
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
