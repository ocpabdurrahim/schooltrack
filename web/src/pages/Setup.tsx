import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type SchoolSettings,
  getSettings,
  saveSettings,
} from '../data/admin';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default function Setup() {
  const [s, setS] = useState<SchoolSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(true);
  const [saved, setSaved] = useState('');
  const [problem, setProblem] = useState('');

  useEffect(() => {
    getSettings()
      .then((got) => { if (got) setS({ ...DEFAULT_SETTINGS, ...got }); })
      .catch(() => setProblem('Could not read the settings.'))
      .finally(() => setBusy(false));
  }, []);

  const field = (k: keyof SchoolSettings) => ({
    value: (s[k] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value }),
  });

  const toggleDay = (d: string) =>
    setS({
      ...s,
      weekendDays: s.weekendDays.includes(d)
        ? s.weekendDays.filter((x) => x !== d)
        : [...s.weekendDays, d],
    });

  async function save() {
    setBusy(true);
    setSaved('');
    setProblem('');
    try {
      await saveSettings(s);
      setSaved('Saved.');
    } catch {
      setProblem('That save was refused. Only an administrator may change the settings.');
    }
    setBusy(false);
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>School setup</h1>
        <h2>The name and session used on every screen, card and report</h2>

        <label htmlFor="n">School name</label>
        <input id="n" {...field('instituteName')} />

        <label htmlFor="sess">Session</label>
        <input id="sess" placeholder="2026" {...field('sessionLabel')} />

        <label htmlFor="addr">Address</label>
        <input id="addr" {...field('address')} />

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label htmlFor="eiin">EIIN</label>
            <input id="eiin" {...field('eiin')} />
          </div>
          <div style={{ flex: '2 1 240px' }}>
            <label htmlFor="head">Head teacher</label>
            <input id="head" {...field('headTeacher')} />
          </div>
        </div>

        <label>Weekend days</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {DAYS.map((d) => (
            <label key={d} style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={s.weekendDays.includes(d)}
                onChange={() => toggleDay(d)}
              />
              {d}
            </label>
          ))}
        </div>

        <button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
        {saved && <span style={{ marginLeft: 12, color: 'var(--accent)' }}>{saved}</span>}
        {problem && <div className="err">{problem}</div>}
      </div>
    </div>
  );
}
