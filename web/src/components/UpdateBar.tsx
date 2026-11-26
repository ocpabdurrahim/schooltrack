import { useEffect, useState } from 'react';
import { BUILD, isStale, liveBuild } from '../data/freshness';

/**
 * "A new version is ready." — and a button that takes it.
 *
 * A single-page app never reloads itself, so a tab opened on Monday is still
 * running Monday's code on Thursday however many times it has been deployed
 * to. Nothing on screen says so, which is how a change can be live, verified
 * live, and still invisible to the person who asked for it.
 *
 * Checked on waking rather than on a clock: a school's tab sits untouched for
 * hours and is looked at again the moment somebody needs it, which is exactly
 * when the answer matters and exactly when an hourly timer would be stale.
 * The slow interval is only for the screen left open all day on a desk.
 *
 * It never reloads on its own. A teacher halfway through entering a column of
 * marks would lose them, and no version of anything is worth that.
 */
const EVERY = 30 * 60 * 1000;   // the screen nobody touches

export default function UpdateBar() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    const look = async () => {
      if (!live || document.visibilityState !== 'visible') return;
      const latest = await liveBuild();
      if (live && isStale(BUILD, latest)) setReady(true);
    };

    // Not at once: the first seconds belong to signing in and drawing the
    // page the person came for.
    const first = window.setTimeout(look, 8000);
    const every = window.setInterval(look, EVERY);
    window.addEventListener('focus', look);
    document.addEventListener('visibilitychange', look);
    return () => {
      live = false;
      window.clearTimeout(first);
      window.clearInterval(every);
      window.removeEventListener('focus', look);
      document.removeEventListener('visibilitychange', look);
    };
  }, []);

  if (!ready) return null;

  return (
    <div className="update-bar no-print" role="status">
      <span>
        A newer version of SchoolTrack is ready. This page is still running the
        older one.
      </span>
      <button type="button" onClick={() => window.location.reload()}>
        Reload now
      </button>
      <button type="button" className="ghost" onClick={() => setReady(false)}>
        Not yet
      </button>
    </div>
  );
}
