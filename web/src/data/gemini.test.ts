import { describe, expect, it } from 'vitest';
import { buildPrompt, parseScanReply, pickVisionModel, stripFence } from './gemini';

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
