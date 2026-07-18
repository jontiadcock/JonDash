"use client";

import { useState } from "react";

/**
 * Displays a freshly generated set of one-time recovery codes with copy /
 * download / print. Shown once — the raw codes cannot be retrieved again.
 */
export function BackupCodesPanel({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);

  const asText = codes.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(asText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable; download/print still work */
    }
  }

  function download() {
    const blob = new Blob(
      [`JonDash recovery codes\nGenerated ${new Date().toISOString()}\n\n${asText}\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jondash-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface-2)" }}>
      <p className="label mb-1">Your recovery codes</p>
      <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
        Save these somewhere safe. Each code works once if you lose your authenticator.
        They won’t be shown again.
      </p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => (
          <li
            key={c}
            className="rounded-lg px-3 py-2 text-center tracking-wider"
            style={{ background: "var(--background)", border: "1px solid var(--border)" }}
          >
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="btn btn-ghost !py-1.5 !px-3 text-sm">
          {copied ? "Copied ✓" : "Copy"}
        </button>
        <button type="button" onClick={download} className="btn btn-ghost !py-1.5 !px-3 text-sm">
          Download
        </button>
        <button type="button" onClick={() => window.print()} className="btn btn-ghost !py-1.5 !px-3 text-sm">
          Print
        </button>
      </div>
    </div>
  );
}
