import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/store";
import { createExpressAccountAndOnboardingLink } from "@/lib/stripe/connect";
import { stripeConfigured } from "@/lib/stripe/client";

// POST: create a Connect Express account + onboarding link for a vendor org.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const orgId = String(body.orgId ?? "");
  const vendor = db.orgs.get(orgId);
  if (!vendor || vendor.kind !== "vendor") {
    return NextResponse.json({ error: "vendor_not_found" }, { status: 404 });
  }

  if (!stripeConfigured()) {
    return NextResponse.json({ error: "stripe_not_configured", mock: true }, { status: 501 });
  }

  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const { accountId, url } = await createExpressAccountAndOnboardingLink(
    vendor,
    `${base}/vendor?connected=1`,
    `${base}/vendor?refresh=1`,
  );

  vendor.stripeAccountId = accountId;
  db.orgs.put(vendor);

  return NextResponse.json({ accountId, url });
}
