// Real vendor + market research, driven by Claude's server-side web_search
// tool. One ANTHROPIC_API_KEY buys both the search and the synthesis, so the
// live path needs no separate search provider.
//
// Everything here is best-effort: if the key is missing, the network is
// blocked, or the model returns something unparseable, we fall back to the
// seeded fixtures and mark the result `simulated: true` so the UI can say so
// rather than passing fabricated numbers off as sourced ones.
import { createMessage, firstText, type MessageLike } from './anthropic';
import type { JobSpec, MarketResearch, SourceRef, VendorLead } from './types';

// Haiku with the basic search tool is the fastest configuration that still
// returns real sourced vendors: ~20s vs ~34s for Opus with dynamic filtering.
// Measured, not assumed - max_uses barely moves the needle, the round-trips do.
const MODEL = 'claude-haiku-4-5';
// Opus 5 with web search + dynamic filtering routinely needs 2-3 minutes for
// a multi-vendor sweep. Budget generously; the UI streams a placeholder while
// this runs, and a timeout falls back to fixtures rather than failing.
const RESEARCH_TIMEOUT_MS = 300_000;

const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    market_low_usd: { type: 'number' },
    market_high_usd: { type: 'number' },
    vendors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quote_low_usd: { type: 'number' },
          quote_high_usd: { type: 'number' },
          rationale: { type: 'string' },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: { title: { type: 'string' }, url: { type: 'string' } },
              required: ['title', 'url'],
              additionalProperties: false,
            },
          },
        },
        required: ['name', 'quote_low_usd', 'quote_high_usd', 'rationale', 'sources'],
        additionalProperties: false,
      },
    },
  },
  required: ['market_low_usd', 'market_high_usd', 'vendors'],
  additionalProperties: false,
} as const;

function usdToCents(usd: number): number {
  return Math.round(usd * 100);
}

function collectSearchSources(content: MessageLike['content']): SourceRef[] {
  const out: SourceRef[] = [];
  for (const block of content) {
    // web_search_tool_result.content is a list of results on success and a
    // single error object on failure, so guard the shape before iterating.
    if (block.type !== 'web_search_tool_result') continue;
    const results = block.content;
    if (!Array.isArray(results)) continue;
    for (const r of results as Array<{ title?: string; url?: string }>) {
      if (r.url) out.push({ title: r.title ?? r.url, url: r.url });
    }
  }
  // Dedupe by URL, keep first title seen.
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('research_timeout')), ms)),
  ]);
}

/**
 * In-flight research keyed by job id.
 *
 * A blocking research call cannot finish in 10s - the search round-trips
 * alone cost more than that. So it is kicked off the moment the job is
 * created and awaited later, which turns most of the latency into time the
 * user was already spending reading the dashboard.
 */
const inFlight = new Map<string, Promise<MarketResearch>>();

/** Fire-and-forget. Safe to call repeatedly; only the first call researches. */
export function startResearch(jobId: string, spec: JobSpec): void {
  if (inFlight.has(jobId)) return;
  const promise = researchMarket(spec).catch(() =>
    simulatedResearch(spec, 'Research failed - using generic vendors.'),
  );
  inFlight.set(jobId, promise);
  // Never let an unobserved rejection take the process down.
  void promise.catch(() => {});
}

/**
 * Returns research for a job, waiting at most `capMs` for work already in
 * flight. Past the cap it hands back scaled fixtures so the deal room opens
 * immediately rather than making the user watch a frozen button.
 */
export async function researchForJob(
  jobId: string,
  spec: JobSpec,
  capMs = 10_000,
): Promise<MarketResearch> {
  startResearch(jobId, spec);
  const pending = inFlight.get(jobId)!;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), capMs));
  const winner = await Promise.race([pending, timeout]);
  if (winner) return winner;
  return simulatedResearch(
    spec,
    `Live research did not return within ${Math.round(capMs / 1000)}s - showing generic vendors.`,
  );
}

/**
 * Returns the real research for a job if it has landed since, else null.
 *
 * Deal creation caps its wait at 10s and may fall back to fixtures, but the
 * live call keeps running. By the time the user reaches the negotiation it has
 * usually finished, so the deal is upgraded from generic vendors to sourced
 * ones rather than staying simulated for the whole session.
 */
export async function peekResearch(jobId: string, graceMs = 8_000): Promise<MarketResearch | null> {
  const pending = inFlight.get(jobId);
  if (!pending) return null;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), graceMs));
  const winner = await Promise.race([pending, timeout]);
  return winner && !winner.simulated ? winner : null;
}

export function researchConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Researches real vendors and real price signals for a job spec.
 * Throws on any failure; callers are expected to fall back.
 */
async function liveResearch(spec: JobSpec): Promise<MarketResearch> {
  const prompt = [
    `Research real market pricing and real service providers for this procurement request.`,
    ``,
    `Job: ${spec.title}`,
    `Category: ${spec.category}`,
    `Scope: ${spec.scope}`,
    `Location: ${spec.location}`,
    `Needed by: ${spec.deadline}`,
    spec.quantity ? `Quantity/size: ${spec.quantity}` : ``,
    ``,
    `Search the web for (a) what this work actually costs in this location right now,`,
    `and (b) three real providers who do it there. For each provider give the price`,
    `range you'd expect from the evidence you found, and cite the pages you used.`,
    `Use real business names you actually found - do not invent providers.`,
    `All prices in US dollars, total for the job, not hourly.`,
  ]
    .filter(Boolean)
    .join('\n');

  const res = await withTimeout(
    createMessage({
      model: MODEL,
      max_tokens: 8000,
      // Haiku 4.5 predates the _20260209 tool and rejects `effort` outright.
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
      output_config: { format: { type: 'json_schema', schema: RESEARCH_SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    }),
    RESEARCH_TIMEOUT_MS,
  );

  if (res.stop_reason === 'refusal') throw new Error('research_refused');

  const parsed = JSON.parse(firstText(res)) as {
    market_low_usd: number;
    market_high_usd: number;
    vendors: Array<{
      name: string;
      quote_low_usd: number;
      quote_high_usd: number;
      rationale: string;
      sources?: SourceRef[];
    }>;
  };

  const vendors: VendorLead[] = parsed.vendors.map((v) => {
    const lowCents = usdToCents(v.quote_low_usd);
    return {
      name: v.name,
      sources: v.sources ?? [],
      quoteLowCents: lowCents,
      quoteHighCents: usdToCents(v.quote_high_usd),
      // The walk-away price is the researched low end. Real signal, not a
      // number we picked to force an outcome.
      floorCents: lowCents,
      rationale: v.rationale,
    };
  });

  if (vendors.length === 0) throw new Error('research_no_vendors');

  return {
    spec,
    vendors,
    marketLowCents: usdToCents(parsed.market_low_usd),
    marketHighCents: usdToCents(parsed.market_high_usd),
    sources: collectSearchSources(res.content),
    simulated: false,
  };
}

/**
 * Fixture-backed research, used whenever the live path can't run.
 *
 * The seeded electrical job keeps its rigged §11.1 vendors so the scripted
 * demo is untouched. Any OTHER job gets generic vendors scaled to whatever
 * budget the requester stated, because replaying "Bright Electric" and a
 * permit argument at someone who asked for a sofa reads as broken.
 */
function simulatedResearch(spec: JobSpec, note: string): MarketResearch {
  const isSeededElectrical =
    spec.category === 'electrical' && /\b(200a|panel)\b/i.test(`${spec.title} ${spec.scope}`);

  if (isSeededElectrical) {
    return {
      spec,
      vendors: [
        {
          name: 'Bright Electric',
          sources: [],
          quoteLowCents: 85000,
          quoteHighCents: 96000,
          floorCents: 85000,
          rationale: 'Seeded fixture vendor. Permit and second electrician on a 200A cutover.',
        },
        {
          name: 'Delta Contracting',
          sources: [],
          quoteLowCents: 92000,
          quoteHighCents: 110000,
          floorCents: 92000,
          rationale: 'Seeded fixture vendor. Higher rate, faster scheduling.',
        },
      ],
      marketLowCents: 85000,
      marketHighCents: 110000,
      sources: [],
      simulated: true,
      note,
    };
  }

  // Anchor on the stated budget so the numbers are in the right order of
  // magnitude for the actual request. Cheapest floor lands just above the
  // budget, so the mandate breach still demonstrates, without pretending a
  // sofa costs what a panel upgrade costs.
  const anchor = spec.budgetCents ?? 80000;
  const cheapFloor = Math.round(anchor * 1.06);
  const trade = spec.category === 'general' ? 'supplier' : spec.category;

  return {
    spec,
    vendors: [
      {
        name: `${trade.replace(/\b\w/g, (c) => c.toUpperCase())} Co.`,
        sources: [],
        quoteLowCents: cheapFloor,
        quoteHighCents: Math.round(cheapFloor * 1.35),
        floorCents: cheapFloor,
        rationale: `Simulated vendor for ${spec.title}. No live research was available, so these figures are anchored on the stated budget, not on market data.`,
      },
      {
        name: 'Second Source Ltd.',
        sources: [],
        quoteLowCents: Math.round(cheapFloor * 1.2),
        quoteHighCents: Math.round(cheapFloor * 1.6),
        floorCents: Math.round(cheapFloor * 1.2),
        rationale: 'Simulated alternate vendor. Higher price, shorter lead time.',
      },
    ],
    marketLowCents: cheapFloor,
    marketHighCents: Math.round(cheapFloor * 1.6),
    sources: [],
    simulated: true,
    note,
  };
}

export async function researchMarket(spec: JobSpec): Promise<MarketResearch> {
  if (!researchConfigured()) {
    return simulatedResearch(spec, 'ANTHROPIC_API_KEY not set - using seeded vendors.');
  }
  try {
    return await liveResearch(spec);
  } catch (err) {
    return simulatedResearch(spec, `Live research failed (${(err as Error).message}) - using seeded vendors.`);
  }
}
