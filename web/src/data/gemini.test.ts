import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiError,
  buildPrompt,
  parseScanReply,
  pickVisionModel,
  retryAfter,
  RETRY_WAITS_MS,
  readSheets,
  stripFence,
} from './gemini';

/** The SAME cases exist in android/.../data/GeminiTest.kt. */

const m = (name: string, methods = ['generateContent']) => ({ name, methods });

describe('pickVisionModel', () => {
  it('prefers flash over pro, because a school pays per page', () => {
    expect(pickVisionModel([m('models/gemini-2.5-pro'), m('models/gemini-2.5-flash')]))
      .toBe('gemini-2.5-flash');
  });

  it('prefers the newer version of the same family', () => {
    expect(pickVisionModel([m('models/gemini-1.5-flash'), m('models/gemini-2.5-flash')]))
      .toBe('gemini-2.5-flash');
  });

  it('passes over lite, which is the one that guesses at handwriting', () => {
    expect(pickVisionModel([m('models/gemini-2.5-flash-lite'), m('models/gemini-2.5-flash')]))
      .toBe('gemini-2.5-flash');
  });

  it('prefers a stable model to a preview of the same thing', () => {
    expect(pickVisionModel([m('models/gemini-2.5-flash-preview-09'), m('models/gemini-2.5-flash')]))
      .toBe('gemini-2.5-flash');
  });

  it('takes a preview when there is nothing stable', () => {
    expect(pickVisionModel([m('models/gemini-3.0-flash-preview')]))
      .toBe('gemini-3.0-flash-preview');
  });

  it('skips models that cannot read a picture into text', () => {
    expect(pickVisionModel([
      m('models/text-embedding-004'),
      m('models/imagen-3.0-generate'),
      m('models/gemini-2.5-flash-tts'),
      m('models/gemini-2.5-flash'),
    ])).toBe('gemini-2.5-flash');
  });

  it('skips a model that does not do generateContent at all', () => {
    expect(pickVisionModel([m('models/gemini-2.5-flash', ['countTokens'])])).toBeNull();
  });

  it('gives null when the account has nothing usable', () => {
    expect(pickVisionModel([])).toBeNull();
  });

  it('picks the same model twice from the same list', () => {
    const list = [m('models/gemini-2.5-flash'), m('models/gemini-2.5-flash-002')];
    expect(pickVisionModel(list)).toBe(pickVisionModel([...list].reverse()));
  });
});

describe('stripFence', () => {
  it('takes JSON out of a code fence', () => {
    expect(stripFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripFence('```\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripFence('{"a":1}')).toBe('{"a":1}');
  });
});

describe('parseScanReply', () => {
  const good = JSON.stringify({
    header: { exam: 'Half Yearly', year: '2026', className: 'Ten', subject: 'History' },
    rows: [
      { roll: 3, cells: [
        { column: 'CQ', value: 51 }, { column: 'MCQ', value: 18 },
        { column: 'Prac', value: null }, { column: 'Total', value: 69 },
      ] },
      { roll: 23, cells: [
        { column: 'CQ', value: null }, { column: 'MCQ', value: 15 },
        { column: 'Total', value: 53 },
      ] },
    ],
  });

  it('reads the header and the rows', () => {
    const r = parseScanReply(good);
    expect(r.header).toEqual({
      exam: 'Half Yearly', year: '2026', className: 'Ten', subject: 'History',
    });
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({
      roll: 3, values: { CQ: 51, MCQ: 18, Prac: null, Total: 69 },
    });
  });

  it('keeps a cell the reader would not commit to as null, not zero', () => {
    expect(parseScanReply(good).rows[1].values.CQ).toBeNull();
  });

  it('reads numbers the model sent as text', () => {
    const r = parseScanReply(JSON.stringify({
      header: {}, rows: [{ roll: '09', cells: [{ column: 'CQ', value: '51' }] }],
    }));
    expect(r.rows[0].roll).toBe(9);
    expect(r.rows[0].values.CQ).toBe(51);
  });

  it('reads the ways a model writes "nothing here"', () => {
    const r = parseScanReply(JSON.stringify({
      header: {},
      rows: [{ roll: 1, cells: [
        { column: 'A', value: '-' }, { column: 'B', value: '' },
        { column: 'C', value: 'null' }, { column: 'D', value: 'N/A' },
      ] }],
    }));
    expect(r.rows[0].values).toEqual({ A: null, B: null, C: null, D: null });
  });

  it('copes with a plain object of columns instead of the cells array', () => {
    const r = parseScanReply(JSON.stringify({
      header: { subject: 'History' },
      rows: [{ roll: 4, values: { CQ: 56, MCQ: 18, Total: 74 } }],
    }));
    expect(r.rows[0].values).toEqual({ CQ: 56, MCQ: 18, Total: 74 });
  });

  it('copes with a code fence around the answer', () => {
    const r = parseScanReply('```json\n' + good + '\n```');
    expect(r.rows).toHaveLength(2);
  });

  it('leaves missing header fields empty rather than undefined', () => {
    const r = parseScanReply(JSON.stringify({ rows: [] }));
    expect(r.header).toEqual({ exam: '', year: '', className: '', subject: '' });
    expect(r.rows).toEqual([]);
  });

  it('says so plainly when the answer is not a sheet at all', () => {
    expect(() => parseScanReply('I could not read that image.'))
      .toThrow(/did not answer with a sheet/);
  });
});

describe('buildPrompt', () => {
  it('names the parts the subject actually has', () => {
    expect(buildPrompt(['CQ', 'MCQ'])).toContain('CQ, MCQ');
  });

  it('never tells the reader which rolls to expect', () => {
    // A reader given the answers starts producing them.
    const p = buildPrompt(['CQ', 'MCQ']);
    expect(p).not.toMatch(/roll numbers are|students are|expect rolls/i);
  });

  it('forbids the two mistakes that would be silent', () => {
    const p = buildPrompt(['CQ', 'MCQ']);
    expect(p).toContain('Never report an empty cell as 0');
    expect(p).toContain('Never compute the Total yourself');
  });
});

describe('trying again when Google falls over', () => {
  it('tries again on their 5xx, which is usually a busy minute', () => {
    expect(retryAfter(500, 0)).toBe(RETRY_WAITS_MS[0]);
    expect(retryAfter(503, 0)).toBe(RETRY_WAITS_MS[0]);
    expect(retryAfter(500, 1)).toBe(RETRY_WAITS_MS[1]);
  });

  it('gives up rather than going round for ever', () => {
    expect(retryAfter(500, RETRY_WAITS_MS.length)).toBeNull();
  });

  it('waits longer each time, so a busy minute is given a minute', () => {
    expect(RETRY_WAITS_MS[1]).toBeGreaterThan(RETRY_WAITS_MS[0]);
  });

  it('never repeats a request that was wrong to begin with', () => {
    // Sending a bad key or a bad model again changes nothing.
    for (const status of [400, 401, 403, 404]) {
      expect(retryAfter(status, 0)).toBeNull();
    }
  });

  it('never repeats a 429, the one case where asking again makes it worse', () => {
    expect(retryAfter(429, 0)).toBeNull();
  });
});

describe('what the teacher is told', () => {
  const err = (m: string) => ({ error: { message: m } });

  it("keeps Google's own words on a 5xx, which is all there is to go on", () => {
    const said = apiError(500, err('Internal error encountered.'), 'gemini-2.5-flash');
    expect(said).toContain('Internal error encountered.');
    // and says which model, since that is the other half of the diagnosis
    expect(said).toContain('gemini-2.5-flash');
  });

  it('separates Google being busy from Google choking on the sheet', () => {
    expect(apiError(503, err('The model is overloaded.'))).toMatch(/busy/i);
    expect(apiError(500, err('Internal error.'))).not.toMatch(/busy/i);
  });

  it('says it already tried again, so nobody retries a lost cause by hand', () => {
    expect(apiError(500, err('x'))).toMatch(/even after trying again/i);
    expect(apiError(503, err('x'))).toMatch(/even after trying again/i);
  });

  it('still names a dead key plainly', () => {
    expect(apiError(400, err('API key not valid. Please pass a valid API key.')))
      .toMatch(/copied whole/i);
  });
});

describe('the call itself', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  const sheet = JSON.stringify({
    header: { exam: 'Half Yearly', year: '2026', className: 'Ten', subject: 'History' },
    rows: [{ roll: 3, cells: [{ column: 'CQ', value: 51 }, { column: 'MCQ', value: 18 }] }],
  });
  const ok = () => new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: sheet }] } }] }),
    { status: 200 },
  );
  const down = (status: number, message: string) => new Response(
    JSON.stringify({ error: { message } }), { status },
  );

  it('sends the sheet again when Google is briefly unavailable', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return calls < 3 ? down(503, 'The model is overloaded.') : ok();
    }));

    const p = readSheets('key', 'gemini-2.5-flash', [{ mimeType: 'image/jpeg', base64: 'x' }], ['CQ']);
    await vi.advanceTimersByTimeAsync(10_000);
    const got = await p;

    // Two failures swallowed; the teacher saw a wait, not an error.
    expect(calls).toBe(3);
    expect(got.rows[0].values.CQ).toBe(51);
    expect(got.header.subject).toBe('History');
  });

  it('stops after the last wait and repeats what Google said', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return down(500, 'Internal error encountered.');
    }));

    const p = readSheets('key', 'gemini-2.5-flash', [{ mimeType: 'image/jpeg', base64: 'x' }], ['CQ'])
      .catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const e = await p as Error;

    expect(calls).toBe(RETRY_WAITS_MS.length + 1);
    expect(e.message).toContain('Internal error encountered.');
    expect(e.message).toContain('gemini-2.5-flash');
  });

  it('does not send a bad key a second time', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return down(400, 'API key not valid. Please pass a valid API key.');
    }));

    await expect(
      readSheets('bad', 'gemini-2.5-flash', [{ mimeType: 'image/jpeg', base64: 'x' }], ['CQ']),
    ).rejects.toThrow(/copied whole/i);
    expect(calls).toBe(1);
  });
});
