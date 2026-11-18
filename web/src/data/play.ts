import { ERROR_BUZZ, type Note, SUCCESS_CHIME } from './sounds';

/**
 * Playing the gate sounds in a browser.
 *
 * ONE AudioContext for the page, not one per scan. A browser allows only a
 * handful of them at a time, so a gate that opened a fresh context for every
 * child would fall silent part-way through the morning — and silence on a
 * scanner reads as "it didn't work", which sends the child round again.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    // A context created before the operator touched the page starts suspended;
    // the first scan is a gesture, so this is where it wakes up.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function play(notes: Note[]) {
  const c = audio();
  if (!c) return;                       // no audio on this device: the colour still shows
  const now = c.currentTime;

  for (const n of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);

    // sine for the bell, square for the buzz: the harmonics are what make a
    // buzz sound wrong rather than merely low
    osc.type = n.freq > 500 ? 'sine' : 'square';
    osc.frequency.value = n.freq;

    const start = now + n.at / 1000;
    const end = start + n.ms / 1000;
    // The same shape as envelope() in sounds.ts, drawn by the browser rather
    // than sampled: ramp up fast, then decay, so the note never clicks off.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(n.gain, start + Math.min(0.012, n.ms / 1000 / 6));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.start(start);
    osc.stop(end + 0.02);
  }
}

export function playSuccess() { play(SUCCESS_CHIME); }
export function playError() { play(ERROR_BUZZ); }

// ---------------------------------------------------------------------------
// whether to make a noise at all

const KEY = 'schooltrack.gate.sound';

/** On unless this device has been told otherwise. A scanner nobody can hear
 *  is worse than useless, so silence has to be chosen deliberately. */
export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;                        // private window, blocked storage
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch { /* the setting simply will not be remembered */ }
}
