"use client";

import { useState } from "react";
import type { Approval, DealState } from "@/lib/types";

export function ApproveButtons({
  approvalId,
  initialStatus,
  dealState,
}: {
  approvalId: string;
  initialStatus: Approval["status"];
  dealState?: DealState;
}) {
  const [status, setStatus] = useState<Approval["status"]>(initialStatus);
  const [busy, setBusy] = useState(false);

  async function decide(decision: "approved" | "denied") {
    setBusy(true);
    const res = await fetch(`/api/approvals/${approvalId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.approval) setStatus(json.approval.status);
  }

  if (status !== "pending") {
    return (
      <div className="text-center">
        {status === "approved" ? (
          <div className="text-lg font-semibold text-ok">Approved. Payment will proceed automatically.</div>
        ) : (
          <div className="text-lg font-semibold text-breach">Denied.</div>
        )}
        {dealState && <div className="mt-1 text-sm text-white/40">Deal state: {dealState.replace(/_/g, " ")}</div>}
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      <button
        onClick={() => decide("denied")}
        disabled={busy}
        className="flex-1 rounded-lg border border-breach/50 py-4 text-lg font-semibold text-breach hover:bg-breach/10 disabled:opacity-50"
      >
        Deny
      </button>
      <button
        onClick={() => decide("approved")}
        disabled={busy}
        className="flex-1 rounded-lg bg-ok py-4 text-lg font-semibold text-black hover:opacity-90 disabled:opacity-50"
      >
        Approve
      </button>
    </div>
  );
}
