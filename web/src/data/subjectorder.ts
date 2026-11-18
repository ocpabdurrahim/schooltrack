/**
 * One order for subjects, used everywhere.
 *
 * Every screen that shows subjects — the subject list, mark entry, the result
 * sheet, the tabulation sheet, a mark sheet, the routine, a report card —
 * reads them through listSubjects(), so the order is decided here once rather
 * than per page.
 *
 * It is NOT the stored sortOrder. That field is kept, and still separates
 * subjects this file has never heard of, but it cannot be trusted to carry
 * the school's order: the live school had six subjects sharing sortOrder 0,
 * which left Civics third in every list and English 2nd paper after
 * Mathematics.
 *
 * The order is the national mark sheet's, and it is a list of SLOTS. A slot
 * holds the parallel papers that different streams sit in the same position:
 * Physics for Science, History for Humanities, Accounting for Business
 * Studies. Every student sits exactly one paper from each slot that applies
 * to them, so a flat order over the slots puts each student's papers in
 * matching positions — which is what the tabulation sheet's group columns are
 * built from. Get this wrong and Grp 1 holds one student's Civics beside
 * another's Bangladesh and Global Studies.
 *
 * This file has a twin: android/.../data/SubjectOrder.kt.
 */

/** What a subject must offer to be placed. Narrower than Subject on purpose. */
export type Named = {
  subjectId: string;
  subjectName: string;
  subjectCode?: string | null;
};

/**
 * The slots, in order, and the papers in each.
 *
 * A paper is listed by the keys it may be recognised by: its name as the
 * school writes it, the spellings it is also known by, and last the subject
 * code where this school has one. Matching on several keys means renaming a
 * subject — or typing "Bengali" for "Bangla" — does not silently drop it to
 * the bottom of every list.
 *
 * The order WITHIN a slot only shows where several of its papers appear at
 * once, as in the subject list itself; it follows the stream order Science,
 * Humanities, Business Studies.
 */
export const SLOTS: { label: string; papers: string[][] }[] = [
  {
    label: 'Bangla 1st Paper',
    papers: [[
      'BANGLA', 'BANGLA 1ST PAPER', 'BANGLA FIRST PAPER',
      'BENGALI 1ST PAPER', 'BENGALI FIRST PAPER', '101',
    ]],
  },
  {
    label: 'Bangla 2nd Paper',
    papers: [[
      'BANGLA 2ND PAPER', 'BANGLA SECOND PAPER',
      'BENGALI 2ND PAPER', 'BENGALI SECOND PAPER', '102',
    ]],
  },
  {
    label: 'English 1st Paper',
    papers: [['ENGLISH', 'ENGLISH 1ST PAPER', 'ENGLISH FIRST PAPER']],
  },
  {
    label: 'English 2nd Paper',
    papers: [['ENGLISH 2ND PAPER', 'ENGLISH SECOND PAPER', '108']],
  },
  {
    label: 'Mathematics',
    papers: [['MATHEMATICS', 'GENERAL MATHEMATICS', 'MATHS', 'MATH']],
  },
  {
    // One slot, because a student sits one of them: the sheet has a single
    // religion column and it is filled by whichever paper is theirs.
    label: 'Religion',
    papers: [
      [
        'ISLAM AND MORALITY EDUCATION', 'ISLAM AND MORAL EDUCATION',
        'ISLAM RELIGION AND MORAL EDUCATION', 'ISLAM', 'ISL', '111',
      ],
      [
        'HINDU AND MORALITY EDUCATION', 'HINDU AND MORAL EDUCATION',
        'HINDU RELIGION AND MORAL EDUCATION', 'HINDU RELIGION', 'HINDU', 'HIN',
      ],
      ['RELIGION'],
    ],
  },
  {
    label: 'ICT',
    papers: [['ICT', 'INFORMATION AND COMMUNICATION TECHNOLOGY', '154']],
  },
  {
    label: 'Science / BGDS',
    papers: [
      ['SCIENCE', '127'],
      ['BANGLADESH AND GLOBAL STUDIES', 'BGDS', 'BGS', '150'],
    ],
  },
  {
    label: 'Physics / History / Accounting',
    papers: [
      ['PHYSICS', '136'],
      [
        'HISTORY', 'HISTORY OF BANGLADESH AND WORLD CIVILIZATION',
        'HISTORY OF BANGLADESH AND WORLD CIVILISATION', 'HIST', '153',
      ],
      ['ACCOUNTING', '146'],
    ],
  },
  {
    label: 'Chemistry / Geography / Finance and Banking',
    papers: [
      ['CHEMISTRY', '137'],
      ['GEOGRAPHY', 'GEOGRAPHY AND ENVIRONMENT', '110'],
      ['FINANCE AND BANKING', '152'],
    ],
  },
  {
    // Civics and Citizenship was not named in the order given, but it is the
    // Humanities paper of this slot: it is their fourth group paper, as
    // Biology is Science's and Business Entrepreneurship is Business
    // Studies'. Anywhere else it would sit in a group column beside the
    // others' third paper.
    label: 'Biology / Civics and Citizenship / Business Entrepreneurship',
    papers: [
      ['BIOLOGY', '138'],
      ['CIVICS AND CITIZENSHIP', 'CIVICS', '140'],
      ['BUSINESS ENTREPRENEURSHIP', '143'],
    ],
  },
  {
    label: 'Higher Maths / Agriculture',
    papers: [
      ['HIGHER MATHS', 'HIGHER MATHEMATICS', '126'],
      ['AGRICULTURE', 'AGRICULTURE STUDIES', '134'],
    ],
  },
];

/**
 * The rank of a subject this file does not know.
 *
 * Unknown is not an error: a school may add a paper tomorrow. It sorts after
 * every named subject, where it is visible rather than buried in the middle,
 * and the subjects around it keep their order.
 */
export const UNRANKED = 1_000_000;

/** Upper case, and every run of anything else becomes one space. */
export const normaliseKey = (raw: string) =>
  raw.trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

const RANKS: Map<string, number> = (() => {
  const m = new Map<string, number>();
  SLOTS.forEach((slot, slotIndex) => {
    slot.papers.forEach((keys, within) => {
      // Room inside a slot, so a slot's own papers stay together whatever
      // else is added later.
      const rank = slotIndex * 1000 + within;
      for (const key of keys) {
        const k = normaliseKey(key);
        if (!m.has(k)) m.set(k, rank);
      }
    });
  });
  return m;
})();

/**
 * Where this subject belongs, or UNRANKED.
 *
 * The name is asked first because it is what the school wrote, then the id —
 * which is only the name with its spaces replaced, but survives the name
 * being edited — and the code last, so a paper renamed beyond recognition is
 * still placed by the number the school files it under.
 */
export function subjectRank(s: Named): number {
  const tries = [s.subjectName, s.subjectId, s.subjectCode ?? ''];
  for (const t of tries) {
    if (!t) continue;
    const rank = RANKS.get(normaliseKey(t));
    if (rank !== undefined) return rank;
  }
  return UNRANKED;
}

/**
 * The subjects in the school's order.
 *
 * Fully determined: equal ranks fall back to the stored sortOrder, then the
 * name, then the id, so two readings of the same list can never differ and a
 * sheet printed today has the columns of the one printed yesterday.
 */
export function sortSubjects<T extends Named & { sortOrder?: number }>(subjects: T[]): T[] {
  return [...subjects].sort((a, b) =>
    subjectRank(a) - subjectRank(b) ||
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
    a.subjectName.localeCompare(b.subjectName) ||
    a.subjectId.localeCompare(b.subjectId));
}
