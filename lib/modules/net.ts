import "server-only";
import { execFile } from "node:child_process";
import { isIP } from "node:net";

/*
 * ICMP ping for modules, exposed as `ctx.net.ping` when "network:outbound" was granted.
 *
 * ICMP needs a privileged raw socket or the OS binary, so core offers it rather than leaving every
 * module to shell out — which the verifier bans outright. ⚠ **All the hardening lives here, once**:
 * the host is validated against an IP literal or strict hostname so it can never begin with "-" and
 * be read as a flag; `execFile` with a fixed argument list and NO shell; a timeout and output cap.
 *
 * REFS lib/modules/context.ts — where it is attached to the ctx · lib/modules/verify.ts — bans the
 *      alternative · lib/modules/types.ts › ModuleNetApi — the contract
 * PINS tests/unit/module-net.test.ts
 */

/** Labels per RFC 1123: alphanumeric start/end, hyphens inside, ≤63 chars each. */
const HOSTNAME_RE =
  /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** A host safe to hand to the ping binary as a positional argument. */
/** ⚠ The flag-injection guard. PINS tests/unit/module-net.test.ts */
export function isSafePingHost(host: string): boolean {
  if (typeof host !== "string" || host.length === 0 || host.length > 253) return false;
  if (isIP(host) !== 0) return true; // IPv4/IPv6 literal
  return HOSTNAME_RE.test(host);
}

/** Round-trip time from the ping binary's output, in ms (null if not reported). */
/** PINS tests/unit/module-net.test.ts — pins the per-platform output parsing. */
export function parsePingMs(output: string): number | null {
  // Windows: "time=12ms" / "time<1ms" · Linux+macOS: "time=12.3 ms"
  const m = /time[=<]\s*([\d.]+)\s*ms/i.exec(output);
  if (!m) return null;
  const ms = Number(m[1]);
  return Number.isFinite(ms) ? ms : null;
}

function pingArgs(host: string, timeoutMs: number): string[] {
  if (process.platform === "win32") {
    return ["-n", "1", "-w", String(timeoutMs), host];
  }
  // -W is seconds on Linux; at least 1 so a sub-second timeout doesn't mean "no wait".
  const secs = Math.max(1, Math.ceil(timeoutMs / 1000));
  return ["-c", "1", "-W", String(secs), host];
}

/**
 * ICMP echo a host. Resolves the round-trip in ms, or null when the host doesn't answer
 * (or ping isn't available). Rejects only on an invalid host — an unreachable host is a
 * normal result for a monitor, not an error.
 */
/** REFS lib/modules/context.ts — attaches this as ctx.net.ping · types.ts › ModuleNetApi */
export function pingHost(host: string, opts: { timeoutMs?: number } = {}): Promise<number | null> {
  if (!isSafePingHost(host)) {
    return Promise.reject(new Error("Invalid host for ping."));
  }
  const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 3000, 100), 30_000);
  return new Promise((resolve) => {
    execFile(
      "ping",
      pingArgs(host, timeoutMs),
      { timeout: timeoutMs + 1000, maxBuffer: 64 * 1024, windowsHide: true, shell: false },
      (err, stdout) => {
        // A non-zero exit means unreachable — a normal monitor outcome.
        if (err) return resolve(null);
        // Windows' ping exits 0 even when it reports "Destination host unreachable".
        const ms = parsePingMs(stdout);
        resolve(ms);
      },
    );
  });
}
