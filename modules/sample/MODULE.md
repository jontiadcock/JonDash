# Sample notes (module id: `sample`)

The bundled reference module for the JonDash module framework (MOD-01). It exists to prove and demonstrate
the framework end to end — you can disable or uninstall it with no effect on the base app.

- **What it does:** shows a small "notes" widget on the dashboard and a page at `/m/sample` listing notes.
- **Settings:** `heading` (string) — the widget/page heading. No secret settings.
- **Data:** its own table `mod_sample_notes` (created by `migrations/001_init.sql`); one note is added when
  the module is enabled. All of it is dropped on uninstall.
- **Permissions:** none beyond the baseline (a module always gets its own settings and its own tables).
- **Version:** 1.0.0 · minAppVersion 1.4.0

See `docs/MODULES-AUTHORING.md` for the full contract and how to build your own.
