'use client';

import { use, useEffect, useState } from 'react';
import type { Approval, Deal, DealState, Turn } from '@/lib/types';
import Transcript from '@/components/Transcript';
import MandateBadge from '@/components/MandateBadge';
import ApprovalCard from '@/components/ApprovalCard';
import PaymentPanel, { type PayResult } from '@/components/PaymentPanel';
import AcceptAndPay from '@/components/AcceptAndPay';
import TokenDrawer from '@/components/TokenDrawer';
import EventFeed from '@/components/EventFeed';
import ResearchPanel from '@/components/ResearchPanel';
import type { MarketResearch } from '@/lib/live/types';

// Display names for the fixed seed orgs. Server data stays authoritative
// for everything that matters; this is presentation only.
const ORG_NAMES: Record<string, string> = {
  org_acme: 'Acme Facilities',
  org_bright: 'Bright Electric',
  org_delta: 'Delta Contracting',
};

// Sentence-case labels: Apple never sets a status in shouting monospace.
const STATE_LABEL: Record<DealState, string> = {
  negotiating: 'Negotiating',
  settled_within_mandate: 'Within mandate',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved',
  denied: 'Declined',
  paid: 'Paid',
  failed: 'Failed',
};

const STATE_CHIP: Record<DealState, string> = {
  negotiating: '',
  settled_within_mandate: 'chip-ok',
  awaiting_approval: 'chip-warn',
  approved: 'chip-ok',
  denied: 'chip-alert',
  paid: 'chip-ok',
  failed: 'chip-alert',
};

/**
 * THE DEMO SCREEN. Streams the negotiation over SSE on the left, and walks
 * the mandate breach, human approval, and payment on the right.
 */
export default function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [deal, setDeal] = useState<Deal | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [payment, setPayment] = useState<PayResult | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [research, setResearch] = useState<MarketResearch | null>(null);

  useEffect(() => {
    let alive = true;
    let es: EventSource | null = null;
    let streamDone = false;

    async function boot() {
      let initial: Deal | null = null;
      try {
        const res = await fetch(`/api/deals/${id}`);
        if (res.ok) {
          const data = (await res.json()) as { deal: Deal; approval: Approval | null };
          if (!alive) return;
          initial = data.deal;
          setDeal(data.deal);
          setApproval(data.approval ?? null);
          setTurns(data.deal.transcript ?? []);
          if (data.deal.research) setResearch(data.deal.research);
        } else if (alive) {
          setWarn(`Could not load deal ${id} (HTTP ${res.status}). Trying the live stream anyway.`);
        }
      } catch {
        if (alive) setWarn('Could not load the deal. Trying the live stream anyway.');
      }
      if (!alive) return;

      // Only stream when the negotiation has not finished. A reload after
      // settle renders the stored transcript instead of replaying it.
      if (initial && initial.state !== 'negotiating') return;

      const scripted = window.location.search.includes('scripted=1');
      es = new EventSource(`/api/deals/${id}/negotiate${scripted ? '?scripted=1' : ''}`);
      setTurns([]);
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as
            | { type: 'turn'; turn: Turn }
            | { type: 'research'; research: MarketResearch }
            | { type: 'state'; deal: Deal };
          if (msg.type === 'research' && msg.research) {
            setResearch(msg.research);
          } else if (msg.type === 'turn' && msg.turn) {
            setTurns((prev) => [...prev, msg.turn]);
          } else if (msg.type === 'state' && msg.deal) {
            streamDone = true;
            setDeal(msg.deal);
            es?.close();
          }
        } catch {
          // Ignore malformed frames; the state event carries the truth.
        }
      };
      es.onerror = () => {
        // EventSource auto-reconnects, which would replay the whole
        // negotiation mid-demo. Close instead and say what happened.
        es?.close();
        if (!streamDone && alive) {
          setWarn((w) => w ?? 'Negotiation stream dropped. Reload to replay, or add ?scripted=1.');
        }
      };
    }

    boot();
    return () => {
      alive = false;
      es?.close();
    };
  }, [id]);

  // Returning from Stripe's hosted Checkout. The webhook is the durable path;
  // this confirms immediately so the panel updates without waiting on it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'cancelled') {
      setWarn('Checkout cancelled. The approval is still valid, so you can pay again.');
      window.history.replaceState({}, '', `/deals/${id}`);
      return;
    }
    if (params.get('checkout') !== 'success') return;
    const sessionId = params.get('session_id') ?? undefined;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/deals/${id}/checkout/confirm`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const body = (await res.json()) as { deal?: Deal; payment?: PayResult; error?: string };
        if (!alive) return;
        if (res.ok && body.deal && body.payment) {
          setDeal(body.deal);
          setPayment(body.payment);
        } else {
          setWarn(`Returned from Stripe but could not confirm payment (${body.error ?? res.status}).`);
        }
      } catch (err) {
        if (alive) setWarn(`Returned from Stripe but confirmation failed: ${(err as Error).message}`);
      } finally {
        window.history.replaceState({}, '', `/deals/${id}`);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // The negotiation settles against the cheapest researched vendor by floor
  // price (lib/live/negotiate.ts), which is not necessarily the first one the
  // research returned. Mirror that choice so the header names the vendor the
  // approval and the payment are actually for.
  const researchedVendor = research?.vendors?.length
    ? [...research.vendors].sort((a, b) => a.floorCents - b.floorCents)[0].name
    : undefined;
  const vendorName = researchedVendor ?? (deal ? (ORG_NAMES[deal.vendorOrgId] ?? deal.vendorOrgId) : 'Vendor');
  const buyerName = deal ? (ORG_NAMES[deal.buyerOrgId] ?? deal.buyerOrgId) : 'Buyer';
  const ceiling = deal?.mandateSnapshot?.maxAmountCents ?? 80000;

  // Once the deal has settled the settled amount is the truth. The last offer
  // on the table can be a rejected ask from a vendor that was passed over, and
  // showing it here contradicted the approval card.
  const lastOffer = [...turns].reverse().find((t) => typeof t.offerCents === 'number')?.offerCents;
  const offerCents = deal?.amountCents ?? lastOffer;
  const breached = deal?.amountCents !== undefined && deal.amountCents > ceiling;

  // The deal record can lag the approval by a beat since only the approval
  // is polled. Derive the headline state so the chip never reads stale.
  const displayState: DealState | undefined =
    payment || deal?.state === 'paid'
      ? 'paid'
      : deal?.state === 'awaiting_approval' && approval?.status === 'approved'
        ? 'approved'
        : deal?.state === 'awaiting_approval' && approval?.status === 'denied'
          ? 'denied'
          : deal?.state;

  const showApproval =
    deal !== null &&
    (deal.state === 'awaiting_approval' ||
      deal.state === 'approved' ||
      deal.state === 'denied' ||
      approval !== null);

  return (
    <div className="page">
      <div className="mb-6 flex items-end justify-between gap-6">
        <div>
          <p className="eyebrow mb-2">
            {buyerName} &middot; {vendorName}
          </p>
          <h1 className="text-[40px] leading-none font-semibold">Deal room</h1>
          <p className="mt-2 font-mono text-[12px] text-muted">{id}</p>
        </div>
        {displayState && (
          <span className={`chip ${STATE_CHIP[displayState]} shrink-0`}>
            {STATE_LABEL[displayState]}
          </span>
        )}
      </div>

      {warn && (
        <p className="mb-6 rounded-[12px] border border-amber/40 bg-amber/5 px-4 py-3 text-[14px] text-amber">
          {warn}
        </p>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Left 2/3: sourcing above the transcript. The column is a flex box so
            a long research panel scrolls inside its own cap instead of pushing
            the transcript, which must stay on screen, below the fold. */}
        <div className="col-span-2 flex h-[calc(100vh-16rem)] flex-col gap-5">
          {research && (
            <div className="max-h-[38%] shrink-0 overflow-y-auto">
              <ResearchPanel research={research} />
            </div>
          )}
          {/* min-h-0 so the transcript's own overflow container wins over the
              flex default of never shrinking below content height. */}
          <div className="min-h-0 flex-1">
            <Transcript
              turns={turns}
              negotiating={deal?.state === 'negotiating' || deal === null}
              emptyHint={
                research && !research.simulated
                  ? 'Agents negotiating on live market data…'
                  : 'Opening the deal room…'
              }
            />
          </div>
        </div>

        {/* Right 1/3: mandate, approval, payment, token, events. */}
        <div className="h-[calc(100vh-16rem)] space-y-5 overflow-y-auto pr-1">
          <MandateBadge ceilingCents={ceiling} offerCents={offerCents} breached={breached} />

          {deal && showApproval && (
            <ApprovalCard
              deal={deal}
              vendorName={vendorName}
              approval={approval}
              onApproval={setApproval}
              onPaid={(p, d) => {
                setPayment(p);
                setDeal(d);
              }}
            />
          )}

          {/* Within mandate: no human approval was needed, so the approval card
              never renders. This is the accept-and-pay path for those deals. */}
          {deal &&
            !payment &&
            deal.state !== 'paid' &&
            typeof deal.amountCents === 'number' &&
            deal.amountCents <= ceiling &&
            !showApproval && (
              <AcceptAndPay deal={deal} vendorName={vendorName} onError={setWarn} />
            )}

          {deal && <PaymentPanel payment={payment} deal={deal} vendorName={vendorName} />}

          {deal && <TokenDrawer deal={deal} approval={approval} />}

          <EventFeed />
        </div>
      </div>
    </div>
  );
}
