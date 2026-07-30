import type { Org } from '../types';
import { flags } from '../env';
import { logEvent } from '../store';
import { getStripe } from './client';

// §13 Billing: Checkout Session in subscription mode for the Pro tier.
// The webhook on checkout.session.completed flips org.tier, not this call.
export async function createProCheckout(org: Org): Promise<{ url: string; mock: boolean }> {
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  if (flags.demoMode === 'mock' || !stripe || !priceId) {
    logEvent('stripe', `MOCK Pro checkout for ${org.name}. Billing not configured or demo mode.`);
    return { mock: true, url: '#' };
  }

  const base = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/dashboard?upgraded=1`,
    cancel_url: `${base}/dashboard`,
    metadata: { org_id: org.id },
  });
  logEvent('stripe', `Pro checkout session created for ${org.name}.`);
  return { mock: false, url: session.url ?? '#' };
}
