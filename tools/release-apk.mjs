#!/usr/bin/env node
/**
 * Publishes the built APK as a GitHub release, which is where the phone looks
 * for its own updates.
 *
 *   node tools/release-apk.mjs            what it would do, and nothing else
 *   node tools/release-apk.mjs --publish  actually create the release
 *
 * A dry run by default, because this one is public and cannot be taken back
 * quietly: the moment the release exists, every phone with SchoolTrack on it
 * will fetch that APK and install it.
 *
 * WHAT GOES UP IS THE APK AND NOTHING ELSE. A release asset is not a commit:
 * the repository still has no .apk in it, no keystore, and no
 * google-services.json. What the APK itself contains is the same Firebase
 * configuration the website already serves to anybody who opens it — the
 * records are guarded by the Firestore rules and the members list, not by
 * that file being hard to find.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';

const publish = process.argv.includes('--publish');

/** The version the Android build is currently set to. */
const gradle = readFileSync('android/app/build.gradle.kts', 'utf8');
const name = /versionName\s*=\s*\(.*\)\s*\?:\s*"([^"]+)"/.exec(gradle)?.[1];
const code = /versionCode\s*=\s*\(.*\)\s*\?\.toInt\(\)\s*\?:\s*(\d+)/.exec(gradle)?.[1];
if (!name || !code) {
  console.error('Could not read versionName/versionCode from build.gradle.kts');
  process.exit(1);
}

const apk = `SchoolTrack-${name}.apk`;
const tag = `v${name}`;

if (!existsSync(apk)) {
  console.error(`${apk} is not here. Build it first:`);
  console.error('   cd android && ./gradlew assembleRelease');
  console.error(`   cp android/app/build/outputs/apk/release/app-release.apk ${apk}`);
  process.exit(1);
}

const mb = (statSync(apk).size / 1024 / 1024).toFixed(1);

/** The release notes: the commits since the last tag, in the user's words. */
let notes = '';
try {
  const last = execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  notes = execFileSync('git', ['log', '--format=- %s', `${last}..HEAD`], { encoding: 'utf8' });
} catch {
  notes = execFileSync('git', ['log', '-12', '--format=- %s'], { encoding: 'utf8' });
}
notes = notes.trim() || 'No change recorded.';

console.log(`SchoolTrack ${name} (versionCode ${code})`);
console.log(`  tag    ${tag}`);
console.log(`  file   ${apk}  (${mb} MB)`);
console.log('  notes');
console.log(notes.split('\n').map((l) => `    ${l}`).join('\n'));

// An APK whose versionCode has not moved will be refused by every phone that
// already has this version, and would look like a release that did nothing.
const installed = execFileSync('git', ['tag', '--list'], { encoding: 'utf8' })
  .split('\n').map((t) => t.trim()).filter(Boolean);
if (installed.includes(tag)) {
  console.error(`\n${tag} already exists. Bump versionName and versionCode first.`);
  process.exit(1);
}

if (!publish) {
  console.log('\nDry run. Add --publish to create the release.');
  console.log('Every phone with SchoolTrack installed will then update itself to it.');
  process.exit(0);
}

execFileSync('gh', [
  'release', 'create', tag, apk,
  '--repo', 'ocpabdurrahim/schooltrack',
  '--title', `SchoolTrack ${name}`,
  '--notes', notes,
], { stdio: 'inherit' });

console.log(`\nPublished. Phones will pick ${name} up within a few hours, or at once`);
console.log('from Setup → This version → Check for an update.');
