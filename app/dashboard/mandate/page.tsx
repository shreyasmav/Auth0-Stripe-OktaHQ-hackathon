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
    <div className="page mx-auto max-w-2xl">
      <div className="text-center">
        <p className="eyebrow mb-3">Admin only</p>
        <h1 className="text-[40px] leading-none font-semibold">Agent mandate.</h1>
      </div>

      <div className="card mt-10 divide-y divide-rule">
        {[
          { label: 'Ceiling', value: usd(BUYER_MANDATE.maxAmountCents), big: true },
          { label: 'Currency', value: BUYER_MANDATE.currency.toUpperCase() },
          { label: 'Categories', value: BUYER_MANDATE.categories.join(', ') },
          { label: 'Expires', value: expiryIso },
        ].map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-6 px-7 py-5">
            <span className="text-[15px] text-muted">{row.label}</span>
            <span
              className={
                row.big ? 'price text-[28px] font-semibold' : 'text-[17px] font-medium'
              }
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-6 text-[15px] leading-[1.5] text-muted">
        <span className="font-medium text-ink">Why can&apos;t I edit this?</span> The ceiling lives
        in a signed token claim{' '}
        <code className="font-mono text-[13px] text-ink">https://mandate.dev/mandate</code> minted
        by Auth0 on the agent&apos;s client-credentials exchange. Nothing typed here would change
        what the server trusts.
      </p>

      {flags && (
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <span className="chip">Demo: {flags.demoMode}</span>
          <span className="chip">Approval: {flags.approvalMode}</span>
          <span className="chip">Negotiation: {flags.negotiationMode}</span>
          <span className="chip">Auth0: {flags.auth0Configured ? 'configured' : 'mock'}</span>
        </div>
      )}
    </div>
  );
}
