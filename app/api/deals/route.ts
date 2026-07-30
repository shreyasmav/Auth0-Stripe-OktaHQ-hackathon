import type { NextRequest } from 'next/server';
import type { Deal, Org } from '@/lib/types';
import { BUYER_MANDATE } from '@/lib/seed';
import { heuristicSpec } from '@/lib/live/jobspec';
import { researchMarket } from '@/lib/live/research';
import { logEvent, snapshot, store } from '@/lib/store';

// POST /api/deals {jobId} -> {deal}
// Researches real vendors and real price signals for the job, registers the
// cheapest one as a vendor org, and opens the deal room against it. With no
// ANTHROPIC_API_KEY (or a failed/blocked search) researchMarket falls back to
// the seeded vendors and marks the result simulated, so this route works in
// every configuration.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { jobId?: unknown } | null;
  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  const job = store.jobs.get(jobId);
  if (!job) return Response.json({ error: 'job_not_found' }, { status: 404 });

  const spec = job.spec ?? heuristicSpec(job.rawText);
  const research = await researchMarket(spec);

  logEvent(
    'agent',
    research.simulated
      ? `Vendor research: ${research.note ?? 'simulated'}`
      : `Vendor research: found ${research.vendors.length} providers for ${spec.location}, market range $${(research.marketLowCents / 100).toFixed(2)}-$${(research.marketHighCents / 100).toFixed(2)}, ${research.sources.length} sources cited.`,
  );

  // Cheapest walk-away price wins the deal room.
  const lead = [...research.vendors].sort((a, b) => a.floorCents - b.floorCents)[0];
  if (!lead) return Response.json({ error: 'no_vendor_available' }, { status: 409 });

  // Register the researched vendor as an org so the rest of the app (Connect
  // onboarding, the vendor page, the payment split) treats it like any other.
  const existing = [...store.orgs.values()].find((o) => o.kind === 'vendor' && o.name === lead.name);
  const vendor: Org = existing ?? {
    id: `org_${crypto.randomUUID().slice(0, 8)}`,
    name: lead.name,
    kind: 'vendor',
    tier: 'free',
    floorCents: lead.floorCents,
  };
  vendor.floorCents = lead.floorCents;
  store.orgs.set(vendor.id, vendor);

  const deal: Deal = {
    id: `deal_${crypto.randomUUID().slice(0, 8)}`,
    jobId: job.id,
    buyerOrgId: job.buyerOrgId,
    vendorOrgId: vendor.id,
    state: 'negotiating',
    // Demo shortcut: with live Auth0 this snapshot should be copied from the
    // buyer agent's verified token claim at negotiation time, not the seed
    // constant. The pay route never trusts it either way (§8).
    mandateSnapshot: { ...BUYER_MANDATE },
    transcript: [],
    createdAt: Date.now(),
    research,
  };

  store.deals.set(deal.id, deal);
  logEvent('agent', `Deal room opened for ${job.title}: buyer agent vs ${vendor.name}.`);
  snapshot();
  return Response.json({ deal });
}
