import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/store";
import { getAppSession } from "@/lib/auth0/session";
import { getAgentToken } from "@/lib/auth0/agent";
import { verifyAgentToken } from "@/lib/auth0/verify";
import type { Deal } from "@/lib/types";

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function cheapestVendorId(): string {
  const vendors = db.orgs.all().filter((o) => o.kind === "vendor");
  const cheapest = vendors.sort((a, b) => (a.floorCents ?? Infinity) - (b.floorCents ?? Infinity))[0];
  return cheapest?.id ?? "";
}

// POST: open a deal room. The mandate ceiling stamped onto the Deal comes
// from a verified JWT — the agent's token — never straight from the store.
// That's what §8 means by "never trust mandateSnapshot from the store for
// the authorization decision"; here we populate it FROM the verified claims
// in the first place.
export async function POST(req: NextRequest) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const jobId = String(body.jobId ?? "");
  const job = db.jobs.get(jobId);
  if (!job) return NextResponse.json({ error: "job_not_found" }, { status: 404 });

  const vendorOrgId = String(body.vendorOrgId ?? cheapestVendorId());
  const vendor = db.orgs.get(vendorOrgId);
  if (!vendor) return NextResponse.json({ error: "vendor_not_found" }, { status: 404 });

  const agentToken = await getAgentToken(job.buyerOrgId);
  const claims = await verifyAgentToken(agentToken);
  if (!claims.mandate) {
    return NextResponse.json({ error: "no_mandate_claim_on_token" }, { status: 500 });
  }

  const deal: Deal = {
    id: newId("deal"),
    jobId: job.id,
    buyerOrgId: job.buyerOrgId,
    vendorOrgId: vendor.id,
    state: "negotiating",
    mandateSnapshot: claims.mandate,
    transcript: [],
    createdAt: Date.now(),
  };
  db.deals.put(deal);

  return NextResponse.json({ deal });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const deal = db.deals.get(id);
    if (!deal) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const vendor = db.orgs.get(deal.vendorOrgId);
    return NextResponse.json({ deal, vendorName: vendor?.name ?? deal.vendorOrgId });
  }
  return NextResponse.json({ deals: db.deals.all() });
}
