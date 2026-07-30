// Turns free-text user input into a structured JobSpec.
//
// The old /api/jobs handler pattern-matched on "panel"/"200a" and forced every
// request into the seeded electrical job, which is why the demo only ever
// worked for one sentence. This parses what the user actually typed - any
// category, any location - with a keyword fallback so the route still works
// with no API key.
import { createMessage, firstText } from './anthropic';
import type { JobSpec } from './types';

const MODEL = 'claude-opus-5';
const PARSE_TIMEOUT_MS = 30_000;

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    category: { type: 'string' },
    scope: { type: 'string' },
    location: { type: 'string' },
    deadline: { type: 'string' },
    quantity: { type: 'string' },
  },
  required: ['title', 'category', 'scope', 'location', 'deadline'],
  additionalProperties: false,
} as const;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('parse_timeout')), ms)),
  ]);
}

/** Keyword fallback. Deliberately generic - it must not force a category. */
export function heuristicSpec(rawText: string): JobSpec {
  const lower = rawText.toLowerCase();
  const category =
    /(hvac|furnace|air condition|heat pump|cooling|boiler)/.test(lower) ? 'hvac'
    : /(panel|electric|wiring|circuit|voltage|\b\d+a\b|breaker)/.test(lower) ? 'electrical'
    : /(plumb|pipe|drain|water heater|sewer)/.test(lower) ? 'plumbing'
    : /(roof|shingle|gutter)/.test(lower) ? 'roofing'
    : /(pressure wash|power wash|facade|exterior wash)/.test(lower) ? 'exterior cleaning'
    : /(clean|janitor|custodial)/.test(lower) ? 'cleaning'
    : /(paint|drywall)/.test(lower) ? 'painting'
    : /(landscap|lawn|snow removal|tree)/.test(lower) ? 'grounds'
    : /(security|alarm|camera|cctv)/.test(lower) ? 'security'
    : 'general';

  const isoDate = rawText.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  // Match a place after in/at/near, skipping determiners and possessives so
  // "at our Denver CO site" still yields "Denver CO". Trailing common nouns
  // ("site", "office") are dropped.
  const placeMatch = rawText.match(
    /\b(?:in|at|near)\s+(?:(?:our|the|a|an|my|their|its)\s+)*([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3})/,
  );
  const location =
    placeMatch?.[1]?.replace(/\s+(?:Site|Office|Building|Location|Facility|Campus)$/i, '').trim() || 'unspecified';

  const firstSentence = rawText.split(/[.!?\n]/)[0].trim();
  // Trim to a word boundary rather than mid-word.
  const title =
    firstSentence.length <= 80
      ? firstSentence
      : `${firstSentence.slice(0, 80).replace(/\s+\S*$/, '')}...`;

  return {
    title: title || 'Procurement request',
    category,
    scope: rawText.trim(),
    location,
    deadline: isoDate ?? 'ASAP',
    rawText,
  };
}

export async function parseJobSpec(rawText: string): Promise<JobSpec> {
  if (!process.env.ANTHROPIC_API_KEY) return heuristicSpec(rawText);

  try {
    const res = await withTimeout(
      createMessage({
        model: MODEL,
        max_tokens: 2000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SPEC_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              `Extract a structured procurement request from this text. Do not invent`,
              `details that are not present - if the location or deadline is not stated,`,
              `say "unspecified" and "ASAP" respectively.`,
              ``,
              rawText,
            ].join('\n'),
          },
        ],
      }),
      PARSE_TIMEOUT_MS,
    );

    if (res.stop_reason === 'refusal') return heuristicSpec(rawText);

    const parsed = JSON.parse(firstText(res)) as Omit<JobSpec, 'rawText'>;
    return { ...parsed, rawText };
  } catch {
    return heuristicSpec(rawText);
  }
}
