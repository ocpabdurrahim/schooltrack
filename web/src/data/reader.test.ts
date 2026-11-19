import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  READ_WITH_LABELS,
  localReaderUnreachable,
  nothingToReadWith,
  readSheetsLocally,
  readerComplaint,
  readerEndpoint,
  readersToTry,
} from './reader';

/** The SAME cases exist in android/.../data/ReaderTest.kt. */

describe('which reader gets the sheet', () => {
  it('offers it to this computer first, then Google', () => {
    // The local one is free and has no quota; Google is the safety net.
    expect(readersToTry('auto', 'http://localhost:8765', true)).toEqual(['local', 'gemini']);
  });

  it('falls straight to Google when no local reader is set', () => {
    expect(readersToTry('auto', '', true)).toEqual(['gemini']);
    expect(readersToTry('auto', '   ', true)).toEqual(['gemini']);
  });

  it('uses the local reader alone when Google has no key', () => {
    expect(readersToTry('auto', 'http://localhost:8765', false)).toEqual(['local']);
  });

  it('honours a deliberate choice, even when the other one is available', () => {
    expect(readersToTry('local', 'http://localhost:8765', true)).toEqual(['local']);
    expect(readersToTry('gemini', 'http://localhost:8765', true)).toEqual(['gemini']);
  });

  it('offers nothing rather than something that cannot work', () => {
    // Calling an address nobody set, or Google with no key, only produces a
    // worse error later than the one the screen can give now.
    expect(readersToTry('local', '', true)).toEqual([]);
    expect(readersToTry('gemini', 'http://localhost:8765', false)).toEqual([]);
    expect(readersToTry('auto', '', false)).toEqual([]);
  });

  it('explains the gap in terms of what was chosen', () => {
    // "No key" is baffling advice to somebody who picked the local reader.
    expect(nothingToReadWith('local')).toMatch(/address/i);
    expect(nothingToReadWith('local')).not.toMatch(/gemini key/i);
    expect(nothingToReadWith('gemini')).toMatch(/gemini key/i);
    expect(nothingToReadWith('auto')).toMatch(/key/i);
    expect(nothingToReadWith('auto')).toMatch(/reader/i);
  });

  it('ends where the Setup link is put, not with a full stop before it', () => {
    // The screen renders "<message> Setup", so a trailing "Setup." here would
    // read "...on Setup. Setup".
    for (const w of ['auto', 'local', 'gemini'] as const) {
      expect(nothingToReadWith(w)).toMatch(/ on$/);
    }
  });

  it('offers every choice on the Setup screen', () => {
    expect(READ_WITH_LABELS.map((o) => o.value)).toEqual(['auto', 'local', 'gemini']);
  });
});

describe('the address of the local reader', () => {
  it('takes an address however it was typed', () => {
    expect(readerEndpoint('http://localhost:8765')).toBe('http://localhost:8765/read');
    expect(readerEndpoint('http://localhost:8765/')).toBe('http://localhost:8765/read');
    expect(readerEndpoint('  http://localhost:8765///  ')).toBe('http://localhost:8765/read');
  });

  it('does not add /read twice to somebody who typed it', () => {
    expect(readerEndpoint('http://localhost:8765/read')).toBe('http://localhost:8765/read');
  });
});

describe('when the local reader will not answer', () => {
  it('talks about the office computer, not about sockets', () => {
    const said = localReaderUnreachable('http://localhost:8765', new TypeError('Failed to fetch'));
    expect(said).toContain('http://localhost:8765');
    expect(said).toMatch(/switched on/i);
    expect(said).not.toMatch(/fetch|socket|ECONN/i);
  });

  it('says so differently when it answered too slowly', () => {
    const said = localReaderUnreachable('http://pc:8765', { name: 'TimeoutError' });
    expect(said).toMatch(/too long/i);
  });

  it("repeats the reader's own complaint, which knows things this end cannot", () => {
    expect(readerComplaint('{"error":"No printed grid was found on that photograph."}'))
      .toBe('No printed grid was found on that photograph.');
    expect(readerComplaint('plain words')).toBe('plain words');
    expect(readerComplaint('')).toBe('');
  });
});

describe('reading through the local reader', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const sheet = {
    header: { exam: '', year: '2026', className: 'Ten', subject: 'History' },
    rows: [{ roll: 3, cells: [{ column: 'CQ', value: 51 }, { column: 'MCQ', value: 18 }] }],
  };
  const images = [{ mimeType: 'image/jpeg', base64: 'x'.repeat(40) }];

  it('reads the same shape Google answers in, so nothing downstream changes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sheet), { status: 200 })));
    const got = await readSheetsLocally('http://localhost:8765', images, ['CQ', 'MCQ']);
    expect(got.header.className).toBe('Ten');
    expect(got.rows[0].values.CQ).toBe(51);
  });

  it('sends the pictures and the column names it was given', async () => {
    const seen: { url?: string; body?: string } = {};
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.url = url;
      seen.body = init.body as string;
      return new Response(JSON.stringify(sheet), { status: 200 });
    }));
    await readSheetsLocally('http://localhost:8765', images, ['CQ', 'MCQ']);
    expect(seen.url).toBe('http://localhost:8765/read');
    const sent = JSON.parse(seen.body ?? '{}');
    expect(sent.components).toEqual(['CQ', 'MCQ']);
    expect(sent.images).toHaveLength(1);
  });

  it('does not call a reader with no photograph to read', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(readSheetsLocally('http://localhost:8765', [], ['CQ'])).rejects.toThrow(/no photograph/i);
    expect(f).not.toHaveBeenCalled();
  });

  it('passes on what the reader said went wrong', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'No printed grid was found on that photograph.' }), { status: 422 },
    )));
    await expect(readSheetsLocally('http://localhost:8765', images, ['CQ']))
      .rejects.toThrow(/No printed grid was found/);
  });

  it('never lets a hung reader hang the screen', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Response(JSON.stringify(sheet), { status: 200 });
    }));
    await readSheetsLocally('http://localhost:8765', images, ['CQ']);
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
