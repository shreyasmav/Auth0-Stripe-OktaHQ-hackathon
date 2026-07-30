import type { Org } from '../types';
import { flags } from '../env';
import { logEvent, snapshot, store } from '../store';
import { getStripe } from './client';

// §13 Connect Express onboarding. Create the account once, keep the id on the
// org, and hand back a fresh onboarding link. Mock fallback when Stripe is not
// configured or demo mode is mock, so the vendor page never dead-ends.
export async function createExpressAccount(
  org: Org,
): Promise<{ url: string; accountId?: string; mock: boolean }> {
  const stripe = getStripe();
  if (flags.demoMode === 'mock' || !stripe) {
    logEvent('stripe', `MOCK Connect onboarding for ${org.name}. No live Stripe call made.`);
    return { mock: true, url: '#' };
  }

  let accountId = org.stripeAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      metadata: { org_id: org.id },
    });
    accountId = account.id;
    org.stripeAccountId = accountId;
    store.orgs.set(org.id, org);
    snapshot();
    logEvent('stripe', `Express account ${accountId} created for ${org.name}.`);
  }

  const base = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}/vendor`,
    return_url: `${base}/vendor`,
    type: 'account_onboarding',
  });
  logEvent('stripe', `Connect onboarding link created for ${org.name}.`);
  return { mock: false, url: link.url, accountId };
}
