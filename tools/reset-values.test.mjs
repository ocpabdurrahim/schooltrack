/** node --test tools/reset-values.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { toJson, fromJson } from './reset-values.mjs';

const round = (v) => fromJson(JSON.parse(JSON.stringify(toJson(v))));

test('a timestamp comes back a TIMESTAMP, not a map of seconds', () => {
  // The fault this whole file exists for: {_seconds, _nanoseconds} restored
  // as an ordinary object, which reads back fine and is wrong for ever.
  const t = Timestamp.fromDate(new Date('2026-11-19T15:02:48.414Z'));
  const back = round({ updatedAt: t });
  assert.ok(back.updatedAt instanceof Timestamp);
  assert.equal(back.updatedAt.toDate().toISOString(), '2026-11-19T15:02:48.414Z');
});

test('keeps the nanoseconds an ISO string would drop', () => {
  const t = new Timestamp(1763564568, 123456789);
  const back = round({ at: t });
  assert.equal(back.at.seconds, 1763564568);
  assert.equal(back.at.nanoseconds, 123456789);
});

test('finds a timestamp buried in an array of maps', () => {
  // A receipt's lines are exactly this shape.
  const v = { lines: [{ head: 'Tuition', paidAt: Timestamp.fromDate(new Date('2026-01-02')) }] };
  assert.ok(round(v).lines[0].paidAt instanceof Timestamp);
});

test('leaves ordinary values exactly as they were', () => {
  const v = {
    fullName: 'Ayesha Rahman', rollNo: 1, absent: false, parts: { CQ: 42, MCQ: null },
    tags: ['a', 'b'], photo: 'data:image/jpeg;base64,/9j/4AAQ',
  };
  assert.deepEqual(round(v), v);
});

test('a geopoint and bytes survive too', () => {
  const back = round({ where: new GeoPoint(23.8, 90.4), blob: Buffer.from('hello') });
  assert.ok(back.where instanceof GeoPoint);
  assert.equal(back.where.latitude, 23.8);
  assert.equal(back.blob.toString(), 'hello');
});

test('a type it does not know STOPS the backup, naming the field', () => {
  // Better than writing something unreadable into the file the wipe trusts.
  assert.throws(() => toJson({ when: new Date() }), /when is a Date/);
});
