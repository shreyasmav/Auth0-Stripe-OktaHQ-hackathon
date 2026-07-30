'use client';

import { useEffect, useState } from 'react';
import type { Approval, Deal } from '@/lib/types';

type Flags = {
  demoMode: string;
  approvalMode: string;
  negotiationMode: string;
  auth0Configured: boolean;
  stripeConfigured: boolean;
};

const BASE_SCOPES = ['deals:negotiate', 'deals:read'];

/**
 * Collapsible proof that the mandate lives in a signed token, not a
 * database row. Shows the agent's scopes, org, and mandate claim, and
 * flips to the elevated view once an approval grants payments:execute.
 */
export default function TokenDrawer({ deal, approval }: { deal: Deal; approval: Approval | null }) {
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

  const elevated = approval?.status === 'approved';
  const scopes = elevated ? [...BASE_SCOPES, 'payments:execute'] : BASE_SCOPES;

  return (
    <details className="rounded-xl border border-line bg-raised">
      <summary className="cursor-pointer select-none px-5 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-dim transition-colors hover:text-ink">
        Agent token
      </summary>
      <div className="space-y-4 border-t border-line px-5 py-4">
        <p className="text-xs text-dim">decoded from the agent access token</p>

        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-dim">scope</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {scopes.map((s) => (
              <span
                key={s}
                className={`rounded px-2 py-0.5 font-mono text-xs ${
                  s === 'payments:execute'
                    ? 'bg-money/15 font-bold text-money'
                    : 'bg-inset text-dim'
                }`}
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-dim">org_id</div>
          <div className="mt-1 font-mono text-sm">{deal.buyerOrgId}</div>
        </div>

        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-dim">
            https://mandate.dev/mandate
          </div>
          <pre className="mt-1.5 overflow-x-auto rounded-lg bg-inset p-3 font-mono text-[11px] leading-relaxed text-dim">
            {JSON.stringify(deal.mandateSnapshot, null, 2)}
          </pre>
        </div>

        {elevated && approval && (
          <div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-money">
              authorization_details
            </div>
            <pre className="mt-1.5 overflow-x-auto rounded-lg bg-inset p-3 font-mono text-[11px] leading-relaxed text-dim">
              {JSON.stringify(approval.authorizationDetails, null, 2)}
            </pre>
          </div>
        )}

        {flags && (
          <div className="border-t border-line pt-3 font-mono text-[11px] text-dim">
            signature: {flags.auth0Configured ? 'Auth0 tenant JWKS' : 'mock, no tenant configured'}
            <br />
            approval mode: {flags.approvalMode} &middot; negotiation: {flags.negotiationMode}
          </div>
        )}
      </div>
    </details>
  );
}
