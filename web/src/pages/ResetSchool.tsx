import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  armReset,
  backupEverything,
  clearCollections,
  countCollections,
  disarmReset,
  getSettings,
} from '../data/admin';
import {
  ALL_COLLECTIONS,
  ARMED_FOR_MINUTES,
  type ResetMode,
  confirms,
  planFor,
} from '../data/reset';

/**
 * Empty the school and start another one.
 *
 * The most dangerous screen in the app, so it is built the way the script in
 * tools/ is, and in the same order:
 *
 *   1. Show what would go, counted from the database, before anything.
 *   2. Download the whole school first — every collection, not only the ones
 *      being cleared — in the format the script's --restore reads.
 *   3. Make the school's own name be typed. Not "yes": the point is a
 *      sentence you cannot produce by leaning on the keyboard.
 *   4. Only then arm the fifteen-minute window the rules need, delete, and
 *      shut the window again.
 *
 * The backup is not a flag. The wipe does not begin until the file has been
 * saved, because a reset without an undo is one slip away from a school's
 * records being gone — which is not hypothetical here.
 */
export default function ResetSchool() {
  const [mode, setMode] = useState<ResetMode>('records');
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [typed, setTyped] = useState('');
  const [backedUp, setBackedUp] = useState('');
  const [done, setDone] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [finished, setFinished] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [settings, c] = await Promise.all([
          getSettings(),
          countCollections(ALL_COLLECTIONS),
        ]);
        setSchoolName(settings?.instituteName ?? '');
        setCounts(c);
      } catch {
        setProblem('Could not read the school. Only an administrator may do this.');
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  const plan = planFor(mode);
  const going = counts ? plan.clear.reduce((n, name) => n + (counts[name] ?? 0), 0) : 0;
  const staying = counts ? plan.keep.reduce((n, name) => n + (counts[name] ?? 0), 0) : 0;

  async function download() {
    setBusy(true); setProblem('');
    try {
      const backup = await backupEverything(ALL_COLLECTIONS);
      const name = `schooltrack-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      const kept = Object.values(backup.collections).reduce((n, r) => n + r.length, 0);
      setBackedUp(`${name} — ${kept} document${kept === 1 ? '' : 's'}`);
    } catch {
      setProblem('The backup could not be read, so nothing was deleted.');
    } finally {
      setBusy(false);
    }
  }

  async function wipe() {
    setBusy(true); setProblem(''); setDone([]);
    try {
      await armReset();
      await clearCollections(plan.clear, (name, removed) => {
        setDone((d) => [...d, `${name} — ${removed}`]);
      });
      setFinished(true);
      setCounts(await countCollections(ALL_COLLECTIONS));
    } catch {
      setProblem(
        'Some of it was refused and the rest was left alone. The window may have '
        + 'run out — read the list below, then start again.',
      );
    } finally {
      // Always, even after a failure: the window is meant to be shut.
      await disarmReset().catch(() => {});
      setBusy(false);
    }
  }

  const ready = backedUp !== '' && confirms(typed, schoolName) && going > 0;

  return (
    <div className="wrap">
      <div className="card">
        <h1>Start a new school</h1>
        <h2>
          Empties this school so another can be set up in it
          {' · '}<Link to="/setup">back to setup</Link>
        </h2>

        {finished ? (
          <p className="callout">
            <strong>Done.</strong> {done.length} collection{done.length === 1 ? '' : 's'} cleared.
            Your sign-in, the school&rsquo;s name and the Gemini key are untouched, so you can
            set the school up again from Setup. The backup you downloaded is the only copy
            of what was here.
          </p>
        ) : (
          <>
            <label htmlFor="mode">How much</label>
            <select id="mode" value={mode} disabled={busy}
                    onChange={(e) => { setMode(e.target.value as ResetMode); setTyped(''); }}>
              <option value="records">
                The records — students, marks, attendance, money. Keeps classes, subjects and fees
              </option>
              <option value="all">
                Everything — a blank school, set up again from nothing
              </option>
            </select>

            <div style={{ overflowX: 'auto', marginTop: 14 }}>
              <table className="sheet">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Collection</th>
                    <th>Documents</th>
                    <th style={{ textAlign: 'left' }}>&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {[...plan.clear, ...plan.keep].sort().map((name) => {
                    const clearing = plan.clear.includes(name);
                    return (
                      <tr key={name} style={clearing ? { background: 'var(--bad-soft)' } : undefined}>
                        <td style={{ textAlign: 'left' }}>{name}</td>
                        <td>{counts?.[name] ?? '…'}</td>
                        <td style={{ textAlign: 'left', fontSize: 13, color: clearing ? 'var(--bad)' : 'var(--muted)' }}>
                          {clearing ? 'cleared' : 'kept'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p style={{ marginTop: 12 }}>
              <strong>{going} document{going === 1 ? '' : 's'} would be deleted</strong>
              {' '}and {staying} kept. This cannot be undone except from the backup.
              {plan.clear.includes('counters') &&
                ' Student, staff and receipt numbering starts again at 1.'}
            </p>

            <h2 style={{ marginTop: 20 }}>1 · Take the backup</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
              The whole school, including what is being kept, as a file on this computer.
              It is the same format the <code>reset-school.mjs</code> script restores from.
              Nothing can be deleted until this is done.
            </p>
            <button onClick={download} disabled={busy}>
              {busy && !backedUp ? 'Reading…' : 'Download the backup'}
            </button>
            {backedUp && <div style={{ marginTop: 10, color: 'var(--accent)' }}>Saved {backedUp}</div>}

            <h2 style={{ marginTop: 20 }}>2 · Type the school&rsquo;s name</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
              {schoolName ? <>Exactly: <strong>{schoolName}</strong></>
                : 'This school has no name set, so it cannot be emptied from here.'}
            </p>
            <input value={typed} disabled={busy || !backedUp}
                   placeholder={schoolName}
                   onChange={(e) => setTyped(e.target.value)} />

            <h2 style={{ marginTop: 20 }}>3 · Empty it</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
              Deleting is otherwise impossible in this database. Pressing this opens a{' '}
              {ARMED_FOR_MINUTES}-minute window in which an administrator may delete, and shuts
              it again as soon as the work is finished.
            </p>
            <button onClick={wipe} disabled={busy || !ready}>
              {busy && backedUp ? 'Emptying…' : `Empty ${schoolName || 'this school'}`}
            </button>
            {!ready && !busy && (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                {backedUp === '' ? 'Take the backup first.'
                  : going === 0 ? 'There is nothing to delete.'
                    : 'Type the school’s name exactly to enable this.'}
              </p>
            )}
          </>
        )}

        {done.length > 0 && (
          <ul style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12 }}>
            {done.map((d) => <li key={d}>{d}</li>)}
          </ul>
        )}
        {problem && <div className="err">{problem}</div>}
      </div>
    </div>
  );
}
