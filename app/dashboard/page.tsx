'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Deal, Job } from '@/lib/types';
import { BUYER_MANDATE } from '@/lib/seed';

const usd = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Buyer home for Acme Facilities, laid out the way Apple lays out a buy page:
 * a short centred heading, then a grid of cards that each carry one thing you
 * can act on. The intake box sits above the grid because typing a request is
 * the primary action, not a footnote.
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

  const jobs = [...createdJobs, SEED_JOB_CARD];

  return (
    <>
      <div className="page pb-10">
        <div className="text-center">
          <p className="eyebrow mb-3">Acme Facilities</p>
          <h1 className="text-[48px] leading-[1.05] font-semibold">Buy something.</h1>
          <p className="mx-auto mt-4 max-w-xl text-[19px] leading-[1.4] text-muted">
            Describe the work. Your agent researches the market, negotiates it, and stops at your
            ceiling.
          </p>
        </div>

        {warn && (
          <p className="mx-auto mt-8 max-w-2xl rounded-[12px] border border-amber/40 bg-amber/5 px-4 py-3 text-center text-[14px] text-amber">
            {warn}
          </p>
        )}

        {/* Intake. The single most-used control on the page, so it gets the
            width and the primary pill. */}
        <div className="mx-auto mt-10 max-w-2xl">
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="We need a 200A electrical panel upgrade in suite 300 before the November inspection. Budget under $3,000."
            rows={3}
            className="w-full resize-none rounded-[18px] border border-rule bg-white p-5 text-[17px] leading-[1.45] placeholder:text-muted focus:border-blue focus:outline-none"
          />
          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              onClick={createJob}
              disabled={creating || !rawText.trim()}
              className="btn-pill btn-primary"
            >
              {creating ? 'Creating…' : 'Create request'}
            </button>
            <span className="text-[13px] text-muted">
              Name a budget and it becomes the mandate ceiling.
            </span>
          </div>
        </div>
      </div>

      {/* Grey band carrying the request cards, the alternating-section move. */}
      <section className="bg-band py-16">
        <div className="mx-auto max-w-[1120px] px-6">
          <h2 className="mb-8 text-center text-[32px] font-semibold">Open requests.</h2>

          {/* Centred flex rather than a grid: with one or two open requests a
              grid strands them against the left edge. */}
          <div className="flex flex-wrap justify-center gap-6">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="card card-hover flex w-full max-w-[340px] flex-col p-8 text-center"
              >
                <p className="eyebrow mb-3">{job.category}</p>
                <h3 className="text-[21px] leading-[1.2] font-semibold">{job.title}</h3>
                <p className="mt-3 flex-1 text-[15px] leading-[1.45] text-muted">{job.scope}</p>
                <p className="mt-4 text-[13px] text-muted">Due {job.deadline}</p>
                <button
                  onClick={() => openDealRoom(job.id)}
                  disabled={opening !== null}
                  className="btn-pill-sm btn-primary mt-6 self-center"
                >
                  {opening === job.id ? 'Researching…' : 'Open deal room'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mandate. Its own quiet section rather than a sidebar tile: it is the
          product's whole claim, and it reads better with air around it. */}
      <section className="page">
        <div className="mx-auto max-w-2xl">
          <div className="card p-8 text-center">
            <p className="eyebrow">Agent mandate</p>
            <p className="price mt-3 text-[56px] leading-none font-semibold">
              {usd(BUYER_MANDATE.maxAmountCents)}
            </p>
            <p className="mt-2 text-[15px] text-muted">
              {BUYER_MANDATE.currency.toUpperCase()} &middot; expires {expiry}
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {BUYER_MANDATE.categories.map((c) => (
                <span key={c} className="chip">
                  {c}
                </span>
              ))}
            </div>

            <p className="mx-auto mt-6 max-w-md text-[14px] leading-[1.5] text-muted">
              The ceiling travels inside the agent&apos;s signed access token. The server reads it
              from verified claims, never from a database row.
            </p>
            <a href="/dashboard/mandate" className="link-arrow mt-5 inline-block text-[15px]">
              View mandate details &rsaquo;
            </a>
          </div>
        </div>
      </section>
    </>
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
