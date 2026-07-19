# Changelog

All notable changes to JonDash are documented here. Versions follow
`MAJOR.MINOR.PATCH` — patch = fix/security, minor = features, major = big changes.

## [1.2.0] — 2026-07-20

### Security
- **Sessions are invalidated when the server restarts.** Every active sign-in ends on a server
  restart, so everyone must sign in again — a stolen or lingering session can't survive a
  restart. (Note: closing and reopening the launcher counts as a restart.)

## [1.1.7] — 2026-07-19

### Changed
- **Even smaller install.** After building, the launcher now also removes files that are never
  used at runtime — TypeScript declarations (`*.d.ts`), sourcemaps (`*.map`), and the build
  cache — on top of the existing prune. The install is now **~9,000 files (from ~26,000, ~65%
  smaller)**. No effect on how the app runs.

## [1.1.6] — 2026-07-19

### Fixed
- **Reverted the 1.1.5 self-contained (standalone) build.** It failed to load the image
  (`sharp`) and password (`argon2`) native libraries at runtime, causing errors on sign-in and
  the two-factor pages. This restores the proven, smaller-install approach from 1.1.4 (build-only
  packages are still pruned after building). A fully self-contained build will be revisited
  separately once the underlying bundler issue is resolved.

## [1.1.4] — 2026-07-19

### Changed
- **Much smaller install footprint.** After building, the launcher now removes build-only
  packages (`npm prune --omit=dev`), cutting `node_modules` by ~40% (~26,000 → ~15,500 files).
  The app rebuilds only when the version actually changes, so the runtime no longer keeps the
  TypeScript / ESLint / Tailwind / test toolchain on disk.
- Config moved from `next.config.ts` to `next.config.mjs` (no TypeScript needed at runtime).

## [1.1.3] — 2026-07-19

### Added
- **Delegated admin permissions (Access Roles).** Grant specific admin powers — manage users,
  reset access, service groups, sessions, audit, settings, backup export — to a regular user
  via named **Access Roles**, without making them a full admin. Managed at
  `/admin/access-roles` (full admins only). The admin area and menu show each person only the
  sections their capabilities allow.

### Changed
- **Settings reorganized.** The Settings page now holds general config only. **Session
  lifetime + idle timeout** moved to the **Sessions** page; **audit-log retention** moved to
  the **Audit** page — each next to what it controls.

### Fixed
- Users with delegated admin capabilities now see the **Admin** link and can reach their
  permitted sections (previously only full admins saw it).

## [1.1.2] — 2026-07-19

### Added
- Internal **automated test suite** (Vitest) and **CI** covering the security-critical
  behaviour — password/2FA, CSRF, RBAC/IDOR authorization, backup export/restore, backup
  codes, and settings. Developer tooling only: it is excluded from the download and does
  not change the app you run.

## [1.1.1] — 2026-07-19

### Added
- The installed version number is shown in the admin header.

## [1.1.0] — 2026-07-19

### Added
- Public, source-available release under a view-only license.
- **Credential-free auto-update**: checks the public repo (no Git or token needed,
  works with ZIP installs) and shows each update's version, **type** (major / minor /
  security) and **priority** before you choose to install it (opt-in).

### Changed
- The launcher and the admin "update available" banner now display the update's type
  and priority, and download/install from the public repo.

## [1.0.3] — 2026-07-19

### Fixed
- Styling was broken when opening the app over a LAN IP (e.g. `http://192.168.x.x:3000`).
  The CSP `upgrade-insecure-requests` directive is now emitted only when actually served
  over HTTPS, so plain-HTTP LAN access loads CSS/JS correctly.

## [1.0.2] — 2026-07-19

### Added
- **Settings** page (admin): sign-in message, session lifetime, idle timeout, audit-log retention.
- **Audit log** viewer (admin): filter by user/action, with automatic retention pruning.
- **Account self-service**: change your password, and re-enrol your authenticator in two steps.
- One-time **recovery-codes** reveal page shown after account setup.

### Changed
- "Roles" are now called **Service Groups**, managed from their own section.
- Admin navigation consolidated into a single **Menu** dropdown.
- Confirmation prompts now appear as in-page dialogs instead of browser popups.

### Fixed
- Deleting a user or group no longer lands on a "not found" page.
- A deleted/renamed group could linger on user pages until refresh.

## [1.0.1] — 2026-07-18

### Added
- **Two-factor backup codes**: one-time recovery codes for signing in without your authenticator.
- **Session manager**: view and revoke active sign-ins (device, approximate location, last active).
- **Backup & restore** (admin): export/import your data; accounts are exported only in an
  encrypted, passphrase-protected file.
- **Step-up confirmation** for major destructive actions.

## [1.0.0] — 2026-07-18

### Added
- Initial release: per-user dashboard of service tiles, fully managed in the web UI.
- Admin-created accounts secured with a password **plus authenticator-app two-factor**.
- Service Groups (shared tile bundles) assignable to users.
- Secure by default: hashed passwords, encrypted 2FA secrets, hardened headers, audit logging.
- One-click Windows launcher with automatic first-run setup.

[1.2.0]: https://github.com/jontiadcock/JonDash/releases/tag/v1.2.0
[1.1.7]: https://github.com/jontiadcock/JonDash/releases/tag/v1.1.7
[1.1.6]: https://github.com/jontiadcock/JonDash/releases/tag/v1.1.6
[1.1.4]: https://github.com/jontiadcock/JonDash/releases/tag/v1.1.4
[1.1.3]: https://github.com/jontiadcock/JonDash/releases/tag/v1.1.3
[1.1.2]: https://github.com/jontiadcock/JonDash/releases/tag/v1.1.2
[1.1.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.1.1
[1.1.0]: https://github.com/jontiadcock/JonDash/releases/tag/v1.1.0
[1.0.3]: https://github.com/jontiadcock/JonDash/releases/tag/v1.0.3
[1.0.2]: https://github.com/jontiadcock/JonDash/releases/tag/v1.0.2
[1.0.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.0.1
[1.0.0]: https://github.com/jontiadcock/JonDash/releases/tag/v1.0.0
