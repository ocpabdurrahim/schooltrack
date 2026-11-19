import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type SchoolSettings,
  getSettings,
  saveSettings,
} from '../data/admin';
import { getIntegrations, maskKey, saveIntegrations } from '../data/integrations';
import { listModels, rankVisionModels } from '../data/gemini';
import type { ReadWith } from '../data/reader';
import { READ_WITH_LABELS, nothingToReadWith, readersToTry } from '../data/reader';

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

  // Who does the reading: Google, this school's own computer, or whichever
  // of the two is available.
  const [readWith, setReadWith] = useState<ReadWith>('auto');
  const [readerUrl, setReaderUrl] = useState('');
  const [readerNote, setReaderNote] = useState('');
  const [readerBusy, setReaderBusy] = useState(false);

  useEffect(() => {
    getSettings()
      .then((got) => { if (got) setS({ ...DEFAULT_SETTINGS, ...got }); })
      .catch(() => setProblem('Could not read the settings.'))
      .finally(() => setBusy(false));
    getIntegrations().then((i) => {
      setKeyOnFile(i.geminiApiKey);
      setModel(i.geminiModel);
      setReadWith(i.readWith);
      setReaderUrl(i.localReaderUrl);
    });
  }, []);

  /**
   * Remembers who should read the sheets.
   *
   * Not checked against the reader the way the key is checked against Google:
   * the office computer is very often switched off at the moment somebody is
   * sitting here setting this up, and refusing to save an address because
   * nothing answered it right now would be wrong.
   */
  async function saveReader() {
    setReaderBusy(true); setReaderNote('');
    try {
      await saveIntegrations({ readWith, localReaderUrl: readerUrl });
      setReaderNote(
        readersToTry(readWith, readerUrl, keyOnFile !== '').length === 0
          ? `Saved. ${nothingToReadWith(readWith)}`
          : 'Saved.',
      );
    } catch {
      setReaderNote('That could not be saved.');
    }
    setReaderBusy(false);
  }

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

      <div className="card">
        <h2>Who reads the sheets</h2>
        <p className="muted small">
          Google reads a sheet from anywhere there is signal, but a free key is
          refused when their models are busy — which tends to be exactly when
          schools are marking. This school can run its own reader on one office
          computer instead: free, no quota, and nothing leaves the building —
          but only while that computer is switched on.
        </p>

        {READ_WITH_LABELS.map((o) => (
          <label key={o.value} className="choice">
            <input
              type="radio"
              name="readWith"
              value={o.value}
              checked={readWith === o.value}
              onChange={() => setReadWith(o.value)}
            />
            <span>
              <strong>{o.label}</strong>
              <br />
              <span className="muted small">{o.hint}</span>
            </span>
          </label>
        ))}

        <label htmlFor="readerUrl" style={{ marginTop: 12 }}>
          Address of this school&rsquo;s reader
        </label>
        <input
          id="readerUrl"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="http://localhost:8765"
          value={readerUrl}
          onChange={(e) => setReaderUrl(e.target.value)}
        />
        <p className="muted small">
          On the computer running the reader this is{' '}
          <code>http://localhost:8765</code>. From another machine or a phone
          on the same wifi it is that computer&rsquo;s address instead, such as{' '}
          <code>http://192.168.0.12:8765</code>.
        </p>

        <div className="btn-row" style={{ marginTop: 10 }}>
          <button onClick={saveReader} disabled={readerBusy}>
            {readerBusy ? 'Saving…' : 'Save'}
          </button>
        </div>
        {readerNote && <div style={{ marginTop: 10, color: 'var(--accent)' }}>{readerNote}</div>}
      </div>
    </div>
  );
}
