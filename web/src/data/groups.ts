/**
 * The groups a secondary school streams classes 9 and 10 into — the same three
 * the APEX app seeds into its `groups` table (SCI / HUM / BUS), in that order.
 *
 * Classes 6 to 8 have no group at all, which is why every picker built from
 * this list keeps a blank option at the top. A blank group is a real answer
 * here, not a missing one.
 */
export const GROUPS = ['Science', 'Humanities', 'Business Studies'];

/** Spellings that turn up in the office's own lists, as letters only. */
const ALIASES: Record<string, string> = {
  science: 'Science',
  sci: 'Science',
  sciencegroup: 'Science',
  humanities: 'Humanities',
  humanity: 'Humanities',
  hum: 'Humanities',
  arts: 'Humanities',
  art: 'Humanities',
  humanitiesgroup: 'Humanities',
  artsgroup: 'Humanities',
  businessstudies: 'Business Studies',
  business: 'Business Studies',
  businessstudiesgroup: 'Business Studies',
  businessgroup: 'Business Studies',
  bus: 'Business Studies',
  commerce: 'Business Studies',
  commercegroup: 'Business Studies',
};

/**
 * The proper name for a group however somebody wrote it: "sci", "COMMERCE" and
 * "Business group" all land on one of the three above.
 *
 * Anything it does not recognise comes back trimmed but otherwise untouched.
 * That is deliberate — the record belongs to the school, and a group name we
 * have not thought of is likelier to be theirs than to be a mistake.
 */
export function normalGroup(raw: string | null | undefined): string {
  const v = (raw ?? '').trim();
  if (v === '') return '';
  return ALIASES[v.toLowerCase().replace(/[^a-z]/g, '')] ?? v;
}

/**
 * What the group picker offers: the three groups, and after them whatever is
 * already on this record when it is something else.
 *
 * Without that last part, opening an older record in the form and saving it
 * would quietly wipe a group the picker had no option for — the same trap the
 * section picker avoids by keeping retired sections in its list.
 */
export function groupOptions(stored: string | null | undefined): string[] {
  const v = normalGroup(stored);
  const list = [...GROUPS];
  if (v !== '' && !list.includes(v)) list.push(v);
  return list;
}
