export type OrgRole = 'admin' | 'requester';
export type Tier = 'free' | 'pro';

export type Org = {
  id: string;                    // matches Auth0 org_id
  name: string;
  kind: 'buyer' | 'vendor';
  tier: Tier;
  stripeCustomerId?: string;
  stripeAccountId?: string;      // vendors: Connect Express account
  // vendor economics, never exposed to the buyer agent
  hourlyRateCents?: number;
  floorCents?: number;
};

export type Mandate = {
  maxAmountCents: number;
  currency: 'usd';
  categories: string[];
  expiresAt: number;             // unix seconds
};

export type Job = {
  id: string;
  buyerOrgId: string;
  requestedByUserId: string;
  rawText: string;               // what the human typed
  title: string;
  category: string;
  scope: string;
  deadline: string;
  createdAt: number;
  // Live path (lib/live/*): the parsed spec behind this job. Optional so
  // fixture-seeded jobs and older snapshots stay valid.
  spec?: import('./live/types').JobSpec;
};

export type Turn = {
  speaker: 'buyer_agent' | 'vendor_agent' | 'system';
  text: string;
  offerCents?: number;
  ts: number;
};

export type DealState =
  | 'negotiating'
  | 'settled_within_mandate'
  | 'awaiting_approval'
  | 'approved'
  | 'denied'
  | 'paid'
  | 'failed';

export type Deal = {
  id: string;
  jobId: string;
  buyerOrgId: string;
  vendorOrgId: string;
  state: DealState;
  amountCents?: number;          // settled amount
  mandateSnapshot: Mandate;      // from the token, at negotiation time
  transcript: Turn[];
  approvalId?: string;
  paymentIntentId?: string;
  /** Hosted Checkout session, when the human paid via Stripe's page. */
  checkoutSessionId?: string;
  applicationFeeCents?: number;
  createdAt: number;
  // Live path: the sourced vendor/market research this negotiation ran on.
  // Absent on fixture-driven deals.
  research?: import('./live/types').MarketResearch;
};

export type Approval = {
  id: string;
  dealId: string;
  approverUserId: string;
  // 'mandate' means no human was asked: the settled amount was already inside
  // the agent's authorized ceiling, and that authorization is recorded here so
  // the audit trail says why the payment was permitted.
  mode: 'ciba' | 'frontchannel' | 'mandate';
  status: 'pending' | 'approved' | 'denied' | 'expired';
  authReqId?: string;            // CIBA
  bindingMessage: string;
  authorizationDetails: unknown; // the RAR payload, render this in the UI
  grantedToken?: string;         // elevated, single-use
  createdAt: number;
  resolvedAt?: number;
};

export type EventLogEntry = {
  id: string;
  source: 'auth0' | 'stripe' | 'agent' | 'system';
  text: string;
  ts: number;
};
