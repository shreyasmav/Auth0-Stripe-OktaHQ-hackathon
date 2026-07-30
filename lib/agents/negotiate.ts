// The negotiation loop. Max 3 rounds each side. Streams turns with a
// 600–900ms delay between them — instant text reads as a form, not a
// negotiation, and the delay gives the presenter room to talk over it.
//
// Each agent's prompt context is assembled through canRead() (lib/fga.ts):
// the buyer agent is handed the mandate ceiling, the vendor agent is handed
// its own floor, and neither is ever handed the other side's number. That's
// what makes the vendor agent un-promptinjectable into leaking the buyer's
// budget — it was never given it.
import Anthropic from "@anthropic-ai/sdk";
import type { Job, Org, Turn } from "../types";
import { canRead } from "../fga";
import { buyerSystemPrompt, vendorSystemPrompt } from "./personas";
import { scriptedTranscript } from "./fallback";

const TURN_DELAY_MIN_MS = 600;
const TURN_DELAY_MAX_MS = 900;
const ROUND_TIMEOUT_MS = 4000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function turnDelay() {
  return TURN_DELAY_MIN_MS + Math.random() * (TURN_DELAY_MAX_MS - TURN_DELAY_MIN_MS);
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("round_timeout")), ms)),
  ]);
}

let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

async function llmTurn(systemPrompt: string, history: Turn[]): Promise<string> {
  const client = getAnthropic();
  if (!client) throw new Error("no_llm_configured");
  const messages = history.map((t) => ({
    role: (t.speaker === "buyer_agent" ? "assistant" : "user") as "assistant" | "user",
    content: t.text,
  }));
  const res = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 150,
    system: systemPrompt,
    messages: messages.length ? messages : [{ role: "user", content: "Open the negotiation." }],
  });
  const block = res.content[0];
  return block && block.type === "text" ? block.text : "Let's proceed.";
}

function extractOfferCents(text: string): number | undefined {
  const match = text.match(/\$([\d,]+(?:\.\d{2})?)/);
  if (!match) return undefined;
  return Math.round(parseFloat(match[1].replace(/,/g, "")) * 100);
}

/**
 * Runs the negotiation and yields each Turn as it's produced. Falls back to
 * the deterministic scripted transcript when NEGOTIATION_MODE=scripted, no
 * ANTHROPIC_API_KEY is configured, or any round exceeds ROUND_TIMEOUT_MS.
 */
export async function* runNegotiation(
  job: Job,
  buyerCeilingCents: number | undefined,
  vendor: Org,
): AsyncGenerator<Turn> {
  const scriptedMode = process.env.NEGOTIATION_MODE === "scripted" || !process.env.ANTHROPIC_API_KEY;
  const settleCents = vendor.floorCents ?? 85000;

  if (scriptedMode) {
    for (const turn of scriptedTranscript(job, vendor, settleCents)) {
      await sleep(turnDelay());
      yield turn;
    }
    return;
  }

  const buyerCanSeeCeiling = await canRead("buyer_agent", job.id, "budget_ceiling");
  const vendorCanSeeFloor = await canRead("vendor_agent", job.id, "vendor_floor");

  const buyerPrompt = buyerSystemPrompt(job, buyerCanSeeCeiling ? buyerCeilingCents : undefined);
  const vendorPrompt = vendorSystemPrompt(vendor, vendorCanSeeFloor ? vendor.floorCents : undefined);

  const history: Turn[] = [];
  try {
    for (let round = 0; round < 3; round++) {
      const buyerText = await withTimeout(llmTurn(buyerPrompt, history), ROUND_TIMEOUT_MS);
      const buyerTurn: Turn = {
        speaker: "buyer_agent",
        text: buyerText,
        offerCents: extractOfferCents(buyerText),
        ts: Date.now(),
      };
      history.push(buyerTurn);
      await sleep(turnDelay());
      yield buyerTurn;

      const vendorText = await withTimeout(llmTurn(vendorPrompt, history), ROUND_TIMEOUT_MS);
      const vendorTurn: Turn = {
        speaker: "vendor_agent",
        text: vendorText,
        offerCents: extractOfferCents(vendorText) ?? settleCents,
        ts: Date.now(),
      };
      history.push(vendorTurn);
      await sleep(turnDelay());
      yield vendorTurn;

      const lastOffer = vendorTurn.offerCents ?? 0;
      if (round >= 1 && Math.abs(lastOffer - settleCents) < 500) break;
    }
  } catch {
    // LLM round timed out or errored mid-negotiation — flip to scripted and
    // keep going from a clean settle turn so the demo never stalls.
    for (const turn of scriptedTranscript(job, vendor, settleCents)) {
      await sleep(turnDelay());
      yield turn;
    }
  }
}

export function settleAmountCents(vendor: Org): number {
  return vendor.floorCents ?? 85000;
}
