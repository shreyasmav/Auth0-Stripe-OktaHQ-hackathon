'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import MockChip from './MockChip';

type Flags = {
  demoMode: 'live' | 'mock';
  approvalMode: 'ciba' | 'frontchannel';
  negotiationMode: 'llm' | 'scripted';
  auth0Configured: boolean;
  stripeConfigured: boolean;
};

/**
 * Top navigation. Client component so the MOCK chip and auth links
 * reflect runtime flags from GET /api/flags, not build-time env.
 */
export default function TopNav() {
  const [flags, setFlags] = useState<Flags | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/flags')
      .then((r) => (r.ok ? r.json() : null))
      .then((f) => {
        if (alive && f) setFlags(f as Flags);
      })
      .catch(() => {
        // Nav stays useful even if flags are unreachable.
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden />
          AgentMarketplace
        </Link>
        <div className="flex items-center gap-4 text-sm text-dim">
          <Link href="/dashboard" className="transition-colors hover:text-ink">
            Dashboard
          </Link>
          <Link href="/vendor" className="transition-colors hover:text-ink">
            Vendor
          </Link>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {flags?.demoMode === 'mock' && <MockChip />}
          {flags?.auth0Configured && (
            <span className="flex items-center gap-3 text-sm text-dim">
              {/* Plain anchors: these hit the Auth0 route handler, not a page. */}
              <a href="/auth/login" className="transition-colors hover:text-ink">
                Sign in
              </a>
              <a href="/auth/logout" className="transition-colors hover:text-ink">
                Sign out
              </a>
            </span>
          )}
        </div>
      </nav>
    </header>
  );
}
