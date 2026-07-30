// Billing — CLAUDE.md §13. Checkout Session in subscription mode for Pro.
import { getStripe } from "./client";
import type { Org } from "../types";

export async function createProCheckoutSession(org: Org, successUrl: string, cancelUrl: string) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: org.stripeCustomerId,
    client_reference_id: org.id,
    metadata: { org_id: org.id },
  });
  return session;
}
