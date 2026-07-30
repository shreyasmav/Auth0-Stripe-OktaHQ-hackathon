import type { NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/client';
import { logEvent, snapshot, store } from '@/lib/store';

export const dynamic = 'force-dynamic';

// POST /api/stripe/webhook. Raw body, never req.json(). The signature check
// needs the exact bytes Stripe sent (§16).
export async function POST(req: NextRequest) {
  const payload = await req.text();

  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    // Guarded: no webhook secret configured. Acknowledge and do nothing so a
    // stray delivery never 500s during the demo.
    return Response.json({ received: true, skipped: true });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      req.headers.get('stripe-signature') ?? '',
      secret,
    );
  } catch {
    return Response.json({ error: 'invalid_signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const dealId = pi.metadata?.deal_id;
      const deal = dealId ? store.deals.get(dealId) : undefined;
      if (deal) {
        deal.state = 'paid';
        deal.paymentIntentId = pi.id;
      }
      logEvent('stripe', `Webhook: payment_intent.succeeded ${pi.id}${deal ? ` for ${deal.id}` : ''}.`);
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const dealId = pi.metadata?.deal_id;
      const deal = dealId ? store.deals.get(dealId) : undefined;
      if (deal) deal.state = 'failed';
      logEvent('stripe', `Webhook: payment_intent.payment_failed ${pi.id}${deal ? ` for ${deal.id}` : ''}.`);
      break;
    }
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.org_id;
      const org = orgId ? store.orgs.get(orgId) : undefined;
      if (org) {
        org.tier = 'pro';
        if (typeof session.customer === 'string') org.stripeCustomerId = session.customer;
      }
      logEvent('stripe', `Webhook: checkout.session.completed${org ? `, ${org.name} upgraded to Pro` : ''}.`);
      break;
    }
    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      const org = [...store.orgs.values()].find((o) => o.stripeAccountId === account.id);
      logEvent(
        'stripe',
        `Webhook: account.updated ${account.id}${org ? ` (${org.name})` : ''}, charges ${account.charges_enabled ? 'enabled' : 'disabled'}.`,
      );
      break;
    }
    default:
      logEvent('stripe', `Webhook: ${event.type} ignored.`);
  }

  snapshot();
  return Response.json({ received: true });
}
