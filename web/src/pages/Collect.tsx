import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  type Collectable,
  type FeeHead,
  type PaymentLine,
  collectPayment,
  collectablesFor,
  currentYear,
  listFeeHeads,
  money,
  outstanding,
} from '../data/fees';
import { type StudentDetail, findStudents } from '../data/people';
import { todayInDhaka } from '../data/attendance';

type Picked = { on: boolean; discount: string; amount: string };

const keyOf = (c: Collectable) => `${c.head.feeHeadId}|${c.periodLabel}`;

export default function Collect() {
  const { access } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [found, setFound] = useState<StudentDetail[]>([]);
  const [student, setStudent] = useState<StudentDetail | null>(null);

  const [year] = useState(currentYear());
  const [rows, setRows] = useState<Collectable[]>([]);
  const [picked, setPicked] = useState<Record<string, Picked>>({});
  const [heads, setHeads] = useState<FeeHead[]>([]);

  // one free line, for an exam fee or anything the rate card does not predict
  const [extraHead, setExtraHead] = useState('');
  const [extraPeriod, setExtraPeriod] = useState('');
  const [extraAmount, setExtraAmount] = useState('');

  const [method, setMethod] = useState('Cash');
  const [date, setDate] = useState(todayInDhaka());
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => { listFeeHeads().then(setHeads).catch(() => {}); }, []);

  useEffect(() => {
    if (search.trim().length < 2) { setFound([]); return; }
    let live = true;
    const t = setTimeout(() => {
      findStudents(null, search)
        .then((r) => { if (live) setFound(r.slice(0, 8)); })
        .catch(() => { if (live) setFound([]); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [search]);

  async function choose(s: StudentDetail) {
    setStudent(s);
    setSearch('');
    setFound([]);
    setProblem('');
    setBusy(true);
    try {
      const cs = await collectablesFor(s, year);
      setRows(cs);
      // nothing is ticked by default: the collector decides what is being paid
      setPicked(Object.fromEntries(cs.map((c) => [keyOf(c), {
        on: false,
        discount: '0',
        amount: String(outstanding(c)),
      }])));
    } catch {
      setProblem('Could not work out what this student owes.');
    }
    setBusy(false);
  }

  const lines: PaymentLine[] = rows
    .filter((c) => picked[keyOf(c)]?.on)
    .map((c) => {
      const p = picked[keyOf(c)];
      return {
        feeHeadId: c.head.feeHeadId,
        headName: c.head.headName,
        sessionYear: year,
        periodLabel: c.periodLabel,
        grossAmount: c.grossAmount,
        discountAmount: Number(p.discount) || 0,
        amountPaid: Number(p.amount) || 0,
      };
    });

  const extra = heads.find((h) => h.feeHeadId === extraHead);
  if (extra && extraPeriod.trim() && Number(extraAmount) > 0) {
    lines.push({
      feeHeadId: extra.feeHeadId,
      headName: extra.headName,
      sessionYear: year,
      periodLabel: extraPeriod.trim().toUpperCase(),
      grossAmount: Number(extraAmount) || 0,
      discountAmount: 0,
      amountPaid: Number(extraAmount) || 0,
    });
  }

  const total = lines.reduce((t, l) => t + l.amountPaid, 0);

  async function collect() {
    if (!student || !lines.length) {
      setProblem('Tick what is being paid first.');
      return;
    }
    if (total <= 0) {
      setProblem('The total is zero — nothing would be collected.');
      return;
    }
    setBusy(true);
    setProblem('');
    try {
      const receiptNo = await collectPayment({
        student,
        lines,
        method,
        paymentDate: date,
        remarks,
        createdBy: access.kind === 'staff' ? access.email : '',
      });
      navigate(`/fees/receipts/${receiptNo}`);
    } catch {
      setProblem(
        'That payment was refused. Only the head or the accounts user may collect fees.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>Collect fee</h1>
        <h2>{student ? `${student.fullName} · ${student.className} - ${student.section} · Roll ${student.rollNo}` : 'Find the student first'}</h2>

        <label htmlFor="q">Student</label>
        <input id="q" autoComplete="off" placeholder="name, roll or student number"
               value={search} onChange={(e) => setSearch(e.target.value)} />
        {found.map((s) => (
          <div className="row" key={s.studentId}>
            <span style={{ color: 'var(--ink)' }}>
              {s.fullName}
              <span style={{ color: 'var(--muted)', marginLeft: 10 }}>
                {s.className} {s.section} · roll {s.rollNo}
              </span>
            </span>
            <button className="link" onClick={() => choose(s)}>choose</button>
          </div>
        ))}
        {problem && <div className="err">{problem}</div>}
      </div>

      {student && (
        <>
          <div className="card">
            <h2>Due this session ({year})</h2>
            {busy && <p>Working…</p>}
            {!busy && rows.length === 0 && (
              <p style={{ color: 'var(--muted)', margin: 0 }}>
                No rates are set for {student.className} in {year}. Set them under Fee setup.
              </p>
            )}

            {rows.map((c) => {
              const k = keyOf(c);
              const p = picked[k] ?? { on: false, discount: '0', amount: '0' };
              const settled = outstanding(c) === 0;
              return (
                <div key={k} style={{
                  display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
                  padding: '7px 0', borderBottom: '1px solid var(--line)',
                  opacity: settled ? 0.55 : 1,
                }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={p.on}
                         disabled={settled}
                         onChange={(e) => setPicked({ ...picked, [k]: { ...p, on: e.target.checked } })} />
                  <span style={{ flex: '2 1 200px' }}>
                    {c.head.headName}
                    <span style={{ color: 'var(--muted)' }}> · {c.periodLabel}</span>
                    {settled && <span className="pill" style={{ marginLeft: 8 }}>paid</span>}
                  </span>
                  <span style={{ flex: '0 1 90px', color: 'var(--muted)' }}>
                    {money(c.grossAmount)}
                  </span>
                  <input style={{ flex: '0 1 90px' }} type="number" inputMode="decimal"
                         aria-label={`discount ${c.periodLabel}`}
                         placeholder="discount" value={p.discount} disabled={!p.on}
                         onChange={(e) => setPicked({ ...picked, [k]: { ...p, on: true, discount: e.target.value } })} />
                  <input style={{ flex: '0 1 110px' }} type="number" inputMode="decimal"
                         aria-label={`amount ${c.periodLabel}`}
                         placeholder="amount" value={p.amount} disabled={!p.on}
                         onChange={(e) => setPicked({ ...picked, [k]: { ...p, on: true, amount: e.target.value } })} />
                </div>
              );
            })}

            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12, marginBottom: 0 }}>
              Monthly heads are listed up to this month only. An exam fee is not predicted
              here — add it as a line below, naming the exam.
            </p>
          </div>

          <div className="card">
            <h2>Another line</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '2 1 180px' }}>
                <label htmlFor="eh">Fee head</label>
                <select id="eh" value={extraHead} onChange={(e) => setExtraHead(e.target.value)}>
                  <option value="">—</option>
                  {heads.filter((h) => h.active !== false).map((h) => (
                    <option key={h.feeHeadId} value={h.feeHeadId}>{h.headName}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '2 1 180px' }}>
                <label htmlFor="ep">Period</label>
                <input id="ep" placeholder="HALF_YEARLY_EXAM-2026" value={extraPeriod}
                       onChange={(e) => setExtraPeriod(e.target.value)} />
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <label htmlFor="ea">Amount</label>
                <input id="ea" type="number" inputMode="decimal" value={extraAmount}
                       onChange={(e) => setExtraAmount(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Receipt</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <label htmlFor="m">Method</label>
                <select id="m" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {['Cash', 'bKash', 'Nagad', 'Bank'].map((x) => <option key={x}>{x}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label htmlFor="d">Date</label>
                <input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div style={{ flex: '2 1 200px' }}>
                <label htmlFor="r">Remarks</label>
                <input id="r" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
            </div>

            <div className="row" style={{ marginTop: 14 }}>
              <span>{lines.length} line{lines.length === 1 ? '' : 's'}</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
                {money(total)}
              </span>
            </div>

            <button onClick={collect} disabled={busy || !lines.length}>
              {busy ? 'Collecting…' : `Collect ${money(total)}`}
            </button>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              The receipt number is handed out as the receipt is written, in one
              transaction, so two people collecting at once can never be given the
              same number. A receipt can never be edited or deleted afterwards.
            </p>
            {problem && <div className="err">{problem}</div>}
          </div>
        </>
      )}
    </div>
  );
}
