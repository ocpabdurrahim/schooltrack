import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DEFAULT_SETTINGS,
  type SchoolSettings,
  getSettings,
  saveSettings,
} from '../data/admin';
import { getIntegrations, maskKey, saveIntegrations } from '../data/integrations';
import { listModels, rankVisionModels } from '../data/gemini';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default function Setup() {
  const [s, setS] = useState<SchoolSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(true);
  const [saved, setSaved] = useState('');
  const [problem, setProblem] = useState('');

  // The Gemini key, for reading photographed mark sheets. Kept apart from the
  // settings above because it is kept apart in the database too: settings are
  // readable by parents, and an API key must not be.
  const [keyOnFile, setKeyOnFile] = useState('');
  const [newKey, setNewKey] = useState('');
  const [model, setModel] = useState('');
  const [keyNote, setKeyNote] = useState('');
  const [keyProblem, setKeyProblem] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);

  useEffect(() => {
    getSettings()
      .then((got) => { if (got) setS({ ...DEFAULT_SETTINGS, ...got }); })
      .catch(() => setProblem('Could not read the settings.'))
      .finally(() => setBusy(false));
    getIntegrations().then((i) => {
      setKeyOnFile(i.geminiApiKey);
      setModel(i.geminiModel);
    });
  }, []);

  /**
   * Saves the key and immediately spends it on one cheap call, so the person
   * who pasted it finds out NOW whether it works -- rather than a teacher
   * finding out over a pile of scripts.
   */
  async function saveKey() {
    const key = newKey.trim();
    if (!key) return;
    setKeyBusy(true); setKeyNote(''); setKeyProblem('');
    try {
      const ranked = rankVisionModels(await listModels(key));
      if (!ranked.length) throw new Error('That key works, but has no model on it that can read a picture.');
      const picked = ranked[0];
      await saveIntegrations({ geminiApiKey: key, geminiModel: picked, geminiModels: ranked });
      setKeyOnFile(key);
      setModel(picked);
      setNewKey('');
      // The runners-up matter to say out loud: the best model is also the
      // busiest, and knowing there is somewhere to fall back to is the
      // difference between "come back later" and "it sorted itself out".
      const spare = ranked.length - 1;
      setKeyNote(
        `Saved, and checked against Google. Sheets will be read by ${picked}`
        + (spare > 0
          ? `, falling back to ${ranked.slice(1).join(', ')} if it is busy.`
          : '. It is the only model on this key that can read a picture.'),
      );
    } catch (err) {
      setKeyProblem(err instanceof Error ? err.message : 'That key could not be checked.');
    }
    setKeyBusy(false);
  }

  async function forgetKey() {
    setKeyBusy(true); setKeyNote(''); setKeyProblem('');
    try {
      await saveIntegrations({ geminiApiKey: '', geminiModel: '' });
      setKeyOnFile(''); setModel(''); setNewKey('');
      setKeyNote('Removed. Mark sheets can no longer be scanned.');
    } catch {
      setKeyProblem('That was refused. Only an administrator may change this.');
    }
    setKeyBusy(false);
  }

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

      <div className="card">
        <h2>Reading mark sheets</h2>
        <p className="muted small">
          A Gemini key lets the app read a photographed mark sheet. Without one,
          marks are typed in as before and nothing else changes. Make a key at{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>.
        </p>
        <p className="muted small">
          The key is stored in this school's own database, where only an
          administrator or a teacher can reach it — never in the app's code,
          which is public. A photographed sheet is sent to Google to be read.
        </p>

        {keyOnFile ? (
          <p>
            Key on file: <code>{maskKey(keyOnFile)}</code>
            {model && <> · sheets are read by <code>{model}</code></>}
          </p>
        ) : (
          <p className="muted">No key yet. Mark sheets cannot be scanned.</p>
        )}

        <label htmlFor="gkey">{keyOnFile ? 'Replace the key' : 'Paste the key'}</label>
        <input
          id="gkey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="AIza…"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
        />

        <div className="btn-row" style={{ marginTop: 10 }}>
          <button onClick={saveKey} disabled={keyBusy || newKey.trim() === ''}>
            {keyBusy ? 'Checking…' : 'Save and check the key'}
          </button>
          {keyOnFile && (
            <button className="ghost" onClick={forgetKey} disabled={keyBusy}>
              Remove the key
            </button>
          )}
        </div>

        {keyNote && <div style={{ marginTop: 10, color: 'var(--accent)' }}>{keyNote}</div>}
        {keyProblem && <div className="err">{keyProblem}</div>}
      </div>

      {/*
        Last on the page, and a link rather than a button that does it: the
        screen it opens counts what would go, insists on a backup, and makes
        the school's name be typed. Nothing here deletes anything.
      */}
      <div className="card">
        <h1>Start a new school</h1>
        <h2>Empties this school so another can be set up in it</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
          Clears the students, marks, attendance and money — everything, or just the
          records, keeping the classes and subjects. Your sign-in, the school&rsquo;s
          name and the Gemini key are kept either way, so you are not locked out.
          The next screen counts what would go and takes a backup first;{' '}
          <strong>nothing is deleted until you type the school&rsquo;s name</strong>.
        </p>
        <Link to="/setup/reset">
          <button className="ghost">Start a new school…</button>
        </Link>
      </div>
    </div>
  );
}
