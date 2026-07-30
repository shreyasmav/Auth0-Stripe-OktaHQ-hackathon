import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { requestApproval } from '@/lib/approval';
import { getSessionUser } from '@/lib/auth0/session';

/** POST /api/approvals {dealId} -> {approval}. Requests human approval. */
export async function POST(req: Request) {
  let body: { dealId?: string };
  try {
    body = (await req.json()) as { dealId?: string };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.dealId) {
    return NextResponse.json({ error: 'missing_dealId' }, { status: 400 });
  }

  const deal = store.deals.get(body.dealId);
  if (!deal) {
    return NextResponse.json({ error: 'deal_not_found' }, { status: 404 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const approval = await requestApproval(deal, user.sub);
  return NextResponse.json({ approval });
}
