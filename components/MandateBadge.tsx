'use client';

const usd = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The badge the whole demo pivots on. Persistently shows the ceiling and
 * the live offer. When the settle crosses the ceiling it turns red and
 * shakes exactly once. Must be readable from the back of a room.
 */
export default function MandateBadge({
  ceilingCents,
  offerCents,
  breached,
}: {
  ceilingCents: number;
  offerCents?: number;
  breached: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 transition-colors duration-300 ${
        breached ? 'breach-once border-danger bg-danger/10' : 'border-line bg-raised'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`font-mono text-[11px] uppercase tracking-[0.25em] ${
            breached ? 'text-danger' : 'text-dim'
          }`}
        >
          Mandate ceiling
        </span>
        {breached && (
          <span className="rounded bg-danger px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-bg">
            Exceeded
          </span>
        )}
      </div>

      <div
        className={`mt-1 font-mono text-5xl font-bold tabular-nums ${
          breached ? 'text-danger' : 'text-money'
        }`}
      >
        {usd(ceilingCents)}
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-line/60 pt-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-dim">
          Current offer
        </span>
        <span
          className={`font-mono text-2xl font-bold tabular-nums ${
            breached
              ? 'text-danger'
              : offerCents !== undefined && offerCents > ceilingCents
                ? 'text-warn'
                : 'text-ink'
          }`}
        >
          {offerCents !== undefined ? usd(offerCents) : '--'}
        </span>
      </div>

      {breached && (
        <p className="mt-3 text-sm font-medium leading-snug text-danger">
          Settle exceeds the mandate. The agent holds no token that permits payment.
        </p>
      )}
    </div>
  );
}
