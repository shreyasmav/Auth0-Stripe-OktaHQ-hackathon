import { NextResponse } from 'next/server';
import { getApproval, resolveApproval } from '@/lib/approval';

type Params = { params: Promise<{ id: string }> };

/** GET /api/approvals/[id] -> {approval}. The browser polls this every 1s. */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const approval = await getApproval(id);
  if (!approval) {
    return NextResponse.json({ error: 'approval_not_found' }, { status: 404 });
  }
  return NextResponse.json({ approval });
}

/** POST /api/approvals/[id] {action} -> {approval}. Front channel only. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const approval = await getApproval(id);
  if (!approval) {
    return NextResponse.json({ error: 'approval_not_found' }, { status: 404 });
  }
  if (approval.mode === 'ciba') {
    // A CIBA approval resolves on the phone through Auth0, not through us.
    return NextResponse.json({ error: 'ciba_resolves_on_device' }, { status: 409 });
  }

  let body: { action?: string };
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (body.action !== 'approved' && body.action !== 'denied') {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }

  const resolved = await resolveApproval(id, body.action);
  return NextResponse.json({ approval: resolved });
}
