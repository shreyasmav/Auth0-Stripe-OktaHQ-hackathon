import Anthropic from '@anthropic-ai/sdk';
import type { Deal, Turn } from '../types';
import { flags } from '../env';
import { logEvent } from '../store';
import { SCRIPTED_TRANSCRIPT } from './fallback';
import { buyerSystemPrompt, vendorSystemPrompt } from './personas';

const MODEL = 'claude-haiku-4-5-20251001';
// §11.3: any round over 4 seconds flips to scripted, permanently.
const TURN_TIMEOUT_MS = 4000;

// Pinned to globalThis so a hot reload cannot un-flip the decision mid-demo.
const g = globalThis as unknown as { __negotiationForcedScripted?: boolean };

// The offer ladder is deterministic even in llm mode. The model writes the
// prose, the ladder guarantees the rigged §11.1 ending at 85000 every run.
// Slots mirror SCRIPTED_TRANSCRIPT one to one, so a mid-run flip can splice in
// the scripted remainder at the same index without a visible seam.
type Slot =
  | { speaker: 'system'; scriptIndex: number }
  | { speaker: 'buyer_agent' | 'vendor_agent'; offerCents: number; hint: string };

const PLAN: Slot[] = [
  { speaker: 'system', scriptIndex: 0 },
  { speaker: 'buyer_agent', offerCents: 62000, hint: 'Open low at exactly $620. Cite comparable jobs in the area.' },
  { speaker: 'vendor_agent', offerCents: 96000, hint: 'Reject the lowball. Counter at exactly $960. Cite permit cost and site coordination.' },
  { speaker: 'buyer_agent', offerCents: 74000, hint: 'Offer scheduling flexibility as a sweetener. Raise to exactly $740.' },
  { speaker: 'vendor_agent', offerCents: 88000, hint: 'Acknowledge the flexibility but hold firm on fixed costs like permits and travel. Drop to exactly $880.' },
  { speaker: 'buyer_agent', offerCents: 80000, hint: 'Say you are at your authorization ceiling. Offer exactly $800 to close today.' },
  { speaker: 'vendor_agent', offerCents: 85000, hint: 'Refuse to go under $850. Make exactly $850 your final offer and commit to the deadline.' },
  { speaker: 'buyer_agent', offerCents: 85000, hint: 'Accept $850 as best available terms. State that it exceeds your $800 mandate ceiling, so you are escalating to a human approver before any payment moves.' },
  { speaker: 'system', scriptIndex: 8 },
];

function scriptedTurn(index: number): Turn {
  return { ...SCRIPTED_TRANSCRIPT[index], ts: Date.now() };
}

function* scriptedRemainder(from: number): Generator<Turn> {
  for (let i = from; i < SCRIPTED_TRANSCRIPT.length; i++) yield scriptedTurn(i);
}

async function llmProse(
  client: Anthropic,
  system: string,
  spoken: string[],
  hint: string,
): Promise<string> {
  const request = client.messages.create({
    model: MODEL,
    max_tokens: 160,
    system,
    messages: [
      {
        role: 'user',
        content: `Negotiation so far:\n${spoken.join('\n')}\n\nYour move: ${hint}\nReply with only your message. One or two sentences. Include the dollar amount.`,
      },
    ],
  });
  // Promise.race timeout. The losing request is abandoned, not aborted. Fine
  // for a demo; an AbortController would be the production shape.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('turn_timeout')), TURN_TIMEOUT_MS),
  );
  const msg = await Promise.race([request, timeout]);
  const text = msg.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join(' ')
    .trim();
  if (!text) throw new Error('empty_completion');
  return text;
}

/**
 * Yields negotiation turns for a deal. Pacing between turns belongs to the SSE
 * route, not here. Both paths end settled at 85000 (§11.1, load-bearing).
 */
export async function* runNegotiation(
  deal: Deal,
  opts: { forceScripted?: boolean } = {},
): AsyncGenerator<Turn> {
  const useLlm =
    flags.negotiationMode === 'llm' &&
    Boolean(process.env.ANTHROPIC_API_KEY) &&
    !opts.forceScripted &&
    !g.__negotiationForcedScripted;

  if (!useLlm) {
    yield* scriptedRemainder(0);
    return;
  }

  const client = new Anthropic();
  const [buyerSystem, vendorSystem] = await Promise.all([
    buyerSystemPrompt(deal),
    vendorSystemPrompt(deal),
  ]);
  const spoken: string[] = [];

  for (let i = 0; i < PLAN.length; i++) {
    const slot = PLAN[i];
    if (slot.speaker === 'system') {
      const turn = scriptedTurn(slot.scriptIndex);
      spoken.push(`[system] ${turn.text}`);
      yield turn;
      continue;
    }
    try {
      const system = slot.speaker === 'buyer_agent' ? buyerSystem : vendorSystem;
      const text = await llmProse(client, system, spoken, slot.hint);
      spoken.push(`[${slot.speaker}] ${text}`);
      yield { speaker: slot.speaker, text, offerCents: slot.offerCents, ts: Date.now() };
    } catch {
      // §11.3: one slow or failed round flips the whole session to scripted.
      g.__negotiationForcedScripted = true;
      logEvent('agent', 'LLM turn exceeded 4s or failed. Flipped to the scripted transcript for the rest of this session.');
      yield* scriptedRemainder(i);
      return;
    }
  }
}
