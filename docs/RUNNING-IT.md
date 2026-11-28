# Running SchoolTrack — the operator's notes

For whoever keeps the system alive: deploying, releasing, backups, and the
handful of things only a person with the right accounts can do.

Everything here is about **schooltrack-1941**, the Firebase project behind the
live school.

---

## 1. What is where

| Thing | Where |
|---|---|
| Website | <https://schooltrack-1941.web.app> |
| Android download page | <https://schooltrack-1941.web.app/app> |
| Releases (the .apk files) | <https://github.com/ocpabdurrahim/schooltrack/releases> |
| Source | <https://github.com/ocpabdurrahim/schooltrack> — **public** |
| Database, auth, hosting | Firebase project `schooltrack-1941` |
| Signing key | `android/keystore.properties` + the keystore it points at — **not in the repo** |

**The repository is public.** Nothing with a real student's name, a parent's
mobile number, a service-account key or the keystore may ever be committed.
`.gitignore` covers the known shapes, but the rule is: read
`git diff --cached --name-only` before every commit, every time.

---

## 2. Deploying the website

```
npm run web:deploy
```

That builds and publishes. It takes about a minute. Afterwards, check that
what is live is what you built — open the site, and if you want certainty,
fetch the JS bundle and look for a string you changed.

Rules and indexes are separate, and are deployed when they change:

```
npm run rules:deploy
```

---

## 3. Releasing the Android app

1. Bump both numbers in `android/app/build.gradle.kts` —
   `versionCode` (an integer that must always increase) and `versionName`.
2. `cd android && ./gradlew assembleRelease`
3. **Check the artefact, not the gradle file:**
   `aapt2 dump badging app/build/outputs/apk/release/app-release.apk | head -1`
   — it must show the version you just set. A stale APK sitting in `outputs/`
   from a failed build looks identical otherwise.
4. Copy it to `SchoolTrack-<version>.apk` — every release so far uses that
   name, and the download page relies on the pattern being recognisable.
5. `gh release create v<version> --title "SchoolTrack <version>" --notes-file - <file>`

The app updates itself from GitHub: it checks a few hours after a release,
downloads, verifies the SHA-256, the package name, the signature and the
version code, and installs in the background. Version comparison is numeric,
so 1.5.10 is correctly newer than 1.5.9.

**Losing the keystore is unrecoverable.** Android will only accept an update
signed with the same key. Without it, every phone must uninstall and reinstall,
and nothing carries over. Back up `android/keystore.properties` and the
keystore file somewhere that is not this machine.

---

## 4. Accounts and access

- A new person creates their own account on the site, confirms the email, and
  then the head teacher grants a role on **Setup → Users**. Nobody can grant
  themselves one.
- **There is currently one ADMIN.** That is a single point of failure: if that
  account is lost, nobody can grant roles. Add a second ADMIN — it needs the
  head teacher's own email address, and takes a minute on Setup → Users.
- The rules are in `firebase/firestore.rules` and are the real protection. The
  screens only hide what the rules would refuse anyway.

---

## 5. Backups

Firestore on the free plan has no automatic export. What exists today:

- The **source and rules** are on GitHub.
- The **data** is not backed up anywhere automatically.

If the school's records matter — and they do — set up an export. The simplest
is a scheduled export to Cloud Storage from the Firebase console (needs the
Blaze plan), or a periodic manual run of a read-only script against
`tools/serviceAccount.json`. Until that exists, a wrong bulk operation is
permanent.

---

## 6. Putting it on your own domain

The site works today on `schooltrack-1941.web.app`. A custom domain is
cosmetic but makes it the school's own.

**What to buy.** A `.com` or `.net` is ~৳1,200–1,500 a year from any registrar
and works immediately. A `.com.bd` is cheaper to renew but slower to obtain and
needs paperwork through BTCL. A `.edu.bd` is restricted to recognised
institutions and needs the school's documents — worth it if the school wants
the official mark, not worth the wait otherwise. Buy from a registrar that
gives you **full DNS control** (Namecheap, Cloudflare, GoDaddy, or a local
reseller that lets you edit records yourself); a host that will not let you add
a TXT record cannot be used here.

**Then, in the Firebase console:**

1. Hosting → **Add custom domain** → type the domain.
2. Firebase gives a **TXT record** to prove you own it. Add it at the
   registrar, wait, press Verify.
3. Firebase then gives **two A records**. Add both, remove any existing A
   record for the same name.
4. The certificate is issued automatically — usually within an hour, sometimes
   up to 24.

The CLI cannot add a custom domain; it is a console job. After it is live,
update the two links in `docs/USER-GUIDE.md` and on the ID cards if they carry
the address.

**The Android app needs no change.** It talks to Firebase directly, not through
the website, so the domain does not affect it.

---

## 7. Testing before you ship

```
npm --prefix web run test        # the web suites
cd android && ./gradlew testDebugUnitTest
```

Both must be green. The data layer is covered by twin suites — the same cases
exist in TypeScript and in Kotlin, so the website and the phone cannot drift
apart on a rule. There are **no tests above the data layer**: screens are
checked by running them.

To try something without touching the real school:

```
npm run emulators                 # Firestore + Auth, locally
node tools/seed-emulator.mjs      # invented students, no real names
npm --prefix web run dev:emulator # the site against the emulator
```

The seeded admin is `admin@test.local` / `test-pass-1`. The seed gives each
class one section and no fee rates; add what a test needs.

---

## 8. Known gaps, honestly

- **No automatic backup of the data.** See section 5. This is the biggest one.
- **One ADMIN account.** See section 4.
- **83 students have no father, mother, mobile or date of birth.** Certificates
  and ID cards print blanks where those belong.
- **No tests above the data layer** on either client.
- **The Gemini mark-sheet scan has never completed a real read** — it is built
  and wired, but has not once been proven on a photographed sheet.
- **The APK download needs two taps** (the release page, then the file). A
  one-tap link would need each release to also carry a fixed-name asset such as
  `SchoolTrack.apk`.
