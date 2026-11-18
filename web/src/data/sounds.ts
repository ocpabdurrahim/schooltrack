/**
 * What the gate sounds like.
 *
 * The scanner is used in a doorway with a queue of children pushing past it:
 * nobody is watching the screen, so the sound IS the answer. Two of them, and
 * they have to be told apart in one hearing by someone not paying attention:
 *
 *   success — two rising notes, bell-like, short and bright;
 *   error   — two low flat buzzes, longer, obviously not the bell.
 *
 * Rising-and-bright against low-and-flat survives a noisy corridor and a
 * cheap phone speaker far better than two tones at different pitches, which
 * is what this started as.
 *
 * The notes themselves live here, as plain numbers, so that both clients make
 * the same noise — a teacher who learns the sounds on the phone should not
 * have to learn them again on the web.
 */

export type Note = {
  /** Hz */
  freq: number;
  /** milliseconds from the start of the sound */
  at: number;
  /** milliseconds */
  ms: number;
  /** 0..1, before the decay envelope */
  gain: number;
};

/** C6 then G6: a rising fifth, which is what a bell pull sounds like. */
export const SUCCESS_CHIME: Note[] = [
  { freq: 1047, at: 0, ms: 110, gain: 0.22 },
  { freq: 1568, at: 85, ms: 170, gain: 0.22 },
];

/** Two low buzzes with a gap, so it cannot be mistaken for the bell even
 *  heard through a pocket. */
export const ERROR_BUZZ: Note[] = [
  { freq: 196, at: 0, ms: 160, gain: 0.3 },
  { freq: 165, at: 210, ms: 260, gain: 0.3 },
];

/** How long a sound lasts altogether, including the gap before its last note. */
export function totalMs(notes: Note[]): number {
  return notes.reduce((end, n) => Math.max(end, n.at + n.ms), 0);
}

/**
 * The loudness of a note part-way through, as a fraction of its gain.
 *
 * A note that simply stops clicks; one that fades sounds like an instrument.
 * This is the same curve on both clients so the two really are one sound.
 */
export function envelope(elapsedMs: number, ms: number): number {
  if (elapsedMs < 0 || elapsedMs > ms) return 0;
  const t = elapsedMs / ms;
  // a quick attack so the note starts crisply, then an exponential tail
  const attack = Math.min(1, t / 0.06);
  return attack * Math.exp(-4 * t);
}
