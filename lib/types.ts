export type OrgRole = 'admin' | 'requester';
export type Tier = 'free' | 'pro';

export type Org = {
  id: string;                    // matches Auth0 org_id
  name: string;
  kind: 'buyer' | 'vendor';
  tier: Tier;
  stripeCustomerId?: string;
  stripeAccountId?: string;      // vendors: Connect Express account
  // vendor economics — never exposed to the buyer agent
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
  applicationFeeCents?: number;
  createdAt: number;
};

export type Approval = {
  id: string;
  dealId: string;
  approverUserId: string;
  mode: 'ciba' | 'frontchannel';
  status: 'pending' | 'approved' | 'denied' | 'expired';
  authReqId?: string;            // CIBA
  bindingMessage: string;
  authorizationDetails: unknown; // the RAR payload — render this in the UI
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
