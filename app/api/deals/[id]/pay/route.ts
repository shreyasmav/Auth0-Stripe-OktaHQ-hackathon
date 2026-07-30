import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/store";
import { verifyAgentToken, hasScope, TokenVerificationError } from "@/lib/auth0/verify";
import { stripeConfigured } from "@/lib/stripe/client";
import { chargeForDeal, mockChargeForDeal } from "@/lib/stripe/connect";

// POST /api/deals/:id/pay — the scope-gated route. The 403 lives here, in
// this order (CLAUDE.md §8):
//   1. verify the bearer JWT against the tenant JWKS
//   2. require payments:execute in scope
//   3. require authorization_details[0].deal_id === params.id
//   4. require amount === deal.amountCents
//   5. mark the approval consumed (single use — enforced via deal.state)
//   6. only then call Stripe
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: dealId } = await params;
  const deal = db.deals.get(dealId);
  if (!deal) return NextResponse.json({ error: "deal_not_found" }, { status: 404 });

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return NextResponse.json(
      { error: "mandate_exceeded", ceiling: deal.mandateSnapshot.maxAmountCents, requested: deal.amountCents },
      { status: 403 },
    );
  }

  let claims;
  try {
    claims = await verifyAgentToken(token);
  } catch (err) {
    if (err instanceof TokenVerificationError) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }
    throw err;
  }

  if (!hasScope(claims, "payments:execute")) {
    // This is the beat, not an error state to hide: the agent's normal
    // token carries deals:negotiate only. It cannot pay.
    return NextResponse.json(
      { error: "mandate_exceeded", ceiling: deal.mandateSnapshot.maxAmountCents, requested: deal.amountCents },
      { status: 403 },
    );
  }

  const details = claims.authorizationDetails?.[0];
  if (!details || details.deal_id !== dealId) {
    return NextResponse.json({ error: "deal_mismatch" }, { status: 403 });
  }

  if (details.amount !== deal.amountCents) {
    return NextResponse.json({ error: "amount_mismatch" }, { status: 403 });
  }

  if (deal.state !== "approved") {
    return NextResponse.json({ error: "not_approved", state: deal.state }, { status: 409 });
  }

  const vendor = db.orgs.get(deal.vendorOrgId);
  if (!vendor) return NextResponse.json({ error: "vendor_not_found" }, { status: 404 });

  try {
    const result =
      process.env.DEMO_MODE === "mock" || !stripeConfigured() ? mockChargeForDeal(deal) : await chargeForDeal(deal, vendor);

    // Single use: once paid, deal.state moves off "approved" so a replayed
    // token can never charge twice.
    deal.state = "paid";
    deal.paymentIntentId = result.paymentIntentId;
    deal.applicationFeeCents = result.applicationFeeCents;
    db.deals.put(deal);

    return NextResponse.json({ deal, payment: result });
  } catch (err) {
    deal.state = "failed";
    db.deals.put(deal);
    return NextResponse.json({ error: "payment_failed", message: (err as Error).message }, { status: 502 });
  }
}
