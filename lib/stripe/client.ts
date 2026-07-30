import Stripe from 'stripe';
import { stripeConfigured } from '../env';

// Lazy singleton. Returns null when Stripe is not configured so every caller
// has to handle the mock path explicitly.
let singleton: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!stripeConfigured()) return null;
  if (!singleton) {
    singleton = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  }
  return singleton;
}
