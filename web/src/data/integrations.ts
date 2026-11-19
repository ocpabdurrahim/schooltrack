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
import type { ReadWith } from './reader';
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
  /**
   * The runners-up, best first, so a busy model is something to step around
   * rather than wait out. Empty on a key saved before this existed, which is
   * why geminiModel is still kept and still used first.
   */
  geminiModels: string[];
  /**
   * Where this school's own reader is listening, if it has one. Empty means
   * there is no local reader and Google is the only one.
   */
  localReaderUrl: string;
  /** Which reader the school has chosen. See reader.ts. */
  readWith: ReadWith;
};

export const NO_INTEGRATIONS: Integrations = {
  geminiApiKey: '', geminiModel: '', geminiModels: [],
  localReaderUrl: '', readWith: 'auto',
};

/** Anything else stored is read as 'auto', which is the safe one: it tries both. */
const asReadWith = (raw: unknown): ReadWith =>
  (raw === 'local' || raw === 'gemini' ? raw : 'auto');

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
      geminiModels: Array.isArray(d.geminiModels) ? d.geminiModels.map(String) : [],
      localReaderUrl: String(d.localReaderUrl ?? ''),
      readWith: asReadWith(d.readWith),
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
  if (patch.geminiModels !== undefined) data.geminiModels = patch.geminiModels.map((m) => m.trim());
  if (patch.localReaderUrl !== undefined) data.localReaderUrl = patch.localReaderUrl.trim();
  if (patch.readWith !== undefined) data.readWith = patch.readWith;
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
