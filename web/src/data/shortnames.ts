/**
 * Short names for the columns of a tabulation sheet.
 *
 * A sheet is read sideways across a page: "BANGLADESH AND GLOBAL STUDIES"
 * cannot be a column heading, and truncating it to ten letters gives
 * "BANGLADESH", which is also what Bangla truncates to.
 *
 * The board's own subject codes would do this job, but a school fills those in
 * slowly and three of this one's subjects have none, so the name is the source
 * and the code is not needed.
 *
 * This file has a twin: android/.../data/ShortNames.kt.
 */

/** The ones a Bangladeshi secondary school writes a particular way. */
const KNOWN: [RegExp, string][] = [
  [/\bISLAM/, 'ISL'],
  [/\bHINDU/, 'HIN'],
  [/\bCHRIST/, 'CHR'],
  [/\bBUDDH/, 'BUD'],
  [/\bHIGHER\s+MATH/, 'H.MATH'],
  [/\bINFORMATION\s+AND\s+COMMUNICATION|^ICT\b/, 'ICT'],
];

/** First words that have a settled abbreviation of their own. */
const FIRST: Record<string, string> = {
  BANGLA: 'BAN',
  BENGALI: 'BAN',
  ENGLISH: 'ENG',
  MATHEMATICS: 'MATH',
  MATHS: 'MATH',
  MATH: 'MATH',
  PHYSICS: 'PHY',
  CHEMISTRY: 'CHEM',
  BIOLOGY: 'BIO',
  GEOGRAPHY: 'GEO',
  SCIENCE: 'SCI',
  HISTORY: 'HIST',
  ACCOUNTING: 'ACC',
  AGRICULTURE: 'AGRI',
  AGRICULTURAL: 'AGRI',
  CIVICS: 'CIV',
  ECONOMICS: 'ECON',
  CAREER: 'CAREER',
};

/**
 * Words that carry no meaning in an abbreviation.
 *
 * Deliberately only the joining words. "Studies" looked like noise until
 * BANGLADESH AND GLOBAL STUDIES came out as BG, which is not what the board
 * calls it — the S belongs to BGS. "Education" goes the same way: dropping it
 * turns PHYSICAL EDUCATION into PHYS instead of PE.
 */
const SKIP = new Set(['AND', 'OF', 'THE', 'FOR', '&']);

/**
 * One subject's short name.
 *
 * In order: the handful a school writes a particular way, then a settled
 * abbreviation for the first word, then the initials of the words that carry
 * meaning — which is where BANGLADESH AND GLOBAL STUDIES becomes BGS and
 * FINANCE AND BANKING becomes FB.
 */
export function shortName(subjectName: string): string {
  const name = (subjectName ?? '').toUpperCase().replace(/[^A-Z0-9&\s.]/g, ' ').trim();
  if (name === '') return '?';

  for (const [pattern, short] of KNOWN) if (pattern.test(name)) return short;

  const words = name.split(/\s+/).filter(Boolean);
  const first = FIRST[words[0]];
  if (first) return first;

  const meaty = words.filter((w) => !SKIP.has(w));
  if (meaty.length >= 2) return meaty.map((w) => w[0]).join('').slice(0, 5);

  const one = meaty[0] ?? words[0];
  return one.length <= 4 ? one : one.slice(0, 4);
}

/**
 * Short names for a whole sheet, each one different from the others.
 *
 * Two columns headed the same are worse than two long headings: the marks
 * under them cannot be told apart. A clash takes more of the subject's name
 * until it is its own, and only then falls back to a number.
 */
export function shortNames(subjectNames: string[]): string[] {
  const used = new Set<string>();
  return subjectNames.map((name) => {
    const wanted = shortName(name);
    if (!used.has(wanted)) { used.add(wanted); return wanted; }

    const letters = (name ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (let n = wanted.length + 1; n <= letters.length; n += 1) {
      const longer = letters.slice(0, n);
      if (!used.has(longer)) { used.add(longer); return longer; }
    }
    for (let n = 2; ; n += 1) {
      const numbered = `${wanted}${n}`;
      if (!used.has(numbered)) { used.add(numbered); return numbered; }
    }
  });
}
