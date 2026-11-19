/**
 * Who reads the photographed sheet: Google, or this school's own computer.
 *
 * Two readers rather than one, because they fail in opposite circumstances.
 * Google is there wherever there is signal but answers "experiencing high
 * demand" on a free key at exactly the times a school marks. The local reader
 * costs nothing and has no quota, but only exists while a particular computer
 * in the office is switched on.
 *
 * Neither is allowed to be a dead end, so by default the sheet is offered to
 * the local reader first and falls through to Google when that computer is not
 * answering. A teacher standing in a classroom with a phone gets Google; the
 * same teacher sitting at the office machine gets the free one, and neither of
 * them has to know which.
 *
 * This file has a twin: android/.../data/Reader.kt.
 */

import type { ScanRead } from './scanmarks';
import { parseScanReply } from './gemini';
import type { SheetImage } from './gemini';

/** What the school has chosen on the Setup screen. */
export type ReadWith = 'auto' | 'local' | 'gemini';

export type Reader = 'local' | 'gemini';

export const READ_WITH_LABELS: { value: ReadWith; label: string; hint: string }[] = [
  {
    value: 'auto',
    label: 'Whichever is available',
    hint: 'This computer when it is running, Google otherwise.',
  },
  {
    value: 'local',
    label: 'This computer only',
    hint: 'Free and no quota, but nothing is read while it is switched off.',
  },
  {
    value: 'gemini',
    label: 'Google only',
    hint: 'Works anywhere there is signal. A free key can be refused when busy.',
  },
];

/**
 * The readers to offer the sheet to, in order.
 *
 * A reader that cannot possibly work is left out rather than tried and failed:
 * there is no point calling a local address that has not been set, or Google
 * with no key, and an empty list is what tells the screen to say so plainly.
 */
export function readersToTry(
  readWith: ReadWith,
  localUrl: string,
  hasKey: boolean,
): Reader[] {
  const local = localUrl.trim() !== '';
  switch (readWith) {
    case 'local':
      return local ? ['local'] : [];
    case 'gemini':
      return hasKey ? ['gemini'] : [];
    default: {
      const out: Reader[] = [];
      if (local) out.push('local');
      if (hasKey) out.push('gemini');
      return out;
    }
  }
}

/**
 * What to tell somebody who has set nothing up, or has chosen a reader that
 * is not set up.
 *
 * Said in terms of what they chose, because "no key" is baffling advice to
 * somebody who deliberately picked the local reader.
 */
export function nothingToReadWith(readWith: ReadWith): string {
  if (readWith === 'local') {
    return 'Sheets are set to be read by this school\'s own computer, but no '
      + 'address for it has been set. An admin can set one on';
  }
  if (readWith === 'gemini') {
    return 'Sheets are set to be read by Google, but no Gemini key has been '
      + 'set up. An admin can paste one in on';
  }
  return 'Nothing is set up to read a sheet yet. An admin can paste a Gemini '
    + 'key, or set the address of this school\'s own reader, on';
}

/** The address of the reading endpoint, however the address was typed. */
export function readerEndpoint(url: string): string {
  const base = url.trim().replace(/\/+$/, '');
  return /\/read$/.test(base) ? base : `${base}/read`;
}

/**
 * How long the local reader is given.
 *
 * Generous: it is doing the same work Google does, on one office computer
 * rather than a datacentre. A refusal to connect comes back at once anyway —
 * that is the case this timeout is NOT for.
 */
export const LOCAL_TIMEOUT_MS = 180_000;

/**
 * Asks this school's own computer to read the sheets.
 *
 * It answers in Gemini's reply shape on purpose, so everything downstream —
 * the review grid, the Total checksum, the class and subject guards — is the
 * same code reading the same thing, whoever did the reading.
 */
export async function readSheetsLocally(
  url: string,
  images: SheetImage[],
  componentNames: string[],
): Promise<ScanRead> {
  if (images.length === 0) throw new Error('There is no photograph to read.');

  let res: Response;
  try {
    res = await fetch(readerEndpoint(url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images, components: componentNames }),
      signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(localReaderUnreachable(url, err));
  }

  const text = await res.text();
  if (!res.ok) {
    // The reader's own words: it knows things this end cannot, such as that
    // it could not find the printed grid on the photograph.
    const said = readerComplaint(text);
    throw new Error(
      `This school's reader could not read it${said ? `: ${said}` : ` (${res.status}).`}`,
    );
  }
  return parseScanReply(text);
}

/** Whatever the reader said went wrong, out of JSON or plain text. */
export function readerComplaint(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    return (parsed.error ?? parsed.message ?? '').trim();
  } catch {
    return body.trim().slice(0, 200);
  }
}

/**
 * Said in terms of the office computer, not of sockets.
 *
 * The overwhelmingly likely cause is that nobody has started it, or it is
 * switched off — which is a thing somebody can go and fix, unlike "failed to
 * fetch".
 */
export function localReaderUnreachable(url: string, err: unknown): string {
  const timedOut = (err as { name?: string } | null)?.name === 'TimeoutError';
  if (timedOut) {
    return `This school's reader at ${url.trim()} took too long to answer. It `
      + 'may be reading a very large photograph, or it may have got stuck.';
  }
  return `This school's reader at ${url.trim()} did not answer. Check that `
    + 'computer is switched on and the reader is running on it.';
}
