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
    <div className="page">
      <div className="text-center">
        <p className="eyebrow mb-3">Vendor workspace</p>
        <h1 className="text-[48px] leading-none font-semibold">Bright Electric.</h1>
      </div>

      <div className="mt-12 grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="card p-8">
            <h2 className="text-[21px] font-semibold">Deals</h2>
            <p className="mt-3 text-[15px] leading-[1.5] text-muted">
              Deals appear here as buyer agents open deal rooms. Watch the activity feed for live
              negotiation and payment events.
            </p>
          </div>
          <EventFeed />
        </div>

        <div className="space-y-6">
          <div className="card p-7">
            <p className="eyebrow">Floor price</p>
            {/* §11.1 seed fixture. Private to this vendor: never shown to the buyer side. */}
            <p className="price mt-2 text-[36px] leading-none font-semibold">$850.00</p>
            <p className="mt-3 text-[14px] leading-[1.5] text-muted">
              Private. Your negotiating agent knows this number. The buyer&apos;s agent is never
              given it, so it cannot be prompt-injected into revealing it.
            </p>
          </div>

          <div className="card p-7">
            <p className="eyebrow">Payouts</p>
            <p className="mt-2 text-[14px] leading-[1.5] text-muted">
              Connect a Stripe Express account to receive settled payments minus the platform fee.
            </p>
            {connectUrl ? (
              <a
                href={connectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-pill-sm btn-primary mt-5 inline-block"
              >
                Continue onboarding
              </a>
            ) : (
              <button
                onClick={startOnboarding}
                disabled={connecting}
                className="btn-pill-sm btn-primary mt-5"
              >
                {connecting ? 'Creating account…' : 'Set up payouts'}
              </button>
            )}
            {warn && <p className="mt-3 text-[14px] text-amber">{warn}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
