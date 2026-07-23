import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encryptString, decryptString } from "@/lib/crypto";

/**
 * Typed, cached configuration store (global scope for now; the table also
 * supports per-user / per-module scopes for later). Each key has a zod schema,
 * a default, and UI metadata. Secret values are encrypted at rest.
 */

type FieldKind = "string" | "int";

// Which admin page a setting is surfaced on. "general" = the Settings page
// (non-critical); "sessions" lives on the Sessions page; "audit" on the Audit page.
export type SettingGroup = "general" | "sessions" | "audit" | "updates";

type SettingDef<T> = {
  label: string;
  help: string;
  kind: FieldKind;
  default: T;
  schema: z.ZodType<T>;
  secret?: boolean;
  group: SettingGroup;
};

// Registry of global settings.
export const SETTINGS = {
  "login.message": {
    label: "Sign-in page message",
    help: "Optional text shown on the login page (e.g. a notice). Leave blank for none.",
    kind: "string",
    default: "",
    schema: z.string().max(280),
    group: "general",
  } as SettingDef<string>,

  "session.lifetimeDays": {
    label: "Session lifetime (days)",
    help: "How long a login stays valid before requiring sign-in again. 1–365.",
    kind: "int",
    default: 7,
    schema: z.coerce.number().int().min(1).max(365),
    group: "sessions",
  } as SettingDef<number>,

  "session.idleTimeoutMinutes": {
    label: "Idle timeout (minutes)",
    help: "Sign out sessions inactive for this long. 0 disables; otherwise at least 5.",
    kind: "int",
    default: 0,
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

  // When opted-in automatic updates run. Applying one means a rebuild and a restart,
  // which signs everyone out — so this is never "whenever an update appears", it's a
  // window the admin picks. Nothing runs unless something is individually opted in.
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

  // Capped at 28 on purpose: 29–31 would silently skip February, and an update schedule
  // that quietly does nothing for a month is worse than one that runs slightly early.
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

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: unknown; exp: number }>();

/** Drop the in-memory settings cache (used by tests for isolation). */
export function clearSettingsCache(): void {
  cache.clear();
}

async function readValue<K extends SettingKey>(
  key: K,
): Promise<(typeof SETTINGS)[K]["default"]> {
  const def = SETTINGS[key];
  const cached = cache.get(key);
  if (cached && cached.exp > Date.now()) {
    return cached.value as (typeof SETTINGS)[K]["default"];
  }

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
    // Fall back to default on any read/parse error.
  }

  cache.set(key, { value, exp: Date.now() + CACHE_TTL_MS });
  return value as (typeof SETTINGS)[K]["default"];
}

// ---- Typed getters (consumers use these) ----

export async function getLoginMessage(): Promise<string> {
  return readValue("login.message");
}
export async function getSessionLifetimeMs(): Promise<number> {
  return (await readValue("session.lifetimeDays")) * 24 * 60 * 60 * 1000;
}
export async function getIdleTimeoutMs(): Promise<number> {
  return (await readValue("session.idleTimeoutMinutes")) * 60 * 1000; // 0 => disabled
}
export async function getAuditRetentionDays(): Promise<number> {
  return readValue("audit.retentionDays");
}
/** Raw schedule settings for automatic updates; `lib/updates/schedule.ts` normalises them. */
export async function getUpdateScheduleSettings(): Promise<{
  frequency: string;
  timeOfDay: string;
  dayOfWeek: number;
  dayOfMonth: number;
}> {
  const [frequency, timeOfDay, dayOfWeek, dayOfMonth] = await Promise.all([
    readValue("updates.frequency"),
    readValue("updates.timeOfDay"),
    readValue("updates.dayOfWeek"),
    readValue("updates.dayOfMonth"),
  ]);
  return { frequency, timeOfDay, dayOfWeek, dayOfMonth };
}

// ---- Admin UI helpers ----

export type SettingView = {
  key: SettingKey;
  label: string;
  help: string;
  kind: FieldKind;
  value: string; // string form for the form input
  secret: boolean;
  group: SettingGroup;
};

/** The setting keys belonging to a given group. */
export function settingKeysByGroup(group: SettingGroup): SettingKey[] {
  return (Object.keys(SETTINGS) as SettingKey[]).filter((k) => SETTINGS[k].group === group);
}

/** All settings (optionally just one group) with their current values, for admin forms. */
export async function listSettings(group?: SettingGroup): Promise<SettingView[]> {
  const out: SettingView[] = [];
  for (const key of Object.keys(SETTINGS) as SettingKey[]) {
    const def = SETTINGS[key];
    if (group && def.group !== group) continue;
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

export type SettingsFormState = { errors?: Record<string, string>; success?: string };

/**
 * Validate + persist the submitted settings, restricted to `allowedKeys` (so a
 * page/action can only ever write its own group — a form can't inject other
 * keys). Only keys actually present in the form are touched. Returns field errors.
 */
export async function applySettingsForm(
  formData: FormData,
  allowedKeys: SettingKey[],
): Promise<Record<string, string>> {
  return (await applySettingsFormDetailed(formData, allowedKeys)).errors;
}

/**
 * As `applySettingsForm`, but also reports WHAT it wrote, for the audit entry (BUG-24).
 *
 * Every settings save used to be logged as a bare `settings.updated` with no detail, so the
 * log recorded that *a* setting changed but never which, or to what — for a security
 * product that is most of the value of the entry. The single-value toggles beside them
 * (`settings.auto-update`, `settings.update-channel`) always logged theirs, which is why
 * the gap survived review: the file looked like it did the right thing.
 *
 * **`changed` deliberately carries no VALUES for secret settings.** `writeSetting`
 * encrypts anything the registry marks `secret`, so putting submitted values in the audit
 * detail would write them back out in plaintext — into a log readable by anyone holding
 * the *delegable* `audit.view` capability, and carried in every backup. Key names always;
 * values only where the registry says the setting isn't secret.
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

/** Validate + persist one setting from raw string input. Returns an error message or null. */
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
  cache.delete(key);
  return null;
}
