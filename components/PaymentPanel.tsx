"use client";

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PaymentPanel({
  vendorName,
  amountCents,
  applicationFeeCents,
  paymentIntentId,
  mock,
}: {
  vendorName: string;
  amountCents: number;
  applicationFeeCents: number;
  paymentIntentId?: string;
  mock?: boolean;
}) {
  const vendorReceives = amountCents - applicationFeeCents;
  return (
    <div className="rounded-lg border border-ok/40 bg-ok/5 p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-white/50">Payment settled</span>
        {mock && (
          <span className="rounded bg-white/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white/70">
            Mock
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold">
        {fmt(amountCents)} → {vendorName} {fmt(vendorReceives)} · Mandate fee {fmt(applicationFeeCents)}
      </div>
      {paymentIntentId && <div className="mt-2 text-sm text-white/40">{paymentIntentId}</div>}
    </div>
  );
}
