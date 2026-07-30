import type { NextRequest } from 'next/server';
import { createExpressAccount } from '@/lib/stripe/connect';
import { store } from '@/lib/store';

// POST /api/stripe/connect {orgId?} -> {url, accountId?, mock}
// Defaults to org_bright, the vendor the demo onboards.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { orgId?: unknown } | null;
  const orgId = typeof body?.orgId === 'string' ? body.orgId : 'org_bright';

  const org = store.orgs.get(orgId);
  if (!org) return Response.json({ error: 'org_not_found' }, { status: 404 });
  if (org.kind !== 'vendor') return Response.json({ error: 'not_a_vendor' }, { status: 400 });

  try {
    const result = await createExpressAccount(org);
    return Response.json(result);
  } catch {
    return Response.json({ error: 'stripe_error' }, { status: 502 });
  }
}
