// NEGOTIATION_MODE=scripted. Also the safety net when an LLM round runs long
// (CLAUDE.md §11.3: flip to scripted if any round takes over 4 seconds).
// Hand-written, same timing and same settle amount every time.
import type { Turn } from "../types";
import type { Job, Org } from "../types";

export function scriptedTranscript(job: Job, vendor: Org, settleCents: number): Turn[] {
  const openCents = 65000;
  const counterCents = 98000;
  const secondOfferCents = 72000;
  const secondCounterCents = 88000;

  const now = Date.now();
  return [
    {
      speaker: "buyer_agent",
      text: `Scope: ${job.scope}. Needed by ${job.deadline}. Can you do it for $${(openCents / 100).toFixed(2)}?`,
      offerCents: openCents,
      ts: now,
    },
    {
      speaker: "vendor_agent",
      text: `That's below cost once you factor travel time and the permit pull for a 200A service — we'd need $${(counterCents / 100).toFixed(2)}.`,
      offerCents: counterCents,
      ts: now + 1,
    },
    {
      speaker: "buyer_agent",
      text: `Understood on the permit cost. We can move to $${(secondOfferCents / 100).toFixed(2)}.`,
      offerCents: secondOfferCents,
      ts: now + 2,
    },
    {
      speaker: "vendor_agent",
      text: `We can come down to $${(secondCounterCents / 100).toFixed(2)} — that covers parts, the panel, and a same-week slot.`,
      offerCents: secondCounterCents,
      ts: now + 3,
    },
    {
      speaker: "buyer_agent",
      text: `Let's settle at $${(settleCents / 100).toFixed(2)} and lock the same-week slot.`,
      offerCents: settleCents,
      ts: now + 4,
    },
    {
      speaker: "vendor_agent",
      text: `Deal — $${(settleCents / 100).toFixed(2)} it is. We'll have ${vendor.name}'s crew on site.`,
      offerCents: settleCents,
      ts: now + 5,
    },
  ];
}
