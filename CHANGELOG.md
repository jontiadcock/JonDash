# Changelog

JonDash ships on **two channels** — pick yours under Admin → Updates:

- **Stable** (`main` branch) — tested releases, versioning `MAJOR.MINOR.PATCH`; the default, and the
  public auto-update channel.
- **Beta** (`beta` branch) — pre-release builds, versioning `X.Y.Z-beta.N`; early access, may be less stable.

Within a release: **patch** = fix/security · **minor** = feature · **major** = big change. A beta build
`X.Y.Z-beta.N` is promoted to Stable as `X.Y.Z` once confirmed.

## [1.8.0-beta.18] — 2026-07-28

**A module now opens over the catalogue rather than taking you somewhere else.** Clicking a card
expands it into a panel over the grid, growing out of the card you clicked; the catalogue stays
exactly where it was behind it, same channel, same page, same scroll position, and closing it puts
you straight back. Escape, the browser's Back button, clicking outside and the ✕ all do the same
thing. **The address still names the module**, so it can be linked and shared — open that link
fresh, or reload the page, and you get the full page as before. Both routes render the same
content, so there is no second copy of the permission list to drift out of date.

**Modules you already have are ticked** — a green tick on the card, so a glance down the catalogue
answers "which of these do I have?" without reading a word. If the version you have installed is
older than the one published, the card says which one you have.

**A queued install no longer comes back after the restart.** Queue two modules, install the batch,
and the dashboard would restart and then offer to install them again — the queue is held in your
browser and nothing survives the restart to clear it. The list now drops anything the server says
is already installed, so it tidies itself up whatever happened; a batch that *failed* still stays
put, ready to retry.

**The startup window prints readable text again.** A stray punctuation mark came out as `ΓÇö` in
the console, which made a perfectly healthy launch look broken.

## [1.8.0-beta.17] — 2026-07-28

**The Add-ons page has one row of actions**, and Import is in it. Import used to be a
permanently-open card at the foot of the page — the rarest thing anyone does here taking the most
room, while Browse, which is what almost everyone wants, was a small button. Both now open when
asked for. **Import still shows its safety notice in full** when it does: it carries the only
statement in the product that a sideloaded module is checked, and anything reaching for a
permission it didn't declare, touching the filesystem, or running constructed code is refused.

**New: Design your own module** — the authoring guide (the version matching your update channel,
since a beta build has a different contract from a stable one) and the `template` module, which is
a working module you can copy and is the faster start.

**Browse is a catalogue.** Three across, each entry carrying its author's summary and a chip saying
roughly how much access it wants. You choose how many to show per page and the choice is
remembered. A module this build is too old for is greyed **and says which version it needs** —
dimming alone reads as a rendering fault.

**Clicking one opens its own page**, where the permissions are written out in full, the shared
capabilities it would bring with it are named, and the install actions live. Back returns you to
the page of the catalogue you left, not to the beginning.

**This is a consent change, not only a layout one.** Installing was previously possible from a
checkbox on a catalogue row — so a module could be selected and installed with its permissions
never having been on screen. The catalogue now has no install control at all; **Queue install** and
**Install now** exist only on a module's own page. Queuing still batches, so several modules cost
one rebuild and one restart rather than one each, and a part-built batch survives moving between
pages.

**`docs/MODULES-AUTHORING.md` caught up with the 1.8.0 dashboard.** It still told authors their
widget was 1–3 grid cells. It now describes the 18-column grid, square cells, the 6×6 default and
the 1×1 floor, that the frame **clips rather than scrolls**, container queries rather than media
queries, free placement, and that phone and desktop layouts are stored separately.

## [1.8.0-beta.16] — 2026-07-28

**Drop a tile on top of another and the others shuffle out of the way.** It used to be refused —
the tile went back where it came from, which was safe but read as being told off.

**This pulls against free placement, and the tension is resolved deliberately.** Gaps are the point
of free placement, so a general tidy-up would be exactly wrong: it would close every deliberate
space every time anything moved. Instead **only the tiles actually in the way move**, each to its
nearest free spot, cascading if that displaces someone else. Everything else keeps its position
exactly. The tile you are dragging never moves — where you drop it is where it goes, and the board
rearranges around it. Dropping A onto B usually reads as a swap, because the space A just left is
normally B's nearest free spot.

**The board only rearranges when you pause, or when you drop.** Recomputing continuously was
genuinely erratic: the target cell comes from rounding, so it flips back and forth on the least
jitter near a cell boundary, and each flip can send a displaced tile somewhere quite different.
Waiting for stillness removes the cause rather than damping it, and doubles as a preview — hesitate
over a spot and the board shows you what dropping there would do, then puts itself back if you move
on. A drop always resolves, so a quick flick still lands.

**A dropped tile now lands rather than sliding in.** Three separate attempts blamed the reflow
animation before a frame-by-frame probe found the real cause: the tile carries a CSS transition that
covers `transform`, so when the drag offset was removed on release, that removal was *animated* —
the tile snapped to its new cell and then slid in over 180ms from wherever you had been holding it.
It is now cleared at the one moment both the new position and the absence of the offset are true
together: after the grid has moved, before the browser paints. Measured across a real drop, the tile
occupies exactly two positions — under your cursor, then in its cell.

Tiles that get **shoved** still animate, because they genuinely move and nothing else is competing
to change them.

## [1.8.0-beta.15] — 2026-07-28

**The arrange controls are just the size now.** The ←↑↓→ buttons and Reset are gone; the `3×3` badge
stays. The arrows moved an item one cell at a time, which made sense while a position was a place in
a queue — against free placement on an eighteen-column grid it is a dozen clicks to do what a drag
does in one gesture, and they filled most of the chrome on a small tile.

**The cost, stated rather than buried:** those buttons were the only way to *move* a tile without a
pointer, so moving is now drag-only. Resizing keeps its non-pointer path — the corner handle is
arrow-key operable — and the move capability could come back as arrow keys on a focused tile, with
no buttons, if it is ever wanted.

The server action behind Reset went with it. An exported server action is a live endpoint whether or
not anything calls it, so leaving an orphan would have been half a removal; it was properly guarded,
so this is tidiness rather than a fix.

## [1.8.0-beta.14] — 2026-07-28

**The launcher no longer updates JonDash — ever.**

There used to be two things that could replace the app: the launcher, at every single startup, and
the in-app scheduler, at the time you chose. Only the second respected your schedule, which is how
a restart could install a version you hadn't asked for at a moment you hadn't picked. That path is
gone. Updates now happen on your schedule, or when you press the button in **Admin → Updates**, and
nothing else installs anything. The launcher still *tells* you an update exists — being informed
costs nothing; installing without being asked was the problem.

That closes **BUG-61** (JonDash updating itself with automatic updates switched off) at the cause
rather than patching it: with nothing acting on the pre-boot flag, the master switch and the
per-item exclusion can no longer disagree about anything that matters.

**Scheduled updates now cover JonDash itself**, not just add-ons — which they have to, now that the
launcher doesn't. It obeys the same schedule, the same master switch and the same per-item
exclusion as everything else, and a version that already failed and was rolled back is never
retried automatically.

**Shut down now means shut down (BUG-63).** The supervisor checked the update, rebuild and restart
signals *before* the shutdown one, so any of them arriving at the same time beat an explicit stop —
which is how pressing **Shut down** could restart the server and install an update on the way. Stop
is now checked first and clears the rest, and stale signals left by a previous run are discarded at
startup instead of being acted on.

**Dragging tracks the cursor again.** A tile changes grid cell as you drag it, and it was *also*
being offset by the full pointer distance on top of that — so it moved about twice as far as the
mouse. The offset is now just the remainder within the current cell.

**Small tiles no longer have their contents cut off.** A service tile had a fixed icon size and
padding, so below a certain size the label was sliced off by the frame. It now sizes itself against
the tile: the icon scales down, and on a very small tile the label steps aside and leaves the icon.

**A resize now shows up immediately.** The grid was caching each item's size when the page loaded
and never taking a new one from the server, so resizing could leave the old geometry on screen.

## [1.8.0-beta.13] — 2026-07-28

**Put things where you want them.** A tile's position is now a **cell**, not a place in a queue —
so one icon can sit at the top and another at the bottom with nothing in between, and a gap is a
perfectly good arrangement rather than something the grid closes up behind you.

This also replaces the model that never felt right. While position was an ordering, moving one item
forced every item after it to shuffle along, so the grid churned continuously under a gesture that
hadn't finished. Now **nothing else moves at all**: the item you're holding follows the pointer, the
rest stay exactly where they are, and the layout changes once, when you let go. A cell that's
already occupied is refused rather than overlapped, and the item holds the last free cell it passed
through.

The arrange arrows become four directions — up and down are precisely what free placement adds, and
"move later" means nothing once you can leave a gap. They remain the only way to arrange without a
pointer.

Positions are stored per device profile as before, and an install upgrading to this version looks
exactly as it did: everything is packed into the arrangement it already had, and only starts being
stored as explicit positions once something is actually moved.

**Service tiles could not be dragged at all.** The drag handler skipped anything inside a link, to
protect the arrange controls — and a service tile *is* a link filling the whole frame, so every grab
on one was ignored while module widgets worked fine. Controls are now excluded by an explicit
marker, so nothing is special-cased per kind and both behave identically.

**Hovering a service clipped the top off its card.** The tile carried its own hover lift from before
the frame had one; once the frame gained a lift so widgets would rise too, tiles lifted twice, and
the inner lift moved the card inside a container that clips. The frame is now the only thing that
lifts.

**Back to top now appears on every page**, including sign-in, first-run setup, the recovery-code
page and a module's own page — several of which are long on a phone, and the last of which an
add-on author controls the length of entirely.

## [1.8.0-beta.12] — 2026-07-28

Three things the owner found testing beta.11.

**A dropdown needed several attempts before it would change.** A `<select>`'s React `onChange` runs
on the DOM `change` event — but the browser fires `input` first, and React processes that one too:
seeing the DOM value no longer match its `value` prop, and with no state update yet, it **restores
the old value**. By the time `change` arrives there is nothing left to report, so React suppresses
`onChange` entirely and the selection snaps back. Measured live: one keypress produced `input` at
index 5, then `change` back at index 6, with `onChange` never called.

Handling `input` as well gets the update in **before** the restore, so React's value already matches
the DOM and there is nothing to undo. Every controlled dropdown now goes through one helper, and a
test fails if a new one is added without it.

**Dragging a large widget threw the small tiles around.** Two causes, both about size. Touching any
part of a target was enough to reorder, and a module widget is four times a tile's area — so
brushing one edge reordered the grid, and because a wide item that no longer fits its row pushes
everything after it down, tiles moved most of a screen for a gesture that had barely started. FLIP
then inverted that: the tile was placed at its old position, often outside the viewport, and
animated back in, which reads as vanishing rather than moving. Now a swap needs the pointer to be
**past the target's centre** in the direction of travel, and a journey longer than the screen isn't
animated at all.

**A "back to top" button**, app-wide, appearing once you have scrolled about two-thirds of a screen.
On a phone, arranging the dashboard means scrolling down to reach the tiles, which left no way back
up to *Done arranging*. Bottom-right, clear of the home indicator, and it respects reduced motion.

## [1.8.0-beta.11] — 2026-07-28

**"I click Save and it reverts" — found, and it was never what anyone thought.**

React 19 calls `form.reset()` once a form action resolves. A reset restores every control to its
**server-rendered** default, so the setting you just changed snaps back to the value the page loaded
with — and because React's own state still holds your new value, React sees nothing changed and
never rewrites the screen. Measured live: after saving, React's value read `1440` while the input
read `480`. **The save had worked every single time; only the display lied.**

That makes a **controlled** field the case that breaks, which is why converting these forms from
`defaultValue` to controlled (beta.8) changed nothing at all, and why removing the settings cache
(also this beta — a real bug, but a different one) did not fix it either. `reset` is a cancelable
event, so `preventDefault()` on it is the whole fix. It ships as part of `dirtyProps`, so a form is
protected by spreading one object rather than by everyone remembering. Write-only fields — passwords,
client secrets, file pickers — relied on that reset to clear themselves, and are keyed on a
generation counter instead.

**Every savable setting now says "Not saved yet."** One shared `SaveBar` across email, general
settings, appearance, logo, network, update schedule, session length, module settings and module
visibility — the save button is live only when there is something to save, and a "Saved." never
appears next to a field you have since edited.

**Dragging is rebuilt on pointer events.** The native HTML5 drag painted a grey ghost box that cannot
be styled away, ignored touch entirely, and reported only coarse enter/leave — so nothing could move
out of the way until you let go. Now the item follows the cursor and the rest reflow around it live,
with a FLIP animation, one save when you release, and touch support.

Two failures found by testing it rather than by reading it:

- The FLIP release ran inside `requestAnimationFrame`, which **does not run in a hidden or
  backgrounded tab** — so items kept their inverted transform permanently, sitting visibly displaced.
  It is now released synchronously after a forced style flush: animated when frames are being
  produced, correct when they are not.
- Hit-testing used `getBoundingClientRect`, which **includes the in-flight animation**. Drag faster
  than the 180ms reflow and every test aimed at a rectangle that was nowhere in particular, which
  scrambled the order rather than merely mis-aiming. It now tests layout position, which no transform
  can move.

**A new service tile appears on the dashboard immediately.** Creating a link revalidated only the
admin page — editing and deleting a link already revalidated `/dashboard`, but creating one never
had, so the one case where you are certainly looking for a change was the one that showed none.

**Tiles go three times smaller.** The grid runs at 3× resolution (18 columns wide, 6 narrow) with
defaults grown to match, so nothing changes size on upgrade and 1×1 becomes a genuinely small,
genuinely square tile — 68px against a 219px default, measured. Existing layouts are multiplied by
three in a migration. The frame's own height ceiling, a stale `6` that silently refused to grow an
item past six rows, now comes from the shared geometry.

**Module widgets rise on hover while arranging**, as service tiles already did.

**Add-ons can send through the branded shell** — the second half of beta.10's email work.
`ctx.email.send` takes `title`, `lists` and a `cta`, and the body is escaped, so a module can lay a
message out properly but cannot forge JonDash's own mail.

**A new `Public address` setting** (Admin → Settings) is where email links are resolved from. With
nothing set, a message simply carries no button rather than a guessed address: a forged
`x-forwarded-host` is considerably worse in an email, which outlives the request, than on a page.

**The settings cache is gone.** A module-level map with a 30-second TTL that `writeSetting` cleared —
except a server action and the page render it triggers are **separate module instances**, so the
clear never reached the reader. It made saved settings appear not to have saved for up to half a
minute, and an earlier fix had worked around it for one getter with a `fresh` flag. Nothing replaces
it: these are a handful of small rows in a local SQLite file, and being right about what an admin
just saved is worth more than the read. (Not the cause of the revert above — see BUG-64.)

## [1.8.0-beta.10] — 2026-07-27

**Branded email — design C2, first pass.** `lib/email/template.ts` renders the shell; the test email
is the first thing through it.

**The app's own CSS is unavailable here, and that shapes everything.** Mail clients strip `<style>`
blocks and have no idea what a CSS custom property is, so the token system the whole app is built on
cannot be used — every rule is inlined as a literal. The palette is resolved to concrete hex at send
time, which is what lets **one** template cover all 140 style × palette combinations instead of 140
hand-built ones.

**Light ground regardless of palette**, deliberately: a good number of clients override a dark
background and leave the light text on it, producing an unreadable message — the one failure worse
than looking plain. Branding arrives through the accent rule, the wordmark and the call to action.

**A custom accent beats the palette's**, because that is what the person chose and what the app
paints with; an email using the palette colour would look like a different product to its own
dashboard. `STYLE_SETTINGS` decides whether the current style offers one at all, so a value stored
under a previous style doesn't resurface.

**`readableOn()`** picks black or white for the CTA by WCAG relative luminance. Not decoration:
palette accents run from `#000000` (Paper · Ink) to `#f5e600` (Brutalist · Yellow), and a button
hardcoded to white text is invisible on half of them.

**Every message carries a real plain-text alternative**, built from the same inputs rather than by
stripping the HTML.

**A drift guard, and it earns its place.** `lib/styles.ts` describes its palette colours as a
*mirror* of `app/styles.css` — a second source of truth with nothing checking it. Now every one of
the 20 palettes is asserted to have its accent present in the stylesheets. The failure it prevents is
specific and slow: emails going out in a colour the app stopped using, months after a palette edit
nobody would connect it to. All 20 agree today.

**Still to come in this release:** the rest of JonDash's own messages, the module-facing
`ctx.email.send()` shape (D4), the repeating list slot for add-on digests, and the canonical base URL
that CTA paths resolve against.

**Tests:** 534 (was 504). The new ones cover markup injection through the body, list rows, the CTA
URL and the app name — a module supplying any of those must not be able to forge JonDash's own mail.

## [1.8.0-beta.9] — 2026-07-27

**The Email page, as asked for.**

**Provider preset removed** (owner: *"it will just cause confusion"*). It filled in a host and port
you had to understand anyway, and said nothing about what people actually get stuck on: that Gmail and
Outlook want a purpose-made app password rather than your account password, and that Microsoft 365
disables SMTP AUTH per mailbox by default — the single most common cause of a test that never connects.

**Replaced with links to each provider's own instructions**, at the foot of the page. Those stay
correct when a provider changes a hostname; anything copied into JonDash goes quietly stale. Four:
Gmail app passwords, Outlook.com app passwords, M365 SMTP AUTH, and M365 direct send (which points
back at the existing **Mail relay** mode).

**"App password" → "Password"**, and it now says it's stored encrypted. That was already true — the
whole email config is a single encrypted `Setting` row — and the screen never said so, which is why
the owner asked for it. The old label also described what two specific providers happen to call
theirs; a self-hosted relay just has a password.

**OPS-13 needed nothing — it was already built.** Scheduled into this release, then verified as
already shipping: `sendTestEmail` separates *couldn't connect* from *connected but the send was
refused*, returns the **raw provider error verbatim** prefixed with the stage and the host it actually
used, appends a cause only where the raw text is known to mislead, and the UI renders it `pre-wrap` —
without which the whole thing collapses into one run-on line. Recorded in the roadmap as satisfied so
it isn't scheduled a third time.

**Tests:** 504, unchanged — this is presentation, and the behaviour underneath already had coverage.

## [1.8.0-beta.8] — 2026-07-27

**Fixes from the owner's testing of betas 5–7.**

**Grid cells are now SQUARE.** The row height is the **measured column width**, so one unit is one
unit in both directions, N×N is genuinely a square, and any shape composes from spans — which was the
ask: *"I should be able to make the modules small or large, square, rectangle, whatever I want."*

It has to be measured, not declared. The columns are fluid, so a constant row height is landscape at
one window width and portrait at another; CSS can size a row from its content or from a fixed value,
but not from the width of a column it doesn't know. A `ResizeObserver` on the grid recomputes it —
which also covers the window changing without a `resize` event, the exact gap that made the profile
switch untestable in the browser harness. `GEOMETRY` no longer carries a row height at all, rather
than keeping a second source of truth that is wrong at every width except one.

**Widgets clip instead of scrolling.** Owner's call, reversing mine: *"if something can't be presented,
it should be cut off and the module needs to manage the sizings correctly."* I'd argued hiding content
was worse than showing it doesn't fit — in a dashboard that's the wrong trade. A scrollbar inside a
tile is noise on every item to rescue the rare one that overflows, and it lets a badly sized widget
look acceptable instead of obviously wrong. The widget root is now pinned to the frame's height so an
author lays out against a box they can see. **This changes what every existing widget must do** — it's
on the add-ons hand-off list.

**Fixed — saving a Session length looked like it did nothing.** It saved correctly every time, but the
select was uncontrolled with `defaultValue`, which only seeds on mount: the action revalidated, the
server sent the new value, and the DOM kept showing the old one until a reload. Indistinguishable from
a failed save. Now controlled, re-seeding when the server's value genuinely changes, with an explicit
*"Not saved yet"* and the Save button disabled until something is actually different.

**Added 365 days** as the longest Session length — the same as `SESSION_ABSOLUTE_CAP_DAYS`, because
beyond that the idle window could never be reached and an option that can never take effect is worse
than no option.

**Also logged, not built: BUG-63 — Shut down restarts the server *and* installs an update.** Two
faults; the update half is BUG-61, and the restart half is worse and separate — a server that comes
back after being told to stop cannot be taken out of service at all. Scheduled with BUG-61.

**Tests:** 504. The paint suite now strips comments before matching — these files explain the rules
they follow, so a `not.toMatch` over raw source matches the sentence saying the bad thing isn't there.
That's BUG-39's trap, and it caught me three times in this one file.

## [1.8.0-beta.7] — 2026-07-27

**Start of group 4 — updates and launcher.** Two items that need nothing from anyone else; the
auto-update rework (BUG-61) is held until the owner settles what *"unless someone clicks yes"* means,
since a console prompt versus an in-app one changes the shape rather than a detail.

**Fixed — the update list showed the opposite of what it would do.** Everything eligible now starts
**ticked**, the label is always `Update selected (N)`, and the button is **disabled at zero**.

The old code stored the *inclusions* and treated an empty set as "act on everything", so the page
rendered N **unticked** boxes above a button reading "Update all" that would update all N. An unticked
box means "not included" everywhere else, and the owner reasonably concluded JonDash and the add-ons
couldn't be picked apart. They always could — every row has had its own checkbox since 1.7.0; the UI
simply never showed it.

Now it stores the **exclusions**, which also fixes a subtler thing: press *Check now* and anything
newly discovered arrives ticked like everything else, whereas storing inclusions would have left a new
item silently outside a button claiming to update the selection. Unticking the last row leaves a
disabled button rather than making the control vanish, which reads as a broken page.

**OPS-06 — the browser auto-open can be switched off.** Out of backlog at the owner's request.
`.data/no-browser`, written by a toggle on **Admin → Server power**, and `JONDASH_NO_BROWSER` as an
environment variable. **Both, deliberately:** the toggle is the "I'm set up now, stop doing this"
case and survives updates because `.data` is preserved — but it is no use whatsoever on a headless
box, because a switch inside JonDash cannot be reached by somebody who can't see the window it just
opened. Worth noting it only ever fired on a *first* launch, not on every restart.

**Verified live:** the sole available update renders ticked with the button enabled; unticking it
gives `Update selected (0)`, disabled, with the row still on screen.

**Tests:** 503. The update-selection ones are source-level — nothing misbehaved, the screen just
disagreed with itself, so no behavioural test would have caught it. The launcher ones cover both
opt-out routes and assert no unguarded browser launch survives.

## [1.8.0-beta.6] — 2026-07-27

**Session lifetime + Idle timeout become one "Session length".** The last item of group 3, held back
from beta.5 deliberately — it changes when people get signed out, and appending that to the end of a
long dashboard push is how such things go wrong.

**Why one and not two.** The pair overlapped confusingly: switching the idle timeout off quietly made
the absolute lifetime the only thing ending a session, and the help text under it asserted a "7-day
lifetime" that stopped being true the moment anyone changed the field above it (corrected in beta.2).

**The idle window is the one worth exposing** — it's what people mean by "how long do I stay signed
in". **The absolute cap is not discarded**, which was the risk in merging: without it a stolen token
can be kept alive indefinitely, because the idle window resets on every use. It survives as
`SESSION_ABSOLUTE_CAP_DAYS = 365`, a constant rather than a second control, stated on the page.

**A picker, not a number box.** One field now has to express both "2 hours" and "30 days", and an
input reading `43200` tells nobody anything. Presets from 1 hour to 90 days, and the two genuinely
bad answers — a few seconds, or effectively never — are no longer a typo away. A migrated value that
matches no preset is added to the list and shown as *"(your current setting)"*, so an upgrade never
silently presents a different number as if it were yours.

**Migration in SQL (`20260727230000_session_length`), and nobody's session changes length.** Had an
idle timeout → kept exactly. Had it switched **off** → the absolute lifetime becomes the new window,
because that was the only thing ending their sessions and anything else would sign them out sooner
than before. Neither → the shipped 120-minute default. Guarded by `NOT EXISTS`, so it never
overwrites a choice made after upgrading. The legacy rows are deliberately left in place — a
migration that destroys its own inputs can't be checked afterwards.

**Verified against a real database, every branch:** idle-wins-over-lifetime, idle-off-uses-lifetime,
the owner's own 30-days-with-idle-off (→ 43200 minutes, unchanged), fresh install, idle-with-no-
lifetime-row, and a re-run leaving a later choice alone. Then live: the page shows one control, the
migrated value selected as "30 days", and both old fields gone.

**Tests:** 490. The new ones pin the property the merge could have quietly lost — that no setting can
raise the absolute ceiling, and that the legacy rows stop influencing anything once the merged value
exists.

## [1.8.0-beta.5] — 2026-07-27

**One dashboard, arranged freely, using the whole screen.** CORE-11, CORE-12 and CORE-14 — all three
came out of the owner testing beta.1.

**CORE-11 — service tiles and module widgets share one grid and one ordering.** Reverses retired
MOD-04 (dropped 2026-07-22 as "arranging core service tiles is not wanted"), asked for again after
using the reworked arrange mode; retired IDs are never reused, hence a new one.

The data model was the work. `ModuleLayout` became **`DashboardLayout`** with `kind` + `refId`, so one
sequence spans two tables. **A user's arrangement could never be written to `Link.sortOrder`** — a
`Link` with a `roleId` belongs to a service group and is visible to every member, so that would
silently reorder the tile for all of them. It lives per user, keyed by link id, exactly as widgets
always did. The layout actions gained the matching gate: a tile is checked against
`getUserVisibleLinks` before anything is written, or a crafted request could both pollute a dashboard
and answer *"does this id exist?"* for something the caller was never shown.

**Geometry chosen so the merge itself rearranges nobody.** Tiles were 5-across and widgets 3, so the
grid is **6 columns wide / 2 narrow** with a tile at 1 unit and a widget at 2 — a tile lands near its
old size and a widget lands exactly on its old 3-across. The row track drops to 88px with widgets
defaulting to 2 rows, so a tile stays compact instead of becoming a large empty square.

**CORE-12 — a saved arrangement per device.** `profile` (`wide` / `narrow`) on the same table, keyed
on the **viewport, not the user agent**: the viewport is what actually decides which grid renders,
whereas a UA check is wrong for a narrowed desktop window, ambiguous for tablets, and not trustworthy.
The breakpoint and the grid's `lg:` are one constant, so what you rearrange on a phone is always what
gets saved for phones. **Writes read the live viewport rather than component state** — belt and
braces, because a missed media-query event would otherwise file a change against the *other* device,
which is precisely what this feature exists to prevent.

**Back compat: the migration copies every existing row into BOTH profiles**, so nothing changes until
someone deliberately arranges one differently. Backups carry a new top-level `dashboardLayouts` and
still write the old per-module `layouts`, so an archive taken here restores into an older build and an
older archive restores here. That block also moved *out* of the modules branch — now that it covers
tiles, a backup with no modules would have thrown the whole arrangement away.

**CORE-14 — the dashboard escapes the reading measure.** Every page was capped at `max-w-6xl`
(1152px), which on a wide display squeezed the dashboard into the middle third. The cap is right for
prose and wrong for a grid, so a page marks itself `data-wide-page` and `:has()` widens the shell —
rather than removing it globally, which would make a 2000px-wide settings form worse than the problem.

**Verified live:** 38 items (36 tiles + 2 widgets) in one 6-column grid at 88px rows with
`max-width: none`; at 375px it becomes 2 columns with widgets full width and tiles two-up, matching the
old behaviour exactly. **Not verified here:** the live *rotation* transition — this browser harness
changes the viewport without dispatching `resize` or `matchMedia` `change` at all (probed: zero events
across a genuine 375↔1034 change), so only a real browser can exercise it. Loading fresh at either
size is correct.

**Deferred:** the Session Length merge. Its design is settled, but it changes when people get signed
out and needs a careful migration — appending that to the end of a long dashboard push is how such
things go wrong. It's independent, so nothing waits on it.

**Tests:** 487. The layout suite now covers one ordering across both kinds, a tile and a module of the
same id staying apart, and the two profiles being genuinely independent for size, order and reset.

## [1.8.0-beta.4] — 2026-07-27

**Fixed — BUG-59: resizing one widget changed its neighbour's height.** Found by the owner testing
beta.1. Taking a 1×1 widget to 1×2 made an unrelated 2×3 widget beside it shrink slightly.

**My regression, from beta.1's own fix.** `grid-auto-rows: minmax(11rem, auto)` lets a track grow to
fit content, and a widget spanning N rows spreads its content across all N — so a span change
re-sized tracks *shared* with a neighbour. A tall widget spanning row 1 forced row 1 tall; spanning
rows 1–2 spread the same content over two tracks, row 1 shrank, and the widget spanning rows 1–3 lost
exactly that height. Neither widget was wrong; the tracks moved under both.

I chose `auto` to avoid clipping a module's UI, and that choice is what caused it — content-sized
tracks cannot also be independent of content. The track is now **fixed**, so a span is purely
multiplicative: nothing a module does can move its neighbour, and widgets sharing a row are genuinely
identical heights, which is the honest version of BUG-55.

**Owner's rule, 2026-07-27:** *"modules should conform to rules given by the dashboard — if text gets
cut off, that would be bad module design."* So the dashboard sets the box. The frame still **scrolls**
rather than clipping, because silently hiding a module's content is worse than showing it doesn't fit:
the author sees the overflow and nothing becomes unreachable. `min-h-full` rather than `h-full` on the
child, so a short widget still stretches while a tall one keeps its natural height inside the scroller.

Verified against the owner's exact arrangement: a 2×3 widget held at **560px** through a neighbour's
1×1 → 1×2 resize (it moved before), and the overflowing widget scrolls internally.

**Also logged, not built:** **BUG-60** — the glass styles still scroll poorly, and the owner's testing
is what separated it from the beta.1 fix. Modern improved "significantly", and *only* Crystal and Aero
remain slow, because those two set a real blur (18px/14px) rather than the zero blur beta.1 removed.
That cost is inherent to the effect and scales with card count, which is why Browse modules is worst.
**Owner's decision: log it and move on, change no other style** — deferred, not dropped.

## [1.8.0-beta.3] — 2026-07-27

**CI only — no application code changed from beta.2.**

`tests/unit/elevation.test.ts:164` (`--run` against a missing grant, which queries Task Scheduler)
timed out at vitest's 5s default on `windows-latest`, while ubuntu passed and the identical file had
passed an hour earlier on beta.1. So beta.2's tag carries a red run it cannot clear on its own.

**Fixed as a class, not as a line.** Every test in that file which spawns `jondash-grant.exe` or
`jondash-elevate.exe` is waiting on a Windows subsystem whose cold-start time is a property of the
runner, not of this codebase. The winget case hit exactly this in 1.7.x and was given its own 30s
timeout — and the four siblings that spawn the same way were left on the default, which is why a
different one tripped today. The budget is now set **once for the file** (`vi.setConfig`), and the
per-test override is removed so there is one rule rather than two. A genuine hang still fails; it
just takes 30s to say so.

## [1.8.0-beta.2] — 2026-07-27

**Two controls that looked like they worked and didn't, plus clearer names under Security.**

**Renames.** Permissions → **Addon Permissions**; Access Roles → **Admin Roles**, moved directly
under Service Groups. The two sat one line apart with near-identical names while answering
unrelated questions — one about what an *add-on* may do, one about what a *person* may do. Admin
Roles now sits beside Service Groups because both are "what is this person allowed to reach?".
The nav label and each page's own heading are separate declarations with nothing checking they
agree, so both were changed together and a test asserts the new names.

**Fixed — BUG-56: a revoked permission came back on its own.** `enableModule` wrote
`grantsForModule(def)` — the full declared set — in **both** branches of its upsert, so a plain
disable → enable round trip silently restored everything an admin had turned off on the
Permissions page, which promises the change "takes effect immediately". `applyModuleUpdates` did
the same on update. Now both **intersect** instead: keep what the admin currently holds, drop
anything the new version no longer declares, add nothing. The update path additionally grants only
permissions that are **new in that version and were explicitly consented to** at the gate that
already exists — so re-declaring a revoked permission is not re-consenting to it (owner decision,
2026-07-27). First enable still takes the full set, which is exactly what the consent screen showed.

**Fixed — BUG-57: admin roles assigned to an admin did nothing.** `getEffectivePermissions`
short-circuits to `ALL_PERMISSIONS` on its first line for an ADMIN, so every assigned role was
ignored — while the tick-boxes saved, persisted and redrew as ticked. Someone could reasonably
conclude they had scoped an admin's powers by unticking things. They had not. The tick-boxes are
replaced with a plain statement for an ADMIN or a service account, **and `setUserAccessRolesAction`
now refuses the write** — hiding the form alone would leave the page stating a rule the action
still accepted. The stored rows are deliberately **not cleared**: demoting the account back to a
normal user restores whatever was assigned (owner decision), and the page says so.

**Also:** the help text under Idle timeout claimed a session lasts "its full 7-day lifetime" while
the field above it read 30 — it stopped being true the moment anyone changed that setting, and read
as a fact rather than a stale default. It now names the other setting instead of quoting a number.

**Deferred, needs a decision:** merging Session lifetime and Idle timeout into one "Session Length".
Those are two different security properties — an absolute cap stops a stolen token being kept alive
indefinitely, an idle window signs out an unattended browser — and one number cannot express both
without dropping one or hiding a derived value. Raised rather than guessed, since the standing rule
is to ask before changing anything governing sessions.

**Tests:** 481 (was 468). The BUG-56 set is behavioural — it performs the actual disable → enable
round trip that used to undo a revocation.

## [1.8.0-beta.1] — 2026-07-27

**The dashboard is cheaper to draw, and arranging it is now an explicit mode.** First of the
1.8.0 UI rework betas, aimed squarely at jankiness.

**Two rendering faults, both found by measuring rather than reading.** A seeded 36-tile dashboard
was profiled before anything was changed, which ruled out the two usual suspects immediately —
245 DOM nodes and a 155 ms load are not the problem — and pointed at compositing:

- **`backdrop-filter` was applied to every `.card` regardless of style.** `--surface-blur` is `0px`
  in the global default and in 4 of the 7 styles, but `blur(0px)` is **not** `none`: it still creates
  a stacking context, still promotes the element to its own compositor layer, and still makes the
  compositor read back and re-filter the backdrop on every frame anything moves. Measured: **37
  promoted layers covering 97% of the viewport**, for no visible difference. Now driven by a new
  `--surface-backdrop` token that is `none` unless a style opts in — Crystal and Aero are unchanged.
  After the fix the same page has **1** (the sticky header, at a real 8px blur, which is correct).
- **`.page-fade` used `animation-fill-mode: both`**, retaining the final keyframe's `transform` on a
  full-page element permanently. That promotes the whole page to its own layer and makes it the
  containing block for every descendant `position: fixed` — the documented root cause of **BUG-23**,
  which was fixed by portalling the overlays while leaving the transform in place. Now `backwards`:
  same entrance, no flash, and the transform reverts to `none` when it finishes.

**CORE-08 — widget interaction rework.** Arranging is a mode you turn on, not chrome that appears on
hover. Hover cannot happen on a touch screen, and the controls were positioned exactly where a module
puts its own affordance. Normally the whole widget is a click target that opens the module's page —
with a real focusable link for keyboard and screen-reader users, since a container `onClick` is
invisible to both. In Arrange mode: move buttons, a size readout, Reset, and a corner handle that
resizes by drag **or arrow key**. A module with no page of its own is correctly not clickable.

**Fixed — BUG-54: the widget Height setting did nothing.** `widget-grid.tsx` had no `grid-auto-rows`,
so implicit rows were content-sized and the `grid-row: span N` set by the frame multiplied nothing.
The setting saved, re-rendered and moved nothing. Now `minmax(11rem, auto)` — a span multiplies a real
base, while a widget that genuinely needs more room still grows rather than being clipped. Verified
live: height 1 → 2 took a widget from 590px to 782px.

**Fixed — BUG-55**: widgets in a row are a uniform height, and the frame stretches a module's own root
so a short widget fills its cell. **BUG-53** is closed by CORE-08 — with no chrome in normal use,
there is nothing left to overlap a module's "Open".

**Also:** `.lift:hover` is now behind `@media (hover: hover) and (pointer: fine)`, so a tapped tile no
longer stays visibly raised on touch. And `eslint.config.mjs` now ignores `WORKING/**` — it already
intended to ignore the test sandbox, but `.testbed/**` only ever matched the repo root, and the sandbox
moved inside `WORKING/` when the working folder came into the checkout. A testbed's build output was
being linted as source, contributing **611 errors**; lint is clean again.

**Tests:** 468 (was 456). The 12 new ones are source-level on purpose — every defect here is a missing
or wrong declaration, which renders correctly and so is invisible to a behavioural test.

## [1.7.3] — 2026-07-27

**Service accounts — an identity for an add-on, that nobody can ever sign in as.** Consolidates the
four 1.7.3 betas unchanged.

Create one under **Users** — pick *Service account* as the type, alongside creating a person. It can
hold permissions and it appears in the audit log under its own name, but it has **no password, no
authenticator, no recovery codes and no setup link**, and none of those can be added to it later.

- **An add-on acts as *it*, not as you.** Previously an assistant had to borrow a real person's
  account, so the audit log blamed you for what it did, and revoking the assistant meant locking
  yourself out. Those are now separate things.
- **It cannot be turned into a login.** Resetting access, completing a setup link and signing in are
  all refused — and a sign-in attempt answers exactly like an unknown address, so nobody can
  discover a service account exists by trying.
- **It never counts as your last administrator.** Delete every real admin and the first-run recovery
  screen still appears, so an install can't end up locked away behind an account nobody can use.
- **Its page tells you what it's for** — when it was last used and by which add-on — and says
  plainly that the key lives in the add-on, not in JonDash. JonDash never sees it, can't show it to
  you and can't re-issue it.
- **One button cuts off every add-on**: disabling the account stops them all, because they re-check
  it on every request.

### Fixed
- **Switching an add-on off now actually stops the shared component it uses.** It mattered for the
  first component that holds a connection open — turning the add-on off left it listening, with
  nothing on screen saying so.

## [1.7.3-beta.4] — 2026-07-27

### Fixed
- **Switching an add-on off now actually stops the shared component it uses.** Until now those
  components started whenever they were installed, whether or not any add-on using them was
  switched on. For almost every one that made no difference — they sit idle until an add-on calls
  them. It mattered for the first one that **holds a connection open**: turning that add-on off
  left the connection listening, and nothing on screen said so. You could reasonably believe you'd
  closed it when you hadn't. Found by the add-ons author while building it.
  - Their own component was already patched; this fixes it for **every** add-on, including ones not
    written yet, so nobody has to rediscover it.
  - Database upgrades still run for everything installed, switched on or not, so turning an add-on
    back on can never meet an out-of-date layout.

## [1.7.3-beta.3] — 2026-07-27

### Changed
- **One "Create an account" form, with a Type of Person or Service account.** It was two separate
  cards; now it's one, and the fields change to suit what you're making — a person has an email, a
  service account has a name (its handle is generated for it).

### Removed
- **The "credential type" choice when creating a service account.** It offered *API key* or
  *username & password*, and the second could never be true: a service account has no password,
  no add-on can give it one, and anything that signed in that way would be a login — the one thing
  this feature exists to prevent. The credential is always issued and held by the add-on, so
  labelling the account described the add-on's plumbing and invited exactly that confusion. Its
  page still shows what matters: when it was last used, and by which add-on.

## [1.7.3-beta.2] — 2026-07-27

### Changed — a service account now tells you what it's for
The first cut created an account you couldn't sign in as and then showed you nothing about it, which
made it indistinguishable from one created by mistake and forgotten.

- **A new "How this account is used" panel** on the account: what kind of credential it's for, when
  it was **last used**, and **which add-on** used it. An account nothing has touched says so.
- **It's now explicit that the key lives in the add-on, not in JonDash** — said when you create the
  account and again on its page. JonDash never sees the key, can't show it to you and can't
  re-issue it; to see, re-issue or revoke one you go to that add-on's own settings page, and where
  we know which add-on that is, it's named.
- **Pick the credential type when creating one** — API key, username and password, or leave it. A
  note to yourself about what the account was for; nothing depends on it.
- **Disable now says what it actually does**: *"Disable — cuts off every add-on"*. That one action
  stops every add-on using this identity, because they re-check it on every request — you don't
  have to find each key.
- **Sections that don't apply are gone.** A service account has no dashboard and no sign-in, so
  Service Groups, Personal services and Reset access no longer appear on it. A person's account is
  unchanged.

## [1.7.3-beta.1] — 2026-07-26

### Added
- **Service accounts — an identity for an add-on, that nobody can ever sign in as.** Create one
  under **Users**, alongside creating a person. It can hold permissions and it shows up in the
  audit log under its own name, but it has **no password, no authenticator, no recovery codes and
  no setup link** — and none of those can be added to it later.
  - **An add-on acts as *it*, not as you.** Until now an assistant had to borrow a real person's
    account, so the audit log blamed you for what it did, and revoking the assistant meant locking
    yourself out. Those are now separate things.
  - **It cannot be turned into a login.** Resetting access, completing a setup link and signing in
    are all refused, and a sign-in attempt answers exactly like an unknown address — so nobody can
    discover a service account exists by trying.
  - **It never counts as your last administrator.** Delete every real admin and the first-run
    recovery screen still appears, so an install can't be locked away behind an account nobody can
    use.
  - **Disable or delete it in one action**, and any add-on holding a key for it drops that key.

### Changed
- **Add-ons can now check permissions outside a browser request**, which they need in order to act
  on their own rather than only while someone is clicking. No change to what anyone can do.

## [1.7.2] — 2026-07-26

**A Permissions page, and Modules and Helpers merged into one Addons section.** Consolidates
1.7.2-beta.1 and 1.7.2-beta.2 unchanged.

Permissions answers two questions on one screen: what a single addon is allowed to do, and *which
addons can do a given thing*. The second is the one that catches trouble — "what can reach my
files?" — and you couldn't work it out before without opening every addon in turn.

- **Every permission is a switch.** Turning one off takes effect immediately: the addon keeps
  working, that one capability stops answering.
- **Per addon.** Switching something off for one addon doesn't touch another using the same
  underlying capability. An addon can only ever lose permissions here, never gain ones it never
  asked for.
- **What a permission is limited to sits on the same screen as the switch** — which services,
  which folders. A limit you have to go and find is how the recent security problems happened.
  You pick entries from a browsable list rather than typing names exactly right, and a per-entry
  setting ("this one may act without asking me") sits on the entry it applies to.
- **Where an addon can be given access to everything, that's a choice, not a hidden default.**
  Turning it on reveals a second switch — "exclude JonDash's own data", starting on — covering the
  encryption key protecting your passwords and 2FA secrets, the database, and the files JonDash
  uses to ask Windows for administrator rights. Turning *that* off is the step that asks you to
  confirm, because it's the direction that gives more away.
- **Helpers are no longer a separate menu item.** They were never separately installable, so a
  second entry implied a control that didn't exist. They appear as **Shared capabilities** on the
  Addons page. The old Helpers link still works and takes you to the new place.

## [1.7.2-beta.2] — 2026-07-26

### Added
- **A choice where "allow everything" would reach JonDash's own data.** Turning the switch on now
  reveals a second one beneath it — **"exclude JonDash's own data"**, starting on. That covers the
  encryption key protecting your passwords and 2FA secrets, the database, and the files JonDash
  uses to ask Windows for administrator rights.
  - **Turning the protection OFF is the step that asks you to confirm**, not turning it on. It is
    the direction that gives more away, and that is where the friction belongs.
  - The point is that the sentence beside the switch is true whichever way it's set: JonDash isn't
    quietly excluding things you were told it would reach, nor quietly including the ones that
    matter most.

### Fixed
- **Documentation:** the helper contract's optional fields were described as "optional" without
  saying that this means optional to *omit*, never optional to *add*. Helpers compile into the
  app, so declaring a newer field on an older JonDash is a failed build, not a plainer screen.
  Adopting a contract addition is a `minAppVersion` bump, and it propagates to every module that
  uses the helper. Found and measured by the add-ons session.

## [1.7.2-beta.1] — 2026-07-26

### Added
- **A Permissions page**, answering two questions on one screen: what a single addon is allowed
  to do, and *which addons can do a given thing*. The second is the one that catches trouble —
  "what can reach my files?" — and you couldn't work it out before without opening every addon
  in turn.
  - **Every permission is a switch.** Turning one off takes effect immediately: the addon keeps
    working, that one capability stops answering.
  - **Per addon, never per capability-provider.** Switching something off for one addon doesn't
    touch another that happens to use the same underlying capability.
  - **An addon can only ever lose permissions here, never gain ones it never asked for.**
  - **Where a permission is limited to a list** — which services, which folders — that list now
    sits on the same screen as the switch. A limit you have to go and find is how the recent
    security problems happened. You pick from a browsable list rather than typing names exactly,
    and where an addon offers a per-entry setting — "this one may act without asking me each
    time" — that sits on the entry it applies to, not on another page.

### Changed
- **Modules and Helpers are now one "Addons" section.** Helpers were never separately
  installable — they arrive with an addon that needs one and go when nothing does — so a second
  menu entry implied a control that didn't exist. They appear as **Shared capabilities** on the
  Addons page, in their own list rather than mixed in with the addons you can install and remove.
  The old Helpers link still works; it takes you to the new place.

## [1.7.1] — 2026-07-26

**Groundwork.** Nothing here changes JonDash on its own — it's the foundation that lets add-ons do
things JonDash itself isn't allowed to do, like restarting a Windows service or installing
software. The add-ons that use it are being built separately.

### Added
- **Add-ons can control Windows services, with your approval given once.** Restarting a service
  needs administrator rights, which JonDash doesn't have. You approve one service at a time —
  *may JonDash restart Plex?* — and after that it can do that one thing without asking again.
  - **It really is only that one thing.** What gets saved names one service and one action, and
    can't be edited into something else afterwards.
  - **You can see and remove them yourself**, in Windows' own Task Scheduler under a `JonDash`
    folder, showing who added each one and when.
  - Nothing runs in the background waiting for orders, and nothing keeps administrator rights
    between uses. Removing a module, the add-on, or JonDash takes its permissions with it.
- **Add-ons can install software for you** — Docker, for instance. Unlike service permissions,
  this asks every single time, because what's being installed changes each time.
  - **Read the add-on's screen, not the Windows prompt.** Windows can only say that JonDash wants
    administrator rights; it can't say what's being installed. Only installing and removing a
    named package from the official Windows package source is possible.
- **Add-ons can ask you something when you remove them** — *"also remove Docker Desktop?"* —
  answered on the confirmation screen rather than guessed at. Every question says who's asking,
  above the question itself.

### Fixed
- **Add-ons that need setting up are now configured in JonDash, not through a module.** An add-on
  keeping a list of what it's allowed to do had nowhere to edit that list except inside a module —
  so the module could edit it, and could show you one thing while doing another. That list is no
  longer editable by a module.
- **An action could happen without being recorded.** If a log entry couldn't be written, it was
  quietly dropped and the action went ahead — the one thing an audit log exists to prevent.

## [1.7.1-beta.9] — 2026-07-26

### Added
- **Add-ons that need setting up now have a place in JonDash to do it** — Admin → Helpers, rather
  than through whichever module happens to use them.
  - **This closes a real hole.** An add-on that keeps an admin-approved list — say, which Windows
    services JonDash may restart — had nowhere to edit that list except inside a module. So the
    module could edit it. It could show you a button saying "Add Plex" and actually add something
    else entirely, and the Windows prompt names JonDash rather than the service, so nothing on
    screen would have shown you the difference.
  - **The list that limits what a module can do is no longer editable by a module.** It's edited
    on a JonDash admin page, and JonDash checks you're an administrator before the add-on sees
    anything.
  - Every change is recorded, including ones that are refused.

*Found by the owner; the add-on side was fixed by the add-ons session in parallel.*

## [1.7.1-beta.8] — 2026-07-26

### Fixed
- **On the uninstall screen, the name of whatever is asking now appears above the question, not
  below it.** JonDash can't control the wording a module chooses, so a module could word its
  question to look as though it came from something else — and with the real name underneath,
  you'd read the claim before the correction. You now see who's asking before you see what
  they're asking. Same information; on a screen about permissions, the order is the point.

## [1.7.1-beta.7] — 2026-07-25

### Added
- **Add-ons can now ask you something when you remove them.** Questions appear on the
  confirmation screen, so you answer while you're still there rather than the add-on guessing.
  The case it was built for: *"also remove Docker Desktop?"* when the Docker module goes —
  removing it automatically would be wrong, since it's your software and probably in use, but
  quietly leaving it behind isn't right either.
  - **Every question says who asked it.** A module's wording is its own, not JonDash's, and the
    screen makes that clear.
  - **A module can't pre-tick anything.** Boxes start unticked on a screen whose job is
    confirming something you can't undo. Add-ons that ship with JonDash may set a default; ones
    you installed may not.
  - Ten questions maximum, and text only — a module can't put formatting or links on the screen.
  - **A broken module can't make itself unremovable.** If asking fails or hangs, you get the
    uninstall without its questions rather than no uninstall at all.

## [1.7.1-beta.6] — 2026-07-25

### Added
- **Groundwork for add-ons that can install software for you** — Docker, for instance, if you
  don't already have it.
  - **This one asks every single time.** Unlike the service permissions added earlier, what's
    being installed changes each time, so there's nothing fixed to approve once.
  - **Read the add-on's screen, not the Windows prompt.** Windows can only tell you JonDash
    wants administrator rights — it cannot tell you *what* is being installed. The add-on has to
    name the package, and that's the thing worth reading.
  - Only installing and removing a **named package from the official Windows package source** is
    possible. There is deliberately no way to pass extra options to an installer, install from a
    file, or pick an older version — any of those would amount to running anything at all as an
    administrator.
  - Nothing uses it yet; the Docker add-on is being built separately.

## [1.7.1-beta.5] — 2026-07-25

### Fixed
- **The cleanup added in the previous build could not actually work.** Removing a permission
  needs your approval, and approving takes as long as it takes you to read the prompt — but the
  cleanup was cut off after five seconds. The prompt was abandoned underneath you and the
  permission survived, which is the whole thing it was meant to prevent. Add-ons that need to ask
  you something during removal now get the time to do it. Safe to wait on, because it only
  happens while you are sat there having just clicked uninstall.

  *Reported by the add-ons session, who found it could only ever succeed when there was nothing
  to clean up.*

## [1.7.1-beta.4] — 2026-07-25

### Fixed
- **The last way a permission could be left behind.** Add-ons that need special access are
  removed automatically once no module uses them — but they had no chance to tidy up first, so
  anything they'd registered with Windows could outlive them. They can now clean up on removal.
  If that cleanup fails or takes too long, the add-on is still removed and the problem is
  recorded, so nothing can get stuck half-removed.

## [1.7.1-beta.3] — 2026-07-25

### Fixed
- **Adding a permission told JonDash nothing about what it had created.** The list of new
  entries came back empty, because the part that runs with administrator rights reports to its
  own hidden window and nothing came back. It now reads the result back from Windows, which is
  the authoritative answer anyway.
  - The obvious shortcut — handing the elevated part a file to write its results into — was
    deliberately avoided. JonDash picks that location *without* administrator rights, so it
    would have amounted to writing any file anywhere as an administrator, which is precisely
    what this whole design exists to prevent.

### Verified
The feature was tested by hand for the first time, and the model holds:
- Adding a permission asks once. Using it asks nothing.
- The permission does something JonDash genuinely cannot do otherwise — stopping the service
  directly from an ordinary account is refused by Windows.
- From an ordinary account the permission **cannot be rewritten, disabled or deleted**, and no
  new one can be planted alongside it. Windows refuses all three.
- Removing everything leaves nothing behind — no entries, and the `JonDash` folder itself goes.

*Independently reproduced by the add-ons session, which reached the same result.*

## [1.7.1-beta.2] — 2026-07-25

### Fixed
- **An action could happen without being recorded.** If the log entry couldn't be written —
  most easily when it named a user account that no longer exists — the entry was quietly
  dropped and the action went ahead anyway. That's the one thing an audit log exists to
  prevent. Now the entry is always written; if we can't tell *who* asked, it's recorded as
  unattributed and says so, which is honest rather than silent. And granting a new permission
  is refused outright if it can't be recorded at all.
- **Saving the same permission twice created a duplicate**, and because removal matches by
  name, deleting one wiped both. Two differently-named entries could also end up sharing a
  single permission, so removing one silently revoked the other. Re-saving now updates the
  existing entry, and a genuine name clash is refused with an explanation instead of quietly
  creating something ambiguous.
- **A slow decision looked like a breakage.** You now get ten minutes to answer the Windows
  prompt instead of two, and taking too long is reported as "timed out" rather than "failed".

### Added
- **Using a permission is now logged, not just granting or removing one.** The moment a service
  is actually restarted appears in the audit log alongside everything else.

*All four reported by the add-ons session, which has the feature working end to end: one
approval when a service is added, then start and stop with no further prompts.*

## [1.7.1-beta.1] — 2026-07-25

### Added
- **Groundwork for letting add-ons control Windows services** (restart Plex, and so on) **without
  asking your permission every single time.** JonDash can't do that on its own — restarting a service
  needs administrator rights — so this adds a small program, `jondash-grant.exe`, that records your
  decision with Windows once.
  - **You approve once, per service.** The question asked is the one you actually care about: *may
    JonDash restart Plex?* After that it can do that one thing, and nothing else.
  - **It really is only that one thing.** What gets saved is a fixed instruction naming one service and
    one action. It can't be edited into something else afterwards, and it can't be handed different
    orders at the time it runs.
  - **You can see and remove them yourself.** Everything appears in Windows' own Task Scheduler under a
    `JonDash` folder, saying who added it and when. Deleting one there works, and so does removing it
    from JonDash. Removing a module, the add-on, or JonDash itself takes its permissions with it.
  - Nothing runs in the background waiting for orders, and nothing is left running with administrator
    rights between uses.
- **Nothing to use it yet.** The add-on that will actually use this is being built separately. This
  release only puts the foundation in place.

### Note
- Windows only. The Linux equivalent is designed but not built, because JonDash doesn't run on Linux
  yet — that's now tracked on the roadmap rather than left unsaid.

## [1.7.0] — 2026-07-25

**Make it yours.** This release is about the instance looking like *your* instance rather than like
JonDash — plus a dashboard you can rearrange by hand and a nav that works on a phone.

### Added
- **Choose how the whole interface looks.** Seven **styles**, each with its own **palettes** — twenty
  combinations in all, under Admin → Settings → Appearance. A *style* is the shape of things (corners,
  borders, shadows, glass, title bars, type); a *palette* is the colour that fills it.
  - **Modern** — soft cards and gentle shadows, in Indigo, Nord or Solarized. Follows your system's
    light/dark setting.
  - **Crystal** — frosted glass and pill-shaped controls, in Aurora or Neon.
  - **Aero** — framed glass with a highlight along the top and gradient buttons, in Sky, Twilight or Slate.
  - **XP** — a title bar on every panel, bevelled buttons and sunken fields, in Luna Blue, Olive Green or
    Silver.
  - **Terminal** — monospace throughout with hard edges, in Phosphor Green, Amber or Cyan.
  - **Brutalist** — fat black borders and hard offset shadows, in Yellow, Cyan or Mono.
  - **Paper** — ink on stock: a serif face, hairline rules and no shadows anywhere, in Newsprint, Sepia
    or Ink.
  - **Each style moves the way it should.** XP doesn't animate at all — it snaps, the way it did — and
    shows the era's marching-blocks progress bar instead of a spinner. Crystal takes its time. Terminal
    blinks a block cursor. Your system's reduced-motion setting is respected throughout.
  - **Installed modules follow the style too**, without their authors having to do anything.
- **Make it your own instance.** Change the app name, upload your own logo, and pick an accent colour.
  The name and logo appear in the header, the browser tab and its icon, and on the sign-in page. New
  authenticator enrolments use your name as well — existing entries keep working untouched.
- **Rearrange your dashboard by dragging.** Drag widgets into the order you want, or use the move buttons
  if you'd rather not drag. Sizing and position now live behind a small edit icon instead of a permanent
  panel, so the dashboard is what you see the rest of the time. Your arrangement is yours — it doesn't
  affect anyone else's.
- **A proper menu on phones and tablets.** The admin menu is now a drawer that slides out from the left,
  grouped and closing when you pick something.

### Changed
- **"Update all" now updates JonDash itself as well as your add-ons**, in that order — JonDash first,
  because add-ons can need the newer version. It previously skipped JonDash entirely.
- **A module with settings now says "Settings".** It used to say "Channel" and lead somewhere that no
  longer managed channels.

### Fixed
- **The official JonDash module source can no longer be removed.** Disabling and re-enabling it is still
  fine — but removing it left no way to install official modules at all.
- **Applying an update no longer signs everyone out.** *This affected 1.6.2.*

## [1.7.0-beta.10] — 2026-07-25

### Added
- **Aero and Paper are now styles of their own — 7 styles, 20 palettes.** Both had been offered as a
  *colour* of another style, but neither was really a colour: Aero was changing the corner radius, the
  blur and the typeface, and Paper the shadows and radius. As proper styles they get to be themselves.
  **Aero** now frames every panel the way Windows 7 did, with a highlight along the top and gradient
  buttons, in **Sky**, **Twilight** or **Slate**. **Paper** is ink on stock — a serif face, hairline
  rules and no shadows anywhere — in **Newsprint**, **Sepia** or **Ink**.
- **If you were using either, you'll simply keep using it.** Your setting moves with the style rather
  than falling back to something you didn't choose.

### Changed
- Crystal now offers Aurora and Neon; Modern offers Indigo, Nord and Solarized.

## [1.7.0-beta.9] — 2026-07-25

### Added
- **Styles now have a colour choice: 5 styles, 16 palettes.** Several of the styles turned out to be the
  same shape in different colours, so the two are now separate choices. A **style** is the structure —
  corners, borders, shadows, glass, title bars, type. A **palette** is the colour that fills it. Pick
  Modern and then Indigo, Nord, Solarized or Paper; pick XP and then Luna Blue, Olive Green or Silver.
  Crystal offers Aurora, Neon and Aero; Terminal offers Phosphor Green, Amber and Cyan; Brutalist offers
  Yellow, Cyan and Mono. The picker is now two levels — compact style tiles grouped by family, then that
  style's palettes.
- **Each style now moves the way it should.** How the interface animates is part of a style, not a fixed
  behaviour. **XP no longer transitions at all** — it snaps between states the way it actually did, and
  its "working" indicator is the era's marching-blocks progress bar rather than a spinner. Crystal is
  slower and eases, because glass should feel unhurried. Terminal doesn't move and blinks a block cursor.
  Brutalist jumps in visible steps. Everything respects your system's reduced-motion setting, though the
  busy indicator keeps turning — a frozen one looks like a crash.

### Changed
- **Appearance is now its own settings section, separate from Branding.** Branding is who the instance is
  (its name and logo); Appearance is how it's drawn. They were confusing together, and a style isn't
  branding.

### Fixed
- **The official JonDash module source can no longer be removed.** Disabling and re-enabling it is still
  fine — but removing it left no way to install official modules, and the control was only hidden in the
  UI rather than actually prevented.

## [1.7.0-beta.8] — 2026-07-25

### Changed
- **Accent colour is now a Modern-style option, shown under the style you've chosen.** It only ever
  affected Modern — XP and Crystal carry their own palettes as part of their look — but it was offered as
  a general setting, so on those styles it silently did nothing. Each style now has its own settings
  block; Modern's holds the accent, and XP and Crystal say plainly that they have no options of their own.
- **Every colour in the app now comes from the style.** A sweep found status colours (update criticality,
  warnings, the success tick, danger text) hardcoded in a dozen places where no style could reach them.
  All 15 pages were then checked under XP with nothing left painted in the old palette.

### Fixed
- **A module with a settings panel but no settings list showed a button labelled "Channel"** — pointing at
  a page that no longer manages channels, and giving no obvious way into its settings. It now reads
  **Settings** whenever a module has any, and **Manage** otherwise. *Reported by the add-ons session;
  affected Backup Manager on stable.*

## [1.7.0-beta.7] — 2026-07-25

### Fixed
- **Updating no longer signs you out.** Applying an update looked fine, then logged everyone out the
  moment you moved to a page you hadn't opened yet. JonDash decides "does this restart keep people signed
  in?" as it starts — but that decision was being re-made later, by which time the marker saying *this was
  a deliberate restart* had already been tidied away, so it concluded nobody should stay signed in. The
  decision is now made once per start and everything else follows it. **This affected 1.6.2 onwards.**

### Changed
- **Your branding now shows on the sign-in page.** It was still showing "JonDash" and the default mark to
  anyone signing in — the one screen where a renamed instance most needs to look like itself. Your name,
  logo and accent colour all appear there now.

## [1.7.0-beta.6] — 2026-07-25

**Choose how JonDash looks.** The interface now comes in styles, and you pick one.

### Added
- **Interface styles.** *Admin → Settings → Branding* offers:
  - **Modern** — the standard look; follows your system light/dark setting.
  - **XP** — bevelled buttons, tan panels, a bright blue desktop and Tahoma. One committed look, so it
    ignores dark mode on purpose.
  - **Crystal** — translucent frosted-glass panels over a soft gradient; follows light/dark.
  More will follow. Your accent colour and logo carry across every style — the style is the chrome, your
  branding sits on top of it.
- **Installed modules are restyled along with everything else**, without their authors doing anything: a
  style only redefines the shared design tokens, never one page or one component.

### Notes
- Styles are documented in `docs/STYLES.md`, including the rules every style must follow — no layout
  changes, no shrinking of tap targets, a visible keyboard focus ring, and a contrast floor.

## [1.7.0-beta.5] — 2026-07-25

**UI rework — phase 4: your own logo, and a more legible interface.**

### Added
- **Upload your own logo.** *Admin → Settings → Branding* takes a PNG, JPEG, WebP or GIF (up to 2 MB); it
  replaces the square lettermark in every header and is used as the browser-tab icon. Remove it and the
  lettermark comes back. Images are resized and re-saved as PNGs, so nothing hidden inside a file is kept.

### Changed
- **Keyboard focus is visible again.** Buttons, links and inputs now show a clear focus ring when you tab
  to them — previously the custom styling left almost no indication of where you were.
- **Buttons carry a subtle shadow in your accent colour** rather than a fixed one, so a rebranded instance
  looks deliberate rather than tinted with leftovers.

### Fixed
- **Changing the logo took effect immediately instead of up to 30 seconds later.** Settings are cached per
  request-handler, and the cache the upload cleared wasn't the one the image was served from, so a new
  logo could 404 or serve the old image for a while.

## [1.7.0-beta.4] — 2026-07-25

**"Update all" now updates JonDash as well as your add-ons.**

### Fixed
- **"Update all" used to skip JonDash itself** and update only modules and helpers — so the one button
  that reads like "update everything" left the app on its old version.

### Changed
- **One button now runs the whole thing, in the right order: JonDash → add-ons → done.** JonDash updates
  and restarts first, then your modules and helpers are updated after it comes back. That order matters:
  a new module version often needs the newer JonDash, never the other way round.
- **You can see it happen.** After JonDash restarts you get *"JonDash is updated — updating your add-ons
  next"*, then the finished screen once they're done. Stay on the page and it runs to the end by itself.
- **If the add-ons can't be updated, it says so and stops** — naming the reason, confirming JonDash itself
  is fine, and pointing at Admin → Updates. It won't retry in a loop.
- You can also tick JonDash and add-ons together in the list now; they used to be mutually exclusive.

## [1.7.0-beta.3] — 2026-07-25

**UI rework — phase 3: arrange your dashboard by dragging.**

### Changed
- **Drag module widgets where you want them.** Grab a widget by the grip in its corner and drop it
  anywhere in the grid — it moves as you drop and the new arrangement is remembered for you alone.
- **The "Customise" link is now a small edit (pencil) icon.** Width, height, position and *Reset to
  default* moved inside it, so the dashboard stays clean until you actually want to change something.
  Both the grip and the pencil stay out of sight until you hover over a widget.
- **You can still move widgets without dragging.** The edit popover keeps the ← → position buttons, which
  work with a keyboard and on touch, where dragging doesn't.

## [1.7.0-beta.2] — 2026-07-25

**UI rework — phase 2: make it yours.** You can now rename the app and set your own accent colour.

### Added
- **Rename the app.** *Admin → Settings → Branding* sets the name shown in the header and the browser
  tab, and the square mark takes its first letter. New authenticator enrolments use the new name too —
  **entries already in your authenticator keep the old name and keep working**, because the underlying
  secret never changes.
- **Set your own accent colour.** A hex colour of your choice replaces the default purple on buttons,
  links and highlights, in both light and dark mode. Text on the accent automatically switches between
  black and white so it stays readable whatever colour you pick. Leave it blank for the default.

### Changed
- **Section headings in the Settings navigation are clearer.** *Server settings* and *Security* now sit on
  a divider and are smaller, bolder and wider-spaced, so they read as headings rather than as options you
  can tap — on both the mobile slide-out and the desktop sidebar.

## [1.7.0-beta.1] — 2026-07-25

**UI rework — phase 1 of several.** The look and layout are being refreshed in stages; nothing about your
services or data changes. This first beta is the mobile admin navigation.

### Changed
- **Mobile admin navigation is now a slide-out menu.** On a phone, the admin **Menu** dropdown is replaced
  by a **hamburger** button that slides the full Settings navigation out from the left — grouped exactly
  like the desktop sidebar. Pick a section and it navigates and closes itself; tap outside or the ✕ to
  dismiss. The desktop sidebar is unchanged.

## [1.6.2] — 2026-07-25

**Security hardening, plus restarts that no longer sign you out.** Everything since 1.6.0, in one release.
Most of this is behind-the-scenes; nothing changes in how you use JonDash day to day.

### Changed — restarts keep you signed in
- **An intentional restart keeps everyone signed in.** Restarting from Admin → Server, and the automatic
  restart after a **module is installed, updated or removed**, now bring you straight back into the
  dashboard still signed in — the same as an update already did. Each shows the familiar full-screen
  "please wait" page while the server comes back, then drops you back where you were.
- **Shutting down is the exception, by design.** A shutdown still signs everyone out: it's the one
  deliberate stop that isn't a quick restart, so the next start asks everyone to sign in again.
- **A crash, or moving the install to another machine, still signs everyone out** — those are exactly the
  cases where ending every session is the safe thing to do.
- The wording on the restart, module-change and network-settings screens now says you stay signed in,
  rather than warning you'll be signed out.

### Changed — security hardening
These close weaknesses found in an independent security review. Access control itself was tested and found
sound: the sign-in page could not be bypassed.
- **Signing in no longer reveals which email addresses have an account.** An unrecognised address used to
  fail noticeably faster than a wrong password, and a locked account announced itself by name — together
  that let someone test whether an address was registered here. Every failed sign-in now does the same
  amount of work and gives the same message. *Side effect worth knowing:* if your account is temporarily
  locked after repeated wrong passwords, the page now just says the sign-in failed rather than explaining
  the lock. A notification for the account holder is coming separately.
- **Updated Next.js and its bundled libraries**, clearing three high-severity advisories in image
  handling and CSS processing. `npm audit` now reports no vulnerabilities.
- **The front page is never cached.** It could previously be served from a copy made at build time, so it
  reflected whoever the app knew about then rather than right now.
- **A six-digit authenticator code can now only be used once.** Codes stay valid for up to a minute or so,
  and during that time the same code could sign you in more than once. Each code is now retired the moment
  it's accepted — at sign-in, at step-up, during first-run setup, when finishing an invite, when
  regenerating recovery codes, and when moving to a new authenticator app.
- **Sessions now sign out after 2 hours of inactivity.** This previously shipped switched off, so a
  session lasted its full 7-day life no matter how long it sat untouched. **This applies to existing
  installs too**, not only new ones — if you'd rather keep the old behaviour, set *Idle timeout* to 0 under
  Admin → Settings → Sessions.
- **JonDash no longer advertises which framework it runs on** in every response.

## [1.6.0] — 2026-07-24

**A friendlier update and account experience.** Coming from 1.5.4, this is the 1.6.0 beta line in one.
Nothing about your services or data changes.

### Changed
- **The "updates available" notice is a single compact banner.** One line, coloured by how important the
  most urgent update is — green, amber or red — reading e.g. *"You have 3 updates available ·
  Recommended"*. It counts JonDash, modules and helpers together, and clicking it opens the Updates page,
  where all the detail and controls live. The old large box with the release notes is gone.
- **The account controls are now one small menu.** Every header shows an account icon instead of separate
  Account / email / Sign out buttons; it opens to **My account** and **Sign out**, with your email inside.
  Much tidier on a phone, and you can now reach your account from the admin area too. Signing out asks you
  to confirm first, so a stray tap can't do it.
- **An update keeps you signed in.** After JonDash updates itself it reconnects to an **"Update
  successful"** screen with your session intact, instead of sending you back to the sign-in page. A restart
  — or moving the install to another machine — still signs everyone out, exactly as before.
- **The updating / restarting screen reconnects as soon as the server is back**, rather than waiting longer
  than it needs to.

### Added
- Helper updates are now included in the "updates available" total, alongside JonDash and modules.

## [1.6.0-beta.1] — 2026-07-24

A friendlier update and account experience. Nothing about your services or data changes.

### Changed
- **The "updates available" notice is a single compact banner.** One line, coloured by how important
  the most urgent update is — green, amber or red — reading e.g. *"You have 3 updates available ·
  Recommended"*. It counts JonDash, modules and helpers together, and clicking it opens the Updates page,
  where all the detail and controls live. The old large box with the release notes is gone.
- **The account controls are now one small menu.** Every header shows an account icon instead of separate
  Account / email / Sign out buttons; it opens to **My account** and **Sign out**, with your email inside.
  Much tidier on a phone, and you can now reach your account from the admin area too. Signing out asks you
  to confirm first, so a stray tap can't do it.
- **An update keeps you signed in.** After JonDash updates itself it reconnects to an **"Update
  successful"** screen with your session intact, instead of sending you back to the sign-in page. A restart
  — or moving the install to another machine — still signs everyone out, exactly as before.
- **The updating / restarting screen reconnects as soon as the server is back**, rather than waiting longer
  than it needs to.

### Added
- Helper updates are now included in the "updates available" total, alongside JonDash and modules.

## [1.5.4] — 2026-07-24

**Module-system reliability fixes.** Coming from 1.5.3, this is the whole 1.5.4 beta line in one.
Everything here is about installing, building and testing add-ons — nothing changes for the base app or
your services.

### Fixed
- **A module's own styling no longer comes out half-applied.** Tailwind doesn't scan the folders installed
  modules and helpers live in, so any layout class a module used that the base app didn't *also* use was
  never generated — a module's stat grid, for one, collapsed to fewer columns than intended. A module's
  classes are now generated.
- **A module database migration that fails part-way can recover.** Each migration file runs as a single
  transaction, so a failed statement rolls back the whole file and the next attempt starts clean instead of
  wedging on a half-applied change.
- **A commented-out example in a module is no longer read as a real declaration.** A `// helpers: [...]` or
  `// permissions: [...]` line left as a worked example won't install a helper, roll the module back, or
  overstate what you're asked to approve.
- **A finished module install can't later cause a healthy module to be removed.** The "install in progress"
  marker is cleared once the app is running again, so an unrelated later build failure can't act on a stale
  one.

### Added (for module authors)
- **A supported way to test a module against a database** — `npm run test:modules` runs tests under
  `modules/…/tests` and `helpers/…/tests` against a throwaway migrated database, and works from a downloaded
  release as well as a `git clone`.

## [1.5.4-beta.2] — 2026-07-24

### Fixed
- **`npm run test:modules` failed on a downloaded release** — a follow-up to the BUG-33 fix in beta.1. The
  module-test config ships in the download, but its `globalSetup` and `server-only` stub lived under
  `tests/`, which is deliberately excluded from the archive to keep it lean — so a module author testing
  against a downloaded release hit a missing-file error. Those two files moved to `test-support/` (which
  ships); a `git clone` was unaffected either way. Nothing about installing or running modules changes.

## [1.5.4-beta.1] — 2026-07-24

Five fixes, all in the module system — installing, building and testing add-ons. Nothing changes
unless you install or build modules.

### Fixed
- **A module's own styling could come out half-applied.** Tailwind doesn't scan the folders installed
  modules and helpers live in, so any layout class a module used that the base app didn't *also* use was
  never generated — health monitoring's stat row, for one, collapsed from five columns to two. A
  module's classes are now generated. (BUG-40)
- **A module database migration that failed part-way could never recover.** Each migration file now runs
  as a single transaction, so a statement failing rolls back the whole file and the next attempt starts
  clean — instead of wedging on a half-applied change that could only be undone by hand. (BUG-32)
- **A commented-out example in a module could be read as a real declaration.** A `// helpers: [...]` or
  `// permissions: [...]` line left as a worked example is no longer treated as a dependency or a granted
  capability — which could otherwise have installed a helper, rolled the module back at install, or
  overstated what you were asked to approve. (BUG-39)
- **A finished module install could later cause a healthy module to be removed.** The "install in
  progress" marker is now cleared once the app is running again; before, it lingered indefinitely, and an
  unrelated later build failure could hand recovery that stale name and remove the wrong module. (BUG-36)

### Added
- **A supported way for a module's own tests to reach a database.** Tests under `modules/…/tests` (and
  `helpers/…/tests`) run against a throwaway, migrated database with `npm run test:modules` — the data
  layer is usually the interesting part of a module, and there was no supported way to test it. (BUG-33)

## [1.5.3] — 2026-07-24

**One page for everything that updates — and updates that can finally run on their own.** Coming from
1.5.2, this is the whole 1.5.3 beta line in one. Nothing changes about how your dashboard or your
services work.

### Added
- **Automatic updates that actually run.** Turn them on and JonDash keeps itself, your modules and their
  helpers current on a schedule you choose (daily, weekly or monthly, at a set time). It's **off by
  default** — and whatever the schedule says, an update is never applied on its own when it asks for more
  access than you approved, would move a version backwards, or would stop another module working. Those
  wait for you, and the run records what it held back and why.
- **Admin → Updates is now the single page for everything that updates**, in four sections in the order
  you work through them: the version you're running; **Available updates** — one list grouped Core, then
  Modules, then Helpers, with a checkbox per item showing the name, the version you have and the one on
  offer, and how important it is when the source says so (tick what you want, or update all);
  **Automatic updates** — the master switch, when it runs, and anything you've excluded; and **Beta
  channels** — a switch each for JonDash, every module and every helper.
- **Portable, fully-encrypted backups.** A backup can now be a single encrypted `.dashbk` file that also
  carries your service icons and any installed module's own data, so a restore or a move to another
  machine brings the whole instance back.

### Fixed
- **Automatic updates did nothing before.** The per-module "update automatically" tick from 1.5.2 saved
  your choice and never acted on it; that path now genuinely applies updates, and a run that has to hold
  something back says so.
- **A downgrade is never offered as an update.**
- **Encrypted backups no longer expose service icons** outside the encryption, and an unreadable network
  configuration no longer quietly falls back to the default port.
- **Background and scheduled work is now in the audit log**, marked **System**, so nothing happens
  unattributed.
- **A run of Updates-page fixes from testing:** stale copies of a module's channel and auto-update state
  removed from its own page, the beta switches for helpers now work, channel changes refresh immediately
  instead of looking dead for a few minutes, and a helper that's been removed no longer lingers on the
  page.
- **Mail relays that authorise by IP** (no username or password) are now supported.

### Notes
- The manual update path and every existing page behave exactly as before; only the new
  automatic/scheduled path is added, and it stays off until you turn it on.

## [1.5.3-beta.17] — 2026-07-23

### Fixed
- **A removed helper still appeared under Updates.** Uninstalling the last module that needed a
  helper removes that helper, but JonDash keeps a record of it so reinstalling the module brings
  its data back rather than starting from nothing. The Updates page was reading that record and
  still listing the helper — with a working beta switch, and able to offer it updates — while the
  Helpers page correctly showed it as gone. Updates now goes by what is actually installed.

## [1.5.3-beta.16] — 2026-07-23

### Fixed
- **The beta switches for helpers looked dead.** They were writing the change correctly, but the
  page kept showing the old value for up to three minutes, so clicking appeared to do nothing.
  Now updates immediately.
- **The same fault in two more places, neither reported.** Switching **JonDash's own** channel, or a
  **module's**, also left the page showing the pre-change answer for up to three minutes. Both fixed.
- **Updating JonDash showed no "updating" screen.** The full-screen cover had been lost, so the page
  never reloaded onto the new version — it sat there looking hung while the update had actually
  finished. The cover is back, and a dropped connection mid-update is treated as expected rather than
  an error.

## [1.5.3-beta.15] — 2026-07-23

### Fixed
- **The beta switches for helpers did nothing.** A helper normally follows the modules that need it,
  so one sitting on beta *only because a module is* couldn't be switched off: the switch cleared the
  override, the channel was worked out again from the module still on beta, and it landed back where
  it started — redrawing in the same position with nothing changed.
  The switch now sets the channel you asked for, and only returns a helper to following its modules
  when you ask for the channel it would have chosen anyway.
- **Rows now say when a helper is pinned** and no longer following the modules that need it.

## [1.5.3-beta.14] — 2026-07-23

### Fixed
- **A module's settings page no longer shows its release channel and automatic-update state.**
  Those controls moved to Admin → Updates a few releases ago, leaving this page displaying copies it
  couldn't change — and the copies could fall out of step, so a module could read *"Currently on
  beta"* while the switch for it on the Updates page was off. The page now carries one line pointing
  at Admin → Updates, which can't disagree with anything.
- **Changing a module's channel now refreshes the Updates page.** It was the only setting of its kind
  that didn't.

## [1.5.3-beta.13] — 2026-07-23

### Changed
- **Tidied up the Updates page.** Several things had ended up in two places at once — most
  obviously **two separate cards both titled "Automatic updates"**, and an "Automatically install
  updates when available" tickbox doing the same job as the Automatic updates switch.
- **The page is now four sections, in the order you'd work through them:** which version you're
  running · what's available to update · whether it should update itself · which beta channels
  you're on.
- **The schedule now sits inside Automatic updates**, and only appears once the switch is on — it
  means nothing while it's off.
- **Checking for updates and installing them happen in one place**, rather than a "Check for
  updates" button at the top and a separate list below.

## [1.5.3-beta.12] — 2026-07-23

### Changed
- **One list of everything you can update.** The separate Modules and Helpers update panels are
  replaced by a single **Available updates** list, grouped **Core**, then **Modules**, then
  **Helpers**. Each row has a checkbox and shows the name, the version you have and the one on
  offer, and how important the release is *when the source says so*. JonDash's own releases carry
  that; module and helper manifests don't yet, so nothing is shown for them rather than a made-up
  default.
- **Tick what you want and press Update selected** — or leave everything unticked and press
  **Update all**.
- **JonDash's own update is applied on its own.** It restarts through the launcher rather than
  in-process, so running it in the same click as modules and helpers could leave an update half
  applied. Selecting Core clears any add-on selection, and the page says why.

## [1.5.3-beta.11] — 2026-07-23

### Changed
- **Automatic updates are now one switch with exclusions.** Turn **Automatic updates** on and
  JonDash, your modules and their helpers all stay current on your schedule; each then gets its own
  switch to exclude it. This replaces the per-item opt-in from beta.5.
  It is **off by default**, and worth understanding before turning it on: with it on, a module from
  **any** source you have added updates itself unless you exclude it.
- **A helper excluded from automatic updates is still updated when a module that needs it updates.**
  Excluding a helper opts it out of being updated for its own sake, not out of being a working
  dependency — a module updated against a helper it can't use is simply broken.

Unchanged: an update that asks for more access than you approved, is blocked, goes backwards, or
would stop another module working still waits for you, whatever the switches say.

## [1.5.3-beta.10] — 2026-07-23

### Changed
- **The Helpers page is about the helper, not its updates.** The version line, beta-channel note
  and "Pin to stable" button have moved to the **Beta channels** panel on Admin → Updates, which
  already lists every helper alongside JonDash and your modules. The page keeps what it is for:
  what each helper does, which modules use it, and what permission it implies — plus a **Settings**
  area reserved for helpers that offer settings. None do yet.

## [1.5.3-beta.9] — 2026-07-23

### Fixed
- **The Updates page no longer offers to move you backwards.** A module or helper whose channel
  offered an *older* version than the one installed was listed as an available update, with a
  tick-box beside it — so one click could take you back to an earlier release. Anything older is
  now simply not offered.
  This shows up on the **beta** channel after a pre-release is promoted: `0.0.5-beta.1` counts as
  older than `0.0.5`, so once that beta becomes the stable `0.0.5`, the beta channel points at
  something older than what you are running until it is moved forward.

## [1.5.3-beta.8] — 2026-07-23

### Changed
- **Removed the duplicate update-channel dropdown.** JonDash's channel now has a switch in the
  **Beta channels** panel alongside every module and helper, so the separate selector at the top of
  the Updates page was a second control for the same setting. The panel above still shows your
  installed version, update status and the automatic-install option, and now states which channel
  you are on with a pointer to the switch.

## [1.5.3-beta.7] — 2026-07-23

**Beta: every beta-channel choice in one place.**

### Added
- **A "Beta channels" section on Admin → Updates.** Lists JonDash itself and every installed
  module and helper, each with a switch to opt in or out of pre-release versions. Collapsed when
  everything is on stable; when it isn't, it says how many things are on beta — so "what am I
  running pre-release code for?" is answerable from one screen.

### Changed
- **The per-module channel control has been removed from each module's own page.** That page now
  states which channel the module is on and links to Updates. Previously the app's channel, each
  module's and each helper's lived in three different places.
- **A helper's switch pins it.** A helper normally follows the highest channel among the modules
  that need it; turning its switch off returns it to following, rather than forcing it to stable
  and fighting the module that moved it.

## [1.5.3-beta.6] — 2026-07-23

**Beta: an encrypted backup is now encrypted all the way through.**

### Fixed
- **An "encrypted" backup left every icon readable in the clear.** Only the settings inside were
  protected; each uploaded icon sat in the file as a plain image anyone could open without the
  passphrase — for most people, a list of the services they run. These are the files people put on
  cloud drives and USB sticks *because* they are encrypted. Everything is now inside the
  encryption. **Existing encrypted backups were affected — replace any you are relying on.** They
  still restore.
- **A network settings file JonDash can't read no longer silently starts it on plain HTTP.** It
  fell back to port 3000 with no warning anywhere, which on an install set up for HTTPS meant
  quietly serving unencrypted. It now says what is wrong and stops. A file saved with a UTF-8 BOM
  — the usual cause — is now read normally instead of being rejected.

### Added
- **Backups include your module data** — each module's configuration, stored records and dashboard
  layout. Restoring no longer leaves modules installed but empty. A module's own database tables
  are not included; they belong to the module version installed at restore time.
- **The download is a `.dashbk` file** rather than a `.zip`. Older `.zip` backups still restore.

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

## [1.1.5] — 2026-07-19

**Withdrawn — superseded by 1.1.6. Don't run this version.**

### Changed
- Attempted a fully self-contained (standalone) build to shrink the install further. It failed at
  runtime — the image (`sharp`) and password (`argon2`) native libraries wouldn't load, breaking
  sign-in and the two-factor pages — and was reverted the same day in 1.1.6.

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

[1.5.3-beta.17]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.17
[1.5.3-beta.16]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.16
[1.5.3-beta.15]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.15
[1.5.3-beta.14]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.14
[1.5.3-beta.13]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.13
[1.5.3-beta.12]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.12
[1.5.3-beta.11]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.11
[1.5.3-beta.10]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.10
[1.5.3-beta.9]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.9
[1.5.3-beta.8]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.8
[1.5.3-beta.7]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.7
[1.5.3-beta.6]: https://github.com/jontiadcock/JonDash/releases/tag/v1.5.3-beta.6
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
