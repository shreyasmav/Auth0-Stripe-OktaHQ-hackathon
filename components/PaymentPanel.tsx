'use client';

import type { Deal } from '@/lib/types';
import MockChip from './MockChip';

/** Shape of the payment object returned by POST /api/deals/[id]/pay. */
export type PayResult = {
  amountCents: number;
  applicationFeeCents: number;
  vendorNetCents: number;
  paymentIntentId: string;
  mock: boolean;
};

const usd = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Renders the settled money split. Every number comes from the pay API
 * response (or the stored deal after a reload). Nothing is computed here.
 */
export default function PaymentPanel({
  payment,
  deal,
  vendorName,
}: {
  payment: PayResult | null;
  deal: Deal;
  vendorName: string;
}) {
  if (!payment && deal.state !== 'paid') return null;

  return (
    <div className="rounded-xl border border-money/40 bg-money/5 p-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-money">
          Payment complete
        </span>
        {payment?.mock && <MockChip />}
      </div>

      {payment ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-xl font-bold tabular-nums">
            <span>{usd(payment.amountCents)}</span>
            <span className="text-dim" aria-hidden>
              &rarr;
            </span>
            <span className="text-money">
              {vendorName} {usd(payment.vendorNetCents)}
            </span>
          </div>
          <div className="font-mono text-sm text-dim">
            Platform fee {usd(payment.applicationFeeCents)}
          </div>
        </div>
      ) : (
        // Reload path: the live pay response is gone, so show only what the
        // stored deal carries. No client-side math to fill the gap.
        <div className="mt-3 space-y-2 font-mono tabular-nums">
          <div className="text-xl font-bold">
            {deal.amountCents !== undefined ? usd(deal.amountCents) : '--'}{' '}
            <span className="text-dim">to {vendorName}</span>
          </div>
          {deal.applicationFeeCents !== undefined && (
            <div className="text-sm text-dim">Platform fee {usd(deal.applicationFeeCents)}</div>
          )}
        </div>
      )}

      {(payment?.paymentIntentId ?? deal.paymentIntentId) && (
        <div className="mt-3 truncate border-t border-money/20 pt-2 font-mono text-xs text-dim">
          {payment?.paymentIntentId ?? deal.paymentIntentId}
        </div>
      )}
    </div>
  );
}
