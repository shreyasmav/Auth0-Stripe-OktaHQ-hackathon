// Live negotiation. Unlike lib/agents/negotiate.ts - which drives an LLM
// through a fixed offer ladder so the settle always lands on the rigged
// $850 - this lets the two agents actually converge on real numbers from
// researched vendor economics. The settle is whatever they agree to, so the
// mandate breach is a real outcome rather than a scripted one.
//
// Information asymmetry is enforced through lib/fga.ts exactly as before: the
// buyer agent is handed the mandate ceiling and never the vendor's floor; the
// vendor agent is handed its own floor and never the buyer's ceiling. Neither
// prompt can leak what it was never given.
import { createMessage, firstText } from './anthropic';
import type { Turn } from '../types';
import type { MarketResearch, VendorLead } from './types';
import { canRead } from '../fga';

const MODEL = 'claude-opus-5';
const TURN_TIMEOUT_MS = 30_000;
const MAX_ROUNDS = 3;

const TURN_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    offer_usd: { type: 'number' },
    accepts_previous: { type: 'boolean' },
  },
  required: ['message', 'offer_usd', 'accepts_previous'],
  additionalProperties: false,
} as const;

type AgentTurn = { message: string; offerCents: number; accepts: boolean };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('turn_timeout')), ms)),
  ]);
}

function usd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Repairs escape artifacts the model leaves inside the JSON string field.
 *
 * Observed failure mode: it emits a doubled backslash before a unicode escape,
 * so JSON.parse yields the literal text "\u2014" instead of an em dash. Decode
 * those first - stripping the backslash instead would leave "u2014" in the
 * transcript. Only then drop any lone backslashes that remain.
 */
function cleanMessage(text: string): string {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s*\\+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function speak(
  system: string,
  history: Turn[],
  instruction: string,
): Promise<AgentTurn> {
  const transcript = history
    .map((t) => `${t.speaker === 'buyer_agent' ? 'BUYER' : t.speaker === 'vendor_agent' ? 'VENDOR' : 'SYSTEM'}: ${t.text}`)
    .join('\n');

  const res = await withTimeout(
    createMessage({
      model: MODEL,
      max_tokens: 1200,
      system,
      // 'low' was observed emitting transposed fragments and stray backslashes
      // inside the JSON string. 'medium' is clean and still sub-second per turn.
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: TURN_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            transcript ? `Negotiation so far:\n${transcript}` : 'You are opening the negotiation.',
            ``,
            instruction,
            `Reply with one or two sentences, the dollar figure you are putting on the table,`,
            `and whether you are accepting the other side's last offer.`,
            `Write the message in plain ASCII only - use a comma or a period where you`,
            `would reach for an em dash, and no typographic quotes or symbols. Non-ASCII`,
            `punctuation has to be escaped in the JSON string and comes back corrupted.`,
          ].join('\n'),
        },
      ],
    }),
    TURN_TIMEOUT_MS,
  );

  if (res.stop_reason === 'refusal') throw new Error('turn_refused');

  const parsed = JSON.parse(firstText(res)) as {
    message: string;
    offer_usd: number;
    accepts_previous: boolean;
  };
  return {
    message: cleanMessage(parsed.message),
    offerCents: Math.round(parsed.offer_usd * 100),
    accepts: parsed.accepts_previous,
  };
}

export type LiveNegotiationResult = {
  turns: Turn[];
  settledCents: number;
  vendor: VendorLead;
  agreed: boolean;
};

/**
 * Runs a real negotiation against the cheapest researched vendor and yields
 * each turn as it happens. The caller decides what the settle means against
 * the mandate - this function has no opinion about whether it breaches.
 */
export async function* runLiveNegotiation(
  research: MarketResearch,
  buyerCeilingCents: number,
  dealId: string,
): AsyncGenerator<Turn, LiveNegotiationResult> {
  const vendor = [...research.vendors].sort((a, b) => a.floorCents - b.floorCents)[0];
  const buyerSeesCeiling = await canRead('buyer_agent', dealId, 'view_budget_ceiling');
  const vendorSeesFloor = await canRead('vendor_agent', dealId, 'view_vendor_floor');
  const buyerSeesFloor = await canRead('buyer_agent', dealId, 'view_vendor_floor');
  const vendorSeesCeiling = await canRead('vendor_agent', dealId, 'view_budget_ceiling');

  const spec = research.spec;
  const jobLine = `${spec.title}. Scope: ${spec.scope}. Location: ${spec.location}. Needed by: ${spec.deadline}.`;
  const marketLine = `Independent research puts this job in the ${usd(research.marketLowCents)} to ${usd(research.marketHighCents)} range.`;

  const buyerSystem = [
    `You are a buyer-side procurement agent negotiating on behalf of a facilities team.`,
    jobLine,
    marketLine,
    buyerSeesCeiling
      ? `Your authorization ceiling is ${usd(buyerCeilingCents)}. Never state that number, or the fact that you have a ceiling at all, until you have made at least one counter-offer - revealing your budget early destroys your leverage. Open below the market range and negotiate. Only once the vendor has given a firm best price that you still cannot authorize should you say you need approval to go higher, and then accept their price on the record so a human can decide.`
      : `You do not have visibility into your authorization ceiling.`,
    buyerSeesFloor ? `` : `You do NOT know the vendor's walk-away price. Do not guess it aloud.`,
    `Negotiate in good faith toward a fair price. Be concise and specific.`,
  ]
    .filter(Boolean)
    .join(' ');

  const vendorSystem = [
    `You are a sales agent for ${vendor.name}.`,
    jobLine,
    marketLine,
    vendorSeesFloor
      ? `Your walk-away price is ${usd(vendor.floorCents)} - never agree below it. Your justification: ${vendor.rationale}`
      : `You do not have visibility into your walk-away price.`,
    vendorSeesCeiling ? `` : `You do NOT know the buyer's budget ceiling. Do not ask for it or guess it aloud.`,
    `Defend your price with real costs. Be concise and specific.`,
  ]
    .filter(Boolean)
    .join(' ');

  const turns: Turn[] = [];
  const emit = (turn: Turn) => {
    turns.push(turn);
    return turn;
  };

  let settledCents = vendor.floorCents;
  let agreed = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const buyer = await speak(
      buyerSystem,
      turns,
      round === 0
        ? `Open the negotiation with your first offer.`
        : `Respond to the vendor's last offer. Close if the terms are acceptable.`,
    );
    yield emit({
      speaker: 'buyer_agent',
      text: buyer.message,
      offerCents: buyer.offerCents,
      ts: Date.now(),
    });
    if (buyer.accepts && round > 0) {
      settledCents = buyer.offerCents;
      agreed = true;
      break;
    }

    const seller = await speak(
      vendorSystem,
      turns,
      `Respond to the buyer's offer. Accept it if it is at or above your walk-away price.`,
    );
    yield emit({
      speaker: 'vendor_agent',
      text: seller.message,
      offerCents: seller.offerCents,
      ts: Date.now(),
    });
    if (seller.accepts) {
      settledCents = seller.offerCents;
      agreed = true;
      break;
    }
    settledCents = seller.offerCents;
  }

  // Never settle below the vendor's real floor, whatever the transcript said.
  if (settledCents < vendor.floorCents) settledCents = vendor.floorCents;

  return { turns, settledCents, vendor, agreed };
}
