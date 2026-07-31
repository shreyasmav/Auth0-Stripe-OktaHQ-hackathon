'use client';

const usd = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The badge the whole demo pivots on. Persistently shows the ceiling and
 * the live offer, and washes red once when the settle crosses the ceiling.
 *
 * On a white page the breach cannot be carried by a glowing panel, so it is
 * carried the way Apple carries a stock warning: the border and the numeral
 * change colour, and a plain sentence says what happened. Still readable from
 * the back of a room because the numeral is 48px.
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
  const over = offerCents !== undefined && offerCents > ceilingCents;

  return (
    <div
      className={`card p-6 transition-colors duration-300 ${
        breached ? 'breach-once border-red' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">Mandate ceiling</span>
        {breached && <span className="chip chip-alert font-medium">Exceeded</span>}
      </div>

      <div
        className={`price mt-2 text-[48px] leading-none font-semibold ${
          breached ? 'text-red' : 'text-ink'
        }`}
      >
        {usd(ceilingCents)}
      </div>

      <div className="mt-5 flex items-baseline justify-between border-t border-rule pt-4">
        <span className="text-[14px] text-muted">Current offer</span>
        <span
          className={`price text-[28px] font-semibold ${
            breached ? 'text-red' : over ? 'text-amber' : 'text-ink'
          }`}
        >
          {offerCents !== undefined ? usd(offerCents) : '—'}
        </span>
      </div>

      {breached && (
        <p className="mt-4 text-[15px] leading-[1.45] text-red">
          {typeof offerCents === 'number' && offerCents > ceilingCents
            ? `${usd(offerCents - ceilingCents)} over the mandate. `
            : 'Settle exceeds the mandate. '}
          The agent holds no token that permits payment.
        </p>
      )}
    </div>
  );
}
