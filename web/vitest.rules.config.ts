import { defineConfig } from 'vitest/config';

// Rules tests talk to the Firestore emulator, never to schooltrack-1941.
// Run them with:  firebase emulators:exec --only firestore "npm run test:rules"
export default defineConfig({
  test: {
    include: ['rules/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
