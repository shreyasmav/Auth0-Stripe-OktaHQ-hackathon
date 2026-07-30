'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Deal, Job } from '@/lib/types';
import { BUYER_MANDATE } from '@/lib/seed';

const usd = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Buyer home for Acme Facilities. One seeded job card plus a free-text
 * intake box. Both roads lead to the deal room.
 */
export default function DashboardPage() {
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdJobs, setCreatedJobs] = useState<Job[]>([]);

  async function openDealRoom(jobId: string) {
    setOpening(jobId);
    setWarn(null);
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      if (!res.ok) throw new Error(`POST /api/deals returned ${res.status}`);
      const data = (await res.json()) as { deal: Deal };
      router.push(`/deals/${data.deal.id}`);
    } catch (e) {
      setWarn(`Could not open the deal room. ${e instanceof Error ? e.message : 'Unknown error.'}`);
      setOpening(null);
    }
  }

  async function createJob() {
    if (!rawText.trim()) return;
    setCreating(true);
    setWarn(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: rawText.trim() }),
      });
      if (!res.ok) throw new Error(`POST /api/jobs returned ${res.status}`);
      const data = (await res.json()) as { job: Job };
      setCreatedJobs((prev) => [data.job, ...prev]);
      setRawText('');
    } catch (e) {
      setWarn(`Could not create the request. ${e instanceof Error ? e.message : 'Unknown error.'}`);
    } finally {
      setCreating(false);
    }
  }

  const expiry = new Date(BUYER_MANDATE.expiresAt * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Acme Facilities</h1>
          <p className="mt-1 text-dim">Buyer workspace</p>
        </div>
        <span className="rounded-full border border-line bg-raised px-3 py-1 font-mono text-xs uppercase tracking-widest text-dim">
          Free tier
        </span>
      </div>

      {warn && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">{warn}</p>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Left 2/3: jobs */}
        <div className="col-span-2 space-y-4">
          <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-dim">Open requests</h2>

          {[...createdJobs, SEED_JOB_CARD].map((job) => (
            <div
              key={job.id}
              className="rounded-xl border border-line bg-raised p-6 transition-colors hover:border-accent/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-medium">{job.title}</h3>
                  <p className="mt-1 text-sm text-dim">{job.scope}</p>
                  <div className="mt-3 flex gap-3 font-mono text-xs text-dim">
                    <span className="rounded bg-inset px-2 py-1">{job.category}</span>
                    <span className="rounded bg-inset px-2 py-1">due {job.deadline}</span>
                  </div>
                </div>
                <button
                  onClick={() => openDealRoom(job.id)}
                  disabled={opening !== null}
                  className="shrink-0 rounded-lg bg-accent px-5 py-2.5 font-semibold text-bg transition-colors hover:bg-accent-deep hover:text-ink disabled:opacity-50"
                >
                  {opening === job.id ? 'Researching vendors...' : 'Open deal room'}
                </button>
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-line bg-raised p-6">
            <h3 className="font-mono text-xs uppercase tracking-[0.25em] text-dim">New request</h3>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Describe the work in plain language, e.g. We need a 200A electrical panel upgrade in suite 300 before the November inspection."
              rows={3}
              className="mt-3 w-full resize-none rounded-lg border border-line bg-inset p-3 text-sm placeholder:text-dim/60 focus:border-accent focus:outline-none"
            />
            <button
              onClick={createJob}
              disabled={creating || !rawText.trim()}
              className="mt-3 rounded-lg border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-bg disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create request'}
            </button>
          </div>
        </div>

        {/* Right 1/3: mandate summary */}
        <div className="space-y-4">
          <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-dim">Agent mandate</h2>
          <div className="rounded-xl border border-line bg-raised p-6">
            <div className="font-mono text-xs uppercase tracking-widest text-dim">Ceiling</div>
            <div className="mt-1 font-mono text-4xl font-bold text-money">
              {usd(BUYER_MANDATE.maxAmountCents)}
            </div>
            <div className="mt-0.5 font-mono text-xs uppercase text-dim">
              {BUYER_MANDATE.currency}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {BUYER_MANDATE.categories.map((c) => (
                <span key={c} className="rounded bg-inset px-2 py-1 font-mono text-xs text-dim">
                  {c}
                </span>
              ))}
            </div>
            <div className="mt-4 text-sm text-dim">
              Expires <span className="text-ink">{expiry}</span>
            </div>
            <a href="/dashboard/mandate" className="mt-4 block text-sm text-accent hover:underline">
              View mandate details
            </a>
          </div>
          <p className="text-xs leading-relaxed text-dim">
            The ceiling travels inside the agent&apos;s signed access token. The server reads it
            from verified claims, never from a database row.
          </p>
        </div>
      </div>
    </div>
  );
}

// Mirrors the seeded fixture in lib/seed.ts so the card renders without a jobs
// GET endpoint. The id is what matters: POST /api/deals resolves it server-side.
const SEED_JOB_CARD = {
  id: 'job_panel_300',
  title: '200A panel upgrade, suite 300',
  scope: 'Replace existing 100A panel with 200A service, permit included',
  category: 'electrical',
  deadline: '2026-11-03',
};
