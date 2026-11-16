import { useEffect, useState } from 'react';
import { type ClassRow, listAllClasses } from '../data/admin';
import {
  type FeeHead,
  type Frequency,
  type StructureRow,
  currentYear,
  listFeeHeads,
  listStructure,
  saveFeeHead,
  saveStructure,
  structureId,
} from '../data/fees';

const FREQUENCY: Record<Frequency, string> = {
  MONTHLY: 'Every month',
  ONE_TIME: 'Once a session',
  EXAM: 'Per exam',
};

const blank = {
  headCode: '', headName: '', frequency: 'MONTHLY' as Frequency,
  active: true, sortOrder: 0,
};

export default function FeeSetup() {
  const [heads, setHeads] = useState<FeeHead[]>([]);
  const [structure, setStructure] = useState<StructureRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [form, setForm] = useState<typeof blank & { feeHeadId?: string }>({ ...blank });
  const [className, setClassName] = useState('');
  const [year, setYear] = useState(currentYear());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');

  const load = async () => {
    const [h, s, c] = await Promise.all([listFeeHeads(), listStructure(), listAllClasses()]);
    setHeads(h);
    setStructure(s);
    setClasses(c.filter((x) => x.active !== false));
    if (!className && c.length) setClassName(c[0].className);
    setBusy(false);
  };

  useEffect(() => {
    load().catch(() => {
      setProblem('Could not read the fee setup. Only the head, accounts or the office may.');
      setBusy(false);
    });
  }, []);

  // the rate card for the chosen class and session, as editable text
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const h of heads) {
      const row = structure.find((r) => r.id === structureId(h.feeHeadId, className, year));
      next[h.feeHeadId] = row ? String(row.amount) : '';
    }
    setAmounts(next);
  }, [heads, structure, className, year]);

  async function saveHead() {
    if (!form.headCode.trim() || !form.headName.trim()) {
      setProblem('A fee head needs a short code and a name.');
      return;
    }
    setBusy(true); setProblem(''); setNote('');
    try {
      await saveFeeHead(form);
      setForm({ ...blank, sortOrder: (heads.at(-1)?.sortOrder ?? 0) + 1 });
      await load();
    } catch {
      setProblem('That save was refused. Only an administrator may change the fee heads.');
      setBusy(false);
    }
  }

  async function saveRates() {
    setBusy(true); setProblem(''); setNote('');
    try {
      let saved = 0;
      for (const h of heads) {
        const raw = (amounts[h.feeHeadId] ?? '').trim();
        if (raw === '') continue;            // blank means "not charged to this class"
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount < 0) continue;
        await saveStructure({ feeHeadId: h.feeHeadId, className, sessionYear: year, amount });
        saved++;
      }
      await load();
      setNote(`${saved} rate${saved === 1 ? '' : 's'} saved for ${className}, ${year}.`);
    } catch {
      setProblem('That save was refused. Only an administrator may change the rates.');
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>Fee setup</h1>
        <h2>What each class is charged, and how often</h2>
        {problem && <div className="err">{problem}</div>}
      </div>

      <div className="card">
        <h2>Fee heads</h2>
        {heads.map((h) => (
          <div className="row" key={h.feeHeadId}>
            <span style={{ color: 'var(--ink)' }}>
              {h.headName}
              <span style={{ color: 'var(--muted)', marginLeft: 10 }}>{h.headCode}</span>
              {h.active === false && <span className="pill none" style={{ marginLeft: 8 }}>off</span>}
            </span>
            <span>
              <span style={{ color: 'var(--muted)', marginRight: 12 }}>
                {FREQUENCY[h.frequency] ?? h.frequency}
              </span>
              <button className="link" onClick={() => { setForm(h); setProblem(''); }}>edit</button>
            </span>
          </div>
        ))}
        {!busy && heads.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            No fee heads yet — add Tuition, Exam fee, Admission and so on below.
          </p>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="code">Code</label>
            <input id="code" placeholder="TUITION" value={form.headCode}
                   disabled={!!form.feeHeadId}
                   onChange={(e) => setForm({ ...form, headCode: e.target.value })} />
          </div>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="name">Name</label>
            <input id="name" placeholder="Monthly tuition fee" value={form.headName}
                   onChange={(e) => setForm({ ...form, headName: e.target.value })} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="freq">Charged</label>
            <select id="freq" value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}>
              {Object.entries(FREQUENCY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{ flex: '0 1 100px' }}>
            <label htmlFor="ord">Order</label>
            <input id="ord" type="number" value={form.sortOrder || ''}
                   onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
          </div>
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={form.active}
                 onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          In use
        </label>

        <button onClick={saveHead} disabled={busy}>
          {form.feeHeadId ? 'Save fee head' : 'Add fee head'}
        </button>
        {form.feeHeadId && (
          <button className="link" style={{ marginLeft: 14 }}
                  onClick={() => setForm({ ...blank })}>cancel</button>
        )}
      </div>

      <div className="card">
        <h2>Rates</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="cls">Class</label>
            <select id="cls" value={className} onChange={(e) => setClassName(e.target.value)}>
              {[...new Set(classes.map((c) => c.className))].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="yr">Session</label>
            <input id="yr" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
        </div>

        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14, marginBottom: 0 }}>
          A rate is per class, not per section: Class 6 A and Class 6 B are charged the same.
          Leave a box empty and that head is simply not charged to this class.
        </p>

        {heads.filter((h) => h.active !== false).map((h) => (
          <div key={h.feeHeadId} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: '2 1 200px' }}>
              <label htmlFor={`a-${h.feeHeadId}`}>
                {h.headName} <span style={{ opacity: 0.7 }}>· {FREQUENCY[h.frequency]}</span>
              </label>
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <input id={`a-${h.feeHeadId}`} type="number" inputMode="decimal"
                     value={amounts[h.feeHeadId] ?? ''}
                     onChange={(e) => setAmounts({ ...amounts, [h.feeHeadId]: e.target.value })} />
            </div>
          </div>
        ))}

        <button onClick={saveRates} disabled={busy || !className}>Save rates</button>
        {note && <span style={{ marginLeft: 12, color: 'var(--accent)' }}>{note}</span>}
      </div>
    </div>
  );
}
