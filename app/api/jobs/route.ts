import type { NextRequest } from 'next/server';
import type { Job } from '@/lib/types';
import { getSessionUser } from '@/lib/auth0/session';
import { parseJobSpec } from '@/lib/live/jobspec';
import { startResearch } from '@/lib/live/research';
import { logEvent, snapshot, store } from '@/lib/store';

// POST /api/jobs {rawText} -> {job}
// Parses whatever the user actually typed into a structured spec (any
// category, any location). Falls back to keyword heuristics with no API key,
// so this route never depends on the LLM being reachable.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { rawText?: unknown } | null;
  const rawText = typeof body?.rawText === 'string' ? body.rawText.trim() : '';
  if (!rawText) return Response.json({ error: 'rawText_required' }, { status: 400 });

  const user = await getSessionUser();
  const spec = await parseJobSpec(rawText);

  const job: Job = {
    id: `job_${crypto.randomUUID().slice(0, 8)}`,
    buyerOrgId: user?.orgId ?? 'org_acme',
    requestedByUserId: user?.sub ?? 'anonymous',
    rawText,
    title: spec.title,
    category: spec.category,
    scope: spec.scope,
    deadline: spec.deadline,
    createdAt: Date.now(),
    spec,
  };

  store.jobs.set(job.id, job);

  // Head start: research runs while the user is still looking at the
  // dashboard, so opening the deal room rarely waits the full round trip.
  startResearch(job.id, spec);
  logEvent('system', `Job parsed: ${job.title} (${job.category}) in ${spec.location}, needed by ${spec.deadline}.`);
  snapshot();
  return Response.json({ job });
}
