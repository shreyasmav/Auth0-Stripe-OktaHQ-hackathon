import type { NextRequest } from 'next/server';
import { SETTLE_AMOUNT_CENTS } from '@/lib/agents/fallback';
import { runNegotiation } from '@/lib/agents/negotiate';
import { logEvent, snapshot, store } from '@/lib/store';

export const dynamic = 'force-dynamic';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
// 600-900ms between turns reads as thinking and gives the presenter room to
// talk (§11.2). Instant text is worse theater.
const pace = () => new Promise((resolve) => setTimeout(resolve, 600 + Math.floor(Math.random() * 300)));

// GET /api/deals/[id]/negotiate -> SSE stream of negotiation turns.
// ?scripted=1 forces the fallback transcript. Reachable in one second from a
// podium, per §11.3.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const deal = store.deals.get(id);
  if (!deal) return Response.json({ error: 'deal_not_found' }, { status: 404 });

  const forceScripted = new URL(req.url).searchParams.get('scripted') === '1';
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

      try {
        if (deal.transcript.length > 0) {
          // Re-opened deal room: replay the stored transcript with live pacing.
          for (const turn of deal.transcript) {
            send({ type: 'turn', turn });
            await pace();
          }
        } else {
          for await (const turn of runNegotiation(deal, { forceScripted })) {
            deal.transcript.push(turn);
            snapshot();
            send({ type: 'turn', turn });
            await pace();
          }

          deal.amountCents = SETTLE_AMOUNT_CENTS;
          if (deal.amountCents > deal.mandateSnapshot.maxAmountCents) {
            deal.state = 'awaiting_approval';
            logEvent(
              'agent',
              `Deal ${deal.id} settled at ${usd(deal.amountCents)}, above the ${usd(deal.mandateSnapshot.maxAmountCents)} mandate ceiling. Human approval required.`,
            );
          } else {
            // Within-mandate branch (§11.2). Proves the ceiling actually gates
            // rather than always firing.
            deal.state = 'settled_within_mandate';
            logEvent(
              'agent',
              `Deal ${deal.id} settled at ${usd(deal.amountCents)}, within the mandate ceiling. Clear to pay.`,
            );
          }
          snapshot();
        }

        send({ type: 'state', deal });
      } catch {
        try {
          send({ type: 'error', error: 'negotiation_failed' });
        } catch {
          // client already gone, nothing to do
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
