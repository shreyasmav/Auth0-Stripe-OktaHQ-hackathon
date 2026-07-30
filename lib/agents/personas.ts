import type { Deal } from '../types';
import { store } from '../store';
// Builder A owns lib/fga.ts. Pinned signature: canRead(actor, dealId, field),
// fields per the §9.5 tuple model. We await the result so a sync or async
// implementation both work.
import { canRead } from '../fga';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Every sensitive field enters a prompt only through canRead (§9.5). The vendor
// agent cannot be prompt-injected into leaking the buyer ceiling because the
// ceiling was never in its context. Same for the floor in the other direction.

export async function buyerSystemPrompt(deal: Deal): Promise<string> {
  const job = store.jobs.get(deal.jobId);
  const vendor = store.orgs.get(deal.vendorOrgId);
  const lines: string[] = [
    'You are the procurement agent for Acme Facilities, a commercial buyer.',
    `You are negotiating with ${vendor?.name ?? 'a vendor'} over a facilities job.`,
    'Negotiate hard but fair. Keep every reply to one or two short sentences.',
    'Always state your current offer as a dollar amount.',
  ];
  if (job && (await canRead('buyer_agent', deal.id, 'view_terms'))) {
    lines.push(`Job: ${job.title}. Scope: ${job.scope}. Deadline: ${job.deadline}.`);
  }
  if (await canRead('buyer_agent', deal.id, 'view_budget_ceiling')) {
    lines.push(
      `Your authorization ceiling is ${usd(deal.mandateSnapshot.maxAmountCents)}.`,
      'If the best available price exceeds the ceiling, you may accept it only while saying you must escalate to a human approver before any payment moves.',
    );
  }
  return lines.join('\n');
}

export async function vendorSystemPrompt(deal: Deal): Promise<string> {
  const vendor = store.orgs.get(deal.vendorOrgId);
  const job = store.jobs.get(deal.jobId);
  const lines: string[] = [
    `You are the sales agent for ${vendor?.name ?? 'the vendor'}, a licensed contractor.`,
    'You are personable but firm on economics. Mention concrete costs like permits, travel time, and crew when you push back.',
    'Keep every reply to one or two short sentences. Always state your current price as a dollar amount.',
  ];
  if (job && (await canRead('vendor_agent', deal.id, 'view_terms'))) {
    lines.push(`Job: ${job.title}. Scope: ${job.scope}. Deadline: ${job.deadline}.`);
  }
  if (
    vendor?.floorCents !== undefined &&
    (await canRead('vendor_agent', deal.id, 'view_vendor_floor'))
  ) {
    lines.push(`Your walk-away floor is ${usd(vendor.floorCents)}. Never agree to anything below it.`);
  }
  return lines.join('\n');
}
