# Changelog

JonDash ships on **two channels** — pick yours under Admin → Updates:

- **Stable** (`main` branch) — tested releases, versioning `MAJOR.MINOR.PATCH`; the default, and the
  public auto-update channel.
- **Beta** (`beta` branch) — pre-release builds, versioning `X.Y.Z-beta.N`; early access, may be less stable.

Within a release: **patch** = fix/security · **minor** = feature · **major** = big change. A beta build
`X.Y.Z-beta.N` is promoted to Stable as `X.Y.Z` once confirmed.

## [1.5.3-beta.5] — 2026-07-23

**Beta: automatic updates actually work, and everything that updates is on one page.**

### Fixed
- **"Update this module automatically" did nothing.** Shipped in v1.5.2, it saved your choice and
  the page reported it as on — but nothing ever acted on it, so no module was ever updated
  automatically. There was no way to tell: an update that never happened looks exactly like
  having nothing to update.

### Added
- **Helpers can be set to update automatically too**, the same per-item way as modules.
- **You choose when it runs** — daily, weekly or monthly, at a time you pick, on a day of the week
  or a day of the month. Applying an update restarts the dashboard and signs everyone out, so it
  happens in a window you set rather than the moment a new version appears.
- **Admin → Updates is now the single page for everything that updates** — JonDash itself and its
  channel, the schedule, and every module and helper with its version, channel and its own
  **Update automatically** tick. These were previously spread across four screens: the Settings
  page, the Updates page, and each module's own page.

### Unchanged, deliberately
- An update is **never** applied automatically if it asks for more access than you approved, is
  blocked, goes backwards a version, or would stop another module working. Those wait for you, and
  every run records what it held back and why.
- Opting in stays **per module and per helper**. There is no single switch, because one tick would
  give every source you have added a standing channel to run new code on your machine.

## [1.5.3-beta.4] — 2026-07-23

**Beta: the audit log now says when JonDash itself did something.**

### Added
- **Scheduled actions are labelled "System" in the audit log, and can be filtered to.**
  Completes the previous release. Work that runs on a timer has no signed-in user, so it was
  showing an empty **User** column — which reads as *we don't know who did this*, when the real
  answer is *nothing did, it was the schedule*. Those two need to be told apart in a security
  log. Scheduled entries now show a **System** marker, and the User filter has a
  **System (scheduled)** option for answering "what ran overnight without anyone touching it".
  Existing entries are all recorded as user actions, which is accurate — before the previous
  release, scheduled work could not write to the log at all.

## [1.5.3-beta.3] — 2026-07-23

**Beta: scheduled work is recorded in the audit log again.**

### Fixed
- **Anything JonDash did on a schedule was missing from the audit log — silently.** Only actions
  someone triggered by clicking were ever recorded. Work that ran on a timer — a module tidying up
  old backups overnight, a health check, any scheduled task — was written to the log, failed to
  save, and reported nothing. The log looked complete, so there was no reason to suspect the gap.
  Scheduled actions are now recorded like any other. They show no IP address, because there is no
  browser involved — but the event itself is kept.

## [1.5.3-beta.2] — 2026-07-23

**Beta: sending mail through a relay, and mail errors that tell you what went wrong.**

### Added
- **"Mail relay (no authentication)" as an authentication option.** Some mail servers authorise
  you by IP address rather than a sign-in — an internal smarthost, or Microsoft 365 direct send
  through an inbound connector. There was no way to describe one: JonDash insisted on an account
  and offered credentials to a server that wasn't asking for any. Choosing this mode connects
  without offering credentials at all, and no longer demands a username.
- **An option to accept a mail server's certificate when it isn't trusted.** For an internal relay
  using a private or self-signed certificate. It is **off by default**, applies only to outgoing
  mail (never to updates or module installs), warns plainly while it is on, is written into the
  audit log when you enable it, and every test result says *certificate NOT verified* so it can't
  be quietly forgotten. Installing the relay's certificate authority on the machine is still the
  better option.

### Fixed
- **Mail failures now say what they tried to connect to.** The test button uses your *saved*
  settings, not what's currently on screen — so an error like "unable to get local issuer
  certificate" gave no way to tell whether it had even used the host you were looking at. Every
  result now names the host, port, TLS mode and how it authenticated.
- **Mail errors are explained instead of quoted.** Newly recognised: a TLS certificate that can't
  be traced to a trusted authority, a self-signed or expired certificate, a certificate issued for
  a different hostname, a server that offers no authentication at all (which now points at relay
  mode), and a relay that accepts the connection but refuses the recipient.
- **"Use TLS on connect" being wrong for the port is now named as the cause.** Ticking it for port
  25 or 587 produced a raw OpenSSL message about a "wrong version number", which reads as a bug in
  JonDash rather than a checkbox in the wrong position.
- **Multi-line mail explanations are no longer squashed onto one line.** The guidance attached to
  each error was being collapsed by the browser, so only the raw error was readable.

## [1.5.3-beta.1] — 2026-07-23

**Beta: a batch of fixes, several security-related.** No new features.

### Fixed
- **Moving or renaming the JonDash folder no longer breaks it permanently.** A build records
  where it was made, so relocating the folder rebuilds on the next start instead of leaving an
  install that fails on every page and never recovers, however many times you restart it.
- **Starting JonDash twice is now refused.** A second copy would fight the first over the same
  database and settings; it tells you one is already running and does nothing.
- **Two ways a module could reach outside itself without asking.** A module could make outbound
  network requests, or read and write files, using ordinary code that slipped past the safety
  checks — bypassing the permissions you approve it against. Filesystem access is supposed to be
  refused to modules outright, so that one mattered most.
- **"Send test email" no longer hangs forever.** Nothing in the mail path had a time limit, so a
  blocked port or a mailbox with SMTP AUTH switched off left the button spinning with no result
  at all. It now fails within seconds, says which step failed — connecting, signing in, or
  sending — and names the usual culprits, including that **Microsoft 365 disables SMTP AUTH per
  mailbox by default** even when you're using OAuth2.
- **Full-screen messages cover the screen again.** The "updating", "restarting", "shutting down"
  and "applying module changes" screens were being confined to the middle column, leaving the
  rest of the page visible and clickable at exactly the moments they exist to say *don't touch
  anything*. Confirmation dialogs had the same problem.
- **Importing your own module: the button is always there.** It used to appear only after you
  picked a file, so the panel looked broken. It's now shown from the start, greyed out until you
  choose a `.zip`, and the file picker matches the rest of the app.
- **The audit log says what changed.** Saving settings recorded only that *something* was
  updated — not which setting, or its new value. It now names both. Values of settings stored
  encrypted are recorded as hidden, never written into the log.

## [1.5.2] — 2026-07-23

**Add-ons stay up to date, and you can see what they're allowed to do.** Coming from 1.5.0, this is both
beta releases in one. Nothing changes unless you install modules.

### Added
- **An "Update everything" button** on Admin → Updates. Updates every module and helper with something
  waiting, in one restart instead of one each. It skips anything needing a decision from you — a module
  asking for more access, or a helper that would stop a module working — and tells you what it skipped and
  why. JonDash's own update stays a separate button: a module can require a newer JonDash, so those have
  to happen in order.
- **Automatic updates, per module.** Each module has its own switch, off unless you turn it on. It's
  deliberately not one setting for everything — a single switch would let any source you've added run new
  code here whenever it liked. **A version asking for more access than you approved is never applied
  automatically**, however this is set.
- **Helpers appear on the Updates page**, showing their version, which modules need them, and what
  changed. You can also pin one to a channel — normally a helper just follows the modules that use it, but
  pinning is there for taking a fix early or stepping back off beta.
- **Helpers can describe their own capabilities**, so the screen can say what actually happens to your
  machine — "Read and write files in D:\Backups" — rather than a technical name. It also means a new
  capability can arrive with a helper instead of waiting for a JonDash release.

### Fixed
- **A module could gain a capability you were never shown.** Helpers do things modules are forbidden —
  reading and writing files, for example — and declare what they can do so you can be told before
  installing anything that uses them. That declaration was being **silently discarded**, so the approval
  screen listed only the module's own, milder permissions. Nothing warned anyone, because nothing failed.
- **What you approve now includes everything the module's helpers can do**, whether or not the module
  asked for it by name, and those entries are highlighted as high-risk.
- **A helper fix could never reach you.** Helpers had no update path: one only changed version as a side
  effect of installing or updating a module that used it. A helper could publish a security fix that no
  existing install would ever receive.
- **A shared helper no longer flip-flops between versions** depending on which module you touched last. It
  follows the highest channel among the modules that need it, and the Helpers page says which module put
  it there.
- **A helper that has to break compatibility says so before it's installed**, naming the modules it will
  stop working, and won't proceed until you've confirmed that specific consequence.
- **Anything JonDash can't make sense of is refused outright** rather than quietly dropped — silently
  discarding a capability is exactly how the problem above stayed invisible.

### Notes
- Known limitation, deliberately written down rather than implied: a module can call past what it declared
  to a helper. The declared subset is enforced by the helper, not by JonDash, so it defends against
  mistakes rather than a module determined to misbehave. Modules remain a **curated or self-built**
  feature — only install ones you trust. Tracked for a proper fix.

## [1.5.2-beta.1] — 2026-07-23

**Beta: keeping add-ons up to date — helpers included, and automatically if you want.** Nothing changes
unless you install modules.

### Added
- **An "Update everything" button.** Updates every module and helper with something waiting, in one
  restart instead of one each. It skips anything that needs a decision from you — a module asking for
  more access, or a helper that would stop a module working — and tells you exactly what it skipped and
  why. JonDash's own update stays a separate button on purpose: a module can require a newer JonDash, so
  those have to happen in order.
- **Automatic updates, per module.** Each module has its own switch, off unless you turn it on. It's
  deliberately not one setting for everything: a single switch would let any source you've added run new
  code here whenever it liked, so you opt in to the modules you actually trust. **A version asking for
  more access than you approved is never applied automatically** — it waits for you either way.
- **Helpers appear on the Updates page.** Each shows its version, which modules need it, and what
  changed.
- **You can pin a helper to a channel.** Normally a helper follows the modules that use it and you never
  think about it. Pinning is there for the times you want a fix early, or want to step back off beta,
  without moving every module that depends on it.

### Fixed
- **A helper fix could never reach you.** Helpers had no update path at all: one only changed version as
  a side effect of installing or updating a module that used it. A helper could publish a security fix
  that no existing install would ever receive, because nothing ever went looking. They're now updated
  like anything else.
- **A shared helper no longer flip-flops between versions.** With two modules using the same helper on
  different channels, whichever module you touched last decided the helper's version — so it swapped back
  and forth as you worked, with nothing showing why. A helper now follows the highest channel among the
  modules that need it, and the Helpers page says which module put it there.
- **A helper that has to break compatibility now says so before it's installed.** Helpers promise not to
  break the modules built on them, but a security fix can't always be made politely. When that happens
  the update names the modules it will stop working, and won't proceed until you've confirmed that
  specific consequence.

## [1.5.1-beta.1] — 2026-07-23

**Beta: a module's helpers now show up on the screen where you approve it.** Nothing changes unless you
install modules, and no module you already have behaves differently.

### Fixed
- **A module could gain a capability you were never shown.** Helpers can do things modules are forbidden —
  reading and writing files, for example. A helper is supposed to declare what it can do so that JonDash
  can tell you before you install anything that uses it. That declaration was being **silently discarded**,
  because JonDash only recognised the four capabilities it implements itself and quietly dropped anything
  else. The result: a module could take a helper that reads and writes your files, and the approval screen
  would list only the module's own, milder permissions. Nothing warned anyone, because nothing failed.
- **What you approve now includes everything the module's helpers can do**, whether or not the module
  asked for it by name. Taking a helper is how a module gets that helper's abilities, so that is what
  you're told — the module's own honesty isn't what protects you.
- **These entries are highlighted as high-risk.** A capability JonDash doesn't implement itself is one it
  can't reason about, so it never gets the quiet styling.
- **A capability JonDash can't make sense of is now refused outright** rather than dropped — a module or
  helper published with a malformed permission won't install at all. Silently discarding one is exactly
  how the problem above stayed invisible.

### Added
- **Helpers can describe their own capabilities.** A helper supplies the sentence you read, so it can say
  what actually happens to your machine — "Read and write files in D:\Backups" — instead of a technical
  name. It also means a new capability can arrive with a helper, without waiting for a JonDash release,
  which is the point of helpers.

## [1.5.0] — 2026-07-22

**Keeping modules up to date, and modules that can work in the background.** Coming from 1.4.0, this is
everything in one release.

### Added
- **Module updates live in Admin → Updates**, in their own section beneath JonDash's own update panel. Each
  module shows its installed and available version, which channel it follows, and where it came from.
  Select several and update them together — one rebuild and one restart for the batch, and everything they
  have stored is kept.
- **You're told when module updates are waiting**, wherever JonDash already flags an update — including
  when JonDash itself is up to date, so you never have to go looking.
- **Modules are never updated automatically**, even when JonDash installs its own updates automatically.
  Updating a module is always something you choose.
- **A module asking for more access than you approved can't slip through.** If a new version wants an
  additional permission, the update says so in plain language and you must approve that specific change
  first. Versions that give up permissions apply without interrupting you.
- **Modules can do work in the background, reliably.** A module can declare recurring work — checking
  something on a schedule, tidying up old records — and it runs **from the moment JonDash starts**, not
  from the first time somebody opens a page. A monitoring module restarted overnight genuinely keeps
  watching instead of sitting idle until morning.
- **Helpers**: shared components that modules rely on for capabilities they can't have on their own. They
  come only from the official add-ons source, arrive automatically with the module that needs them, and are
  listed read-only under **Admin → Helpers** showing which modules use each one. There's nothing to install
  or remove — the page answers "what is this, and why is it on my system?"
- **Modules repair themselves if something they need goes missing** — but only modules from the official
  source. Anything you imported yourself, or installed from elsewhere, is reported with what's wrong and how
  to fix it, rather than JonDash fetching code on its behalf. Nothing restarts on its own; making a repair
  live is always your click.

### Fixed
- Updating a module now brings its stored data up to date with it. Previously a module that changed how it
  stores things could end up running against the old layout, with no error to explain the resulting
  misbehaviour.
- An updated module is no longer denied access it declares and you approved.
- Importing your own module: a failed import no longer leaves the module half-installed and silently
  broken, and importing a module that needs a beta-only component now works if you're on the beta channel.
- You can uninstall a module you never enabled, without having to enable it — and grant everything it asks
  for — just to delete it.
- A brand-new install now sets up the official add-ons source when you first browse, instead of showing an
  empty list that reads as though nothing exists.

### Notes
- Nothing here changes anything if you don't install modules.
- **Why helpers exist:** modules are deliberately forbidden from touching the filesystem, running programs
  or opening raw network connections — that restriction is what makes the permissions you approve mean
  something. A helper does such work *for* a module through a narrow interface you approve, so the
  capability can be offered without trusting the module itself.

## Beta channel (pre-release)

_The pre-release history below led to 1.5.0 above._

## [1.4.0] — 2026-07-22

**Modules.** JonDash can now be extended with add-ons that plug in without changing the base app — like
adding an app to a phone. Coming from 1.3.0, this is the whole feature in one release.

### Added
- **Install modules from a source.** **Admin → Modules** gains **Browse modules**: the official
  add-ons source is set up for you, and you can add any public GitHub repository that publishes modules.
  Tick several and install them together — one rebuild and one restart for the batch.
- **Import your own module** from a `.zip`, with no repository involved. Same safety checks either way.
- **You approve what a module can do.** Before anything is installed you see, in plain language, exactly
  what it's asking for — connecting out to other servers, encryption, audit entries, sending email. A module
  is refused outright if its code reaches for something it didn't declare, touches the filesystem, runs
  code built at runtime, reads the server's environment, or reaches into JonDash's internals. This is a
  strong safety net, **not a sandbox** — a module still runs with the app's privileges, so only install
  modules you trust.
- **Automatic recovery.** If a module ever stops JonDash building, the launcher removes it, starts up
  without it, and tells you which one. Your data isn't touched.
- **Modules can do real work** — their own dashboard widget, their own pages, their own settings screen,
  working buttons and forms, background checks, email, and host reachability checks.
- **Choose who sees each module.** Limit one to Service Groups exactly like a service tile: leave every
  group unticked and everyone signed in sees it; tick some and only their members do.
- **Arrange your dashboard.** Each module widget has a **Customise** control for its width, height and
  position — and your layout is yours alone; it never changes what anyone else sees.
- **Per-module update channels** — opt a single module into its beta releases without moving JonDash itself
  onto beta.
- Modules are preserved across JonDash updates, and installing or removing one shows a full-screen progress
  screen that waits for the restart and returns you to sign-in on its own.

### Changed
- **Delegated administration covers modules.** The **Manage modules** permission can be granted to a
  non-admin through an Access Role, including assigning modules to groups.

### Notes
- Nothing changes if you install no modules — the base app behaves exactly as it did in 1.3.0.
- Building your own is documented in `docs/MODULES-AUTHORING.md`, including a paste-in prompt for having an
  AI write one for you.

## [1.5.0-beta.5] — 2026-07-22

### Added
- **JonDash now notices when a module is missing something it needs.** A module can end up installed and
  enabled but quietly doing nothing, if a shared component it relies on isn't there — which could happen to
  anything installed during the earlier 1.5.0 betas, and which updating alone doesn't repair. Admin →
  Modules now checks every time you open it.
- **Modules from the official add-ons source repair themselves.** What's missing is downloaded for you, and
  you get a **Restart now** button to finish the job — the download alone isn't enough, because these
  components only become active when JonDash rebuilds.
- **Modules you imported yourself, or installed from another source, are reported rather than repaired**,
  with what's wrong and how to fix it (reinstall or re-import). JonDash won't fetch code on their behalf
  without you asking.

### Notes
- **Nothing restarts on its own.** The repair happens quietly; making it live is always your click.

## [1.5.0-beta.4] — 2026-07-22

### Fixed
- **A failed import left the module installed anyway.** You were told the import had failed, but its files
  stayed on disk and were quietly compiled in on the next restart — without the helper it needed, so its
  background work never ran. A module that can't have the helper it declares is now **refused outright**
  rather than installed in a state where it can never work.
- **Installing from a source now behaves the same way.** It previously kept such a module and reported the
  helper separately, so the two routes disagreed about what a missing helper meant. The one exception is
  *updating* an existing module: there the files are already replaced, so the update is kept and the
  problem reported, rather than deleting a module that was working.
- **Importing looked for helpers on the stable channel only**, so importing any module needing a beta-only
  helper always failed. It now follows your own update channel — if you're on stable you won't silently be
  given beta helper code.

## [1.5.0-beta.3] — 2026-07-22

Fixes from a full module lifecycle test — install, enable, use, disable, uninstall, batch install.

### Fixed
- **Helpers never installed.** A module that needed one was installed without it and then sat there doing
  nothing, with no error anywhere. The same fault in reverse meant a helper was never removed when the last
  module needing it was uninstalled. Between them the whole helper mechanism did nothing at all.
- **Importing a module, or updating one, never installed helpers either** — only a fresh install from a
  source tried, and that was the path that was broken.
- **A brand-new install showed an empty module browser**, reading as though nothing existed, when in fact
  the official source hadn't been set up yet. It's now set up when you first browse, and the message
  distinguishes "no sources configured" from "nothing published".
- **You couldn't uninstall a module you'd never enabled.** Removing one you'd decided against meant
  enabling it first — approving every permission it asks for — just to delete it.
- **The Helpers page was missing from the sidebar**, reachable only by typing the address.
- A helper's minimum JonDash version is now checked before it's installed, instead of being ignored.

### Changed
- Installing a module now **tells you if a helper comes with it**, before you confirm.

## [1.5.0-beta.2] — 2026-07-22

### Changed
- **Helpers are now installed from the official add-ons source, not shipped inside JonDash.** A module
  declares the helpers it needs and they arrive **with it** — same batch, same restart — so new shared
  capability can be published without waiting for a JonDash release.
- **Helpers can only ever come from the official source.** This is enforced rather than assumed: a
  `helpers` list published by any other source is ignored outright. A helper is trusted to do things
  modules are deliberately forbidden, so that restriction is the whole reason it's safe to offer them.
- **When nothing needs a helper any more, its files are removed but its data is kept** — reinstalling the
  module brings the helper back with its history intact rather than starting from nothing.
- Installed helpers are preserved across JonDash updates, the same as modules.

## [1.5.0-beta.1] — 2026-07-22

### Added
- **Modules can now do work in the background, reliably.** A module can declare recurring work — checking
  something on a schedule, tidying up old records — and it runs **from the moment JonDash starts**, not
  from the first time somebody opens a page. A monitoring module restarted overnight now genuinely keeps
  watching instead of sitting idle until morning.
- **Helpers** — a new kind of built-in component that provides shared capability to modules. Helpers come
  with JonDash, are used only when a module asks for one, and are listed read-only under
  **Admin → Helpers**, showing which of your modules relies on each. There is nothing to install or remove:
  the page exists to answer "what is this, and why is it on my system?"
- The first helper is a **scheduler**, which runs modules' declared background work. If a job fell due while
  the server was off it runs shortly after starting rather than waiting for its next turn; a module that is
  switched off stops immediately and resumes when switched back on, with no restart.

### Why helpers exist
Modules are deliberately forbidden from touching the filesystem, running programs, or opening raw network
connections — that restriction is what makes the permissions you approve mean anything. But it also makes
whole categories of module impossible to write. A helper does that work *for* a module through a narrow,
purpose-built interface you approve, so the capability can be offered without trusting the module itself.
This release lays that groundwork; the filesystem helper comes later.

### Notes
- Nothing changes if you have no modules installed.
- A helper that fails to start is logged and skipped — it can never prevent JonDash from starting.

## [1.4.1-beta.1] — 2026-07-22

### Added
- **Module updates now live in Admin → Updates**, in their own section under JonDash's own update panel —
  so keeping your modules current is as easy as keeping JonDash current. Each module shows its installed
  and available version, which channel it follows, and where it came from. Select several and update them
  together: one rebuild and one restart for the batch, and their stored data is kept.
- **You're told when module updates are waiting.** A notice appears wherever JonDash already tells you an
  update is available — including when JonDash itself is up to date — so you never have to go looking.
- **Modules are never updated automatically.** Even when JonDash installs its own updates automatically, it
  will never change a module as a side effect. Updating a module is always something you choose.
- **A module asking for more access than you approved can't slip through.** If a new version wants an
  additional permission, the update card says so in plain language and you must approve that specific change
  before it can be applied. Versions that give up permissions apply without interruption.

### Fixed
- **A module updated to a version with database changes could break.** Modules only set up their storage
  when first enabled, so a module that added a new table or column in a later version ran with the old
  layout after updating — with no error to explain the resulting misbehaviour. Updates now bring a module's
  storage up to date on the next start, including for modules already updated before this release.
- **An updated module could be denied access it needs.** The permissions recorded for a module were only
  ever written when it was first enabled, so after an update it kept the old set — a new version relying on
  something it now declares would quietly not work.

### Notes
- Modules that can't be updated yet explain why rather than failing — needing a newer JonDash, no longer
  being published, or having been imported manually (update those by importing the new version).
- A just-published version can take a couple of minutes to appear, as GitHub briefly caches the list.

_The pre-release history below led to 1.4.0 above._

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
- **Modules can now actually be installed.** **Admin → Modules → Browse modules** installs a module
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
- **Module sources.** Modules can now come from a source repository. **Admin → Modules → Manage
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
- **Modules — early foundation.** JonDash now has a module system: a new **Admin → Modules**
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
- **Restart & Shut down controls** (Admin → **Server power**, full-admin only). Restart
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

[1.5.3-beta.5]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.5
[1.5.3-beta.4]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.4
[1.5.3-beta.3]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.3
[1.5.3-beta.2]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.2
[1.5.3-beta.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.1
[1.5.2]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.2
[1.5.2-beta.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.2-beta.1
[1.5.1-beta.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.1-beta.1
[1.5.0]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.0
[1.4.0]: https://github.com/jontiadcock/JonDash/releases/tag/v1.4.0
[1.5.0-beta.5]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.0-beta.5
[1.5.0-beta.4]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.0-beta.4
[1.5.0-beta.3]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.0-beta.3
[1.5.0-beta.2]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.0-beta.2
[1.5.0-beta.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.0-beta.1
[1.4.1-beta.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.4.1-beta.1
[1.4.0-beta.11]: https://github.com/jontiadcock/JonDash/releases/tag/v1.4.0-beta.11
[1.4.0-beta.10]: https://github.com/jontiadcock/JonDash/releases/tag/v1.4.0-beta.10
[1.4.0-beta.9]: https://github.com/jontiadcock/JonDash/releases/tag/v1.4.0-beta.9
[1.4.0-beta.8]: https://github.com/jontiadcock/JonDash/releases/tag/v1.4.0-beta.8
[1.4.0-beta.7]: https://github.com/jontiadcock/JonDash/releases/tag/v1.4.0-beta.7
[1.4.0-beta.6]: https://github.com/jontiadcock/JonDash/releases/tag/v1.4.0-beta.6
[1.4.0-beta.5]: https://github.com/jontiadcock/JonDash/releases/tag/v1.4.0-beta.5
[1.4.0-beta.4]: https://github.com/jontiadcock/JonDash/releases/tag/v1.4.0-beta.4
[1.4.0-beta.3]: https://github.com/jontiadcock/JonDash/releases/tag/v1.4.0-beta.3
[1.4.0-beta.2]: https://github.com/jontiadcock/JonDash/releases/tag/v1.4.0-beta.2
[1.4.0-beta.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.4.0-beta.1
[1.3.7-beta.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.3.7-beta.1
[1.3.6-beta.1]: https://github.com/jontiadcock/JonDash/releases/tag/v1.3.6-beta.1
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
