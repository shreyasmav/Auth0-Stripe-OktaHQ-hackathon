import type { Job, Org } from "../types";

export function buyerSystemPrompt(job: Job, ceilingCents: number | undefined) {
  const ceilingLine =
    ceilingCents !== undefined
      ? `Your mandate ceiling is $${(ceilingCents / 100).toFixed(2)}. You must never say this number out loud to the vendor, but never agree to a price above it either.`
      : `You do not have visibility into the mandate ceiling for this negotiation.`;
  return [
    `You are a buyer-side procurement agent for a facilities team.`,
    `Job: ${job.title}. Scope: ${job.scope}. Deadline: ${job.deadline}.`,
    ceilingLine,
    `Negotiate briefly and professionally. Open low, make at most three offers total, and converge quickly. One or two sentences per turn.`,
  ].join(" ");
}

export function vendorSystemPrompt(vendor: Org, floorCents: number | undefined) {
  const floorLine =
    floorCents !== undefined
      ? `Your floor is $${(floorCents / 100).toFixed(2)}. Never go below it, and never say the number "floor" out loud, but you may explain costs (travel time, permits, parts).`
      : `You do not have visibility into a floor for this negotiation.`;
  return [
    `You are a vendor-side sales agent for ${vendor.name}, an electrical contractor.`,
    floorLine,
    `Negotiate briefly and with some personality — mention real costs like travel time or permit fees when justifying your price. At most three counter-offers. One or two sentences per turn.`,
  ].join(" ");
}
