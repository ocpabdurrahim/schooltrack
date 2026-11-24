import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

/**
 * The Firebase *web* config is not a secret. It identifies the project; it does
 * not grant anything. What protects the data is firebase/firestore.rules, which
 * is why this file can live in a public repo (see README).
 *
 * Filled from `npx firebase apps:sdkconfig web`.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyB4LiQxcWqdh8cf1lwWPGeg4jXg3YZ18q8',
  authDomain: 'schooltrack-1941.firebaseapp.com',
  projectId: 'schooltrack-1941',
  storageBucket: 'schooltrack-1941.firebasestorage.app',
  messagingSenderId: '265452320590',
  appId: '1:265452320590:web:005c74e5d9c3c63529501f',
};

/** One school for now, but every path is tenant-scoped (data-model.md §1). */
export const SCHOOL_ID = 'matkhola';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

/**
 * Firestore, with the school kept on this device.
 *
 * The phone gets this free — the Android SDK keeps a local copy by default —
 * but the web SDK does NOT unless it is asked, and a school on mobile data
 * loses the signal in the middle of a register more often than it loses it
 * for a whole morning. Without a cache the page simply stalls; with one, the
 * register, the roll and the marks already fetched stay on screen and writes
 * queue up until the signal comes back.
 *
 * persistentMultipleTabManager, not the default single-tab manager: an office
 * with the register open in one tab and fees in another is the normal way
 * this app gets used, and the single-tab manager refuses the cache outright
 * in the second tab.
 *
 * initializeFirestore, not getFirestore: the cache can only be chosen while
 * the instance is being made, so this must come before anything calls
 * getFirestore() anywhere in the app.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// `npm run dev:emulator` talks to the emulators instead of the real project,
// so a half-finished screen can never write to the school's data.
if (import.meta.env.MODE === 'emulator') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
