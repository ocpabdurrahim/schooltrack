import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { SCHOOL_ID, db } from '../firebase';

/**
 * Student photographs.
 *
 * They live in their OWN collection, `studentPhotos/<studentId>`, as a
 * compressed JPEG data URL — not in the student record, and not in Cloud
 * Storage.
 *
 * Not in the student record, because the student list reads every document in
 * a section: a photo on each one would turn a 78-row list into several
 * megabytes fetched to show names. Here, a photo is read only by the two
 * screens that want one.
 *
 * Not in Cloud Storage, because this project has no bucket, and adding one
 * means the Firebase console and a billing plan. A capped JPEG costs nothing
 * extra and needs nobody to go and enable anything. The cap is what makes it
 * sound: a Firestore document may not exceed 1 MiB, so the picture is shrunk
 * until it is comfortably below that — see PHOTO_MAX_BYTES.
 */

/** The box a photo is fitted inside, in pixels.
 *
 *  The printed box is 23 x 27 mm. At 300 dpi that is 272 x 319 px, so 480 x
 *  600 has room to spare for a photo that is cropped or printed larger, and
 *  still compresses to tens of kilobytes. */
export const PHOTO_BOX = { width: 480, height: 600 };

/** What a stored data URL may weigh. Base64 is 4 characters per 3 bytes, so
 *  this is about 90 KB of actual JPEG — far below Firestore's 1 MiB document
 *  limit even with the rest of the record, and small enough that printing a
 *  section of 78 is a few megabytes rather than a few hundred. */
export const PHOTO_MAX_BYTES = 120_000;

/** Tried in order until one comes in under the cap. */
export const PHOTO_QUALITY_STEPS = [0.82, 0.7, 0.6, 0.5, 0.4];

export type Size = { width: number; height: number };

/**
 * The size an image becomes when fitted inside a box.
 *
 * Never upscales: a 200px passport scan stays 200px rather than being blown
 * up to 480 and printed soft. Returns whole pixels, because a canvas with a
 * fractional size rounds on its own and the two axes can round opposite ways.
 */
export function fitWithin(w: number, h: number, box: Size = PHOTO_BOX): Size {
  if (!(w > 0) || !(h > 0)) return { width: 0, height: 0 };
  const scale = Math.min(box.width / w, box.height / h, 1);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Roughly what a data URL weighs in bytes, from its base64 payload. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const body = dataUrl.slice(comma + 1);
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

export function photoTooBig(dataUrl: string): boolean {
  return dataUrlBytes(dataUrl) > PHOTO_MAX_BYTES;
}

// ---------------------------------------------------------------------------
// reading and writing

const school = () => doc(db, 'schools', SCHOOL_ID);

export async function getStudentPhoto(studentId: string): Promise<string | null> {
  const snap = await getDoc(doc(school(), 'studentPhotos', studentId));
  return snap.exists() ? ((snap.data().jpeg as string) ?? null) : null;
}

/**
 * Photos for a whole section, as a map.
 *
 * One read per student, on purpose: a photo document carries no section of its
 * own, and giving it one would leave it stale the day a child moves class.
 * This is only ever called from the ID card sheet, where the office has asked
 * for a print, so the reads are deliberate.
 */
export async function getStudentPhotos(ids: string[]): Promise<Record<string, string>> {
  const pairs = await Promise.all(ids.map(async (id) => [id, await getStudentPhoto(id)] as const));
  return Object.fromEntries(pairs.filter(([, jpeg]) => jpeg)) as Record<string, string>;
}

export async function saveStudentPhoto(studentId: string, jpeg: string, by: string) {
  if (photoTooBig(jpeg)) throw new Error('That photo is too large to store.');
  await setDoc(doc(school(), 'studentPhotos', studentId), {
    jpeg,
    bytes: dataUrlBytes(jpeg),
    updatedBy: by,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteStudentPhoto(studentId: string) {
  await deleteDoc(doc(school(), 'studentPhotos', studentId));
}
