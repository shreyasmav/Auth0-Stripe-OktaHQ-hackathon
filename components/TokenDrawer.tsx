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
    <details className="card overflow-hidden">
      <summary className="cursor-pointer list-none px-6 py-4 text-[15px] font-medium transition-colors select-none hover:text-blue">
        Agent token
      </summary>
      <div className="space-y-5 border-t border-rule px-6 py-5">
        <p className="text-[13px] text-muted">Decoded from the agent access token.</p>

        <div>
          <div className="eyebrow">Scope</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {scopes.map((s) => (
              <span
                key={s}
                className={`chip font-mono ${s === 'payments:execute' ? 'chip-ok' : ''}`}
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="eyebrow">org_id</div>
          <div className="mt-1.5 font-mono text-[13px]">{deal.buyerOrgId}</div>
        </div>

        <div>
          <div className="eyebrow">https://mandate.dev/mandate</div>
          <pre className="well mt-2 overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-muted">
            {JSON.stringify(deal.mandateSnapshot, null, 2)}
          </pre>
        </div>

        {elevated && approval && (
          <div>
            <div className="eyebrow text-green">authorization_details</div>
            <pre className="well mt-2 overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-muted">
              {JSON.stringify(approval.authorizationDetails, null, 2)}
            </pre>
          </div>
        )}

        {flags && (
          <div className="border-t border-rule pt-4 text-[12px] text-muted">
            Signature: {flags.auth0Configured ? 'Auth0 tenant JWKS' : 'mock, no tenant configured'}
            <br />
            Approval mode: {flags.approvalMode} &middot; negotiation: {flags.negotiationMode}
          </div>
        )}
      </div>
    </details>
  );
}
