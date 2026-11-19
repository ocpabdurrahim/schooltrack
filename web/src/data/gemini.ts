/**
 * Asking Gemini to read a photographed mark sheet.
 *
 * Everything the reader is told, and everything it hands back, is shaped here.
 * Whether any of it may be BELIEVED is scanmarks.ts's business, and this file
 * deliberately knows nothing about roll numbers, sections or totals: a reader
 * that is also the judge of its own reading is no check at all.
 *
 * The model is not hard-coded. Google renames these every few months and a
 * name baked in here would one day start returning 404 to a teacher standing
 * over a pile of scripts, so the one to use is discovered from the account's
 * own list and remembered in the settings document.
 *
 * This file has a twin: android/.../data/Gemini.kt.
 */

import type { ScanRead, ScanRow } from './scanmarks';

const API = 'https://generativelanguage.googleapis.com/v1beta';

// ---------------------------------------------------------------------------
// choosing a model

export type ModelInfo = { name: string; methods: string[] };

/** Models that cannot read a photograph into text, whatever else they do. */
const NOT_A_READER = /embedding|aqa|imagen|veo|tts|audio|image-generation|learnlm/i;

/**
 * The cheapest model on this account that can read a picture.
 *
 * Flash over Pro: this is a page of digits, not a reasoning problem, and a
 * school pays per page. Lite is passed over because handwriting is the one
 * job where the smallest model starts guessing, and a plausible wrong digit
 * is far worse here than a slow one. Newer beats older; a preview beats
 * nothing but loses to anything stable.
 */
export function pickVisionModel(models: ModelInfo[]): string | null {
  const scored = models
    .filter((m) => m.methods.includes('generateContent'))
    .filter((m) => !NOT_A_READER.test(m.name))
    .map((m) => {
      const name = m.name.replace(/^models\//, '');
      let score = 0;
      if (/flash/i.test(name)) score += 100;
      else if (/pro/i.test(name)) score += 60;
      if (/lite/i.test(name)) score -= 45;
      if (/preview|exp/i.test(name)) score -= 25;
      const version = name.match(/(\d+)\.(\d+)/);
      if (version) score += Number(version[1]) * 10 + Number(version[2]);
      return { name, score };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return scored[0]?.name ?? null;
}

export async function listModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch(`${API}/models?key=${encodeURIComponent(apiKey)}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(apiError(res.status, body));
  return ((body?.models ?? []) as Record<string, unknown>[]).map((m) => ({
    name: String(m.name ?? ''),
    methods: (m.supportedGenerationMethods ?? []) as string[],
  }));
}

/**
 * What went wrong, in words a head teacher can act on.
 *
 * Google's own message is kept on the end because it is the only thing that
 * distinguishes a dead key from a key with billing switched off.
 */
function apiError(status: number, body: unknown): string {
  const raw = (body as { error?: { message?: string } } | null)?.error?.message ?? '';
  if (status === 400 && /API key not valid/i.test(raw)) {
    return 'That API key was not accepted. Check it was copied whole, with no spaces.';
  }
  if (status === 401 || status === 403) {
    return `The key was refused for this request. ${raw}`.trim();
  }
  if (status === 404) {
    return `That model is not available on this key. ${raw}`.trim();
  }
  if (status === 429) {
    return 'Google is rate-limiting this key — too many sheets too quickly. '
      + 'Wait a minute and try again.';
  }
  if (status >= 500) return 'Google had a problem reading it. Try again in a moment.';
  return raw || `The reader answered with ${status}.`;
}

// ---------------------------------------------------------------------------
// what it is asked

/**
 * The reader is told what the paper IS, never what it should say.
 *
 * It is given the subject's parts so it can name the columns the same way,
 * and that is all. It is not told which rolls the section has: a reader that
 * knows the expected answers starts producing them.
 */
export function buildPrompt(componentNames: string[]): string {
  const cols = componentNames.length
    ? componentNames.join(', ')
    : 'whatever mark columns are printed';
  return [
    'This is a photograph of a school mark sheet filled in by hand.',
    '',
    'The sheet is printed with a row for every roll number, usually in two or',
    'three blocks side by side across the page. Read ALL the blocks.',
    `The mark columns are typically: ${cols}, and a Total.`,
    '',
    'Report, for each row that has ANYTHING handwritten on it:',
    '  - the printed roll number of that row',
    '  - every mark column, with the number written in it',
    '',
    'Rules you must follow exactly:',
    '  1. An EMPTY cell is null. Never report an empty cell as 0. Most rows on',
    '     the sheet are empty — leave those rows out altogether.',
    '  2. Report the digits as written. "09" is 9. "02" is 2.',
    '  3. Never compute the Total yourself, and never correct it. Report it',
    '     exactly as the teacher wrote it, even when it does not equal the',
    '     other columns added up: it is the check against your own reading.',
    '  4. If a cell has been written over, crossed out or corrected and you',
    '     cannot tell which value was meant, report null for that cell rather',
    '     than guessing.',
    '  5. Read the roll number from the PRINTED column at the left of each',
    '     block, not from anything handwritten.',
    '',
    'Also report the header: the exam, the year, the class name and the subject',
    'name, exactly as written. Use an empty string for any you cannot read.',
  ].join('\n');
}

/** Forces the shape of the reply, so nothing has to be guessed at by hand. */
export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    header: {
      type: 'object',
      properties: {
        exam: { type: 'string' },
        year: { type: 'string' },
        className: { type: 'string' },
        subject: { type: 'string' },
      },
      required: ['exam', 'year', 'className', 'subject'],
    },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          roll: { type: 'integer', nullable: true },
          cells: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string' },
                value: { type: 'integer', nullable: true },
              },
              required: ['column', 'value'],
            },
          },
        },
        required: ['roll', 'cells'],
      },
    },
  },
  required: ['header', 'rows'],
} as const;

// ---------------------------------------------------------------------------
// what comes back

/** A cell as the model may have written it: a number, a string, or nothing. */
function cellValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  // "-", "x" and "" are all ways of writing "nothing here"; so is "null",
  // which a model hands back as text more often than it should.
  if (s === '' || /^(-+|x|nil|na|null|none)$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const str = (raw: unknown) => (raw === null || raw === undefined ? '' : String(raw).trim());

/**
 * The reply, turned into something scanmarks.ts can check.
 *
 * Defensive about shape on purpose. The schema above makes a well-formed
 * answer the overwhelmingly likely one, but this runs on a teacher's phone at
 * the end of a marking day: a stray code fence or a number sent as a string
 * must not be the thing that loses the sheet.
 */
export function parseScanReply(raw: string): ScanRead {
  const text = stripFence(raw);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('The reader did not answer with a sheet. Try the photo again.');
  }

  const h = (body.header ?? {}) as Record<string, unknown>;
  const rows: ScanRow[] = [];

  for (const r of (body.rows ?? []) as Record<string, unknown>[]) {
    const roll = cellValue(r.roll);
    const values: Record<string, number | null> = {};

    // Either shape is read: the array of cells the schema asks for, or a plain
    // object of column to value, which is what a model falls back to when the
    // schema is not honoured.
    const cells = r.cells ?? r.values;
    if (Array.isArray(cells)) {
      for (const c of cells as Record<string, unknown>[]) {
        const column = str(c.column ?? c.name);
        if (column !== '') values[column] = cellValue(c.value);
      }
    } else if (cells && typeof cells === 'object') {
      for (const [column, v] of Object.entries(cells as Record<string, unknown>)) {
        if (column.trim() !== '') values[column.trim()] = cellValue(v);
      }
    }

    rows.push({ roll: roll === null ? null : Math.round(roll), values });
  }

  return {
    header: {
      exam: str(h.exam),
      year: str(h.year),
      className: str(h.className ?? h.class),
      subject: str(h.subject),
    },
    rows,
  };
}

/** Models still wrap JSON in ```json fences now and again. */
export function stripFence(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith('```')) return t;
  return t.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
}

// ---------------------------------------------------------------------------
// the call

export type SheetImage = { mimeType: string; base64: string };

/**
 * Reads one or more photographs of the SAME sheet-set as a single answer.
 *
 * Several photographs go in one request rather than one each, because a form
 * that runs to a second page shares one header, and two separate readings
 * would have to be stitched together afterwards with nothing to say whether
 * they even came from the same sheet.
 */
export async function readSheets(
  apiKey: string,
  model: string,
  images: SheetImage[],
  componentNames: string[],
): Promise<ScanRead> {
  if (images.length === 0) throw new Error('There is no photograph to read.');

  const res = await fetch(
    `${API}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: buildPrompt(componentNames) },
            ...images.map((i) => ({
              inline_data: { mime_type: i.mimeType, data: i.base64 },
            })),
          ],
        }],
        generationConfig: {
          // Nothing here should be invented, so the sampling is turned off as
          // far as it will go.
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: REPLY_SCHEMA,
        },
      }),
    },
  );

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(apiError(res.status, body));

  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || text.trim() === '') {
    const why = body?.promptFeedback?.blockReason ?? body?.candidates?.[0]?.finishReason;
    throw new Error(
      why ? `The reader stopped without an answer (${why}).`
        : 'The reader sent back nothing. Try the photo again.',
    );
  }
  return parseScanReply(text);
}
