import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type SchoolSettings, getSettings } from '../data/admin';
import { type Payment, getPayment, money } from '../data/fees';

/** One receipt, laid out to be printed. */
export default function Receipt() {
  const { receiptNo = '' } = useParams();
  const [p, setP] = useState<Payment | null>(null);
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    (async () => {
      try {
        const [got, s] = await Promise.all([getPayment(receiptNo), getSettings()]);
        setSchool(s);
        if (!got) { setState('missing'); return; }
        setP(got);
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [receiptNo]);

  if (state === 'loading') return <div className="wrap"><div className="card">Loading…</div></div>;
  if (state === 'missing') return (
    <div className="wrap"><div className="card">
      <p style={{ margin: 0 }}>No receipt {receiptNo}. <Link to="/fees/receipts">All receipts</Link></p>
    </div></div>
  );
  if (state === 'error' || !p) return (
    <div className="wrap"><div className="card"><div className="err">
      Could not read that receipt. Only the head and the accounts user may.
    </div></div></div>
  );

  const discount = p.lines.reduce((t, l) => t + (l.discountAmount || 0), 0);

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Receipt {p.receiptNo}</h1>
        <h2>
          <Link to="/fees/receipts">all receipts</Link>
          {' · '}<Link to={`/students/${p.studentId}`}>{p.studentName}</Link>
        </h2>
        <button onClick={() => window.print()}>Print</button>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
          A receipt cannot be edited or deleted. If this one is wrong, collect a
          correcting entry instead — the ledger keeps both, as a paper book would.
        </p>
      </div>

      <div className="card">
        <div className="print-sheet">
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {school?.instituteName ?? 'School'}
            </div>
            {school?.address && <div style={{ fontSize: 13 }}>{school.address}</div>}
            {school?.eiin && <div style={{ fontSize: 13 }}>EIIN: {school.eiin}</div>}
            <div style={{ marginTop: 8, fontWeight: 600 }}>MONEY RECEIPT</div>
          </div>

          <div className="row"><span>Receipt no.</span><span><strong>{p.receiptNo}</strong></span></div>
          <div className="row"><span>Date</span><span>{p.paymentDate}</span></div>
          <div className="row"><span>Student</span><span>{p.studentName}</span></div>
          <div className="row"><span>Class</span><span>{p.classLabel} · Roll {p.rollNo}</span></div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                <th style={{ padding: '6px 0' }}>Particulars</th>
                <th style={{ padding: '6px 0' }}>Period</th>
                <th style={{ padding: '6px 0', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '6px 0', textAlign: 'right' }}>Discount</th>
                <th style={{ padding: '6px 0', textAlign: 'right' }}>Paid</th>
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l, i) => (
                <tr key={`${l.feeHeadId}-${l.periodLabel}-${i}`}
                    style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px 0' }}>{l.headName}</td>
                  <td style={{ padding: '6px 0' }}>{l.periodLabel}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right' }}>{money(l.grossAmount)}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right' }}>
                    {l.discountAmount ? money(l.discountAmount) : '—'}
                  </td>
                  <td style={{ padding: '6px 0', textAlign: 'right' }}>{money(l.amountPaid)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700 }}>
                  Total
                </td>
                <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700 }}>
                  {money(p.totalAmount)}
                </td>
              </tr>
            </tfoot>
          </table>

          {discount > 0 && (
            <div style={{ fontSize: 13, marginTop: 6 }}>
              Discount allowed: {money(discount)}
            </div>
          )}

          <div className="row" style={{ marginTop: 14 }}>
            <span>Paid by</span><span>{p.method}</span>
          </div>
          {p.remarks && <div className="row"><span>Remarks</span><span>{p.remarks}</span></div>}
          <div className="row"><span>Received by</span><span>{p.createdBy}</span></div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
              Payer's signature
            </div>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
              Accountant
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
