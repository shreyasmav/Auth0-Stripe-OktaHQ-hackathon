import type { NextRequest } from 'next/server';
import { SETTLE_AMOUNT_CENTS } from '@/lib/agents/fallback';
import { runNegotiation } from '@/lib/agents/negotiate';
import { runDeterministicNegotiation, runLiveNegotiation } from '@/lib/live/negotiate';
import { peekResearch, researchConfigured } from '@/lib/live/research';
import { logEvent, snapshot, store } from '@/lib/store';

export const dynamic = 'force-dynamic';

// This route holds an SSE stream open for the whole negotiation. A live run
// measured 66s end to end (6 rounds against up to 3 vendors), which is well
// past Vercel's 10s default - the stream would be killed mid-transcript and
// the deal would be stranded in `negotiating` forever.
//
// 60 is the ceiling a Hobby project can actually get. A live run needs more
// than that, so on Vercel either raise this to 300 on a Pro plan or run the
// demo with NEGOTIATION_MODE=scripted (~7s), which is what the deploy falls
// back to with no ANTHROPIC_API_KEY set anyway.
export const maxDuration = 60;

/** The §11.1 fixture job, which keeps its rigged scripted transcript. */
function isSeededPanelJob(deal: { research?: { spec: { title: string; scope: string; category: string } } }) {
  const spec = deal.research?.spec;
  if (!spec) return true;
  return spec.category === 'electrical' && /\b(200a|panel)\b/i.test(`${spec.title} ${spec.scope}`);
}

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

  // Deal creation caps its research wait at 10s. If it fell back to fixtures
  // but the live call has since landed, upgrade the deal before negotiating.
  if (deal.research?.simulated && deal.transcript.length === 0) {
    const late = await peekResearch(deal.jobId);
    if (late) {
      deal.research = late;
      const cheapest = [...late.vendors].sort((a, b) => a.floorCents - b.floorCents)[0];
      const org = store.orgs.get(deal.vendorOrgId);
      if (org && cheapest) {
        org.name = cheapest.name;
        org.floorCents = cheapest.floorCents;
        store.orgs.set(org.id, org);
      }
      logEvent('agent', `Live research landed after the deal opened; upgraded to sourced vendors.`);
      snapshot();
    }
  }

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
          } else if (!forceScripted && deal.research && !isSeededPanelJob(deal)) {
            // No API key, but we still have research for a real user request.
            // Negotiate deterministically over those numbers instead of
            // replaying the seeded electrical transcript at an unrelated job.
            send({ type: 'research', research: deal.research });
            const iter = runDeterministicNegotiation(
              deal.research,
              deal.mandateSnapshot.maxAmountCents,
            );
            let next = iter.next();
            while (!next.done) {
              deal.transcript.push(next.value);
              snapshot();
              send({ type: 'turn', turn: next.value });
              await pace();
              next = iter.next();
            }
            settledCents = next.value.settledCents;
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
