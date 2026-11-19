/**
 * node --test tools/reset-plan.test.mjs
 *
 * The plan is the whole of the dangerous decision, so it is the part with
 * tests. What the script does afterwards is batching and printing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALWAYS_KEPT, confirms, planFor, readArgs } from './reset-plan.mjs';

// The live school as it stood when this was written, so the cases are about
// real collections rather than invented ones.
const LIVE = [
  'attendance', 'attendanceMarks', 'classes', 'counters', 'exams', 'expenseHeads',
  'feeHeads', 'feeStructure', 'holidays', 'integrations', 'members', 'payments',
  'results', 'settings', 'staff', 'studentPhotos', 'students', 'subjects',
];

test('a full wipe keeps only who you are and how you get in', () => {
  const p = planFor(LIVE, 'all');
  assert.deepEqual(p.keep, ['integrations', 'members', 'settings']);
  assert.ok(p.clear.includes('students'));
  assert.ok(p.clear.includes('payments'));
  assert.ok(p.clear.includes('classes'));
  assert.ok(p.clear.includes('counters'));
});

test('members is NEVER cleared, or the school is locked out of its own app', () => {
  for (const mode of ['all', 'records']) {
    assert.ok(!planFor(LIVE, mode).clear.includes('members'), mode);
  }
  assert.ok(ALWAYS_KEPT.includes('members'));
});

test('the Gemini key survives, because re-pasting it is a nuisance not a guard', () => {
  assert.ok(!planFor(LIVE, 'all').clear.includes('integrations'));
});

test('--records keeps the school\'s shape and clears its history', () => {
  const p = planFor(LIVE, 'records');
  for (const kept of ['classes', 'subjects', 'feeHeads', 'feeStructure', 'holidays', 'staff']) {
    assert.ok(p.keep.includes(kept), `${kept} should be kept`);
  }
  for (const gone of ['students', 'results', 'attendanceMarks', 'payments', 'studentPhotos']) {
    assert.ok(p.clear.includes(gone), `${gone} should be cleared`);
  }
});

test('a collection nobody has heard of is CLEARED, not quietly left behind', () => {
  // The failure to avoid is a "clean" school with last year's records sitting
  // in a collection this file predates.
  const p = planFor([...LIVE, 'libraryLoans'], 'all');
  assert.ok(p.clear.includes('libraryLoans'));
});

test('names what it expected and did not find', () => {
  const p = planFor(['students', 'members'], 'all');
  assert.deepEqual(p.missing, ['integrations', 'settings']);
});

test('an empty school is a plan with nothing in it', () => {
  const p = planFor([], 'all');
  assert.deepEqual(p.clear, []);
  assert.deepEqual(p.keep, []);
});

test('an unknown mode is refused rather than guessed at', () => {
  assert.throws(() => planFor(LIVE, 'everything'), /unknown mode/);
});

// ---------------------------------------------------------------------------
// the confirmation

test('only the school\'s own name confirms', () => {
  assert.ok(confirms('Matkhola ML High School', 'Matkhola ML High School'));
  assert.ok(!confirms('yes', 'Matkhola ML High School'));
  assert.ok(!confirms('y', 'Matkhola ML High School'));
  assert.ok(!confirms('', 'Matkhola ML High School'));
  assert.ok(!confirms('Matkhola', 'Matkhola ML High School'));
});

test('forgives a typing slip, not a doubt', () => {
  assert.ok(confirms('  matkhola ml high school  ', 'Matkhola ML High School'));
  assert.ok(confirms('Matkhola  ML   High School', 'Matkhola ML High School'));
});

test('a school with no name cannot be confirmed by typing nothing', () => {
  assert.ok(!confirms('', ''));
  assert.ok(!confirms('   ', '  '));
});

// ---------------------------------------------------------------------------
// the command line

test('no flags is a DRY RUN, because that is what an unfamiliar script gets first', () => {
  const a = readArgs(['node', 'reset-school.mjs']);
  assert.equal(a.wipe, false);
  assert.equal(a.mode, 'all');
});

test('reads the flags it knows and reports the ones it does not', () => {
  const a = readArgs(['node', 'x', '--wipe', '--records']);
  assert.equal(a.wipe, true);
  assert.equal(a.mode, 'records');
  assert.deepEqual(a.unknown, []);

  const b = readArgs(['node', 'x', '--wipe', '--force', '-y']);
  assert.deepEqual(b.unknown, ['--force', '-y']);
});

test('--restore takes the file to put back', () => {
  assert.equal(readArgs(['node', 'x', '--restore=data/backup-1.json']).restore, 'data/backup-1.json');
  assert.equal(readArgs(['node', 'x', '--restore']).restore, '');
  assert.equal(readArgs(['node', 'x']).restore, null);
});
