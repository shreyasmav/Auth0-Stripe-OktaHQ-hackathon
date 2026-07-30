import type { MarketResearch } from '@/lib/live/types';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Shows where the negotiation's numbers came from. When the research is
 * simulated this says so in plain language - a judge should never be able to
 * mistake a fixture for a sourced quote.
 */
export default function ResearchPanel({ research }: { research: MarketResearch }) {
  return (
    <section className="rounded-xl border border-line bg-raised p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-dim">Sourcing</h2>
        {research.simulated ? (
          <span className="rounded bg-warn/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-warn">
            Simulated
          </span>
        ) : (
          <span className="rounded bg-money/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-money">
            Live research
          </span>
        )}
      </div>

      {research.note && <p className="mb-3 text-sm text-dim">{research.note}</p>}

      <p className="mb-4 text-sm text-ink">
        Market range for{' '}
        <span className="text-dim">
          {research.spec.title} in {research.spec.location}
        </span>
        : <span className="font-mono">{usd(research.marketLowCents)}</span> to{' '}
        <span className="font-mono">{usd(research.marketHighCents)}</span>
      </p>

      <ul className="mb-4 space-y-3">
        {research.vendors.map((v) => (
          <li key={v.name} className="rounded-lg border border-line bg-inset p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-ink">{v.name}</span>
              <span className="font-mono text-sm text-dim">
                {usd(v.quoteLowCents)} - {usd(v.quoteHighCents)}
              </span>
            </div>
            <p className="mt-1 text-sm text-dim">{v.rationale}</p>
            {v.sources.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {v.sources.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-accent underline underline-offset-2"
                  >
                    {s.title}
                  </a>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      {research.sources.length > 0 && (
        <details className="text-sm text-dim">
          <summary className="cursor-pointer">
            {research.sources.length} page{research.sources.length === 1 ? '' : 's'} searched
          </summary>
          <ul className="mt-2 space-y-1">
            {research.sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent underline underline-offset-2"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
