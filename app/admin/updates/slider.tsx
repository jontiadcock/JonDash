"use client";

/**
 * The submit-on-click slider used by the Beta channels and Automatic updates panels.
 *
 * A button rather than a checkbox: each row is its own form that submits immediately, so a
 * page of toggles can't leave someone thinking they saved something they didn't.
 */
export function Slider({
  on,
  label,
  danger,
}: {
  on: boolean;
  label: string;
  /** Use the warning colour when ON means "opted out", not "enabled". */
  danger?: boolean;
}) {
  return (
    <button
      type="submit"
      aria-label={`${on ? "Turn off" : "Turn on"} ${label}`}
      title={on ? `On — click to turn off ${label}` : `Off — click to turn on ${label}`}
      style={{
        width: 42,
        height: 24,
        flex: "none",
        borderRadius: 999,
        border: "1px solid var(--border-strong, #999)",
        background: on ? (danger ? "var(--danger, #dc2626)" : "var(--primary)") : "transparent",
        position: "relative",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 2,
          left: on ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: on ? "#fff" : "var(--border-strong, #999)",
          transition: "left 120ms",
        }}
      />
    </button>
  );
}
