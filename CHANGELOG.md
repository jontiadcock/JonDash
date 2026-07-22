# Changelog

JonDash ships on **two channels** — pick yours under Admin → Settings → Updates:

- **Stable** (`main` branch) — tested releases, versioning `MAJOR.MINOR.PATCH`; the default, and the
  public auto-update channel.
- **Beta** (`beta` branch) — pre-release builds, versioning `X.Y.Z-beta.N`; early access, may be less stable.

Within a release: **patch** = fix/security · **minor** = feature · **major** = big change. A beta build
`X.Y.Z-beta.N` is promoted to Stable as `X.Y.Z` once confirmed.

## Beta channel (pre-release)

## [1.4.0-beta.11] — 2026-07-22

Three module-framework defects found while testing for the 1.4.0 stable release. All three would have
shipped as "stable" and been the version add-on authors built against.

### Fixed
- **A module's own settings screen never appeared.** Modules could declare a custom settings panel and the
  framework silently ignored it — an author wired it up and got nothing, with no error and no explanation.
  It now renders under **Admin → Modules → *the module***, below the module's simple settings, so a module
  can have both. It appears once the module is enabled and only gets the permissions you approved.
- **Modules can no longer ask for permissions that don't do anything.** Nine of the thirteen permissions
  were never connected to anything — including *"Create, modify or delete your user accounts"*, which
  looked alarming at approval time and granted nothing at all. Only the four that genuinely work remain:
  outbound connections, encryption, audit entries and sending email. Account, session and file access will
  come back when they're actually built. **No published module is affected** — none used the removed ones.
- **Legitimate modules were rejected over ordinary English.** The safety check that blocks modules from
  loading code dynamically also matched plain wording in a module's own screens, so a module whose page
  said "Bulk import (JSON)" was refused. Real dynamic loading is still refused.

## [1.4.0-beta.10] — 2026-07-22

### Fixed
- **Installing a module left the page stuck on "Installing…" forever.** A module's code is built into the
  dashboard, so installing, importing or uninstalling one rebuilds and restarts JonDash — but the page that
  triggered it just sat there, because the request it was waiting on never came back. You now get the same
  full-screen **"Applying your module changes…"** cover already used for updates and restarts: it explains
  what's happening, waits for the *new* server to be reliably back, and returns you to sign-in on its own.
  Applies to installing, bulk installing, importing and uninstalling.

### Added
- **The waiting screen no longer spins forever if nothing happens.** If the server is still answering
  normally well after a restart was requested — meaning it never began — the screen now says so and offers
  a reload, instead of looking identical to a broken app.

## [1.4.0-beta.9] — 2026-07-22

### Added
- **Uninstall several modules at once.** Each installed module now has a tick box: select the ones you want
  gone and remove them together, so you get **one rebuild and one restart** for the whole batch instead of
  one per module. The confirmation names every module being deleted before anything happens. This completes
  the bulk selection added in 1.4.0-beta.5, which only covered installing.

## [1.4.0-beta.8] — 2026-07-22

### Fixed
- **Browse modules crashed whenever a channel actually had modules to show.** Opening
  **Admin → Modules → Browse modules** on a channel with published modules produced an error page instead
  of the list, so there was no way to install anything from a source. Introduced in 1.4.0-beta.5 along with
  multi-select; it only appeared once a channel had something in it, which is why the empty **stable**
  channel looked fine while **beta** failed. Selecting and installing modules works normally again.

## [1.4.0-beta.7] — 2026-07-22

### Fixed
- **Critical: updating could leave JonDash unable to start.** When "installed add-ons" were added to the
  list of things an update must not overwrite (1.4.0-beta.3), the rule matched any folder *named* `modules`
  anywhere in the app — including `lib/modules`, which is the module framework itself. Updates therefore
  stopped copying it, and if an update then failed, the automatic rollback deleted it without being able to
  restore it, leaving an install that could not build at all and could not be recovered by the launcher's
  own retries. The rule now only ever matches top-level folders. **If you are stuck on a failed update, see
  the recovery note below — a normal update can't fix this one, because the broken updater is the thing
  performing it.**

#### Recovering an install that won't start
Your data is safe — `.env`, `.data`, `uploads` and the database were never touched. Restore the app files
by hand once, and updates work normally again afterwards:
1. Download the source ZIP for the latest version from the repository's Releases and extract it somewhere new.
2. Copy `.env`, `.data`, `uploads`, `prisma\dev.db` (and `modules\` if you installed any add-ons) from the
   broken folder into the extracted one.
3. Delete `.data\update-failed` and the `.data\rollback` folder in the new copy — they refer to the failed
   attempt and to a snapshot that is missing the same files.
4. Run `start-dashboard.bat` in the new folder, and keep the old one until you're satisfied.

## [1.4.0-beta.6] — 2026-07-22

> ⛔ **Do not use this version — 1.4.0-beta.3 through 1.4.0-beta.6 are withdrawn.** They can leave JonDash
> unable to start: updating deletes part of the app itself, and if that update then fails, the automatic
> rollback cannot put it back, so the app won't start and can't repair itself. **Install 1.4.0-beta.7 or
> later.** Your data is never at risk. If you're already stuck, a normal update *cannot* fix it — see
> [Recovering an install that won't start](#recovering-an-install-that-wont-start) under 1.4.0-beta.7.

### Added
- **Choose who can see each module.** A module can now be limited to **Service Groups**, exactly like a
  service tile — under Admin → Modules → *(module)* → **Who can see this module**. Leave every group
  unticked and it stays visible to everyone signed in; tick one or more and only their members see its
  dashboard widget, and its page returns "not found" to anyone else. Full admins always see it, and a module
  that declares itself admin-only stays admin-only regardless.
- **Arrange your dashboard your way.** Each module widget now has a **Customise** control to set its width
  and height (1–3) and move it earlier or later. **Your layout is yours alone** — changing it never affects
  what anyone else sees. "Reset" puts a widget back to its default.
- **Modules can ship their own icon**, shown beside their name.
- **Multiline module settings.** A module can declare a setting as multiline text, so things like a JSON
  configuration or a list of hosts get a proper resizable box instead of a single-line field.

### Changed
- The module-authoring guide now explains that **each user resizes your widget**, with guidance on designing
  for it (fill the space you're given, no fixed pixel sizes, stay useful at the smallest size, put detail on
  your module's page). It also documents icons and multiline settings, and no longer describes the framework
  as unreleased.

### Note
- Delegated module administration already worked: the **Manage modules** permission can be granted to a
  non-admin through an Access Role, and now covers assigning modules to groups as well.

## [1.4.0-beta.5] — 2026-07-22

> ⛔ **Do not use this version — 1.4.0-beta.3 through 1.4.0-beta.6 are withdrawn.** They can leave
> JonDash unable to start (detail under 1.4.0-beta.6). **Install 1.4.0-beta.7 or later.**

### Added
- **Install several modules at once.** Browse modules now has a checkbox on each module: tick the ones you
  want and install them as a batch, so you get **one rebuild and one restart** for the whole lot instead of
  one per module. If one of them can't be installed, the rest still go ahead and the failure is reported.
- **You're now told before the server restarts.** Installing, importing or uninstalling a module recompiles
  the app, so a confirmation step spells out what's about to happen first — that JonDash will rebuild and
  restart, that **everyone signed in will be signed out**, and that a module which breaks the build is
  removed automatically. Nothing restarts until you confirm.

### Changed
- If a batch of modules breaks the build, all modules from that batch are removed together — a failed build
  doesn't reveal which one caused it — and the notice suggests installing them one at a time to find it.
- The module-authoring guide's AI prompt has been brought up to date. It previously described the framework
  as it was before modules could perform actions, so a module generated from it would have been rejected at
  install. It now covers server actions, email, ping, background contexts, the allowed imports, and every
  rule the installer enforces. It also points at the **Module template (for developers)** add-on, which is a
  complete working example.

## [1.4.0-beta.4] — 2026-07-22

> ⛔ **Do not use this version — 1.4.0-beta.3 through 1.4.0-beta.6 are withdrawn.** They can leave
> JonDash unable to start (detail under 1.4.0-beta.6). **Install 1.4.0-beta.7 or later.**

### Fixed
- **Installed modules could have their data deleted. Update if you have installed any module.** JonDash
  recorded every module as though it had shipped with the app, because the install didn't record where the
  module came from. That defeated the safeguard meant to protect installed modules, so if a module ever
  failed to load — after a bad update or an interrupted rebuild — its tables, settings and stored data could
  be wiped automatically. For something like a health monitor that means every monitor, all of its history
  and all of its incidents. JonDash now records where each module came from at install, repairs existing
  records on its own, and **never** removes a module whose files are still present. No action needed.
- **A module installed from the beta channel is now correctly marked as a beta module.** Previously it was
  recorded as stable, so the per-module "opt into beta releases" setting was wrong from the moment of
  install and update checks would look on the wrong channel.
- **Browse modules** now explains that a just-published module can take a couple of minutes to appear
  (GitHub caches the list briefly), instead of simply showing nothing.

## [1.4.0-beta.3] — 2026-07-22

> ⛔ **Do not use this version — 1.4.0-beta.3 through 1.4.0-beta.6 are withdrawn.** They can leave
> JonDash unable to start (detail under 1.4.0-beta.6). **Install 1.4.0-beta.7 or later.**

### Added
- **Modules can now actually be installed.** **Admin → Settings → Modules → Browse modules** installs a module
  straight from a source: JonDash downloads that exact published version, checks it, then rebuilds and
  restarts so the module is live. Everyone signed in will need to sign in again (the app restarts).
- **Import your own module** — a `.zip` of your module folder, from the Modules page. It goes through exactly
  the same checks as one from a source; importing skips the source, not the safety rules.
- **Modules are verified before they're installed.** A module is refused, with the reason shown, if it uses a
  capability it didn't declare (so the permission list you approve is honest), touches the filesystem, runs
  constructed code, reads the server's environment, reaches into JonDash's internals, asks for different
  permissions than its listing advertises, or fails an archive-safety check. This is a strong safety net, not
  a sandbox — a module still runs with the app's privileges, so only install modules you trust.
- **Automatic recovery.** If a module stops JonDash from building, the launcher removes that module, rebuilds
  without it and starts up normally — then tells you which module was removed. Your data isn't touched.
- **Modules can do things, not just display them.** Modules can now have working buttons, send email through
  your configured mail account, run background checks properly, and ping a host — so a module like health
  monitoring can be fully interactive.

### Changed
- **Uninstalling a module now removes it completely** — its data *and* its code — and rebuilds. Previously it
  cleared the data but left the module listed, which made the button look like it had done nothing.
- Each module now clearly shows whether it is **Enabled**, **Disabled**, or **Not set up**, and uninstall is
  available whenever a module is installed (you no longer have to enable one just to remove it).
- The permission wording for outbound access now says what it really covers: web requests *and* raw TCP, DNS,
  TLS and ping checks.
- Installed modules are preserved across JonDash updates.

### Removed
- The bundled **Sample** module. It was a demonstration for the framework's first release; real modules are
  now installed from a source. Any leftover data from it is cleaned up automatically on update.

## [1.4.0-beta.2] — 2026-07-21

### Added
- **Module sources.** Modules can now come from a source repository. **Admin → Settings → Modules → Manage
  sources** lets you add any public GitHub repo that publishes modules (JonDash checks it really does before
  saving), enable or disable it, and remove it. The official JonDash add-ons source is set up for you.
- **Browse modules** — see what your sources publish on the **stable** or **beta** channel, including each
  module's version, the JonDash version it needs, and **the permissions it requests**, before installing
  anything. (Actually installing from a source arrives in the next update.)
- **Per-module beta channel** — every module's page now has an **"opt into beta releases for this module"**
  toggle. It's separate from JonDash's own update channel, so you can run one module on beta while
  everything else stays on stable.

## [1.4.0-beta.1] — 2026-07-21

### Added
- **Modules — early foundation.** JonDash now has a module system: a new **Admin → Settings → Modules**
  page where you can enable, configure and remove optional add-ons that plug in **without changing the base
  app** (disable or uninstall one and everything returns exactly as before). Before you enable a module it
  shows the **permissions it needs** (e.g. "make outbound network requests"). A bundled **Sample** module —
  a small dashboard widget plus its own page — demonstrates it. This release is the framework itself;
  installing modules from a repository or importing your own comes in a later update.
- **Module author guide** (`docs/MODULES-AUTHORING.md`) — the full contract, the permission list, testing,
  and a self-contained **AI prompt** you can paste into any AI to generate a module to your spec.

### Changed
- Refreshed the README (current features, the Settings sidebar, built-in HTTPS, a Modules section, and an
  accurate project layout).

## [1.3.7-beta.1] — 2026-07-21

### Added
- **Full server backup.** A backup now saves your *entire* server in one file — all accounts, service
  groups, access roles, every setting, your network/HTTPS configuration, icons, and (when encrypted)
  the encryption key. Set a passphrase to include sign-in credentials, 2FA secrets and email settings
  and make it a complete, migratable backup; without one, those sensitive parts are left out.
- **Choose what to restore.** Restoring now lets you pick which parts of a backup to bring back
  (users, service groups, settings, server configuration, icons, …) rather than all-or-nothing.

### Fixed
- **Your authenticator (2FA) now survives a restore or migration.** Restoring an encrypted backup
  carries the server's encryption key across, so authenticator apps keep working on the restored/migrated
  install — no more "sign in with a backup code and re-enrol". (Restoring accounts from an *unencrypted*
  backup still, by design, requires each user to set up their sign-in again.)

### Changed
- Backups are now always full — the per-category export checkboxes were replaced by a single
  **Full server backup**. An encryption passphrase must be reasonably strong (12+ characters, with an
  uppercase letter, a number and a symbol). Legacy v1 backup files are no longer read (v2 still restores).

## [1.3.6-beta.1] — 2026-07-21

### Added
- **"Updating…" screen after an update or restart.** Applying an update (or restarting the server)
  now shows a full-screen "please wait" cover that waits for the server to come *reliably* back before
  returning you to sign-in — so refreshing a half-started server no longer briefly breaks remote
  access. It watches a new lightweight health probe and reconnects on its own; don't refresh or close
  the tab while it works.
- **Restart & Shut down controls** (Admin → Settings → **Server power**, full-admin only). Restart
  relaunches the server in place (a few seconds, no rebuild); Shut down stops it completely. Both ask
  for a quick confirmation first. Note: after a shutdown the dashboard can only be started again from
  the server PC.

### Changed
- **An update or restart now fully signs you out** — the login starts again from the password step,
  not a leftover 2-factor prompt, so you can sign in as a different account. (Previously an in-progress
  login could survive a restart and jump straight to the 2FA step.)

### Fixed
- After an update/restart, remote devices that reconnected too quickly could briefly fail to load the
  page; the new "Updating…" screen waits for the server to be steadily reachable first.

## [1.3.5-beta.3] — 2026-07-21

### Fixed
- **A successful update clears its rollback marker promptly.** The supervisor now marks an update as
  confirmed once the server has run past the healthy threshold (~20s), rather than only when it later
  crashes. This prevents a rare case where a much-later, unrelated crash could roll back a version that
  was actually working fine.

## [1.3.5-beta.2] — 2026-07-21

### Fixed
- **The server no longer restart-loops on an external stop.** A console-control event (Ctrl+C, the
  window closing, or an external process killing it) is now treated as a **clean stop** by the
  supervisor instead of a crash to restart — which had caused repeated restarts and sign-outs on some
  machines. Genuine app crashes still restart as before.
- **Self-updating no longer corrupts the launcher.** When an update rewrote `start-dashboard.bat`
  while it was running, the script was re-read from the changed file and errored partway through; the
  apply / rollback + relaunch now run as a single buffered step so the launcher is never re-read while
  it's being replaced.
- Removed a harmless `session.delete()` error that Prisma logged to the console when a session had
  already been cleaned up.

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

[1.3.5-beta.3]: https://github.com/jontiadcock/JonDash/releases/tag/v1.3.5-beta.3
[1.3.5-beta.2]: https://github.com/jontiadcock/JonDash/releases/tag/v1.3.5-beta.2
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
