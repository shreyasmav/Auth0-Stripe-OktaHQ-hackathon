import { NextRequest } from "next/server";
import { db } from "@/lib/store";
import { runNegotiation, settleAmountCents } from "@/lib/agents/negotiate";
import { stripeConfigured } from "@/lib/stripe/client";
import { mockChargeForDeal, chargeForDeal } from "@/lib/stripe/connect";
import type { Turn } from "@/lib/types";

function sseEvent(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// GET: SSE stream of negotiation turns. Runs the loop, appends each Turn to
// the Deal's transcript as it streams, then settles the deal — paying
// straight through when the settle amount is within mandate, or flipping to
// awaiting_approval when it breaches (which it always will, per §11.1).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = db.deals.get(id);

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (payload: unknown) => controller.enqueue(new TextEncoder().encode(sseEvent(payload)));

      if (!deal) {
        enqueue({ type: "error", message: "deal_not_found" });
        controller.close();
        return;
      }

      // Idempotent reconnects: replay what's already there instead of
      // re-running the negotiation.
      if (deal.transcript.length > 0 || deal.state !== "negotiating") {
        for (const turn of deal.transcript) enqueue({ type: "turn", turn });
        enqueue({ type: "settled", deal });
        controller.close();
        return;
      }

      const job = db.jobs.get(deal.jobId);
      const vendor = db.orgs.get(deal.vendorOrgId);
      if (!job || !vendor) {
        enqueue({ type: "error", message: "job_or_vendor_not_found" });
        controller.close();
        return;
      }

      const ceilingCents = deal.mandateSnapshot.maxAmountCents;

      try {
        for await (const turn of runNegotiation(job, ceilingCents, vendor)) {
          deal.transcript.push(turn);
          db.deals.put(deal);
          enqueue({ type: "turn", turn });
        }
      } catch (err) {
        enqueue({ type: "error", message: (err as Error).message });
      }

      const settleCents = settleAmountCents(vendor);
      deal.amountCents = settleCents;

      const withinMandate = settleCents <= ceilingCents;
      const systemTurn: Turn = {
        speaker: "system",
        text: withinMandate
          ? `Settled at $${(settleCents / 100).toFixed(2)} — within the $${(ceilingCents / 100).toFixed(2)} mandate. Paying automatically.`
          : `Settled at $${(settleCents / 100).toFixed(2)} — exceeds the $${(ceilingCents / 100).toFixed(2)} mandate ceiling. Human approval required.`,
        ts: Date.now(),
      };
      deal.transcript.push(systemTurn);
      enqueue({ type: "turn", turn: systemTurn });

      if (withinMandate) {
        deal.state = "settled_within_mandate";
        db.deals.put(deal);
        enqueue({ type: "settled", deal });

        try {
          const result =
            process.env.DEMO_MODE === "mock" || !stripeConfigured()
              ? mockChargeForDeal(deal)
              : await chargeForDeal(deal, vendor);
          deal.state = "paid";
          deal.paymentIntentId = result.paymentIntentId;
          deal.applicationFeeCents = result.applicationFeeCents;
          db.deals.put(deal);
          enqueue({ type: "paid", deal, payment: result });
        } catch (err) {
          deal.state = "failed";
          db.deals.put(deal);
          enqueue({ type: "error", message: (err as Error).message });
        }
      } else {
        deal.state = "awaiting_approval";
        db.deals.put(deal);
        enqueue({ type: "settled", deal });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
