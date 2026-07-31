import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encryptString, decryptString } from "@/lib/crypto";

/*
 * Typed configuration store, global scope. Each key carries a zod schema, a default and UI
 * metadata; anything marked `secret` is encrypted at rest.
 * ⚠ NOT cached — see the note above `clearSettingsCache`, which explains why one cannot work here.
 * REFS lib/user-prefs.ts — the same table's `user` scope, deliberately not routed through here
 */

type FieldKind = "string" | "int";

// Which admin page a setting is surfaced on. REFS settingKeysByGroup() below — how each page
// restricts what its own form may write.
export type SettingGroup =
  | "general"
  | "sessions"
  | "audit"
  | "updates"
  | "branding"
  /**
   * Surfaced on Admin → Network & HTTPS. ⚠ That page writes TWO stores — this table, and
   * `.data/network.json` for the ports and certificates. Do not assume a control there is a
   * Setting. REFS app/admin/network/public-address.tsx · actions.ts · lib/tls/network-config.mjs
   */
  | "network";

type SettingDef<T> = {
  label: string;
  help: string;
  kind: FieldKind;
  default: T;
  schema: z.ZodType<T>;
  secret?: boolean;
  group: SettingGroup;
  /** Kept out of the generic settings form — it has a purpose-built control instead. */
  hidden?: boolean;
};

// Registry of global settings.
/** ⚠ The registry IS the validation. A key absent here cannot be written at all — see
 *  `writeSetting`. REFS app/admin/settings/ui.tsx  PINS tests/unit/settings-audit.test.ts */
export const SETTINGS = {
  "login.message": {
    label: "Sign-in page message",
    help: "Optional text shown on the login page (e.g. a notice). Leave blank for none.",
    kind: "string",
    default: "",
    schema: z.string().max(280),
    group: "general",
  } as SettingDef<string>,

  // Rebranding (CORE-06). Instance-wide, admin-set; the defaults keep a fresh
  // install recognisably JonDash until changed.
  "branding.appName": {
    label: "App name",
    help: "Shown in the header, the browser tab, and new authenticator enrolments. Existing authenticator entries keep the old name.",
    kind: "string",
    default: "JonDash",
    schema: z.string().trim().min(1, "Enter a name.").max(40),
    group: "branding",
  } as SettingDef<string>,

  // ⚠ The enum below must stay in step with `lib/styles.ts › STYLES` and `app/styles.css`, or a
  // style is selectable with no CSS behind it. Hidden here — it has a visual picker.
  "branding.style": {
    label: "Interface style",
    help: "How the interface is drawn.",
    kind: "string",
    default: "default",
    // Structure only; the colour is `branding.palette` below. REFS lib/styles.ts › STYLES
    schema: z.enum(["default", "crystal", "aero", "xp", "terminal", "brutalist", "paper"]),
    group: "branding",
    hidden: true,
  } as SettingDef<string>,

  /*
   * ⚠ Stored loosely on purpose: a palette id only means something inside its style, so the PAIRING
   * is validated at write time and normalised on read.
   * REFS lib/styles.ts › resolveStylePair() — the choke point making a stale pairing harmless
   */
  "branding.palette": {
    label: "Palette",
    help: "Colour scheme within the chosen style.",
    kind: "string",
    default: "",
    schema: z.string().max(24),
    group: "branding",
    hidden: true,
  } as SettingDef<string>,

  // ⚠ A filename, never a path and never user-supplied text — written by the upload action after
  // the image is re-encoded. REFS lib/security/upload.ts · lib/icons.ts › saveIconPng()
  "branding.logo": {
    label: "Logo",
    help: "Uploaded logo filename.",
    kind: "string",
    default: "",
    schema: z.string().regex(/^$|^[a-f0-9]{32}\.png$/),
    group: "branding",
    hidden: true,
  } as SettingDef<string>,

  // ⚠ STYLE-SPECIFIC (CORE-07): only Modern uses it, and a style's own `--primary` outranks it on
  // specificity anyway. REFS STYLE_SETTINGS below — the list that decides where it is offered
  "branding.accent": {
    label: "Accent colour",
    help: "A hex colour like #4f46e5 for buttons and highlights, or blank for the default. Used in both light and dark mode.",
    kind: "string",
    default: "",
    schema: z
      .string()
      .trim()
      .regex(/^$|^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour like #4f46e5, or leave blank."),
    group: "branding",
    hidden: true, // shown under its style, not in the general branding form
  } as SettingDef<string>,

  /**
   * The address this JonDash is reached at from outside, for links in EMAIL. ⚠ Never derived from
   * the request: `x-forwarded-host` is client-controlled and unvalidated (BUG-41), and in an email
   * a forged one puts an attacker's link, branded as JonDash, into a trusted inbox. Blank means
   * links are omitted. REFS lib/app-url.ts — why guessing must not happen
   */
  "app.publicUrl": {
    label: "Public address",
    help: "Where people reach this JonDash from outside — e.g. https://dash.example.com. Used for links in email. Leave blank and emails simply won't include buttons, which is safer than guessing.",
    kind: "string",
    default: "",
    schema: z
      .string()
      .trim()
      .regex(/^$|^https?:\/\/[^\s/]+\/?$/, "Use a full address like https://dash.example.com, with no path."),
    /*
     * On **Network & HTTPS**, not General (owner, 2026-07-30).
     *
     * It is the same question as the rest of that page — how is this install reached from outside —
     * and it sat under General next to the app name and the sign-in message, which is where you
     * look for appearance, not addressing. Its value also has to agree with the ports and
     * certificate configured a few inches above it, and that is much easier to get right when they
     * are on one screen.
     */
    group: "network",
  } as SettingDef<string>,

  /**
   * How long you stay signed in WITHOUT using JonDash — the one session control.
   *
   * It replaced an absolute lifetime and a switchable idle timeout, which overlapped: turning the
   * idle timeout off silently made the lifetime the only thing ending a session.
   *
   * ⚠ The absolute cap is NOT gone — it survives as `SESSION_ABSOLUTE_CAP_DAYS`, which is what
   * stops a stolen token being kept alive indefinitely by simply continuing to use it.
   * ⚠ Hidden here: the Sessions page renders a purpose-built picker, because one minutes box
   * expressing both "2 hours" and "30 days" is a bad control.
   * REFS app/admin/sessions/session-length-form.tsx · getSessionLengthMs() below
   */
  "session.lengthMinutes": {
    label: "Session length",
    help: "How long you stay signed in without using JonDash.",
    kind: "int",
    default: 120,
    schema: z.coerce.number().int().min(5).max(525600), // 5 minutes … 365 days
    group: "sessions",
    hidden: true,
  } as SettingDef<number>,

  /**
   * ⚠ LEGACY, superseded by `session.lengthMinutes`. Kept rather than deleted because existing
   * installs have rows for it and the migration that derives the new value reads them. Nothing
   * else consults it. REFS prisma/migrations/20260727230000_session_length
   */
  "session.lifetimeDays": {
    label: "Session lifetime (days) — replaced by Session length",
    help: "Legacy. Superseded by Session length; kept so an existing value can be migrated.",
    kind: "int",
    default: 7,
    schema: z.coerce.number().int().min(1).max(365),
    group: "sessions",
    hidden: true,
  } as SettingDef<number>,

  /** LEGACY, superseded by `session.lengthMinutes` (1.8.0). See the note there. */
  "session.idleTimeoutMinutes": {
    hidden: true,
    label: "Idle timeout (minutes) — replaced by Session length",
    // ⚠ Help text names the other setting rather than quoting its default — the old wording
    // said "its full 7-day lifetime", which read as a fact while being a stale default.
    help: "Sign out sessions inactive for this long. Defaults to 120 (2 hours). Set 0 to disable — but then an untouched session survives for the whole of Session lifetime above, however long it sits unused.",
    kind: "int",
    // Non-zero by default: with 0 an untouched session survived the whole absolute lifetime, and
    // a restart was the only thing reliably ending it. 0 stays available as an explicit opt-out.
    default: 120,
    schema: z.coerce
      .number()
      .int()
      .min(0)
      .max(43200)
      .refine((v) => v === 0 || v >= 5, "Use 0 to disable, or 5 minutes or more."),
    group: "sessions",
  } as SettingDef<number>,

  "audit.retentionDays": {
    label: "Audit log retention (days)",
    help: "Automatically delete audit events older than this. 0 keeps them forever.",
    kind: "int",
    default: 90,
    schema: z.coerce.number().int().min(0).max(3650),
    group: "audit",
  } as SettingDef<number>,

  /*
   * ⚠ The master switch, off by default: turning it on gives every source you have added a standing
   * channel to run new code here, so it must be a deliberate act.
   * REFS lib/updates/schedule.ts — reads this and the four keys below as one schedule
   */
  "updates.autoEnabled": {
    label: "Update automatically",
    help: "Keep JonDash, your modules and their helpers up to date on the schedule below. You can exclude individual ones.",
    kind: "int",
    default: 0,
    schema: z.coerce.number().int().min(0).max(1),
    group: "updates",
  } as SettingDef<number>,

  "updates.frequency": {
    label: "Check for updates",
    help: "How often to look for updates to anything you've opted in to automatic updates for.",
    kind: "string",
    default: "weekly",
    schema: z.enum(["daily", "weekly", "monthly"]),
    group: "updates",
  } as SettingDef<string>,

  "updates.timeOfDay": {
    label: "At what time",
    help: "24-hour local time, e.g. 03:00. Pick a quiet hour — applying an update restarts the dashboard and signs everyone out.",
    kind: "string",
    default: "03:00",
    schema: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use HH:MM, e.g. 03:00."),
    group: "updates",
  } as SettingDef<string>,

  "updates.dayOfWeek": {
    label: "Day of the week",
    help: "Used when checking weekly. 0 = Sunday through 6 = Saturday.",
    kind: "int",
    default: 0,
    schema: z.coerce.number().int().min(0).max(6),
    group: "updates",
  } as SettingDef<number>,

  // ⚠ Capped at 28: 29–31 would silently skip February, and a schedule that quietly does nothing
  // for a month is worse than one running slightly early. REFS lib/updates/schedule.ts
  "updates.dayOfMonth": {
    label: "Day of the month",
    help: "Used when checking monthly. 1–28, so it never skips a short month.",
    kind: "int",
    default: 1,
    schema: z.coerce.number().int().min(1).max(28),
    group: "updates",
  } as SettingDef<number>,
} as const;

export type SettingKey = keyof typeof SETTINGS;

/**
 * ⚠ DO NOT add a settings cache. A module-level `Map` cannot work here: Next gives server actions
 * and page renders SEPARATE module instances, so a `cache.delete` inside an action never reaches
 * the copy the page reads from, and the page re-renders stale. That single cause presented as
 * several different bugs — a session-length control snapping back, mail settings needing a refresh.
 *
 * ⚠ React's `cache()` is not a substitute either: an action and the re-render it triggers can share
 * a request scope, so the write is again invisible to the render that follows. These are a handful
 * of tiny rows in local SQLite indexed by a unique key.
 * REFS getLogoFilename() below — its `_fresh` flag is the fossil of the old workaround
 */

/** No-op, kept so tests and existing callers need no change. There is nothing to clear.
 *  REFS lib/backup.ts — calls it after a restore  PINS tests/integration/settings.test.ts */
export function clearSettingsCache(): void {
  /* intentionally empty — see the note above */
}

async function readValue<K extends SettingKey>(
  key: K,
): Promise<(typeof SETTINGS)[K]["default"]> {
  const def = SETTINGS[key];
  let value = def.default;
  try {
    const row = await prisma.setting.findUnique({
      where: { scope_ownerId_key: { scope: "global", ownerId: "", key } },
    });
    if (row) {
      const raw = row.secret ? decryptString(row.valueJson) : row.valueJson;
      const parsed = def.schema.safeParse(JSON.parse(raw));
      if (parsed.success) value = parsed.data as (typeof SETTINGS)[K]["default"];
    }
  } catch {
    // ⚠ Fall back to the default on any read or parse error — a corrupt row must not 500 a page.
  }

  return value as (typeof SETTINGS)[K]["default"];
}

// ---- Typed getters (consumers use these) ----

/** REFS app/login/page.tsx  PINS tests/integration/settings.test.ts */
export async function getLoginMessage(): Promise<string> {
  return readValue("login.message");
}
/** REFS app/components/branding.tsx · app/manifest.ts · app/api/branding/icon/route.ts ·
 *       lib/email/template.ts · lib/auth/totp.ts — the authenticator issuer name */
export async function getAppName(): Promise<string> {
  return readValue("branding.appName");
}
/** ⚠ Only meaningful for a style listing `branding.accent` — REFS STYLE_SETTINGS below ·
 *  app/components/branding.tsx › BrandingStyle() · lib/email/template.ts › currentBrand() */
export async function getAccentColor(): Promise<string> {
  return readValue("branding.accent");
}
/**
 * Which settings each interface style exposes (CORE-07). ⚠ A new style needs an entry here; an
 * empty list is normal and means "no options". Offering a control that silently does nothing is
 * the thing this prevents — a style's own `--primary` outranks the accent anyway.
 * REFS lib/styles.ts › STYLES — every id here must exist there
 *      app/components/branding.tsx · lib/email/template.ts  PINS tests/unit/styles.test.ts
 */
export const STYLE_SETTINGS: Record<string, SettingKey[]> = {
  // Modern is the neutral structure, so a free-choice accent composes with any Modern palette.
  // The others take their colour from their palettes; an arbitrary accent would fight the look.
  default: ["branding.accent"],
  crystal: [],
  aero: [],
  xp: [],
  terminal: [],
  brutalist: [],
  paper: [],
};

/** REFS app/admin/settings/page.tsx — renders these under the style picker */
export async function listStyleSettings(styleId: string): Promise<SettingView[]> {
  const keys = STYLE_SETTINGS[styleId] ?? [];
  const all = await listSettings("branding", true);
  return keys
    .map((k) => all.find((s) => s.key === k))
    .filter((s): s is SettingView => !!s);
}

/** The chosen interface style id (CORE-07); "default" when unset. ⚠ Resolve it through
 *  `resolveStylePair` before use — a promoted palette can change the style.
 *  REFS lib/styles.ts · app/components/branding.tsx · lib/email/template.ts */
export async function getStyleId(): Promise<string> {
  return readValue("branding.style");
}

/** The chosen palette id. ⚠ Meaningful only alongside its style.
 *  REFS lib/styles.ts › resolvePalette() · app/components/branding.tsx · lib/email/template.ts */
export async function getPaletteId(): Promise<string> {
  return readValue("branding.palette");
}

/**
 * The logo's stored filename. `_fresh` is a no-op kept so existing callers compile — it punched
 * through the old 30-second cache, whose absence is now the rule.
 * REFS clearSettingsCache() above — why there is no cache to bypass
 *      app/api/branding/logo/route.ts · app/api/branding/icon/route.ts ·
 *      app/components/branding.tsx
 */
export async function getLogoFilename(_fresh = false): Promise<string> {
  return readValue("branding.logo");
}
/**
 * The absolute ceiling on a session, in days — ⚠ a CONSTANT, not a setting, and the property that
 * matters most: without it a stolen token can be kept alive indefinitely by an attacker who simply
 * keeps using it, because the idle window keeps resetting. Stated in the Session length help text
 * rather than becoming a second control.
 * REFS getSessionLifetimeMs() below · app/admin/sessions/page.tsx
 * PINS tests/integration/settings.test.ts
 */
export const SESSION_ABSOLUTE_CAP_DAYS = 365;

/**
 * How long a session survives WITHOUT use. ⚠ The upgrade from the two old settings lives in SQL,
 * not here, so the value is visible in the settings table and editable afterwards without the old
 * rows haunting it. REFS prisma/migrations/20260727230000_session_length
 *      lib/auth/session.ts — enforces it  PINS tests/integration/settings.test.ts
 */
export async function getSessionLengthMs(): Promise<number> {
  return (await readValue("session.lengthMinutes")) * 60 * 1000;
}

/** The absolute expiry stamped on a new session. Fixed — see `SESSION_ABSOLUTE_CAP_DAYS`.
 *  REFS lib/auth/session.ts  PINS tests/integration/settings.test.ts */
export async function getSessionLifetimeMs(): Promise<number> {
  return SESSION_ABSOLUTE_CAP_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * The idle window enforced on every request — the same number as Session length since the two
 * concepts merged. The name is kept because it describes what the check actually does.
 * REFS lib/auth/session.ts  PINS tests/integration/settings.test.ts ·
 * tests/unit/session-idle.test.ts
 */
export async function getIdleTimeoutMs(): Promise<number> {
  return getSessionLengthMs();
}
/** Raw `app.publicUrl` as stored — ⚠ unvalidated here; `lib/app-url.ts` normalises it and is the
 *  only thing that should build a URL from it. REFS app/admin/network/page.tsx */
export async function getPublicUrlSetting(): Promise<string> {
  return readValue("app.publicUrl");
}
/** REFS lib/audit.ts › pruneAuditLog()  PINS tests/integration/settings.test.ts */
export async function getAuditRetentionDays(): Promise<number> {
  return readValue("audit.retentionDays");
}
/** Raw schedule settings; ⚠ unnormalised — REFS lib/updates/schedule.ts, the only caller, which
 *  is what makes them safe to act on including the local-time comparison. */
export async function getUpdateScheduleSettings(): Promise<{
  autoEnabled: boolean;
  frequency: string;
  timeOfDay: string;
  dayOfWeek: number;
  dayOfMonth: number;
}> {
  const [autoEnabled, frequency, timeOfDay, dayOfWeek, dayOfMonth] = await Promise.all([
    readValue("updates.autoEnabled"),
    readValue("updates.frequency"),
    readValue("updates.timeOfDay"),
    readValue("updates.dayOfWeek"),
    readValue("updates.dayOfMonth"),
  ]);
  return { autoEnabled: autoEnabled === 1, frequency, timeOfDay, dayOfWeek, dayOfMonth };
}

// ---- Admin UI helpers ----

/** REFS app/admin/settings/ui.tsx — the generic form renders exactly these fields */
export type SettingView = {
  key: SettingKey;
  label: string;
  help: string;
  kind: FieldKind;
  value: string; // string form for the form input
  secret: boolean;
  group: SettingGroup;
};

/** ⚠ This is what restricts a page's form to its own group — REFS applySettingsForm() below,
 *  which takes the result as `allowedKeys`. Callers: app/admin/settings · sessions · audit ·
 *  network · updates actions.  PINS tests/unit/settings-audit.test.ts */
export function settingKeysByGroup(group: SettingGroup): SettingKey[] {
  return (Object.keys(SETTINGS) as SettingKey[]).filter((k) => SETTINGS[k].group === group);
}

/** All settings, optionally one group, with current values.
 *  REFS app/admin/settings/page.tsx · app/admin/audit/page.tsx */
export async function listSettings(group?: SettingGroup, includeHidden = false): Promise<SettingView[]> {
  const out: SettingView[] = [];
  for (const key of Object.keys(SETTINGS) as SettingKey[]) {
    const def = SETTINGS[key];
    if (group && def.group !== group) continue;
    // Hidden settings have their own control, so they stay out of the generic form unless a
    // caller asks for them by name.
    if (def.hidden && !includeHidden) continue;
    const value = await readValue(key);
    out.push({
      key,
      label: def.label,
      help: def.help,
      kind: def.kind,
      value: def.kind === "string" ? String(value) : String(value),
      secret: !!def.secret,
      group: def.group,
    });
  }
  return out;
}

/** REFS app/admin/settings/ui.tsx · sessions/session-length-form.tsx · settings/logo-form.tsx ·
 *       settings/style-form.tsx — the `useActionState` shape every settings form reads */
export type SettingsFormState = { errors?: Record<string, string>; success?: string };

/**
 * Validate and persist submitted settings. ⚠ `allowedKeys` is the boundary — without it a crafted
 * form writes any key in the registry, so every caller must pass its own group.
 * REFS settingKeysByGroup() above · applySettingsFormDetailed() below — same rule, plus the audit
 */
export async function applySettingsForm(
  formData: FormData,
  allowedKeys: SettingKey[],
): Promise<Record<string, string>> {
  return (await applySettingsFormDetailed(formData, allowedKeys)).errors;
}

/**
 * As `applySettingsForm`, but reports WHAT it wrote for the audit entry (BUG-24) — a bare
 * "settings.updated" records that a setting changed but not which, which is most of the value.
 *
 * ⚠ `changed` carries NO VALUES for secret settings. The registry encrypts those, so putting the
 * submitted value in the audit detail writes it back out in plaintext — into a log readable via the
 * DELEGABLE `audit.view` capability and carried in every backup. Key names always; values only
 * where the registry says the setting is not secret.
 * REFS lib/audit.ts · lib/auth/permissions.ts › audit.view  PINS tests/unit/settings-audit.test.ts
 */
export async function applySettingsFormDetailed(
  formData: FormData,
  allowedKeys: SettingKey[],
): Promise<{ errors: Record<string, string>; changed: string[] }> {
  const errors: Record<string, string> = {};
  const changed: string[] = [];
  for (const key of allowedKeys) {
    if (!formData.has(key)) continue;
    const raw = String(formData.get(key) ?? "");
    const err = await writeSetting(key, raw);
    if (err) {
      errors[key] = err;
      continue;
    }
    const def = SETTINGS[key];
    changed.push(def?.secret ? `${key}=<hidden>` : `${key}=${summariseValue(raw)}`);
  }
  return { errors, changed };
}

/** A settings value shortened for the audit log — readable, bounded, control-chars out. */
function summariseValue(raw: string): string {
  const clean = Array.from(raw.trim())
    .filter((ch) => {
      const c = ch.codePointAt(0)!;
      return c >= 32 && c !== 127;
    })
    .join("");
  if (clean === "") return "(empty)";
  return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
}

/** Validate and persist one setting from raw string input. ⚠ Refuses any key not in the registry,
 *  and encrypts anything marked `secret` — both are why a caller may pass user input straight in.
 *  REFS app/admin/settings/actions.ts · app/admin/updates/schedule-actions.ts
 *  PINS tests/integration/settings.test.ts · tests/unit/settings-audit.test.ts */
export async function writeSetting(key: string, rawInput: string): Promise<string | null> {
  if (!(key in SETTINGS)) return "Unknown setting.";
  const def = SETTINGS[key as SettingKey];

  const parsed = def.schema.safeParse(def.kind === "int" ? rawInput.trim() : rawInput);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid value.";
  }

  const json = JSON.stringify(parsed.data);
  const stored = def.secret ? encryptString(json) : json;

  await prisma.setting.upsert({
    where: { scope_ownerId_key: { scope: "global", ownerId: "", key } },
    create: { scope: "global", ownerId: "", key, valueJson: stored, secret: !!def.secret },
    update: { valueJson: stored, secret: !!def.secret },
  });
  // No cache to invalidate — see the note above `readValue`. The invalidation that used to live
  // here is exactly what could not work across module instances.
  return null;
}
