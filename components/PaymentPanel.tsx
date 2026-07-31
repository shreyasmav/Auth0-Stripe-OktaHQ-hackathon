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
 * Renders the settled money split, as a receipt rather than a dashboard tile:
 * total in large type, then the two lines it breaks into. Every number comes
 * from the pay API response (or the stored deal after a reload). Nothing is
 * computed here.
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
    <div className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">Paid</h2>
        <div className="flex items-center gap-2">
          {payment?.mock && <MockChip />}
          <span className="chip chip-ok dot-ok">Complete</span>
        </div>
      </div>

      {payment ? (
        <>
          <div className="price mt-3 text-[40px] leading-none font-semibold">
            {usd(payment.amountCents)}
          </div>
          <dl className="mt-5 space-y-2.5 border-t border-rule pt-4 text-[15px]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{vendorName}</dt>
              <dd className="price font-medium text-green">{usd(payment.vendorNetCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Platform fee</dt>
              <dd className="price">{usd(payment.applicationFeeCents)}</dd>
            </div>
          </dl>
        </>
      ) : (
        // Reload path: the live pay response is gone, so show only what the
        // stored deal carries. No client-side math to fill the gap.
        <>
          <div className="price mt-3 text-[40px] leading-none font-semibold">
            {deal.amountCents !== undefined ? usd(deal.amountCents) : '—'}
          </div>
          <dl className="mt-5 space-y-2.5 border-t border-rule pt-4 text-[15px]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">To</dt>
              <dd className="font-medium">{vendorName}</dd>
            </div>
            {deal.applicationFeeCents !== undefined && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Platform fee</dt>
                <dd className="price">{usd(deal.applicationFeeCents)}</dd>
              </div>
            )}
          </dl>
        </>
      )}

      {(payment?.paymentIntentId ?? deal.paymentIntentId) && (
        <div className="mt-4 truncate border-t border-rule pt-3 font-mono text-[11px] text-muted">
          {payment?.paymentIntentId ?? deal.paymentIntentId}
        </div>
      )}
    </div>
  );
}
