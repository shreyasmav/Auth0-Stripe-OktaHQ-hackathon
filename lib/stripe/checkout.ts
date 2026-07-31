// Stripe Checkout for a settled deal.
//
// The server-confirmed PaymentIntent in connect.ts charges without a human
// touching a card. That is right for an unattended demo, but the product
// story is that a person accepts the final price and pays. This builds the
// hosted Checkout Session they get redirected to.
//
// The Connect economics are unchanged: destination charge to the vendor's
// connected account with the platform's 3% as an application fee, so the fee
// split shown in the UI is the same money movement either way.
import type Stripe from 'stripe';
import { getStripe } from './client';
import { defaultConnectedAccount } from '../env';
import type { Deal, Org } from '../types';

const PLATFORM_FEE_RATE = 0.03;

export type CheckoutSessionResult = {
  id: string;
  url: string;
  amountCents: number;
  applicationFeeCents: number;
};

export async function createDealCheckoutSession(
  deal: Deal,
  vendor: Org,
  job: { title: string; scope: string } | undefined,
  baseUrl: string,
): Promise<CheckoutSessionResult> {
  const stripe = getStripe();
  if (!stripe) throw new Error('stripe_unavailable');

  const amountCents = deal.amountCents ?? 0;
  const feeCents = Math.round(amountCents * PLATFORM_FEE_RATE);

  // Only route funds to a vendor that finished Connect onboarding. Without an
  // account id this is a plain charge and the split is display-only - the same
  // honest distinction the pay route draws.
  // Prefer the vendor's own onboarded account; fall back to the configured
  // STRIPE_ACCOUNT_ID so a demo can route real money without every vendor
  // completing Connect onboarding first.
  const destination = vendor.stripeAccountId ?? defaultConnectedAccount();

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData =
    destination
      ? {
          application_fee_amount: feeCents,
          transfer_data: { destination },
          metadata: { deal_id: deal.id, approval_id: deal.approvalId ?? '' },
        }
      : { metadata: { deal_id: deal.id, approval_id: deal.approvalId ?? '' } };

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: job?.title ?? `Deal ${deal.id}`,
              description: job?.scope?.slice(0, 300) || `Negotiated settlement with ${vendor.name}`,
            },
          },
        },
      ],
      payment_intent_data: paymentIntentData,
      // deal_id on the session too: the webhook reads it without having to
      // expand the payment intent.
      metadata: { deal_id: deal.id, approval_id: deal.approvalId ?? '' },
      success_url: `${baseUrl}/deals/${deal.id}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/deals/${deal.id}?checkout=cancelled`,
    },
    // Keyed on the deal so a double-click cannot open two payable sessions.
    { idempotencyKey: `deal_${deal.id}_checkout` },
  );

  if (!session.url) throw new Error('stripe_no_checkout_url');

  return {
    id: session.id,
    url: session.url,
    amountCents,
    applicationFeeCents: feeCents,
  };
}

/** Reads a completed session back to confirm payment on return from Stripe. */
export async function retrieveCheckoutSession(sessionId: string) {
  const stripe = getStripe();
  if (!stripe) throw new Error('stripe_unavailable');
  return stripe.checkout.sessions.retrieve(sessionId);
}
