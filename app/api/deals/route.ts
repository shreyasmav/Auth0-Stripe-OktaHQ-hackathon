import type { NextRequest } from 'next/server';
import type { Deal, Org } from '@/lib/types';
import { BUYER_MANDATE } from '@/lib/seed';
import { heuristicSpec } from '@/lib/live/jobspec';
import { researchMarket } from '@/lib/live/research';
import { logEvent, snapshot, store } from '@/lib/store';

/**
 * The org's hard authorization rail. A requester may set this deal's ceiling
 * anywhere at or below it, never above. Distinct from BUYER_MANDATE's $800,
 * which is the *default* ceiling when no budget is stated.
 */
const ORG_MAX_CENTS = 2_500_000; // $25,000

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

  // This deal's ceiling is the budget the requester stated. With no figure
  // stated it falls back to the org's standing mandate (§11.1's $800), which
  // keeps the seeded demo intact: the scripted $850 settle still breaches.
  //
  // A stated budget is still bounded by ORG_MAX_CENTS, the org's hard
  // authorization rail. A requester can set their own ceiling anywhere under
  // that rail but cannot type their way past it, so "budget $500,000" does not
  // buy authorization the org never granted. In production that rail arrives
  // as a verified token claim rather than a constant; the clamp is what keeps
  // free text from becoming an authorization decision.
  const requestedCents = spec.budgetCents;
  const ceilingCents =
    typeof requestedCents === 'number'
      ? Math.min(requestedCents, ORG_MAX_CENTS)
      : BUYER_MANDATE.maxAmountCents;

  if (typeof requestedCents === 'number') {
    logEvent(
      'auth0',
      requestedCents > ORG_MAX_CENTS
        ? `Requested budget $${(requestedCents / 100).toFixed(2)} exceeds the org authorization rail; clamped to $${(ORG_MAX_CENTS / 100).toFixed(2)}.`
        : `Mandate ceiling for this deal set from the request: $${(ceilingCents / 100).toFixed(2)}.`,
    );
  }

  const deal: Deal = {
    id: `deal_${crypto.randomUUID().slice(0, 8)}`,
    jobId: job.id,
    buyerOrgId: job.buyerOrgId,
    vendorOrgId: vendor.id,
    state: 'negotiating',
    // Demo shortcut: with live Auth0 the org ceiling should come from the buyer
    // agent's verified token claim, not the seed constant. The pay route never
    // trusts this snapshot either way (§8).
    mandateSnapshot: { ...BUYER_MANDATE, maxAmountCents: ceilingCents },
    transcript: [],
    createdAt: Date.now(),
    research,
  };

  store.deals.set(deal.id, deal);
  logEvent('agent', `Deal room opened for ${job.title}: buyer agent vs ${vendor.name}.`);
  snapshot();
  return Response.json({ deal });
}
