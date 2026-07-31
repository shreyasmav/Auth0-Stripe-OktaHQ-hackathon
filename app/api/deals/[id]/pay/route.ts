import type { NextRequest } from 'next/server';
import type { Approval } from '@/lib/types';
import { verifyBearer } from '@/lib/auth0/verify';
import { defaultConnectedAccount, flags, stripeConfigured } from '@/lib/env';
import { getStripe } from '@/lib/stripe/client';
import { logEvent, snapshot, store } from '@/lib/store';

export const dynamic = 'force-dynamic';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// The Approval type has no consumed field. We track single-use consumption as
// a runtime extension so lib/types.ts stays untouched (§18 working agreement).
type ConsumableApproval = Approval & { consumed?: boolean };

// POST /api/deals/[id]/pay. THE GATE. §8 order, exactly. The authorization
// decision reads verified token claims, never the store. mandateSnapshot is
// for display and audit only.
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

  // §8 step 1: verify the bearer token. In mock mode verifyBearer treats the
  // token as an approval grantedToken and never throws, so the 403 beat below
  // works with any garbage or absent token.
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  let agent: Awaited<ReturnType<typeof verifyBearer>>;
  try {
    agent = await verifyBearer(token);
  } catch {
    logEvent('auth0', `Payment rejected for ${deal.id}: bearer token failed verification.`);
    return Response.json({ error: 'invalid_token' }, { status: 401 });
  }

  // §8 step 2: scope gate. This 403 is a demo beat, not an error to hide.
  if (!agent.scopes.includes('payments:execute')) {
    logEvent(
      'auth0',
      `403 for ${deal.id}: token lacks payments:execute. Ceiling ${usd(ceiling)}, requested ${usd(requested)}.`,
    );
    return Response.json({ error: 'mandate_exceeded', ceiling, requested }, { status: 403 });
  }

  // §8 step 3: the token must name this exact deal. A token approved for deal
  // A must not pay deal B.
  const detail = agent.authorizationDetails?.[0];
  if (!detail || detail.deal_id !== id) {
    logEvent('auth0', `403 for ${deal.id}: authorization_details names a different deal.`);
    return Response.json({ error: 'deal_mismatch' }, { status: 403 });
  }

  // §8 step 4: no amount substitution after approval.
  if (detail.amount !== requested) {
    logEvent(
      'auth0',
      `403 for ${deal.id}: approved amount ${usd(detail.amount)} does not match settled ${usd(requested)}.`,
    );
    return Response.json({ error: 'amount_mismatch' }, { status: 403 });
  }

  // §8 step 5: mark the approval consumed. Single use. Clearing grantedToken
  // means the same token can never verify again in mock mode.
  const approval = ((deal.approvalId ? store.approvals.get(deal.approvalId) : undefined) ??
    [...store.approvals.values()].find((a) => a.dealId === id && a.status === 'approved')) as
    | ConsumableApproval
    | undefined;
  if (approval) {
    if (approval.consumed) {
      logEvent('auth0', `403 for ${deal.id}: approval already consumed.`);
      return Response.json({ error: 'approval_consumed' }, { status: 403 });
    }
    approval.consumed = true;
    delete approval.grantedToken;
    deal.approvalId = approval.id;
    snapshot();
    logEvent('auth0', `Approval ${approval.id} consumed for ${deal.id}. Single use.`);
  }

  // §8 step 6: only now touch money.
  const feeCents = Math.round(requested * 0.03);
  const vendor = store.orgs.get(deal.vendorOrgId);
  const useMock = flags.demoMode === 'mock' || !stripeConfigured();

  let paymentIntentId = '';
  let mock = false;

  if (useMock) {
    // §14: fabricated payment with correct-looking fee math. The UI marks it
    // with a MOCK chip so a judge never mistakes it for real.
    paymentIntentId = `pi_mock_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    mock = true;
    logEvent(
      'stripe',
      `MOCK PaymentIntent ${paymentIntentId}: ${usd(requested)} captured, ${usd(feeCents)} platform fee.`,
    );
  } else {
    const stripe = getStripe();
    if (!stripe) return Response.json({ error: 'stripe_unavailable' }, { status: 502 });
    try {
      const destination = vendor?.stripeAccountId ?? defaultConnectedAccount();
      if (destination) {
        // §13 destination charge, server-confirmed for demo determinism. The
        // idempotency key is keyed on the deal so a double-click cannot
        // double-charge.
        const pi = await stripe.paymentIntents.create(
          {
            amount: requested,
            currency: 'usd',
            payment_method: 'pm_card_visa',
            confirm: true,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
            application_fee_amount: feeCents,
            transfer_data: { destination },
            metadata: { deal_id: deal.id, approval_id: deal.approvalId ?? '' },
          },
          { idempotencyKey: `deal_${deal.id}_pay` },
        );
        paymentIntentId = pi.id;
        logEvent(
          'stripe',
          `Destination charge ${pi.id}: ${usd(requested)} to ${vendor?.name ?? destination}, ${usd(feeCents)} platform fee.`,
        );
      } else {
        // Demo shortcut: vendor has not finished Connect onboarding, so this
        // is a plain PaymentIntent. The fee split is computed app-side for
        // display; no funds actually move to the vendor.
        const pi = await stripe.paymentIntents.create(
          {
            amount: requested,
            currency: 'usd',
            payment_method: 'pm_card_visa',
            confirm: true,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
            metadata: { deal_id: deal.id, approval_id: deal.approvalId ?? '' },
          },
          { idempotencyKey: `deal_${deal.id}_pay` },
        );
        paymentIntentId = pi.id;
        logEvent(
          'stripe',
          `Plain PaymentIntent ${pi.id}: vendor has no Connect account yet, fee split shown is computed, not transferred.`,
        );
      }
    } catch {
      deal.state = 'failed';
      snapshot();
      logEvent('stripe', `PaymentIntent failed for ${deal.id}.`);
      return Response.json({ error: 'payment_failed' }, { status: 402 });
    }
  }

  deal.paymentIntentId = paymentIntentId;
  deal.applicationFeeCents = feeCents;
  deal.state = 'paid';
  snapshot();
  logEvent(
    'stripe',
    `Deal ${deal.id} paid: ${usd(requested)} total, ${usd(requested - feeCents)} to vendor, ${usd(feeCents)} Mandate fee.`,
  );

  return Response.json({
    deal,
    payment: {
      amountCents: requested,
      applicationFeeCents: feeCents,
      vendorNetCents: requested - feeCents,
      paymentIntentId,
      mock,
    },
  });
}
