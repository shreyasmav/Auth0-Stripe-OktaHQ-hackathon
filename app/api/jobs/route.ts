import type { NextRequest } from 'next/server';
import type { Job } from '@/lib/types';
import { getSessionUser } from '@/lib/auth0/session';
import { logEvent, snapshot, store } from '@/lib/store';

// POST /api/jobs {rawText} -> {job}
// LLM-free parse. Keyword heuristics map straight onto the seeded electrical
// job shape (§11.1) so the demo input always lands in-category.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { rawText?: unknown } | null;
  const rawText = typeof body?.rawText === 'string' ? body.rawText.trim() : '';
  if (!rawText) return Response.json({ error: 'rawText_required' }, { status: 400 });

  const user = await getSessionUser();

  const lower = rawText.toLowerCase();
  const isPanelJob = lower.includes('panel') || lower.includes('200a') || lower.includes('electrical');
  const category = /(hvac|air condition|cooling|furnace|heat pump)/.test(lower) ? 'hvac' : 'electrical';
  const firstSentence = rawText.split(/[.!?\n]/)[0].trim();
  const deadlineMatch = rawText.match(/\b(\d{4}-\d{2}-\d{2})\b/);

  const job: Job = {
    id: `job_${crypto.randomUUID().slice(0, 8)}`,
    buyerOrgId: user?.orgId ?? 'org_acme',
    requestedByUserId: user?.sub ?? 'anonymous',
    rawText,
    title: isPanelJob ? '200A panel upgrade, suite 300' : firstSentence.slice(0, 64) || 'General facilities job',
    category,
    scope: isPanelJob
      ? 'Replace existing 100A panel with 200A service, permit included'
      : rawText.slice(0, 140),
    deadline: deadlineMatch?.[1] ?? '2026-11-03',
    createdAt: Date.now(),
  };

  store.jobs.set(job.id, job);
  logEvent('system', `Job created: ${job.title} (${job.category}).`);
  snapshot();
  return Response.json({ job });
}
