import type { NextRequest } from 'next/server';
import { SETTLE_AMOUNT_CENTS } from '@/lib/agents/fallback';
import { runNegotiation } from '@/lib/agents/negotiate';
import { runLiveNegotiation } from '@/lib/live/negotiate';
import { researchConfigured } from '@/lib/live/research';
import { logEvent, snapshot, store } from '@/lib/store';

export const dynamic = 'force-dynamic';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
// 600-900ms between turns reads as thinking and gives the presenter room to
// talk (§11.2). Instant text is worse theater.
const pace = () => new Promise((resolve) => setTimeout(resolve, 600 + Math.floor(Math.random() * 300)));

// GET /api/deals/[id]/negotiate -> SSE stream of negotiation turns.
//
// Two paths, chosen per deal:
//   live      - the deal carries sourced research and an API key is present;
//               the agents negotiate freely and settle wherever the real
//               economics land, above OR below the mandate ceiling.
//   simulated - the rigged §11.1 ladder that always settles at $850.
// ?scripted=1 forces the simulated path. Reachable in one second from a
// podium, per §11.3.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const deal = store.deals.get(id);
  if (!deal) return Response.json({ error: 'deal_not_found' }, { status: 404 });

  const forceScripted = new URL(req.url).searchParams.get('scripted') === '1';
  const useLive =
    !forceScripted && researchConfigured() && Boolean(deal.research) && deal.research?.simulated === false;
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
          let settledCents = SETTLE_AMOUNT_CENTS;

          if (useLive && deal.research) {
            send({ type: 'research', research: deal.research });
            const iter = runLiveNegotiation(
              deal.research,
              deal.mandateSnapshot.maxAmountCents,
              deal.id,
            );
            // Drive the generator by hand so we can capture its return value,
            // which carries the real settle amount.
            let next = await iter.next();
            while (!next.done) {
              const turn = next.value;
              deal.transcript.push(turn);
              snapshot();
              send({ type: 'turn', turn });
              await pace();
              next = await iter.next();
            }
            settledCents = next.value.settledCents;
            logEvent(
              'agent',
              next.value.agreed
                ? `Agents agreed at ${usd(settledCents)} with ${next.value.vendor.name}.`
                : `No agreement inside three rounds; best available from ${next.value.vendor.name} is ${usd(settledCents)}.`,
            );
          } else {
            for await (const turn of runNegotiation(deal, { forceScripted })) {
              deal.transcript.push(turn);
              snapshot();
              send({ type: 'turn', turn });
              await pace();
            }
          }

          deal.amountCents = settledCents;
          if (deal.amountCents > deal.mandateSnapshot.maxAmountCents) {
            deal.state = 'awaiting_approval';
            logEvent(
              'agent',
              `Deal ${deal.id} settled at ${usd(deal.amountCents)}, above the ${usd(deal.mandateSnapshot.maxAmountCents)} mandate ceiling. Human approval required.`,
            );
          } else {
            // Within-mandate branch (§11.2). On the live path this fires
            // whenever the real economics land under the ceiling - it is a
            // genuine outcome, not a branch that never runs.
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
