import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { Approval } from '@/lib/types';
import { logEvent, snapshot, store } from '@/lib/store';

export const dynamic = 'force-dynamic';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// POST /api/deals/[id]/authorize -> { grantedToken }
//
// The within-mandate path. When the agents settle at or below the ceiling the
// mandate ALREADY authorizes the spend, so no human approval is requested -
// but the payment routes still demand an elevated token, and until now there
// was no way to obtain one for these deals. They had no pay button at all.
//
// This records the mandate's own authorization as a first-class Approval
// (mode: 'mandate'), which reuses the existing token machinery end to end:
// same grantedToken shape, same verifyBearer path, same single-use
// consumption. The authorization decision is still the ceiling comparison,
// and a deal ABOVE the ceiling is refused here - those must go to a human.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const deal = store.deals.get(id);
  if (!deal) return Response.json({ error: 'deal_not_found' }, { status: 404 });
  if (deal.state === 'paid') return Response.json({ error: 'already_paid' }, { status: 409 });
  if (typeof deal.amountCents !== 'number') {
    return Response.json({ error: 'deal_not_settled' }, { status: 409 });
  }

  const ceiling = deal.mandateSnapshot.maxAmountCents;
  const amount = deal.amountCents;

  // The whole point of the ceiling: above it, this route refuses and the deal
  // has to go through human approval instead.
  if (amount > ceiling) {
    logEvent(
      'auth0',
      `Self-authorization refused for ${deal.id}: ${usd(amount)} exceeds the ${usd(ceiling)} ceiling. Human approval required.`,
    );
    return Response.json({ error: 'mandate_exceeded', ceiling, requested: amount }, { status: 403 });
  }

  // Reuse an existing mandate authorization rather than minting a second one.
  const existing = deal.approvalId ? store.approvals.get(deal.approvalId) : undefined;
  if (existing?.status === 'approved' && existing.grantedToken) {
    return Response.json({ grantedToken: existing.grantedToken, approval: existing });
  }

  const approval: Approval = {
    id: `apr_${randomUUID()}`,
    dealId: deal.id,
    approverUserId: 'mandate',
    mode: 'mandate',
    status: 'approved',
    bindingMessage: `Within mandate: ${usd(amount)} at or under the ${usd(ceiling)} ceiling`,
    authorizationDetails: [
      {
        type: 'procurement_payment',
        deal_id: deal.id,
        amount,
        currency: 'usd',
      },
    ],
    grantedToken: `apv_${randomUUID()}`,
    createdAt: Date.now(),
    resolvedAt: Date.now(),
  };

  store.approvals.set(approval.id, approval);
  deal.approvalId = approval.id;
  deal.state = 'approved';
  snapshot();
  logEvent(
    'auth0',
    `Deal ${deal.id} self-authorized: ${usd(amount)} is within the ${usd(ceiling)} mandate ceiling. No human approval needed.`,
  );

  return Response.json({ grantedToken: approval.grantedToken, approval });
}
