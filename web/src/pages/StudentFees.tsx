import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { type SchoolSettings, getSettings } from '../data/admin';
import {
  type FeeStatement,
  type Payment,
  currentYear,
  feeReport,
  money,
} from '../data/fees';
import { type StudentDetail, getStudent } from '../data/people';

/**
 * What a child owes and has paid — the fees report a parent opens.
 *
 * The arithmetic is the office's, from the same function the student page and
 * the dues screen use: a monthly fee counted only up to the month the school
 * has reached, a one-time fee once, and an exam fee never predicted. A parent
 * and the office reading different numbers would be worse than no report.
 *
 * Receipts are listed but not linked: the receipt page is for the people who
 * take money. Everything a receipt says is on this page instead.
 */
export default function StudentFees() {
  const { studentId = '' } = useParams();
  const { access } = useAuth();
  const mine = access.kind !== 'guardian' || access.studentIds.includes(studentId);

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [session, setSession] = useState(currentYear());
  const [statement, setStatement] = useState<FeeStatement | null>(null);
  const [receipts, setReceipts] = useState<Payment[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'forbidden' | 'refused'>('loading');

  useEffect(() => {
    if (!mine) { setState('forbidden'); return; }
    (async () => {
      const [s, settings] = await Promise.all([
        getStudent(studentId).catch(() => null),
        getSettings(),
      ]);
      if (!s) { setState('missing'); return; }
      setStudent(s);
      setSchool(settings);
      setState('ready');
    })();
  }, [studentId, mine]);

  useEffect(() => {
    if (state !== 'ready' || !student) return;
    (async () => {
      const report = await feeReport(student, session);
      if (report === null) { setState('refused'); return; }
      setStatement(report.statement);
      setReceipts(report.receipts.filter(
        (r) => (r.lines ?? []).some((l) => l.sessionYear === session),
      ));
    })();
  }, [student, session, state]);

  if (state === 'forbidden') {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Not your student</h1>
          <p className="panel-note">
            This account may only see the children listed against it. If that is
            wrong, the school has to add them.
          </p>
        </div>
      </div>
    );
  }
  if (state === 'missing') return <div className="wrap"><div className="card">No such student.</div></div>;
  if (state === 'refused') {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Fees</h1>
          <p className="panel-note">
            Your account may not read the fee records. The head teacher and the
            accounts user can; a teacher cannot.
          </p>
        </div>
      </div>
    );
  }
  if (state === 'loading' || !statement) {
    return <div className="wrap"><div className="card">Loading…</div></div>;
  }

  const years = [String(Number(currentYear()) - 1), currentYear()];

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Fees report</h1>
        <h2>
          {student?.fullName} · {student?.className} - {student?.section} · Roll {student?.rollNo}
        </h2>
        <label htmlFor="session">Session</label>
        <select id="session" value={session} onChange={(e) => setSession(e.target.value)}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={() => window.print()}>Print</button>
        <Link to={`/students/${studentId}`} style={{ marginLeft: 14, fontSize: 14 }}>
          Back to the student
        </Link>
      </div>

      <div className="card print-sheet">
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <strong style={{ fontSize: 17 }}>{school?.instituteName ?? 'SchoolTrack'}</strong>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>FEES — SESSION {session}</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>
            {student?.fullName} · {student?.className} - {student?.section} · Roll {student?.rollNo}
          </div>
        </div>

        <div className="tiles" style={{ marginBottom: 16 }}>
          <div className="tile">
            <div className="tile-value">{money(statement.charged)}</div>
            <div className="tile-label">charged so far</div>
          </div>
          <div className="tile">
            <div className="tile-value good">{money(statement.paid)}</div>
            <div className="tile-label">paid</div>
          </div>
          {statement.discount > 0 && (
            <div className="tile">
              <div className="tile-value">{money(statement.discount)}</div>
              <div className="tile-label">discount</div>
            </div>
          )}
          <div className="tile">
            <div className={`tile-value ${statement.outstanding > 0 ? 'poor' : 'good'}`}>
              {money(statement.outstanding)}
            </div>
            <div className="tile-label">outstanding</div>
          </div>
        </div>

        <table className="sheet">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Fee</th>
              <th>Rate</th>
              <th>Charged</th>
              <th>Paid</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {statement.lines.map((l) => (
              <tr key={l.feeHeadId}>
                <td style={{ textAlign: 'left' }}>
                  {l.headName}
                  {l.frequency === 'MONTHLY' && l.periods > 0 && (
                    <span style={{ color: 'var(--muted)' }}> · {l.periods} month{l.periods === 1 ? '' : 's'}</span>
                  )}
                  {l.frequency === 'EXAM' && (
                    <span style={{ color: 'var(--muted)' }}> · per exam</span>
                  )}
                </td>
                <td>{l.rate === null ? '—' : money(l.rate)}</td>
                <td>{money(l.charged)}</td>
                <td>
                  {money(l.paid)}
                  {l.discount > 0 && (
                    <span style={{ color: 'var(--muted)' }}> + {money(l.discount)} disc.</span>
                  )}
                </td>
                <td className={l.balance > 0 ? 'poor' : undefined}>{money(l.balance)}</td>
              </tr>
            ))}
            {statement.lines.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>Nothing charged for this session yet.</td></tr>
            )}
          </tbody>
        </table>

        <h2 style={{ marginTop: 22 }}>Receipts</h2>
        {receipts.length === 0 && (
          <p className="panel-note">No fees have been paid for this session yet.</p>
        )}
        {receipts.map((r) => (
          <div key={r.receiptNo} style={{ marginBottom: 12 }}>
            <div className="row">
              <span style={{ color: 'var(--ink)' }}>
                <strong>{r.receiptNo}</strong>
                <span style={{ color: 'var(--muted)' }}> · {r.paymentDate} · {r.method}</span>
              </span>
              <span className="amount">{money(r.totalAmount)}</span>
            </div>
            {(r.lines ?? []).filter((l) => l.sessionYear === session).map((l, i) => (
              <div className="row" key={`${r.receiptNo}-${i}`} style={{ paddingLeft: 14 }}>
                <span>
                  {l.headName} <span style={{ color: 'var(--muted)' }}>· {l.periodLabel}</span>
                </span>
                <span>
                  {money(l.amountPaid)}
                  {l.discountAmount > 0 && (
                    <span style={{ color: 'var(--muted)' }}> (discount {money(l.discountAmount)})</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}

        <p className="panel-note" style={{ marginTop: 18, lineHeight: 1.55 }}>
          Monthly fees are counted up to this month only, so nothing is shown as
          owing for months that have not happened. An exam fee is charged when
          the exam happens rather than predicted. A balance is worked out fee by
          fee: paying one fee in advance does not settle another. If any of this
          disagrees with the school's own ledger, the office's figure is the one
          to go by.
        </p>
      </div>
    </div>
  );
}
