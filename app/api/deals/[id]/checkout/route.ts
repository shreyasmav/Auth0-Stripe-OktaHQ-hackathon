import type { NextRequest } from 'next/server';
import type { Approval } from '@/lib/types';
import { verifyBearer } from '@/lib/auth0/verify';
import { stripeConfigured } from '@/lib/env';
import { createDealCheckoutSession } from '@/lib/stripe/checkout';
import { logEvent, snapshot, store } from '@/lib/store';

export const dynamic = 'force-dynamic';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type ConsumableApproval = Approval & { consumed?: boolean };

// POST /api/deals/[id]/checkout -> { url } for Stripe's hosted Checkout page.
//
// This is the human-pays path: the person accepts the settled price and gets
// redirected to Stripe. It runs the SAME §8 gate as /pay before creating the
// session, so redirecting to Stripe is not a way around the mandate. The
// approval is deliberately NOT consumed here - it is consumed when the money
// actually moves (webhook / return), otherwise abandoning the Stripe page
// would burn the authorization and strand the deal.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const deal = store.deals.get(id);
  if (!deal) return Response.json({ error: 'deal_not_found' }, { status: 404 });
  if (deal.state === 'paid') return Response.json({ error: 'already_paid' }, { status: 409 });
  if (typeof deal.amountCents !== 'number') {
    return Response.json({ error: 'deal_not_settled' }, { status: 409 });
  }

  const ceiling = deal.mandateSnapshot.maxAmountCents;
  const requested = deal.amountCents;

  // §8 step 1: verify the bearer token.
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  let agent: Awaited<ReturnType<typeof verifyBearer>>;
  try {
    agent = await verifyBearer(token);
  } catch {
    logEvent('auth0', `Checkout rejected for ${deal.id}: bearer token failed verification.`);
    return Response.json({ error: 'invalid_token' }, { status: 401 });
  }

  // §8 step 2: scope gate.
  if (!agent.scopes.includes('payments:execute')) {
    logEvent(
      'auth0',
      `403 for ${deal.id}: token lacks payments:execute. Ceiling ${usd(ceiling)}, requested ${usd(requested)}.`,
    );
    return Response.json({ error: 'mandate_exceeded', ceiling, requested }, { status: 403 });
  }

  // §8 step 3: the token must name this exact deal.
  const detail = agent.authorizationDetails?.[0];
  if (!detail || detail.deal_id !== id) {
    logEvent('auth0', `403 for ${deal.id}: authorization_details names a different deal.`);
    return Response.json({ error: 'deal_mismatch' }, { status: 403 });
  }

  // §8 step 4: no amount substitution after approval.
  if (detail.amount !== requested) {
    logEvent('auth0', `403 for ${deal.id}: approved amount does not match the settled amount.`);
    return Response.json({ error: 'amount_mismatch' }, { status: 403 });
  }

  // §8 step 5: refuse a replayed, already-consumed approval.
  const approval = ((deal.approvalId ? store.approvals.get(deal.approvalId) : undefined) ??
    [...store.approvals.values()].find((a) => a.dealId === id && a.status === 'approved')) as
    | ConsumableApproval
    | undefined;
  if (approval?.consumed) {
    logEvent('auth0', `403 for ${deal.id}: approval already consumed.`);
    return Response.json({ error: 'approval_consumed' }, { status: 403 });
  }

  if (!stripeConfigured()) {
    return Response.json({ error: 'stripe_not_configured' }, { status: 501 });
  }

  const vendor = store.orgs.get(deal.vendorOrgId);
  if (!vendor) return Response.json({ error: 'vendor_not_found' }, { status: 404 });
  const job = store.jobs.get(deal.jobId);

  const base =
    process.env.APP_BASE_URL?.replace(/\/$/, '') ?? new URL(req.url).origin;

  try {
    const session = await createDealCheckoutSession(deal, vendor, job, base);
    deal.checkoutSessionId = session.id;
    snapshot();
    logEvent(
      'stripe',
      `Checkout session opened for ${deal.id}: ${usd(session.amountCents)} to ${vendor.name}, ${usd(session.applicationFeeCents)} platform fee.`,
    );
    return Response.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    logEvent('stripe', `Checkout session failed for ${deal.id}: ${(err as Error).message}`);
    return Response.json({ error: 'checkout_failed', message: (err as Error).message }, { status: 502 });
  }
}
