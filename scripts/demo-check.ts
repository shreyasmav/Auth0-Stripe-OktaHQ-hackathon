// Headless happy path: negotiate → breach → approve → pay. Forces
// scripted/mock/frontchannel regardless of .env.local so this is fast and
// deterministic — it's a smoke test, not an integration test against live
// services.
process.env.NEGOTIATION_MODE = "scripted";
process.env.APPROVAL_MODE = "frontchannel";
process.env.DEMO_MODE = "mock";

import { seed, SEED_IDS } from "../lib/seed";
import { db } from "../lib/store";
import { getAgentToken } from "../lib/auth0/agent";
import { verifyAgentToken, hasScope } from "../lib/auth0/verify";
import { runNegotiation, settleAmountCents } from "../lib/agents/negotiate";
import { requestApproval, resolveApproval } from "../lib/approval";
import { mockChargeForDeal } from "../lib/stripe/connect";
import type { Deal, Turn } from "../lib/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

async function main() {
  const { acme, bright, job } = seed();

  const agentToken = await getAgentToken(acme.id);
  const agentClaims = await verifyAgentToken(agentToken);
  assert(!hasScope(agentClaims, "payments:execute"), "agent token must NOT carry payments:execute");
  assert(agentClaims.mandate?.maxAmountCents === 80000, "mandate ceiling must be $800.00 from the seed");

  const deal: Deal = {
    id: "deal_smoke",
    jobId: job.id,
    buyerOrgId: acme.id,
    vendorOrgId: bright.id,
    state: "negotiating",
    mandateSnapshot: agentClaims.mandate!,
    transcript: [],
    createdAt: Date.now(),
  };
  db.deals.put(deal);

  const turns: Turn[] = [];
  for await (const turn of runNegotiation(job, deal.mandateSnapshot.maxAmountCents, bright)) {
    turns.push(turn);
  }
  assert(turns.length > 0, "negotiation must produce turns");

  const settleCents = settleAmountCents(bright);
  deal.amountCents = settleCents;
  assert(settleCents === 85000, "settle amount must be $850.00 (Bright's floor)");
  assert(settleCents > deal.mandateSnapshot.maxAmountCents, "settle must exceed the mandate ceiling — the whole point");

  deal.state = "awaiting_approval";
  db.deals.put(deal);

  // Confirm the scope-gated payment route logic rejects the plain agent
  // token (the 403 beat), before any approval exists.
  assert(!hasScope(agentClaims, "payments:execute"), "unapproved agent token still must not carry payments:execute");

  const approval = await requestApproval(deal, SEED_IDS.adminUser, bright.name, job.scope, job.deadline);
  deal.approvalId = approval.id;
  db.deals.put(deal);
  assert(approval.status === "pending", "approval must start pending");

  const resolved = await resolveApproval(approval.id, "approved", deal, acme.id);
  assert(resolved.status === "approved", "approval must resolve to approved");
  assert(Boolean(resolved.grantedToken), "approved resolution must mint a granted token");

  const elevatedClaims = await verifyAgentToken(resolved.grantedToken!);
  assert(hasScope(elevatedClaims, "payments:execute"), "granted token must carry payments:execute");
  assert(elevatedClaims.authorizationDetails?.[0]?.deal_id === deal.id, "granted token must be scoped to this deal id");
  assert(elevatedClaims.authorizationDetails?.[0]?.amount === deal.amountCents, "granted token amount must match settled amount");

  deal.state = "approved";
  db.deals.put(deal);

  const payment = mockChargeForDeal(deal);
  deal.state = "paid";
  deal.paymentIntentId = payment.paymentIntentId;
  deal.applicationFeeCents = payment.applicationFeeCents;
  db.deals.put(deal);

  assert(deal.state === "paid", "deal must end paid");
  assert(payment.applicationFeeCents === Math.round(settleCents * 0.03), "platform fee must be 3%");
  assert(payment.vendorReceivesCents === settleCents - payment.applicationFeeCents, "vendor must receive settle minus fee");

  console.log("PASS — negotiate → breach → approve → pay");
  console.log(`  settled: $${(settleCents / 100).toFixed(2)} (ceiling $${(deal.mandateSnapshot.maxAmountCents / 100).toFixed(2)})`);
  console.log(`  vendor receives: $${(payment.vendorReceivesCents / 100).toFixed(2)}, platform fee: $${(payment.applicationFeeCents / 100).toFixed(2)}`);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
