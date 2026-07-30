import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/store";
import { getAppSession } from "@/lib/auth0/session";
import type { Job } from "@/lib/types";

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("hvac") || lower.includes("furnace") || lower.includes("air condition")) return "hvac";
  if (lower.includes("panel") || lower.includes("electric") || lower.includes("wiring")) return "electrical";
  return "general";
}

// POST: free-text job request → structured Job. No LLM required — a
// keyword heuristic is enough for the demo since the negotiation's economics
// are rigged by seed data (§11.1), not by parsed job content.
export async function POST(req: NextRequest) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const rawText = String(body.rawText ?? "").trim();
  if (!rawText) return NextResponse.json({ error: "rawText required" }, { status: 400 });

  const job: Job = {
    id: newId("job"),
    buyerOrgId: session.orgId,
    requestedByUserId: session.userId,
    rawText,
    title: rawText.length > 60 ? `${rawText.slice(0, 57)}...` : rawText,
    category: detectCategory(rawText),
    scope: rawText,
    deadline: body.deadline ?? "ASAP",
    createdAt: Date.now(),
  };
  db.jobs.put(job);

  return NextResponse.json({ job });
}
