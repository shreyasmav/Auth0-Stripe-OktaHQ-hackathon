import type { Job, Mandate, Org } from './types';

// §11.1 rigged numbers: the cheapest vendor floor ($850) sits ABOVE the buyer
// ceiling ($800) so the negotiation always breaches the mandate. Load-bearing.
export const BUYER_MANDATE: Mandate = {
  maxAmountCents: 80000,
  currency: 'usd',
  categories: ['electrical', 'hvac'],
  expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
};

export function seedData(orgs: Map<string, Org>, jobs: Map<string, Job>) {
  const seedOrgs: Org[] = [
    { id: 'org_acme', name: 'Acme Facilities', kind: 'buyer', tier: 'free' },
    { id: 'org_bright', name: 'Bright Electric', kind: 'vendor', tier: 'pro', hourlyRateCents: 14500, floorCents: 85000 },
    { id: 'org_delta', name: 'Delta Contracting', kind: 'vendor', tier: 'free', hourlyRateCents: 16000, floorCents: 92000 },
  ];
  for (const o of seedOrgs) orgs.set(o.id, o);

  const job: Job = {
    id: 'job_panel_300',
    buyerOrgId: 'org_acme',
    requestedByUserId: 'seed',
    rawText: 'We need a 200A electrical panel upgrade in suite 300 before the November inspection.',
    title: '200A panel upgrade, suite 300',
    category: 'electrical',
    scope: 'Replace existing 100A panel with 200A service, permit included',
    deadline: '2026-11-03',
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
}
