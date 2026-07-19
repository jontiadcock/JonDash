# Changelog

All notable changes to JonDash are documented here. Versions follow
`MAJOR.MINOR.PATCH` — patch = fix/security, minor = features, major = big changes.

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

[1.1.2]: https://github.com/jontiadcock/JonDash/releases/tag/v1.1.2
[1.1.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.1.1
[1.1.0]: https://github.com/jontiadcock/JonDash/releases/tag/v1.1.0
[1.0.3]: https://github.com/jontiadcock/JonDash/releases/tag/v1.0.3
[1.0.2]: https://github.com/jontiadcock/JonDash/releases/tag/v1.0.2
[1.0.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.0.1
[1.0.0]: https://github.com/jontiadcock/JonDash/releases/tag/v1.0.0
