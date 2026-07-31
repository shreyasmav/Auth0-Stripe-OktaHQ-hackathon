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

type Me = {
  authConfigured: boolean;
  signedIn: boolean;
  mocked: boolean;
  user: { name: string; email: string; orgId: string; role: string } | null;
};

/**
 * Global nav, modelled on Apple's: 44px tall, translucent with a heavy blur,
 * hairline rule, 12px links in the single grey. Deliberately quiet - it is
 * chrome, not a feature.
 */
export default function TopNav() {
  const [flags, setFlags] = useState<Flags | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/flags')
      .then((r) => (r.ok ? r.json() : null))
      .then((f) => alive && f && setFlags(f as Flags))
      .catch(() => {});
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => alive && m && setMe(m as Me))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-rule/70 bg-bg/80 backdrop-blur-xl backdrop-saturate-150">
      <nav className="mx-auto flex h-11 max-w-[1024px] items-center gap-8 px-6 text-[12px]">
        <Link href="/" className="font-semibold tracking-tight text-ink">
          Mandate
        </Link>

        <div className="flex items-center gap-7 text-muted">
          <Link href="/dashboard" className="transition-colors hover:text-ink">
            Buy
          </Link>
          <Link href="/vendor" className="transition-colors hover:text-ink">
            Vendors
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-4">
          {flags?.demoMode === 'mock' && <MockChip />}

          {me?.signedIn && me.user && (
            <span className="flex items-center gap-4 text-muted">
              <span className="hidden sm:inline text-ink">{me.user.name}</span>
              {/* Plain anchor: /auth/* is mounted by middleware, not the router. */}
              <a href="/auth/logout" className="transition-colors hover:text-ink">
                Sign out
              </a>
            </span>
          )}

          {me?.authConfigured && !me.signedIn && (
            <a href="/auth/login?returnTo=%2Fdashboard" className="text-blue hover:underline">
              Sign in
            </a>
          )}

          {me && !me.authConfigured && (
            <span
              className="text-muted"
              title="Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET and APP_BASE_URL for real login"
            >
              No login configured
            </span>
          )}
        </div>
      </nav>
    </header>
  );
}
