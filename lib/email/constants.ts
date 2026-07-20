// Client-safe email constants + types (NO "server-only" import) so they can be
// used from client components (ui.tsx) and shared across the OAuth routes.

export type EmailMode = "password" | "oauth2";
export type EmailProvider = "google" | "microsoft" | "";

/** SMTP presets for password mode (host/port/secure can still be overridden). */
export const PROVIDER_PRESETS: Record<
  string,
  { label: string; host: string; port: number; secure: boolean }
> = {
  gmail: { label: "Gmail", host: "smtp.gmail.com", port: 465, secure: true },
  outlook: { label: "Outlook / Hotmail", host: "smtp-mail.outlook.com", port: 587, secure: false },
  office365: { label: "Microsoft 365", host: "smtp.office365.com", port: 587, secure: false },
  custom: { label: "Custom", host: "", port: 587, secure: false },
};

// OAuth consent state cookie (shared by the initiate + callback routes).
export const STATE_COOKIE = "email_oauth_state";
export const STATE_PATH = "/admin/email";
