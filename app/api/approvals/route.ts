import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/store";
import { getAppSession } from "@/lib/auth0/session";
import { requestApproval } from "@/lib/approval";

// POST: request approval for a deal awaiting one (CIBA or front-channel,
// selected by APPROVAL_MODE — the caller doesn't know or care which).
export async function POST(req: NextRequest) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dealId = String(body.dealId ?? "");
  const deal = db.deals.get(dealId);
  if (!deal) return NextResponse.json({ error: "deal_not_found" }, { status: 404 });

  if (deal.approvalId) {
    const existing = db.approvals.get(deal.approvalId);
    if (existing) return NextResponse.json({ approval: existing });
  }

  const vendor = db.orgs.get(deal.vendorOrgId);
  const job = db.jobs.get(deal.jobId);

  const approval = await requestApproval(
    deal,
    session.userId,
    vendor?.name ?? "vendor",
    job?.scope ?? "",
    job?.deadline ?? "ASAP",
  );
  deal.approvalId = approval.id;
  db.deals.put(deal);

  return NextResponse.json({ approval });
}
