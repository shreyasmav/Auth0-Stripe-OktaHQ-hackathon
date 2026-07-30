// Connect Express onboarding + the destination charge — CLAUDE.md §13.
import { getStripe } from "./client";
import type { Deal, Org } from "../types";

export async function createExpressAccountAndOnboardingLink(vendor: Org, returnUrl: string, refreshUrl: string) {
  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    business_type: "company",
    company: { name: vendor.name },
  });
  const link = await stripe.accountLinks.create({
    account: account.id,
    type: "account_onboarding",
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });
  return { accountId: account.id, url: link.url };
}

export type PaymentResult = {
  paymentIntentId: string;
  status: string;
  amountCents: number;
  applicationFeeCents: number;
  vendorReceivesCents: number;
  mock: boolean;
};

const PLATFORM_FEE_RATE = 0.03;

/**
 * Server-confirmed destination charge for demo determinism. The idempotency
 * key is keyed on the deal id — a double-click on Pay can never double-
 * charge — and is not optional, per §13.
 */
export async function chargeForDeal(deal: Deal, vendor: Org): Promise<PaymentResult> {
  if (!vendor.stripeAccountId) {
    throw new Error(`vendor ${vendor.id} has no connected Stripe account`);
  }
  const amountCents = deal.amountCents ?? 0;
  const applicationFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: "usd",
      payment_method: "pm_card_visa",
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      application_fee_amount: applicationFeeCents,
      transfer_data: { destination: vendor.stripeAccountId },
      metadata: { deal_id: deal.id, approval_id: deal.approvalId ?? "" },
    },
    { idempotencyKey: `deal_${deal.id}_pay` },
  );

  return {
    paymentIntentId: intent.id,
    status: intent.status,
    amountCents,
    applicationFeeCents,
    vendorReceivesCents: amountCents - applicationFeeCents,
    mock: false,
  };
}

/** DEMO_MODE=mock: identical shape, fabricated result, correct fee math. */
export function mockChargeForDeal(deal: Deal): PaymentResult {
  const amountCents = deal.amountCents ?? 0;
  const applicationFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);
  return {
    paymentIntentId: `pi_mock_${deal.id}`,
    status: "succeeded",
    amountCents,
    applicationFeeCents,
    vendorReceivesCents: amountCents - applicationFeeCents,
    mock: true,
  };
}
