import type { NextRequest } from 'next/server';
import type { Approval } from '@/lib/types';
import { retrieveCheckoutSession } from '@/lib/stripe/checkout';
import { stripeConfigured } from '@/lib/env';
import { logEvent, snapshot, store } from '@/lib/store';

export const dynamic = 'force-dynamic';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
type ConsumableApproval = Approval & { consumed?: boolean };

// POST /api/deals/[id]/checkout/confirm { sessionId } -> { deal, payment }
//
// Called when Stripe redirects the payer back. The webhook is the durable
// path; this exists so the UI updates immediately instead of waiting on
// delivery. Both are idempotent, and both read payment_status from Stripe
// rather than trusting the redirect - anyone can craft a success URL.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const deal = store.deals.get(id);
  if (!deal) return Response.json({ error: 'deal_not_found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { sessionId?: unknown } | null;
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : deal.checkoutSessionId;
  if (!sessionId) return Response.json({ error: 'no_session' }, { status: 400 });
  if (!stripeConfigured()) return Response.json({ error: 'stripe_not_configured' }, { status: 501 });

  let session;
  try {
    session = await retrieveCheckoutSession(sessionId);
  } catch (err) {
    return Response.json({ error: 'session_lookup_failed', message: (err as Error).message }, { status: 502 });
  }

  // The redirect proves nothing. Stripe's own payment_status does.
  if (session.payment_status !== 'paid') {
    return Response.json({ error: 'not_paid', status: session.payment_status }, { status: 409 });
  }
  if (session.metadata?.deal_id && session.metadata.deal_id !== id) {
    return Response.json({ error: 'session_deal_mismatch' }, { status: 403 });
  }

  const amountCents = session.amount_total ?? deal.amountCents ?? 0;
  const feeCents = Math.round(amountCents * 0.03);

  if (deal.state !== 'paid') {
    deal.state = 'paid';
    deal.amountCents = amountCents;
    deal.applicationFeeCents = feeCents;
    deal.checkoutSessionId = session.id;
    deal.paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : deal.paymentIntentId;

    // Consume the approval only now that money has actually moved. Abandoning
    // the Stripe page must not burn the authorization.
    const approval = (deal.approvalId ? store.approvals.get(deal.approvalId) : undefined) as
      | ConsumableApproval
      | undefined;
    if (approval) {
      approval.consumed = true;
      delete approval.grantedToken;
    }
    snapshot();
    logEvent(
      'stripe',
      `Checkout completed for ${deal.id}: ${usd(amountCents)} paid, ${usd(feeCents)} platform fee.`,
    );
  }

  return Response.json({
    deal,
    payment: {
      amountCents,
      applicationFeeCents: feeCents,
      vendorNetCents: amountCents - feeCents,
      paymentIntentId: deal.paymentIntentId ?? session.id,
      mock: false,
    },
  });
}
