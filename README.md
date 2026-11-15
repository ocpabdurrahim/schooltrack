# SchoolTrack

Android (Kotlin/Compose) and Web (React/Vite) school management for
**Matkhola ML High School** — attendance with QR cards, fee collection,
results, and a read-only portal for parents.

It is the successor to an Oracle APEX application (**SMS**) that is in daily
use. That matters for how this repo is built: see
[`docs/data-model.md`](docs/data-model.md) **§0**, which sets out which system
owns which module during the transition. Both databases being live for the same
module is the one failure this project cannot recover from.

---

## This repository is public

Two kinds of file must never be committed, and `.gitignore` enforces both:

- **Real school data.** Anything exported from Oracle contains students' names,
  their parents' names, mobile numbers and dates of birth. A public repo is
  permanent — removing a file later does not remove it from history.
- **Actual secrets.** A Firebase *admin* service-account key, or a signing
  keystore. The Firebase **web** config (`apiKey` and friends) is public by
  design and belongs in the source; it is an identifier, not a password. What
  protects the data is `firebase/firestore.rules`.

---

## Layout

```
android/     Kotlin + Jetpack Compose app
web/         React 18 + Vite + TypeScript
firebase/    firestore.rules, firestore.indexes.json
tools/       one-way Oracle -> Firestore mirror importer
docs/        data-model.md  <- read this first
```

## Getting set up

1. Create the Firebase project, enable **Authentication → Email/Password** and
   **Firestore**.
2. Put its id in `.firebaserc` (replace `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID`).
3. `firebase deploy --only firestore` — pushes rules and indexes.
4. Create the school document and the first administrator (see
   `tools/README.md`, once the importer lands).

## Security model in one paragraph

Staff sign in with email and password; their access comes from
`schools/{id}/members/{email}` — role, active, deleted — mirroring the APEX
roles (`ADMIN`, `TEACHER`, `ACCOUNTS`, plus `OFFICE`). Parents sign in the same
way and get `schools/{id}/guardians/{email}`, which lists the student ids they
may see; **a guardian has no write path anywhere in the database**, and only an
administrator can edit a guardian's list. While a module still belongs to
Oracle, its collections are **read-only even for administrators** — the
one-way mirror runs through the Admin SDK, which bypasses rules, so mirroring
still works while the app cannot corrupt data it does not own. Cut-over is one
field in `settings/ownership`, not a redeploy.
