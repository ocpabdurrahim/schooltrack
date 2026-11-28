/**
 * A student's fee privilege: what the school has agreed they pay, standing.
 *
 * Four arrangements, the office's own words:
 *
 *   Regular       no waiver, the card rate
 *   Scholarship   no tuition fee
 *   Donor family  no tuition fee
 *   Half fee      50% off tuition
 *
 * Scholarship and Donor family cost the same money on purpose. They are kept
 * apart because the REASON differs, and a school that cannot say how many of
 * its free places are scholarships cannot answer for them.
 *
 * A PRIVILEGE IS NOT A DISCOUNT, and this is the distinction the whole module
 * rests on. A discount is typed by the collector on one receipt and belongs to
 * that receipt. A privilege changes the rate the student is charged, every
 * period, until the office changes it. Conflating them would subtract a
 * waiver twice — once as a lower charge and again as an allowance recorded on
 * the receipt — which is how a half-fee student ends up owing nothing at all.
 *
 * ONLY TUITION IS WAIVED. Session, admission, exam, registration, lab and
 * fine are charged in full to everybody, which is what the office asked for:
 * a free place is free of tuition, not of the exam the board charges for.
 *
 * This file has a twin: android/.../data/Privileges.kt.
 */

/** The four, in the order the pickers show them. */
export const PRIVILEGES = ['Regular', 'Scholarship', 'Donor family', 'Half fee'];

/**
 * The head a privilege touches.
 *
 * The app builds a head's id from its code (`feeHeadIdFor`), and the school's
 * monthly tuition head is TUITION — checked against the live rate card, which
 * also carries ADMISSION, EXAM, FINE, LABFEE, REGISTRATION and SESSION. If a
 * school ever codes its tuition differently, this is the one line to change.
 */
export const TUITION_HEAD = 'TUITION';

/** Percent of the tuition rate each arrangement waives. */
const WAIVER: Record<string, number> = {
  Regular: 0,
  Scholarship: 100,
  'Donor family': 100,
  'Half fee': 50,
};

/** How each one reads to whoever is collecting the money. */
const EXPLAIN: Record<string, string> = {
  Regular: 'no waiver — the full rate',
  Scholarship: 'no tuition fee',
  'Donor family': 'no tuition fee',
  'Half fee': '50% off tuition',
};

/** Spellings that turn up in the office's own lists, as letters only. */
const ALIASES: Record<string, string> = {
  '': 'Regular',
  regular: 'Regular',
  normal: 'Regular',
  none: 'Regular',
  nil: 'Regular',
  full: 'Regular',
  fullfee: 'Regular',
  nowaiver: 'Regular',
  scholarship: 'Scholarship',
  scholar: 'Scholarship',
  stipend: 'Scholarship',
  britti: 'Scholarship',
  donor: 'Donor family',
  donorfamily: 'Donor family',
  donors: 'Donor family',
  free: 'Donor family',
  freestudent: 'Donor family',
  notuition: 'Donor family',
  notuitionfee: 'Donor family',
  half: 'Half fee',
  halffee: 'Half fee',
  halffree: 'Half fee',
  fiftypercent: 'Half fee',
  '50': 'Half fee',
};

/**
 * The proper name for an arrangement however somebody wrote it.
 *
 * BLANK MEANS REGULAR, unlike religion, where blank means nobody has said.
 * Every student already on the roll was added before this field existed, and
 * the school charges them the full rate today; reading their blank as
 * anything else would silently waive fees nobody agreed to waive.
 *
 * A word it does not recognise comes back trimmed but otherwise untouched —
 * the record belongs to the school.
 */
export function normalPrivilege(raw: string | null | undefined): string {
  const v = (raw ?? '').trim();
  const key = v.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALIASES[key] ?? v;
}

/**
 * What the picker offers: the four, and after them whatever is already on
 * this record when it is something else — so opening an older record and
 * saving it cannot quietly rewrite an arrangement the picker had no room for.
 */
export function privilegeOptions(stored: string | null | undefined): string[] {
  const v = normalPrivilege(stored);
  const list = [...PRIVILEGES];
  if (v !== '' && !list.includes(v)) list.push(v);
  return list;
}

/** Percent of tuition waived, 0 for anything unrecognised. */
export function tuitionWaiverPercent(privilege: string | null | undefined): number {
  return WAIVER[normalPrivilege(privilege)] ?? 0;
}

/** The sentence beside the picker, and on the collect screen. */
export function explainPrivilege(privilege: string | null | undefined): string {
  return EXPLAIN[normalPrivilege(privilege)] ?? 'no waiver — the full rate';
}

/**
 * The taka waived on one period of one head.
 *
 * Rounded to the whole taka, and the odd taka goes to the WAIVER rather than
 * to the bill: half of 175 is 88 off, 87 to pay. Nobody is billed a poisha,
 * and a family on a privilege should not be the one paying for the rounding.
 */
export function waiverOn(
  feeHeadId: string,
  rate: number | null | undefined,
  privilege: string | null | undefined,
): number {
  if (feeHeadId !== TUITION_HEAD) return 0;
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate <= 0) return 0;
  const pct = tuitionWaiverPercent(privilege);
  if (pct <= 0) return 0;
  if (pct >= 100) return rate;
  return Math.round((rate * pct) / 100);
}

/** What this student is actually charged for one period of one head. */
export function netRate(
  feeHeadId: string,
  rate: number | null | undefined,
  privilege: string | null | undefined,
): number {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return 0;
  return Math.max(0, rate - waiverOn(feeHeadId, rate, privilege));
}
