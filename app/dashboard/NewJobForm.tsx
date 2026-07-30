"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewJobForm() {
  const router = useRouter();
  const [rawText, setRawText] = useState("We need a 200A panel upgrade in suite 300, ASAP, budget conscious.");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const jobRes = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawText }),
      });
      const jobJson = await jobRes.json();
      if (!jobRes.ok) throw new Error(jobJson.error ?? "job creation failed");

      const dealRes = await fetch("/api/deals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: jobJson.job.id }),
      });
      const dealJson = await dealRes.json();
      if (!dealRes.ok) throw new Error(dealJson.error ?? "deal creation failed");

      router.push(`/deals/${dealJson.deal.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <label className="mb-2 block text-sm text-white/60">Describe what you need</label>
      <textarea
        className="w-full rounded border border-line bg-black/30 p-3 text-white outline-none focus:border-buyer"
        rows={3}
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
      />
      {error && <div className="mt-2 text-sm text-breach">{error}</div>}
      <button
        onClick={submit}
        disabled={busy}
        className="mt-3 rounded bg-buyer px-5 py-2 font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Dispatching agent…" : "Send to buyer agent"}
      </button>
    </div>
  );
}
