# Contributing

## Running the test suite

The automated tests are **not included in the downloadable ZIP** — the download
is kept lean for people who just want to run JonDash. The tests live in the
repository, so grab them by cloning:

```bash
git clone https://github.com/jontiadcock/JonDash.git
cd JonDash
npm install
npm test
```

- Tests run on **Vitest** against a throwaway SQLite database that is created,
  migrated, and deleted automatically for each run — your real `dev.db` is never touched.
- `npm run test:watch` re-runs on change.
- CI (`.github/workflows/ci.yml`) runs typecheck, lint, and tests on **Linux and
  Windows** for every push to `main` or `beta`, and every pull request. Both
  platforms are checked because JonDash is a Windows app whose launcher behaviour
  Linux can't exercise, while Linux catches case-sensitivity assumptions Windows hides.

Tests cover the security-critical behaviour — password/2FA, CSRF, RBAC and IDOR
authorization, backup export/restore (including encryption), backup codes, settings,
and the module/helper install path (archive safety, the install-time verifier,
migrations on update) — so changes that break them fail fast.
