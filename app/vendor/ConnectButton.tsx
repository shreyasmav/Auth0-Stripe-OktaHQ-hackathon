"use client";

import { useState } from "react";

export function ConnectButton({ orgId }: { orgId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/stripe/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orgId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.mock ? "Stripe not configured — DEMO_MODE=mock" : json.error);
      setBusy(false);
      return;
    }
    window.location.href = json.url;
  }

  return (
    <div>
      <button
        onClick={connect}
        disabled={busy}
        className="rounded bg-vendor px-3 py-1.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Connecting…" : "Connect with Stripe"}
      </button>
      {error && <div className="mt-1 text-xs text-white/40">{error}</div>}
    </div>
  );
}
