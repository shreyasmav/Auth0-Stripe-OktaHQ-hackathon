import type { Turn } from '../types';

/**
 * §11.3 scripted transcript. Identical settle amount ($850) and timing shape
 * as the LLM path. Hand-written on purpose — judges remember personality.
 * Delays are carried by the SSE emitter (600-900ms between turns).
 */
export const SCRIPTED_TRANSCRIPT: Omit<Turn, 'ts'>[] = [
  { speaker: 'system', text: 'Deal room opened: 200A panel upgrade, suite 300. Buyer agent (Acme Facilities) vs vendor agent (Bright Electric).' },
  { speaker: 'buyer_agent', text: 'Scope: replace a 100A panel with 200A service in suite 300, permit included, done before Nov 3. Comparable jobs in this zip cleared at $610-$680. I can offer $620.', offerCents: 62000 },
  { speaker: 'vendor_agent', text: 'Not for a 200A cutover. The permit alone runs $120 here, and suite 300 means panel access coordination with building management. $960.', offerCents: 96000 },
  { speaker: 'buyer_agent', text: 'We are flexible on the exact date inside the window, which saves you scheduling cost. $740.', offerCents: 74000 },
  { speaker: 'vendor_agent', text: 'Flexibility helps, but travel time and permit costs are fixed no matter when we roll a truck. I can drop the rush fee: $880.', offerCents: 88000 },
  { speaker: 'buyer_agent', text: 'I am at my authorization ceiling. $800, and we sign today.', offerCents: 80000 },
  { speaker: 'vendor_agent', text: 'I cannot go below $850 — permits and a second electrician for the cutover leave nothing at $800. $850, final, and we hold the Nov 3 date.', offerCents: 85000 },
  { speaker: 'buyer_agent', text: 'Accepting $850 as best available terms. This exceeds my mandate ceiling of $800 — escalating to a human approver before any payment can move.', offerCents: 85000 },
  { speaker: 'system', text: 'Settled at $850.00. Mandate ceiling $800.00 exceeded — payment blocked pending human authorization.' },
];

export const SETTLE_AMOUNT_CENTS = 85000;
