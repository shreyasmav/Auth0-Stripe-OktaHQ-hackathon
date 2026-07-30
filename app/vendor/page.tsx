'use client';

import { useState } from 'react';
import EventFeed from '@/components/EventFeed';

/**
 * Vendor home for Bright Electric. The floor price renders here and only
 * here: the buyer agent never sees this number (that is the FGA story).
 */
export default function VendorPage() {
  const [connecting, setConnecting] = useState(false);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  async function startOnboarding() {
    setConnecting(true);
    setWarn(null);
    try {
      const res = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: 'org_bright' }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data) throw new Error(data?.error ?? `POST /api/stripe/connect returned ${res.status}`);
      if (data.url) setConnectUrl(data.url);
      else setWarn('Connect responded without an onboarding link. Check Stripe configuration.');
    } catch (e) {
      setWarn(`Stripe Connect onboarding is not available. ${e instanceof Error ? e.message : ''}`);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Bright Electric</h1>
        <p className="mt-1 text-dim">Vendor workspace</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-dim">Deals</h2>
          <div className="rounded-xl border border-line bg-raised p-6">
            <p className="text-dim">
              Deals appear here as buyer agents open deal rooms. Watch the event log below for
              live negotiation and payment activity.
            </p>
          </div>
          <EventFeed />
        </div>

        <div className="space-y-4">
          <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-dim">Your terms</h2>
          <div className="rounded-xl border border-line bg-raised p-6">
            <div className="font-mono text-xs uppercase tracking-widest text-dim">
              Floor price
            </div>
            {/* §11.1 seed fixture. Private to this vendor: never shown to the buyer side. */}
            <div className="mt-1 font-mono text-4xl font-bold">$850.00</div>
            <p className="mt-2 text-xs leading-relaxed text-dim">
              Private. Your negotiating agent knows this number. The buyer&apos;s agent is never
              given it, so it cannot be prompt-injected into revealing it.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-raised p-6">
            <div className="font-mono text-xs uppercase tracking-widest text-dim">Payouts</div>
            <p className="mt-2 text-sm text-dim">
              Connect a Stripe Express account to receive settled payments minus the platform fee.
            </p>
            {connectUrl ? (
              <a
                href={connectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block rounded-lg bg-accent px-5 py-2.5 font-semibold text-bg transition-colors hover:bg-accent-deep hover:text-ink"
              >
                Continue onboarding
              </a>
            ) : (
              <button
                onClick={startOnboarding}
                disabled={connecting}
                className="mt-4 rounded-lg bg-accent px-5 py-2.5 font-semibold text-bg transition-colors hover:bg-accent-deep hover:text-ink disabled:opacity-50"
              >
                {connecting ? 'Creating account...' : 'Set up payouts'}
              </button>
            )}
            {warn && <p className="mt-3 text-sm text-warn">{warn}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
