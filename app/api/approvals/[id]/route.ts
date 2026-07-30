import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/store";
import { getApproval, resolveApproval } from "@/lib/approval";

// GET: poll status. The browser polls this every ~1s; the server is the one
// polling Auth0 (CIBA) or waiting on the front-channel tap — never the
// browser talking to Auth0 directly.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const approval = await getApproval(id);
  if (!approval) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ approval });
}

// POST: approve/deny — front-channel only. The approver landed on
// /approve/[approvalId], authenticated, and is tapping the button.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const approval = await getApproval(id);
  if (!approval) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const deal = db.deals.get(approval.dealId);
  if (!deal) return NextResponse.json({ error: "deal_not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const decision = body.decision === "denied" ? "denied" : "approved";

  const resolved = await resolveApproval(id, decision, deal, deal.buyerOrgId);

  deal.state = decision === "approved" ? "approved" : "denied";
  db.deals.put(deal);

  return NextResponse.json({ approval: resolved });
}
