import type { NextRequest } from 'next/server';
import { store } from '@/lib/store';

export const dynamic = 'force-dynamic';

// GET /api/deals/[id] -> {deal, approval|null}
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const deal = store.deals.get(id);
  if (!deal) return Response.json({ error: 'deal_not_found' }, { status: 404 });

  const approval =
    (deal.approvalId ? store.approvals.get(deal.approvalId) : undefined) ??
    [...store.approvals.values()].find((a) => a.dealId === id) ??
    null;

  return Response.json({ deal, approval });
}
