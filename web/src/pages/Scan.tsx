import { Html5Qrcode } from 'html5-qrcode';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  type SchoolClass, type ScanResult,
  listClasses, loadRegister, openSession, scan, todayInDhaka,
} from '../data/attendance';

/**
 * Gate scanning. Two input paths:
 *   - a handheld scanner is a keyboard: it types the code and presses Enter
 *   - or the camera, for a phone
 * Both end in the same scan() call.
 *
 * Leave Section empty for GATE MODE: any student's card is accepted and
 * recorded against their own class.
 */
export default function Scan() {
  const { access } = useAuth();
  const email = 'email' in access ? access.email : '';
  const canMark = access.kind === 'staff' && ['ADMIN', 'TEACHER'].includes(access.role);

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [date] = useState(todayInDhaka());
  const [lateAfter, setLateAfter] = useState('');
  const [code, setCode] = useState('');
  const [last, setLast] = useState<ScanResult | null>(null);
  const [counts, setCounts] = useState({ present: 0, total: 0 });
  const [camera, setCamera] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const reader = useRef<Html5Qrcode | null>(null);
  const recent = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  useEffect(() => { listClasses().then(setClasses).catch(() => {}); }, []);
  useEffect(() => { void tally(); /* eslint-disable-next-line */ }, [classId]);
  useEffect(() => { inputRef.current?.focus(); }, [last]);

  async function tally() {
    try {
      const rows = await loadRegister(classId || null, date);
      setCounts({
        present: rows.filter((r) => r.status === 'P' || r.status === 'L').length,
        total: rows.length,
      });
    } catch { /* the banner below already reports failures that matter */ }
  }

  async function handle(raw: string) {
    if (!raw.trim() || !canMark) return;
    try {
      await openSession(date, email);
      const result = await scan(raw, classId || null, date, email, lateAfter || undefined);
      setLast(result);
      beep(result.ok);
      if (result.ok && !result.already) void tally();
    } catch {
      setLast({ ok: false, message: 'That was refused. Your account may not mark attendance.' });
      beep(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = code;
    setCode('');
    void handle(v);
  }

  async function toggleCamera() {
    if (camera) {
      await reader.current?.stop().catch(() => {});
      reader.current?.clear();
      reader.current = null;
      setCamera(false);
      return;
    }
    setCamera(true);
    reader.current = new Html5Qrcode('reader');
    try {
      await reader.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 220 },
        (text) => {
          // A camera decodes the same card many times a second. Without this
          // one student would be "already marked" a dozen times per visit.
          const now = Date.now();
          if (text === recent.current.code && now - recent.current.at < 2500) return;
          recent.current = { code: text, at: now };
          void handle(text);
        },
        () => {},
      );
    } catch {
      setLast({ ok: false, message: 'The camera could not be started.' });
      setCamera(false);
    }
  }

  useEffect(() => () => { void reader.current?.stop().catch(() => {}); }, []);

  const tone = !last ? '' : !last.ok ? 'scan-bad' : last.already ? 'scan-late' : 'scan-ok';

  return (
    <div className="wrap">
      <div className="card">
        <h1>Scan attendance</h1>
        <h2>
          {counts.total ? `${counts.present} of ${counts.total} present` : 'Â '}
          {' Â· '}
          <Link to="/attendance">mark by hand instead</Link>
        </h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label htmlFor="cls">Section</label>
            <select id="cls" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">â€” Whole school (gate) â€”</option>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.displayName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="late">Late after</label>
            <input id="late" type="time" value={lateAfter}
                   onChange={(e) => setLateAfter(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ textAlign: 'center' }}>
        <div className={`scan-msg ${tone}`}>
          {last ? last.message : 'Scan a card, or type the number and press Enter.'}
        </div>

        <form onSubmit={submit}>
          <input
            ref={inputRef}
            className="scan-input"
            value={code}
            autoComplete="off"
            disabled={!canMark}
            placeholder="SMS-STU-76"
            onChange={(e) => setCode(e.target.value)}
            style={{ marginTop: 14 }}
          />
        </form>

        <button onClick={() => void toggleCamera()} disabled={!canMark} style={{ marginTop: 14 }}>
          {camera ? 'Stop camera' : 'Use camera'}
        </button>

        <div id="reader" className="scan-cam" style={{ display: camera ? 'block' : 'none' }} />
      </div>

      {!canMark && (
        <div className="card">
          <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
            Scanning records attendance, so it is limited to teachers and administrators.
          </p>
        </div>
      )}
    </div>
  );
}

/** High tone for a good scan, low buzz for a problem: the gate is noisy and
 *  nobody is looking at the screen. */
function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.08;
    osc.start();
    setTimeout(() => { osc.stop(); void ctx.close(); }, ok ? 110 : 320);
  } catch { /* no audio on this device â€” the colour still shows */ }
}
