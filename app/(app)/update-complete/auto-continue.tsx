"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** After the success screen has been seen, ease the user back to the dashboard. */
export function AutoContinue({ to, afterMs }: { to: string; afterMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace(to), afterMs);
    return () => clearTimeout(t);
  }, [router, to, afterMs]);
  return null;
}
