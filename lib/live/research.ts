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

const MODEL = 'claude-opus-5';
const RESEARCH_TIMEOUT_MS = 90_000;

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
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: RESEARCH_SCHEMA },
      },
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

/** Fixture-backed research, used whenever the live path can't run. */
function simulatedResearch(spec: JobSpec, note: string): MarketResearch {
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
