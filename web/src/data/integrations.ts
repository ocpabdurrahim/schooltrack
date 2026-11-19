/**
 * The school's Gemini key, and which model it is spent on.
 *
 * NOT under settings/. That collection is readable by guardians — parents
 * reading their own child's results — and Firestore rules are a union, so a
 * narrower rule on one document inside it cannot take that back. The key
 * therefore lives in a collection of its own that only the people who enter
 * marks can read at all.
 *
 * The key is never in this repository, which is public. It is pasted in once
 * on the Setup screen and kept here.
 *
 * This file has a twin: android/.../data/Integrations.kt.
 */

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { SCHOOL_ID, db } from '../firebase';

export type Integrations = {
  /** Empty until somebody pastes one in. */
  geminiApiKey: string;
  /**
   * Discovered from the account rather than chosen here, and written back so
   * the discovery happens once rather than before every sheet. Empty means
   * "work it out next time".
   */
  geminiModel: string;
};

export const NO_INTEGRATIONS: Integrations = { geminiApiKey: '', geminiModel: '' };

const ref = () => doc(db, 'schools', SCHOOL_ID, 'integrations', 'gemini');

/**
 * What is stored, or nothing.
 *
 * A refusal is an answer here, not a fault: ACCOUNTS and OFFICE staff have no
 * business with this key and the rules say so, and the screens that call this
 * cope with an empty answer by telling the person to ask an admin.
 */
export async function getIntegrations(): Promise<Integrations> {
  try {
    const snap = await getDoc(ref());
    if (!snap.exists()) return NO_INTEGRATIONS;
    const d = snap.data();
    return {
      geminiApiKey: String(d.geminiApiKey ?? ''),
      geminiModel: String(d.geminiModel ?? ''),
    };
  } catch {
    return NO_INTEGRATIONS;
  }
}

/** Only the fields given are touched, so remembering a model cannot wipe a key. */
export async function saveIntegrations(patch: Partial<Integrations>): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.geminiApiKey !== undefined) data.geminiApiKey = patch.geminiApiKey.trim();
  if (patch.geminiModel !== undefined) data.geminiModel = patch.geminiModel.trim();
  await setDoc(ref(), data, { merge: true });
}

/**
 * A key as it is safe to show on screen: the last four characters.
 *
 * Enough for somebody to tell whether the key they are looking at is the one
 * they meant to paste, and useless to anybody reading over their shoulder.
 */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k === '') return '';
  if (k.length <= 4) return '••••';
  return `••••••••${k.slice(-4)}`;
}
