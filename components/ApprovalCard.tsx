"use client";

import type { Approval } from "@/lib/types";

type RarDetail = {
  type: string;
  deal_id: string;
  amount: number;
  currency: string;
  vendor: string;
  scope_of_work: string;
  deadline: string;
};

function fmtCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ApprovalCard({ approval, approveUrl }: { approval: Approval; approveUrl?: string }) {
  const details = (approval.authorizationDetails as RarDetail[] | undefined)?.[0];

  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-white/50">
          Approval request · {approval.mode === "ciba" ? "Auth0 CIBA push" : "front-channel"}
        </div>
        <StatusPill status={approval.status} />
      </div>

      {details && (
        <div className="mb-4 space-y-1 text-white/90">
          <div className="text-lg font-semibold">
            Approve {fmtCents(details.amount)} to {details.vendor}
          </div>
          <div className="text-sm text-white/60">{details.scope_of_work}</div>
          <div className="text-sm text-white/60">Needed by {details.deadline}</div>
        </div>
      )}

      {approval.status === "pending" && (
        <div className="flex items-center gap-3 text-white/70">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <span>waiting for approver…</span>
          {approveUrl && (
            <a href={approveUrl} target="_blank" rel="noreferrer" className="ml-auto text-sm text-buyer underline">
              Open approval screen
            </a>
          )}
        </div>
      )}

      {approval.status === "approved" && (
        <div className="text-ok">
          Approved by {approval.approverUserId} at {new Date(approval.resolvedAt ?? Date.now()).toLocaleTimeString()}
        </div>
      )}

      {approval.status === "denied" && <div className="text-breach">Denied.</div>}
      {approval.status === "expired" && <div className="text-white/50">Expired — no response in time.</div>}

      <details className="mt-4 text-sm text-white/50">
        <summary className="cursor-pointer">Raw authorization_details payload</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-3 text-xs">
          {JSON.stringify(approval.authorizationDetails, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function StatusPill({ status }: { status: Approval["status"] }) {
  const colors: Record<Approval["status"], string> = {
    pending: "bg-white/10 text-white/70",
    approved: "bg-ok/20 text-ok",
    denied: "bg-breach/20 text-breach",
    expired: "bg-white/10 text-white/50",
  };
  return <span className={`rounded px-2 py-1 text-xs font-semibold uppercase ${colors[status]}`}>{status}</span>;
}
