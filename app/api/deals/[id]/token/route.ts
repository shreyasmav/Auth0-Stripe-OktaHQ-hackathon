import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/store";
import { getAgentToken } from "@/lib/auth0/agent";
import { verifyAgentToken } from "@/lib/auth0/verify";

// GET: decoded (verified) claims of the buyer agent's live token for this
// deal's org — for the UI's "decoded token drawer" (§12). Returns claims
// only, never the raw token string.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = db.deals.get(id);
  if (!deal) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const token = await getAgentToken(deal.buyerOrgId);
  const claims = await verifyAgentToken(token);

  return NextResponse.json({
    sub: claims.sub,
    scope: claims.scope,
    orgId: claims.orgId,
    mandate: claims.mandate,
  });
}
