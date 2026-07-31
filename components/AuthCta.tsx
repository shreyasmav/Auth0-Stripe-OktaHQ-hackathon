'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Me = { authConfigured: boolean; signedIn: boolean; user: { name: string } | null };

/**
 * Landing call to action.
 *
 * Shows a real Sign in when Auth0 is configured and nobody is signed in,
 * jumps straight to the dashboard once they are, and in the zero-config demo
 * says plainly that it is running without login rather than offering a
 * button that would 404 on /auth/login.
 */
export default function AuthCta() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => alive && m && setMe(m as Me))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (me?.authConfigured && !me.signedIn) {
    return (
      <div className="flex flex-col items-center gap-2">
        <a
          href="/auth/login?returnTo=%2Fdashboard"
          className="btn-pill btn-primary inline-block"
        >
          Sign in with Auth0
        </a>
        <span className="text-[12px] text-muted">
          org-scoped login
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Link
        href="/dashboard"
        className="btn-pill btn-primary inline-block"
      >
        {me?.signedIn ? `Continue as ${me.user?.name ?? 'you'}` : 'Enter the dashboard'}
      </Link>
      {me && !me.authConfigured && (
        <span className="text-[12px] text-muted">
          running without login &middot; auth0 not configured
        </span>
      )}
    </div>
  );
}
