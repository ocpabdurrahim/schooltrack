import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { todayInDhaka } from '../data/attendance';
import { type Payment, breakdown, money, paymentsBetween } from '../data/fees';

/**
 * Receipts and the day's collection on one page: the same question asked two
 * ways — what came in, and which receipts make it up. Defaults to today.
 */
export default function Receipts() {
  const [from, setFrom] = useState(todayInDhaka());
  const [to, setTo] = useState(todayInDhaka());
  const [rows, setRows] = useState<Payment[]>([]);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let live = true;
    setBusy(true);
    paymentsBetween(from, to)
      .then((r) => { if (live) { setRows(r); setProblem(''); } })
      .catch(() => {
        if (live) setProblem('Could not read the receipts. Only the head and accounts may.');
      })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [from, to]);

  const sum = breakdown(rows);
  const sameDay = from === to;

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Receipts</h1>
        <h2>{sameDay ? `Collection on ${from}` : `Collection from ${from} to ${to}`}</h2>

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
        {problem && <div className="err">{problem}</div>}
      </div>

      <div className="card">
        <h2>{busy ? 'Working…' : `${sum.receipts} receipt${sum.receipts === 1 ? '' : 's'}`}</h2>
        <div className="tiles">
          <div className="tile">
            <div className="tile-value">{money(sum.total)}</div>
            <div className="tile-label">collected</div>
          </div>
          {sum.byMethod.map((m) => (
            <div className="tile" key={m.method}>
              <div className="tile-value">{money(m.amount)}</div>
              <div className="tile-label">{m.method}</div>
            </div>
          ))}
        </div>

        {sum.byHead.length > 0 && (
          <>
            <h2 style={{ marginTop: 18 }}>By fee head</h2>
            {sum.byHead.map((h) => (
              <div className="row" key={h.feeHeadId}>
                <span>{h.headName}</span>
                <span>{money(h.amount)}</span>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <h2>Receipts</h2>
        {!busy && rows.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>Nothing was collected in this period.</p>
        )}
        {rows.map((p) => (
          <div className="row" key={p.receiptNo}>
            <span style={{ color: 'var(--ink)' }}>
              <Link to={`/fees/receipts/${p.receiptNo}`}>{p.receiptNo}</Link>
              <span style={{ color: 'var(--muted)', marginLeft: 10 }}>
                {p.studentName} · {p.classLabel}
              </span>
            </span>
            <span>
              <span style={{ color: 'var(--muted)', marginRight: 12 }}>
                {p.paymentDate} · {p.method}
              </span>
              <strong>{money(p.totalAmount)}</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
