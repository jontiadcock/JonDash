# Changelog

JonDash ships on **two channels** — pick yours under Admin → Settings → Updates:

- **Stable** (`main` branch) — tested releases, versioning `MAJOR.MINOR.PATCH`; the default, and the
  public auto-update channel.
- **Beta** (`beta` branch) — pre-release builds, versioning `X.Y.Z-beta.N`; early access, may be less stable.

Within a release: **patch** = fix/security · **minor** = feature · **major** = big change. A beta build
`X.Y.Z-beta.N` is promoted to Stable as `X.Y.Z` once confirmed.

## Beta channel (pre-release)

## [1.3.5-beta.1] — 2026-07-21

### Added
- **Self-supervising server.** The launcher now runs the server under a supervisor that captures its
  output to a log (`logs/server-*.log`), **restarts it automatically if it crashes**, and gives up
  cleanly (with a clear message) if it keeps crashing on startup — instead of the window just closing
  and leaving the dashboard down.
- **Safe updates with automatic rollback.** Every update now snapshots the current version first and,
  if the new version **fails to build or start**, **automatically rolls back to the previous version**
  and shows a notice so you can retry manually (the failed version isn't auto-retried). Your data,
  settings and uploads are never touched by an update or a rollback.
- **"Automatically install updates" checkbox** (Admin → Updates, **off by default**). With it off,
  JonDash only tells you an update is available and you install it with "Update now"; with it on, the
  launcher installs available updates at startup.

## [1.3.4-beta.1] — 2026-07-21

### Changed
- **Access roles now cover the whole admin area.** Two new delegable capabilities — **Manage network
  & HTTPS** and **Manage email** — mean an administrator can grant those areas to a user via an access
  role instead of them being full-admin-only. The **Manage settings** capability now also covers the
  Updates page (relabelled "Manage settings and updates"). Full admins are unaffected, and existing
  access roles keep exactly the powers they already had (the new capabilities do nothing until ticked).
  Backup restore, access-role management, and admin-account management remain full-admin-only.

## [1.3.3-beta.1] — 2026-07-21

### Changed
- **Reorganised admin menu into a "Settings" sidebar.** On desktop the admin area now has a left
  sidebar grouped into **General**, **Server settings** (Updates, Backup, Network & HTTPS, Email) and
  **Security** (Users, Service Groups, Sessions, Audit, Access Roles). Update-channel controls moved to
  their own **Updates** page. You only see the sections your access allows; mobile keeps the dropdown menu.

### Fixed
- **Saving the Network page in "Off" mode no longer fails** with a spurious "Port must be 1–65535" error.
- **The update-channel toggle now updates on screen immediately** when you save, instead of showing the
  old channel until a refresh.
- **"Update now" returns you to the sign-in screen** once the server has restarted, instead of appearing
  to hang on "reconnecting…" (the restart signs you out, so it now reconnects to the login page).
- **Editing a service on a phone no longer runs off the screen** — the edit form stacks below the row.
- Renamed the app's internal package from `website-custom` to `jondash`.

## [1.3.2-beta.1] — 2026-07-21

### Changed
- **Better mobile support.** On small screens the top bar no longer crowds or scrolls sideways —
  the version tag and longer labels ("Admin", "My") collapse, spacing tightens, and the brand
  truncates gracefully rather than pushing the page wide. Wide admin tables scroll within their own
  area instead of stretching the page. Desktop is unchanged. This is groundwork; the larger mobile
  improvement arrives with the admin "Settings" redesign.

## [1.3.1-beta.1] — 2026-07-20

### Changed
- **Smoother page transitions.** The page content now fades in gently as you move between pages,
  instead of switching instantly. Only the body animates — the header and navigation stay put — and
  the effect is disabled automatically if your system is set to reduce motion. First build on the
  Beta channel.

## Stable releases

## [1.3.0] — 2026-07-20

### Added
- **Update channels (Stable / Beta).** Under **Admin → Settings → Updates** you can now choose which
  release channel this install follows: **Stable** tracks tested releases (the default, unchanged for
  everyone), **Beta** receives pre-release builds early. Beta versions use `X.Y.Z-beta.N` and the
  updater understands them. Also adds a **"Check for updates"** button to check on demand and install
  a found update without waiting for the next launch.
- **Restore a backup during first-run setup.** A brand-new install can be initialised by restoring a
  backup — handy for migrating from another machine — instead of creating an administrator from
  scratch. The option appears on the welcome screen and is only available until the first
  administrator exists, then it's closed for good. Use an encrypted backup that includes accounts so
  you can sign in afterwards.

## [1.2.5] — 2026-07-20

### Added
- **Outgoing email support (OPS-02, part 1).** Configure an SMTP account so JonDash can send email
  — via a standard **username + app password** (presets for Gmail, Outlook/Hotmail, Microsoft 365,
  or custom) or **OAuth2** for Google and Microsoft (register your own OAuth app, connect via a
  consent flow). Managed at **Admin → Email** (full admins only), with a **Send test email** button
  to verify it works. All credentials — SMTP password, OAuth client secret, refresh token — are
  encrypted at rest. Nothing sends automatically yet; this is the foundation for emailed setup
  links and self-service password reset.

## [1.2.4] — 2026-07-20

### Fixed
- **Backups now include your icon images (BUG-01).** A backup is now a single **compressed `.zip`
  archive** containing the data plus the **actual icon image files** — previously an "icons-only"
  export produced an empty file, and icons otherwise rode as text inside the JSON. Icons are
  included whenever the Icons category is selected, regardless of the other categories. Restore
  accepts the new archive, and **older `.json` backups still restore** unchanged. Passphrase
  encryption is unchanged.
- **Uploading or restoring files over ~1 MB no longer crashes (BUG-02).** Server Actions were
  capped at 1 MB by the framework, so a 1–2 MB icon (or a larger backup) hit an unhandled error
  page. The limit is raised to 10 MB and oversized files now show a friendly "too large" message
  instead of crashing.

### Notes
- The `Buffer()` deprecation warning (BUG-03) comes from third-party build tooling, not JonDash,
  and no longer appears at runtime. Closed as upstream — no change needed.

## [1.2.3] — 2026-07-20

### Added
- **Automatic HTTPS** (Admin → **Network & HTTPS**, full admins only). Obtain and auto-renew a
  free **Let's Encrypt** certificate (HTTP-01 challenge), or **bring your own** certificate by
  pointing to PEM files. Choose the HTTP and HTTPS **ports**. **Off by default** — plain HTTP is
  unchanged, so existing installs are unaffected until you opt in. Certificates renew in the
  background with no downtime, and a cert-status panel shows the issuer, expiry, and any errors.
- **Self-healing launcher.** If a startup step fails (install / database / build), the launcher
  now rebuilds once from a clean state automatically and tells you what happened, instead of
  leaving a broken install. It also writes a local, **redacted** diagnostics log to a `logs/`
  folder (never contains secrets, never uploaded).

### Changed
- The app is now started through a small custom server (`node server.mjs`) so it can terminate
  TLS itself. No behavioural change when HTTPS is off.

## [1.2.2] — 2026-07-20

### Fixed
- Removed an unsupported `eslint` option from the Next config that printed a harmless warning on
  startup (Next 16 no longer configures ESLint there). No functional change.

## [1.2.1] — 2026-07-20

### Fixed
- **Build failure when updating an already-shrunk install.** The footprint optimisation
  (v1.1.7) removes TypeScript declaration files, but the per-machine build was still re-running
  a type-check that needs them, so a later update could fail to build. The build now skips the
  redundant type-check and lint (both still run in CI before every release).

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

[1.3.5-beta.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.3.5-beta.1
[1.3.4-beta.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.3.4-beta.1
[1.3.3-beta.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.3.3-beta.1
[1.3.2-beta.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.3.2-beta.1
[1.3.1-beta.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.3.1-beta.1
[1.3.0]: https://github.com/jontiadcock/JonDash/releases/tag/v1.3.0
[1.2.5]: https://github.com/jontiadcock/JonDash/releases/tag/v1.2.5
[1.2.4]: https://github.com/jontiadcock/JonDash/releases/tag/v1.2.4
[1.2.3]: https://github.com/jontiadcock/JonDash/releases/tag/v1.2.3
[1.2.2]: https://github.com/jontiadcock/JonDash/releases/tag/v1.2.2
[1.2.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.2.1
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
