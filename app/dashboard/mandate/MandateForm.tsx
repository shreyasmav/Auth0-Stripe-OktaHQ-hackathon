"use client";

import { useState } from "react";

export function MandateForm({
  initialMaxAmountCents,
  categories,
}: {
  initialMaxAmountCents: number;
  categories: string[];
}) {
  const [dollars, setDollars] = useState((initialMaxAmountCents / 100).toFixed(2));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    const maxAmountCents = Math.round(parseFloat(dollars) * 100);
    await fetch("/api/mandate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ maxAmountCents }),
    });
    setBusy(false);
    setSaved(true);
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <label className="mb-2 block text-sm text-white/60">Maximum amount (USD)</label>
      <div className="flex items-center gap-2">
        <span className="text-2xl text-white/50">$</span>
        <input
          type="number"
          step="0.01"
          className="w-full rounded border border-line bg-black/30 p-3 text-2xl tabular-nums outline-none focus:border-buyer"
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
        />
      </div>
      <div className="mt-2 text-sm text-white/40">Categories: {categories.join(", ")}</div>
      <button
        onClick={save}
        disabled={busy}
        className="mt-4 rounded bg-buyer px-5 py-2 font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save mandate"}
      </button>
      {saved && <span className="ml-3 text-sm text-ok">Saved — token cache invalidated.</span>}
    </div>
  );
}
