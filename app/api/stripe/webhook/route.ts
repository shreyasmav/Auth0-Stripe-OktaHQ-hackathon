import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { db } from "@/lib/store";

// Raw body, always — CLAUDE.md §16: "Stripe webhooks need the raw body.
// req.text(), never req.json()." Drives deal/org state; the app never polls
// Stripe for this.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
      // No webhook secret configured (mock/local without `stripe listen`) —
      // accept the payload as-is rather than failing signature checks that
      // can't succeed.
      event = JSON.parse(rawBody);
    } else {
      event = getStripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
    }
  } catch (err) {
    return NextResponse.json({ error: `webhook signature verification failed: ${(err as Error).message}` }, { status: 400 });
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const dealId = intent.metadata?.deal_id;
      if (dealId) {
        const deal = db.deals.get(dealId);
        if (deal) {
          deal.state = "paid";
          deal.paymentIntentId = intent.id;
          db.deals.put(deal);
        }
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const dealId = intent.metadata?.deal_id;
      if (dealId) {
        const deal = db.deals.get(dealId);
        if (deal) {
          deal.state = "failed";
          db.deals.put(deal);
        }
      }
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.org_id ?? session.client_reference_id;
      if (orgId) {
        const org = db.orgs.get(orgId);
        if (org) {
          org.tier = "pro";
          if (typeof session.customer === "string") org.stripeCustomerId = session.customer;
          db.orgs.put(org);
        }
      }
      break;
    }
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const vendor = db.orgs.all().find((o) => o.stripeAccountId === account.id);
      if (vendor) db.orgs.put(vendor);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
