'use client';

import { use, useEffect, useState } from 'react';
import type { Approval, Deal, DealState, Turn } from '@/lib/types';
import Transcript from '@/components/Transcript';
import MandateBadge from '@/components/MandateBadge';
import ApprovalCard from '@/components/ApprovalCard';
import PaymentPanel, { type PayResult } from '@/components/PaymentPanel';
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

const STATE_CHIP: Record<DealState, string> = {
  negotiating: 'border-accent/50 text-accent',
  settled_within_mandate: 'border-money/50 text-money',
  awaiting_approval: 'border-warn/50 text-warn',
  approved: 'border-money/50 text-money',
  denied: 'border-danger/50 text-danger',
  paid: 'border-money/50 text-money',
  failed: 'border-danger/50 text-danger',
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

  const researchedVendor = research?.vendors?.[0]?.name;
  const vendorName = researchedVendor ?? (deal ? (ORG_NAMES[deal.vendorOrgId] ?? deal.vendorOrgId) : 'Vendor');
  const buyerName = deal ? (ORG_NAMES[deal.buyerOrgId] ?? deal.buyerOrgId) : 'Buyer';
  const ceiling = deal?.mandateSnapshot?.maxAmountCents ?? 80000;

  const lastOffer = [...turns].reverse().find((t) => typeof t.offerCents === 'number')?.offerCents;
  const offerCents = lastOffer ?? deal?.amountCents;
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Deal room</h1>
          <span className="text-lg text-dim">
            {buyerName} <span className="text-dim/50">vs</span> {vendorName}
          </span>
          <span className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-xs text-dim/70">
            {id}
          </span>
        </div>
        {displayState && (
          <span
            className={`rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-widest ${STATE_CHIP[displayState]}`}
          >
            {displayState.replaceAll('_', ' ')}
          </span>
        )}
      </div>

      {warn && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          {warn}
        </p>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Left 2/3: the transcript. */}
        <div className="col-span-2 h-[calc(100vh-13rem)]">
          {research && (
            <div className="mb-4">
              <ResearchPanel research={research} />
            </div>
          )}
          <Transcript
            turns={turns}
            negotiating={deal?.state === 'negotiating' || deal === null}
            emptyHint={
              research && !research.simulated
                ? 'Agents negotiating on live market data...'
                : 'Opening the deal room...'
            }
          />
        </div>

        {/* Right 1/3: mandate, approval, payment, token, events. */}
        <div className="h-[calc(100vh-13rem)] space-y-4 overflow-y-auto pr-1">
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

          {deal && <PaymentPanel payment={payment} deal={deal} vendorName={vendorName} />}

          {deal && <TokenDrawer deal={deal} approval={approval} />}

          <EventFeed />
        </div>
      </div>
    </div>
  );
}
