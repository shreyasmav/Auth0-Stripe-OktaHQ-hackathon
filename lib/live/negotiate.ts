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
// Keep haggling while there is a chance of landing under the ceiling. The
// wall-clock budget is what actually stops it: escalating to a human is the
// last resort, not the third move.
const MAX_ROUNDS = 6;
const NEGOTIATION_BUDGET_MS = 60_000;

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
  const ranked = [...research.vendors].sort((a, b) => a.floorCents - b.floorCents);
  let vendorIdx = 0;
  let vendor = ranked[0];
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

  const buildVendorSystem = (v: VendorLead) =>
    [
      `You are a sales agent for ${v.name}.`,
      jobLine,
      marketLine,
      vendorSeesFloor
        ? `Your walk-away price is ${usd(v.floorCents)} - never agree below it. Your justification: ${v.rationale}`
        : `You do not have visibility into your walk-away price.`,
      vendorSeesCeiling ? `` : `You do NOT know the buyer's budget ceiling. Do not ask for it or guess it aloud.`,
      `Defend your price with real costs, but you want this deal: if the buyer offers something that genuinely lowers your cost, pass the saving on. Be concise and specific.`,
    ]
      .filter(Boolean)
      .join(' ');

  let vendorSystem = buildVendorSystem(vendor);

  const turns: Turn[] = [];
  const emit = (turn: Turn) => {
    turns.push(turn);
    return turn;
  };

  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > NEGOTIATION_BUDGET_MS;

  let settledCents = vendor.floorCents;
  let agreed = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const affordableSoFar = settledCents <= buyerCeilingCents;
    const instruction =
      round === 0
        ? `Open the negotiation with your first offer.`
        : affordableSoFar
          ? `The vendor is at or under your ceiling. Close the deal.`
          : `Their price is still above what you can authorize. Keep negotiating: trade something concrete (flexible scheduling, prompt payment, doing prep work yourself, a smaller scope) for a lower number. Do NOT escalate to a human yet - you have more rounds.`;

    const buyer = await speak(buyerSystem, turns, instruction);
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
      `Respond to the buyer's offer. Accept it if it is at or above your walk-away price. If it is below, counter as low as you genuinely can.`,
    );
    yield emit({
      speaker: 'vendor_agent',
      text: seller.message,
      offerCents: seller.offerCents,
      ts: Date.now(),
    });
    settledCents = seller.offerCents;
    if (seller.accepts) {
      agreed = true;
      break;
    }

    // Landed under the ceiling: stop haggling, the buyer can authorize this.
    if (settledCents <= buyerCeilingCents) {
      agreed = true;
      break;
    }

    // This vendor cannot go low enough. Try the next cheapest before giving up.
    if (settledCents > buyerCeilingCents && vendorIdx + 1 < ranked.length && !outOfTime()) {
      vendorIdx += 1;
      vendor = ranked[vendorIdx];
      vendorSystem = buildVendorSystem(vendor);
      yield emit({
        speaker: 'system',
        text: `${ranked[vendorIdx - 1].name} will not go under ${usd(buyerCeilingCents)}. Opening a parallel line with ${vendor.name}.`,
        ts: Date.now(),
      });
      settledCents = vendor.floorCents;
      continue;
    }

    if (outOfTime()) {
      yield emit({
        speaker: 'system',
        text: `No affordable terms after ${Math.round((Date.now() - startedAt) / 1000)}s across ${vendorIdx + 1} vendor${vendorIdx ? 's' : ''}. Referring the best available price to a human.`,
        ts: Date.now(),
      });
      break;
    }
  }

  // Exhausted the rounds without getting under the ceiling: hand the human the
  // cheapest real price found, not the last number on the table.
  if (settledCents > buyerCeilingCents) {
    const cheapest = ranked.reduce((a, b) => (a.floorCents <= b.floorCents ? a : b));
    if (cheapest.floorCents < settledCents) {
      vendor = cheapest;
      settledCents = cheapest.floorCents;
      yield emit({
        speaker: 'system',
        text: `Best available across all vendors: ${usd(settledCents)} from ${cheapest.name}.`,
        ts: Date.now(),
      });
    }
  }

  // Never settle below the vendor's real floor, whatever the transcript said.
  if (settledCents < vendor.floorCents) settledCents = vendor.floorCents;

  return { turns, settledCents, vendor, agreed };
}

/**
 * Deterministic negotiation over researched numbers, with no LLM call.
 *
 * Used when we have research (live or simulated) but no API key. It reads the
 * actual job, so a request for a sofa produces a negotiation about a sofa
 * rather than replaying the seeded electricians. Converges on the cheapest
 * vendor's floor the same way the LLM path does.
 */
export function* runDeterministicNegotiation(
  research: MarketResearch,
  buyerCeilingCents: number,
): Generator<Turn, LiveNegotiationResult> {
  const vendor = [...research.vendors].sort((a, b) => a.floorCents - b.floorCents)[0];
  const floor = vendor.floorCents;
  const what = research.spec.title;
  const where = research.spec.location !== 'unspecified' ? ` in ${research.spec.location}` : '';
  const by = research.spec.deadline;

  // Open below the ceiling, concede toward the floor, settle at the floor.
  const open = Math.max(Math.round(floor * 0.6), Math.round(buyerCeilingCents * 0.75));
  const counter = Math.round(floor * 1.25);
  const second = Math.round((open + floor) / 2);

  const now = Date.now();
  const script: Array<Omit<Turn, 'ts'>> = [
    {
      speaker: 'buyer_agent',
      text: `We need ${what}${where}, completed by ${by}. Opening at ${usd(open)} for the full scope.`,
      offerCents: open,
    },
    {
      speaker: 'vendor_agent',
      text: `${usd(open)} is under our cost on this one. ${vendor.rationale} We are at ${usd(counter)}.`,
      offerCents: counter,
    },
    {
      speaker: 'buyer_agent',
      text: `${usd(counter)} is more than this scope supports. We can move to ${usd(second)} with flexible scheduling.`,
      offerCents: second,
    },
    {
      speaker: 'vendor_agent',
      text: `With the flexible window I can come down to ${usd(floor)}, but that is our floor for ${what}.`,
      offerCents: floor,
    },
    {
      speaker: 'buyer_agent',
      text:
        floor > buyerCeilingCents
          ? `Accepting ${usd(floor)} as best available terms. That exceeds my ${usd(buyerCeilingCents)} mandate ceiling, so I am escalating to a human approver before any payment moves.`
          : `Accepting ${usd(floor)}. That is within my ${usd(buyerCeilingCents)} authorization, so I can settle this now.`,
      offerCents: floor,
    },
  ];

  const turns: Turn[] = [];
  for (const t of script) {
    const turn: Turn = { ...t, ts: now + turns.length };
    turns.push(turn);
    yield turn;
  }

  return { turns, settledCents: floor, vendor, agreed: true };
}
