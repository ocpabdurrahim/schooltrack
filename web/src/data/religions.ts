/**
 * A student's religion, because it decides which religion paper they sit.
 *
 * The three the APEX app allows, in its own order and spelling — its
 * students_info table carries `CHECK (religion IN ('Islam','Hindu','Other'))`
 * and the column is NOT NULL, so every record mirrored from there arrives with
 * one of these.
 *
 * "Other" is a real answer, not a missing one: a student recorded as Other
 * sits NEITHER religion paper, which is exactly what enroll_student_subjects
 * does in Oracle.
 *
 * This file has a twin: android/.../data/Religions.kt.
 */
export const RELIGIONS = ['Islam', 'Hindu', 'Other'];

/** Spellings that turn up in the office's own lists, as letters only. */
const ALIASES: Record<string, string> = {
  islam: 'Islam',
  islami: 'Islam',
  islamic: 'Islam',
  muslim: 'Islam',
  musilm: 'Islam',
  mussalman: 'Islam',
  hindu: 'Hindu',
  hinduism: 'Hindu',
  hindhu: 'Hindu',
  sanatan: 'Hindu',
  hindureligion: 'Hindu',
  other: 'Other',
  others: 'Other',
  christian: 'Other',
  christianity: 'Other',
  buddhist: 'Other',
  buddhism: 'Other',
  buddha: 'Other',
};

/**
 * The proper name for a religion however somebody wrote it: "muslim",
 * "ISLAM" and "Islami" all land on Islam, and Christian and Buddhist land on
 * Other, which is the only place the school's own table has for them.
 *
 * Anything it does not recognise comes back trimmed but otherwise untouched —
 * the record belongs to the school, and a word we have not thought of is
 * likelier to be theirs than to be a mistake.
 */
export function normalReligion(raw: string | null | undefined): string {
  const v = (raw ?? '').trim();
  if (v === '') return '';
  return ALIASES[v.toLowerCase().replace(/[^a-z]/g, '')] ?? v;
}

/**
 * What the religion picker offers: the three, and after them whatever is
 * already on this record when it is something else.
 *
 * Without that last part, opening an older record in the form and saving it
 * would quietly wipe a religion the picker had no option for.
 */
export function religionOptions(stored: string | null | undefined): string[] {
  const v = normalReligion(stored);
  const list = [...RELIGIONS];
  if (v !== '' && !list.includes(v)) list.push(v);
  return list;
}
