import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/store";
import { createProCheckoutSession } from "@/lib/stripe/billing";
import { stripeConfigured } from "@/lib/stripe/client";

// POST: Billing Checkout session for the Pro tier.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const orgId = String(body.orgId ?? "");
  const org = db.orgs.get(orgId);
  if (!org) return NextResponse.json({ error: "org_not_found" }, { status: 404 });

  if (!stripeConfigured()) {
    return NextResponse.json({ error: "stripe_not_configured", mock: true }, { status: 501 });
  }

  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const session = await createProCheckoutSession(org, `${base}/dashboard?upgraded=1`, `${base}/dashboard`);

  return NextResponse.json({ url: session.url });
}
