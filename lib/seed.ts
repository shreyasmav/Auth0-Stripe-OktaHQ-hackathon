// Rigged fixtures — CLAUDE.md §11.1. Do NOT change these numbers.
// Bright Electric's floor ($850.00) sits above the buyer's mandate ceiling
// ($800.00), and Delta's floor ($920.00) is worse still, so the negotiation
// always settles above the ceiling. That breach is the whole demo.
import type { Org, Job, Mandate } from "./types";
import { db } from "./store";

export const SEED_IDS = {
  buyerOrg: "org_acme",
  brightOrg: "org_bright",
  deltaOrg: "org_delta",
  adminUser: "auth0|demo-admin-acme",
  requesterUser: "auth0|demo-requester-acme",
  job: "job_panel_upgrade",
};

export const BUYER_MANDATE: Mandate = {
  maxAmountCents: 80000, // $800.00
  currency: "usd",
  categories: ["electrical", "hvac"],
  expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
};

export function seed() {
  db.reset({
    orgs: new Map(),
    jobs: new Map(),
    deals: new Map(),
    approvals: new Map(),
  });

  const acme: Org = {
    id: SEED_IDS.buyerOrg,
    name: "Acme Facilities",
    kind: "buyer",
    tier: "free",
  };

  const bright: Org = {
    id: SEED_IDS.brightOrg,
    name: "Bright Electric",
    kind: "vendor",
    tier: "free",
    hourlyRateCents: 12500,
    floorCents: 85000, // $850.00 — above the mandate ceiling, by design
  };

  const delta: Org = {
    id: SEED_IDS.deltaOrg,
    name: "Delta Contracting",
    kind: "vendor",
    tier: "free",
    hourlyRateCents: 14000,
    floorCents: 92000, // $920.00 — worse than Bright
  };

  db.orgs.put(acme);
  db.orgs.put(bright);
  db.orgs.put(delta);

  const job: Job = {
    id: SEED_IDS.job,
    buyerOrgId: SEED_IDS.buyerOrg,
    requestedByUserId: SEED_IDS.requesterUser,
    rawText: "We need a 200A panel upgrade in suite 300, ASAP, budget conscious.",
    title: "200A panel upgrade — suite 300",
    category: "electrical",
    scope: "200A panel upgrade, suite 300",
    deadline: "2026-11-03",
    createdAt: Date.now(),
  };
  db.jobs.put(job);

  return { acme, bright, delta, job };
}
