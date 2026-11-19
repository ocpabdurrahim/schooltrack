import { Timestamp, GeoPoint, DocumentReference } from 'firebase-admin/firestore';

/**
 * Firestore values as JSON, and back again.
 *
 * JSON has no timestamp. A Timestamp written straight out comes back as an
 * ordinary map — {_seconds, _nanoseconds} — and a restore would then put a
 * nested object where every record keeps its "last changed". Nobody would
 * notice: the names, the marks and the money would all be back, and only the
 * ordering, the audit stamp and anything comparing dates would be quietly
 * wrong for ever after.
 *
 * So the types that JSON cannot hold are tagged on the way out and rebuilt on
 * the way in, and anything this file does not recognise STOPS the backup
 * rather than being written out as whatever JSON.stringify makes of it. A
 * backup that cannot be trusted is worse than no backup, because the wipe
 * goes ahead on the strength of it.
 */

export function toJson(value, path = '') {
  if (value instanceof Timestamp) {
    return { __type: 'timestamp', iso: value.toDate().toISOString(), nanos: value.nanoseconds };
  }
  if (value instanceof GeoPoint) {
    return { __type: 'geopoint', lat: value.latitude, lng: value.longitude };
  }
  if (Buffer.isBuffer(value)) {
    return { __type: 'bytes', b64: value.toString('base64') };
  }
  if (value instanceof DocumentReference) {
    throw new Error(`${path || 'a field'} is a document reference, which this backup cannot carry`);
  }
  if (Array.isArray(value)) return value.map((v, i) => toJson(v, `${path}[${i}]`));
  if (value === null || typeof value !== 'object') return value;
  if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, toJson(v, path ? `${path}.${k}` : k)]),
    );
  }
  throw new Error(`${path || 'a field'} is a ${value.constructor?.name ?? 'value'}, which this backup does not know how to keep`);
}

export function fromJson(value) {
  if (Array.isArray(value)) return value.map(fromJson);
  if (value === null || typeof value !== 'object') return value;
  if (value.__type === 'timestamp') {
    const t = Timestamp.fromDate(new Date(value.iso));
    // The ISO string holds milliseconds; a Firestore timestamp holds
    // nanoseconds. Putting them back keeps a restored document identical to
    // the one that was taken, rather than merely close to it.
    return typeof value.nanos === 'number' ? new Timestamp(t.seconds, value.nanos) : t;
  }
  if (value.__type === 'geopoint') return new GeoPoint(value.lat, value.lng);
  if (value.__type === 'bytes') return Buffer.from(value.b64, 'base64');
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromJson(v)]));
}
