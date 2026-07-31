import type { MarketResearch } from '@/lib/live/types';

const usd = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Shows where the negotiation's numbers came from, laid out like a product
 * comparison row: name, price range, one line of reasoning. When the research
 * is simulated this says so in plain language - a judge should never be able
 * to mistake a fixture for a sourced quote.
 */
export default function ResearchPanel({ research }: { research: MarketResearch }) {
  return (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">Sourcing</h2>
        {research.simulated ? (
          <span className="chip chip-warn">Simulated</span>
        ) : (
          <span className="chip chip-ok dot-ok">Live research</span>
        )}
      </div>

      {research.note && <p className="mt-3 text-[14px] text-muted">{research.note}</p>}

      <p className="mt-3 text-[15px] leading-[1.45]">
        <span className="text-muted">
          Market range for {research.spec.title} in {research.spec.location}:{' '}
        </span>
        <span className="price font-medium">
          {usd(research.marketLowCents)} – {usd(research.marketHighCents)}
        </span>
      </p>

      <ul className="mt-5 divide-y divide-rule border-t border-rule">
        {research.vendors.map((v) => (
          <li key={v.name} className="py-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[17px] font-medium">{v.name}</span>
              <span className="price text-[15px] whitespace-nowrap">
                {usd(v.quoteLowCents)} – {usd(v.quoteHighCents)}
              </span>
            </div>
            <p className="mt-1 text-[14px] leading-[1.45] text-muted">{v.rationale}</p>
            {v.sources.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {v.sources.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[13px] text-blue hover:underline"
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
        <details className="mt-4 text-[14px] text-muted">
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
                  className="text-[13px] text-blue hover:underline"
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
