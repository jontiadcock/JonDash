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

type SettingDef<T> = {
  label: string;
  help: string;
  kind: FieldKind;
  default: T;
  schema: z.ZodType<T>;
  secret?: boolean;
};

// Registry of global settings.
export const SETTINGS = {
  "login.message": {
    label: "Sign-in page message",
    help: "Optional text shown on the login page (e.g. a notice). Leave blank for none.",
    kind: "string",
    default: "",
    schema: z.string().max(280),
  } as SettingDef<string>,

  "session.lifetimeDays": {
    label: "Session lifetime (days)",
    help: "How long a login stays valid before requiring sign-in again. 1–365.",
    kind: "int",
    default: 7,
    schema: z.coerce.number().int().min(1).max(365),
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
  } as SettingDef<number>,

  "audit.retentionDays": {
    label: "Audit log retention (days)",
    help: "Automatically delete audit events older than this. 0 keeps them forever.",
    kind: "int",
    default: 90,
    schema: z.coerce.number().int().min(0).max(3650),
  } as SettingDef<number>,
} as const;

export type SettingKey = keyof typeof SETTINGS;

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: unknown; exp: number }>();

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

// ---- Admin UI helpers ----

export type SettingView = {
  key: SettingKey;
  label: string;
  help: string;
  kind: FieldKind;
  value: string; // string form for the form input
  secret: boolean;
};

/** All settings with their current values, for the admin Settings page. */
export async function listSettings(): Promise<SettingView[]> {
  const out: SettingView[] = [];
  for (const key of Object.keys(SETTINGS) as SettingKey[]) {
    const def = SETTINGS[key];
    const value = await readValue(key);
    out.push({
      key,
      label: def.label,
      help: def.help,
      kind: def.kind,
      value: def.kind === "string" ? String(value) : String(value),
      secret: !!def.secret,
    });
  }
  return out;
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
