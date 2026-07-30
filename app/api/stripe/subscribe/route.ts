import type { NextRequest } from 'next/server';
import { createProCheckout } from '@/lib/stripe/billing';
import { store } from '@/lib/store';

// POST /api/stripe/subscribe {orgId?} -> {url, mock}
// Defaults to org_acme, the buyer org that upgrades to Pro on stage.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { orgId?: unknown } | null;
  const orgId = typeof body?.orgId === 'string' ? body.orgId : 'org_acme';

  const org = store.orgs.get(orgId);
  if (!org) return Response.json({ error: 'org_not_found' }, { status: 404 });

  try {
    const result = await createProCheckout(org);
    return Response.json(result);
  } catch {
    return Response.json({ error: 'stripe_error' }, { status: 502 });
  }
}
