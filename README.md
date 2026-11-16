# SchoolTrack

Android (Kotlin/Compose) and Web (React/Vite) school management: attendance
with QR cards, student and staff records, fee collection, results, and a
read-only portal for parents.

A standalone app on Firestore — it holds its own data and is not connected to
any other system. The modules it rebuilds come from an Oracle APEX application
(**SMS**) that the school used before; that app is the reference for what each
screen must do, nothing more. The build order is in
[`docs/data-model.md`](docs/data-model.md) **§7**.

---

## This repository is public

Two kinds of file must never be committed, and `.gitignore` enforces both:

- **Real school data.** Student records contain names, parents' names, mobile
  numbers and dates of birth. A public repo is permanent — removing a file
  later does not remove it from history.
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
tools/       first-run bootstrap, emulator seed, optional CSV import
docs/        data-model.md  <- read this first
```

## Getting set up

1. Create the Firebase project, enable **Authentication → Email/Password** and
   **Firestore**.
2. Put its id in `.firebaserc`.
3. `firebase deploy --only firestore` — pushes rules and indexes.
4. `node tools/bootstrap.mjs --admin you@example.com --name "Your School" --commit`
   — writes the school, its settings and the first administrator. A new project
   is otherwise a deadlock: access comes only from a `members` document that
   only an administrator may write.
5. Open the app, **create an account** with that same address, confirm the
   email, and sign in.

## Security model in one paragraph

Staff sign in with email and password; their access comes from
`schools/{id}/members/{email}` — role, active, deleted — with roles `ADMIN`,
`TEACHER`, `ACCOUNTS` and `OFFICE`. Parents sign in the same way and get
`schools/{id}/guardians/{email}`, which lists the student ids they may see;
**a guardian has no write path anywhere in the database**, and only an
administrator can edit a guardian's list. Creating an account grants nothing by
itself — an administrator has to add the address before it can see anything.
Attendance marks carry a snapshot of class, section and roll, and the rules
refuse a mark that omits them; receipts can never be edited or deleted, only
corrected by another document. `web/rules/` holds the tests for all of this.
