"use client";

import { useEffect, useRef, useState } from "react";
import type { Approval, Deal, Turn } from "@/lib/types";
import { Transcript } from "@/components/Transcript";
import { MandateBadge } from "@/components/MandateBadge";
import { ApprovalCard } from "@/components/ApprovalCard";
import { PaymentPanel } from "@/components/PaymentPanel";
import { TokenDrawer } from "@/components/TokenDrawer";

type PaymentInfo = { amountCents: number; applicationFeeCents: number; paymentIntentId: string; mock?: boolean };

export function DealRoom({ dealId }: { dealId: string }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [vendorName, setVendorName] = useState<string>("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [claims, setClaims] = useState<Record<string, unknown> | null>(null);
  const [directPayAttempt, setDirectPayAttempt] = useState<{ status: number; body: unknown } | null>(null);
  const requestedApproval = useRef(false);

  // Load the deal, open the SSE negotiation stream.
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/deals?id=${dealId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.deal) {
          setDeal(json.deal);
          setVendorName(json.vendorName ?? "");
        }
      });

    fetch(`/api/deals/${dealId}/token`)
      .then((r) => r.json())
      .then((json) => !cancelled && setClaims(json));

    const source = new EventSource(`/api/deals/${dealId}/negotiate`);
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "turn") {
        setTurns((prev) => [...prev, payload.turn]);
      } else if (payload.type === "settled") {
        setDeal(payload.deal);
      } else if (payload.type === "paid") {
        setDeal(payload.deal);
        setPayment(payload.payment);
        source.close();
      } else if (payload.type === "error") {
        source.close();
      }
    };
    source.onerror = () => source.close();

    return () => {
      cancelled = true;
      source.close();
    };
  }, [dealId]);

  // Once the deal breaches mandate, kick off the approval request exactly once.
  useEffect(() => {
    if (!deal || deal.state !== "awaiting_approval" || requestedApproval.current) return;
    requestedApproval.current = true;
    fetch("/api/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealId: deal.id }),
    })
      .then((r) => r.json())
      .then((json) => json.approval && setApproval(json.approval));
  }, [deal]);

  // Poll approval status every second while pending.
  useEffect(() => {
    if (!approval || approval.status !== "pending") return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/approvals/${approval.id}`);
      const json = await res.json();
      if (json.approval) {
        setApproval(json.approval);
        if (json.approval.status === "approved") {
          setDeal((prev) => (prev ? { ...prev, state: "approved" } : prev));
        } else if (json.approval.status === "denied") {
          setDeal((prev) => (prev ? { ...prev, state: "denied" } : prev));
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [approval]);

  // Once approved, pay through the scope-gated route with the elevated token.
  useEffect(() => {
    if (!deal || deal.state !== "approved" || !approval?.grantedToken || payment) return;
    fetch(`/api/deals/${deal.id}/pay`, {
      method: "POST",
      headers: { authorization: `Bearer ${approval.grantedToken}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.deal) setDeal(json.deal);
        if (json.payment) setPayment(json.payment);
      });
  }, [deal, approval, payment]);

  async function attemptDirectPay() {
    const res = await fetch(`/api/deals/${dealId}/pay`, { method: "POST" });
    const body = await res.json();
    setDirectPayAttempt({ status: res.status, body });
  }

  if (!deal) {
    return <main className="mx-auto max-w-3xl px-6 py-12 text-white/50">Loading deal…</main>;
  }

  const ceilingCents = deal.mandateSnapshot.maxAmountCents;
  const approveUrl = approval && approval.mode === "frontchannel" ? `/approve/${approval.id}` : undefined;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <a href="/dashboard" className="mb-6 inline-block text-sm text-white/40 hover:text-white/70">
        ← Dashboard
      </a>

      <h1 className="mb-6 text-2xl font-bold">Deal {deal.id}</h1>

      <div className="mb-6">
        <MandateBadge ceilingCents={ceilingCents} settledCents={deal.amountCents} />
      </div>

      <Transcript turns={turns} />

      {deal.state === "awaiting_approval" && (
        <div className="mt-6">
          <button
            onClick={attemptDirectPay}
            className="rounded border border-breach/50 px-4 py-2 text-sm text-breach hover:bg-breach/10"
          >
            Simulate agent attempting to pay directly (no approval)
          </button>
          {directPayAttempt && (
            <pre className="mt-2 overflow-x-auto rounded border border-breach/40 bg-breach/5 p-3 text-xs text-breach">
              HTTP {directPayAttempt.status} — {JSON.stringify(directPayAttempt.body)}
            </pre>
          )}
        </div>
      )}

      {approval && (
        <div className="mt-6">
          <ApprovalCard approval={approval} approveUrl={approveUrl} />
        </div>
      )}

      {payment && deal.state === "paid" && (
        <div className="mt-6">
          <PaymentPanel
            vendorName={vendorName || deal.vendorOrgId}
            amountCents={payment.amountCents}
            applicationFeeCents={payment.applicationFeeCents}
            paymentIntentId={payment.paymentIntentId}
            mock={payment.mock}
          />
        </div>
      )}

      <div className="mt-8">
        <TokenDrawer claims={claims} />
      </div>
    </main>
  );
}
