import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type SchoolSettings, getSettings } from '../data/admin';
import { money } from '../data/fees';
import { type SalaryPayment, getPayment, monthLabel } from '../data/payroll';

/** One month's payslip, laid out to be printed. APEX page 50's output. */
export default function Payslip() {
  const { paymentId = '' } = useParams();
  const [p, setP] = useState<SalaryPayment | null>(null);
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    (async () => {
      try {
        const [got, s] = await Promise.all([getPayment(paymentId), getSettings()]);
        setSchool(s);
        if (!got) { setState('missing'); return; }
        setP(got);
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [paymentId]);

  if (state === 'loading') return <div className="wrap"><div className="card">Loading…</div></div>;
  if (state === 'missing') return (
    <div className="wrap"><div className="card">
      <p style={{ margin: 0 }}>
        No payslip for that month. <Link to="/payroll/register">The register</Link>
      </p>
    </div></div>
  );
  if (state === 'error' || !p) return (
    <div className="wrap"><div className="card"><div className="err">
      Could not read that payslip. Only an administrator may.
    </div></div></div>
  );

  const rows: [string, number][] = [
    ['Basic', p.basic],
    ['House rent', p.houseRent],
    ['Medical', p.medical],
    ['Transport', p.transport],
    ['Other allowance', p.otherAllowance],
  ];
  const deductions: [string, number][] = [
    ['Provident fund', p.providentFund],
    ['Tax', p.tax],
    ['Other deduction', p.otherDeduction],
  ];

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Payslip · {p.staffName}</h1>
        <h2>
          {monthLabel(p.month)}
          {' · '}<Link to={`/payroll/register?month=${p.month}`}>the register</Link>
        </h2>
        <button onClick={() => window.print()}>Print</button>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
          Every figure here was copied onto the payment when it was made, so a later
          rise cannot rewrite this slip.
        </p>
      </div>

      <div className="card">
        <div className="print-sheet">
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {school?.instituteName ?? 'School'}
            </div>
            {school?.address && <div style={{ fontSize: 13 }}>{school.address}</div>}
            <div style={{ marginTop: 8, fontWeight: 600 }}>
              PAYSLIP — {monthLabel(p.month).toUpperCase()}
            </div>
          </div>

          <div className="row"><span>Name</span><span>{p.staffName}</span></div>
          <div className="row"><span>Designation</span><span>{p.designation ?? '—'}</span></div>
          <div className="row"><span>Paid on</span><span>{p.paidOn} · {p.method}</span></div>

          <div style={{ display: 'flex', gap: 24, marginTop: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px' }}>
              <h2>Earnings</h2>
              {rows.filter(([, v]) => v).map(([k, v]) => (
                <div className="row" key={k}><span>{k}</span><span>{money(v)}</span></div>
              ))}
              <div className="row" style={{ fontWeight: 700 }}>
                <span style={{ color: 'var(--ink)' }}>Gross</span><span>{money(p.gross)}</span>
              </div>
            </div>

            <div style={{ flex: '1 1 240px' }}>
              <h2>Deductions</h2>
              {deductions.filter(([, v]) => v).map(([k, v]) => (
                <div className="row" key={k}><span>{k}</span><span>{money(v)}</span></div>
              ))}
              {deductions.every(([, v]) => !v) && (
                <div className="row"><span>None</span><span>0</span></div>
              )}
              <div className="row" style={{ fontWeight: 700 }}>
                <span style={{ color: 'var(--ink)' }}>Total</span>
                <span>{money(p.totalDeduction)}</span>
              </div>
            </div>
          </div>

          <div className="row" style={{ marginTop: 18, fontSize: 18, fontWeight: 700 }}>
            <span style={{ color: 'var(--ink)' }}>Net pay</span>
            <span>{money(p.net)}</span>
          </div>

          {p.remarks && <p style={{ fontSize: 14 }}>{p.remarks}</p>}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 56 }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
              Received by
            </div>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
              {school?.headTeacher ?? 'Head teacher'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
