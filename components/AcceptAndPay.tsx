'use client';

import { useState } from 'react';
import type { Deal } from '@/lib/types';

const usd = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The within-mandate pay path.
 *
 * When the agents settle at or below the ceiling nobody is asked to approve,
 * so the ApprovalCard (which owns the pay buttons) never renders and the deal
 * had no way to be paid at all. This is that missing button: accept the
 * settled price, then pay it on Stripe.
 *
 * It is two calls, not one. /authorize records the mandate's own
 * authorization and hands back an elevated token; /checkout then runs the
 * same gate every other payment runs. The button does not skip the gate, it
 * satisfies it.
 */
export default function AcceptAndPay({
  deal,
  vendorName,
  onError,
}: {
  deal: Deal;
  vendorName: string;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = deal.amountCents ?? 0;

  async function acceptAndPay() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const authRes = await fetch(`/api/deals/${deal.id}/authorize`, { method: 'POST' });
      const auth = (await authRes.json()) as { grantedToken?: string; error?: string };
      if (!authRes.ok || !auth.grantedToken) {
        const msg =
          auth.error === 'mandate_exceeded'
            ? 'This amount is above the mandate ceiling, so it needs human approval rather than acceptance.'
            : `Could not authorize this deal: ${auth.error ?? authRes.status}`;
        setError(msg);
        onError?.(msg);
        return;
      }

      const res = await fetch(`/api/deals/${deal.id}/checkout`, {
        method: 'POST',
        headers: { authorization: `Bearer ${auth.grantedToken}` },
      });
      const body = (await res.json()) as { url?: string; error?: string; message?: string };
      if (res.ok && body.url) {
        window.location.href = body.url;
        return;
      }
      const msg =
        body.error === 'stripe_not_configured'
          ? 'Stripe is not configured. Add STRIPE_SECRET_KEY to .env.local to take payments.'
          : `Could not open Stripe checkout: ${body.message ?? body.error ?? res.status}`;
      setError(msg);
      onError?.(msg);
    } catch (err) {
      const msg = `Could not reach the payment endpoint: ${(err as Error).message}`;
      setError(msg);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">Settled</h2>
        <span className="chip chip-ok dot-ok">Within mandate</span>
      </div>

      <p className="mt-3 text-[14px] text-muted">Agreed with {vendorName}</p>
      <p className="price mt-1 text-[40px] leading-none font-semibold">{usd(amount)}</p>

      <button
        type="button"
        onClick={() => void acceptAndPay()}
        disabled={busy}
        className="btn-pill btn-primary mt-6 w-full"
      >
        {busy ? 'Opening Stripe…' : `Accept ${usd(amount)} and pay`}
      </button>
      <p className="mt-2.5 text-center text-[12px] text-muted">
        You will be redirected to Stripe to enter card details.
      </p>

      {error && <p className="mt-3 text-[14px] text-amber">{error}</p>}
    </section>
  );
}
