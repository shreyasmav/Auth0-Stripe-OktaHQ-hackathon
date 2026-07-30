import type { NextRequest } from 'next/server';
import type { Deal } from '@/lib/types';
import { BUYER_MANDATE } from '@/lib/seed';
import { logEvent, snapshot, store } from '@/lib/store';

// POST /api/deals {jobId} -> {deal}
// The cheapest-floor vendor wins the deal room. With §11.1 seed data that is
// always org_bright at $850, which sits above the $800 ceiling on purpose.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { jobId?: unknown } | null;
  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  const job = store.jobs.get(jobId);
  if (!job) return Response.json({ error: 'job_not_found' }, { status: 404 });

  const vendor = [...store.orgs.values()]
    .filter((o) => o.kind === 'vendor' && typeof o.floorCents === 'number')
    .sort((a, b) => (a.floorCents ?? 0) - (b.floorCents ?? 0))[0];
  if (!vendor) return Response.json({ error: 'no_vendor_available' }, { status: 409 });

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
  };

  store.deals.set(deal.id, deal);
  logEvent('agent', `Deal room opened for ${job.title}: buyer agent vs ${vendor.name}.`);
  snapshot();
  return Response.json({ deal });
}
