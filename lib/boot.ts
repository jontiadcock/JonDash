import "server-only";

/**
 * The moment this server process started (evaluated once, at module load).
 *
 * Both real sessions (`lib/auth/session.ts`) and the short-lived pre-auth login
 * cookie (`lib/auth/preauth.ts`) are tied to this value, so a restart or update
 * invalidates them all — everyone signs in again from the password step. It's also
 * reported by the public `/api/health` endpoint so a client waiting out a restart
 * can detect the *new* process (the boot value changes) before reconnecting.
 */
export const SERVER_BOOT_TIME = Date.now();
