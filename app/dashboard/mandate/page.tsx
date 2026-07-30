'use client';

import { useEffect, useState } from 'react';
import { BUYER_MANDATE } from '@/lib/seed';

const usd = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Flags = {
  demoMode: string;
  approvalMode: string;
  negotiationMode: string;
  auth0Configured: boolean;
  stripeConfigured: boolean;
};

/**
 * Admin view of the buyer agent's mandate. Deliberately read-only:
 * the point of the product is that this screen has no write path.
 */
export default function MandatePage() {
  const [flags, setFlags] = useState<Flags | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/flags')
      .then((r) => (r.ok ? r.json() : null))
      .then((f) => {
        if (alive && f) setFlags(f as Flags);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const expiryIso = new Date(BUYER_MANDATE.expiresAt * 1000).toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Agent mandate</h1>
        <span className="rounded-full border border-accent/50 bg-accent/10 px-3 py-1 font-mono text-xs uppercase tracking-widest text-accent">
          Admin only
        </span>
      </div>

      <div className="rounded-xl border border-line bg-raised p-6">
        <div className="grid grid-cols-2 gap-5">
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-widest text-dim">Ceiling</span>
            <input
              value={usd(BUYER_MANDATE.maxAmountCents)}
              disabled
              className="mt-1.5 w-full cursor-not-allowed rounded-lg border border-line bg-inset px-3 py-2.5 font-mono text-2xl font-bold text-money opacity-80"
            />
          </label>
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-widest text-dim">Currency</span>
            <input
              value={BUYER_MANDATE.currency.toUpperCase()}
              disabled
              className="mt-1.5 w-full cursor-not-allowed rounded-lg border border-line bg-inset px-3 py-2.5 font-mono text-2xl opacity-80"
            />
          </label>
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-widest text-dim">Categories</span>
            <input
              value={BUYER_MANDATE.categories.join(', ')}
              disabled
              className="mt-1.5 w-full cursor-not-allowed rounded-lg border border-line bg-inset px-3 py-2.5 font-mono opacity-80"
            />
          </label>
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-widest text-dim">Expires</span>
            <input
              value={expiryIso}
              disabled
              className="mt-1.5 w-full cursor-not-allowed rounded-lg border border-line bg-inset px-3 py-2.5 font-mono opacity-80"
            />
          </label>
        </div>

        <p className="mt-6 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm leading-relaxed text-dim">
          <span className="font-medium text-accent">Why is this disabled?</span> The ceiling lives
          in a signed token claim
          (<code className="font-mono text-xs text-ink">https://mandate.dev/mandate</code>) minted
          by Auth0 on the agent&apos;s client-credentials exchange. Nothing typed here would change
          what the server trusts.
        </p>
      </div>

      {flags && (
        <div className="flex gap-2 font-mono text-xs text-dim">
          <span className="rounded bg-raised px-2 py-1">demo: {flags.demoMode}</span>
          <span className="rounded bg-raised px-2 py-1">approval: {flags.approvalMode}</span>
          <span className="rounded bg-raised px-2 py-1">negotiation: {flags.negotiationMode}</span>
          <span className="rounded bg-raised px-2 py-1">
            auth0: {flags.auth0Configured ? 'configured' : 'mock'}
          </span>
        </div>
      )}
    </div>
  );
}
