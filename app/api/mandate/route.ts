import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth0/session";
import { getMandateSnapshotForDisplay, setMandateOverride } from "@/lib/auth0/agent";

// GET: current effective mandate for the caller's org (display only).
export async function GET() {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ mandate: getMandateSnapshotForDisplay(session.orgId) });
}

// POST: admin-only — set the agent's mandate ceiling. Invalidates the
// cached token so the next negotiation's agent token reflects it.
export async function POST(req: NextRequest) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const maxAmountCents = Number(body.maxAmountCents);
  if (!Number.isFinite(maxAmountCents) || maxAmountCents < 0) {
    return NextResponse.json({ error: "invalid_max_amount_cents" }, { status: 400 });
  }

  setMandateOverride(session.orgId, maxAmountCents);
  return NextResponse.json({ mandate: getMandateSnapshotForDisplay(session.orgId) });
}
