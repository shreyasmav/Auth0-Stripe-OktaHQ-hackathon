# CLAUDE.md — Mandate

Agent-to-agent B2B procurement marketplace. Auth0 governs **whether an agent may act**; Stripe governs **where the money goes**; a human sits between them holding a phone.

Built for the Auth0 × Stripe hackathon. Build window is 4.5 hours with two people. Every decision below is optimized for *a demo that works on stage*, not for production correctness. When those two goals conflict, the demo wins — but say so in a comment.

---

## 1. The money shot

Everything in this repo exists to make these 30 seconds work:

> Two AI agents negotiate a contract in a live transcript. They settle at **$850**. The buying agent's mandate ceiling is **$800**. The agent cannot pay — it holds no token that permits it. A phone buzzes with an Auth0 push showing the real deal terms. A human taps approve. Stripe captures the payment, splits it to the vendor's connected account, and takes the platform's 3%.

**If a change doesn't serve those 30 seconds, don't make it.**

Three properties are non-negotiable and must be *true*, not simulated:

1. **The mandate lives in a signed token, not a database row.** The ceiling is a custom claim on the agent's Auth0 access token. The server reads it from verified JWT claims. Never from the store.
2. **The negotiation always settles above the ceiling.** Seed data is rigged so this happens every single run (§11). A demo that sometimes lands under the ceiling has no ending.
3. **The payment route is scope-gated.** The agent's normal token carries `deals:negotiate` only. `POST /api/deals/:id/pay` requires `payments:execute` *plus* a matching deal id. Hitting it without approval returns a real 403, and the UI shows it.

---

## 2. Stack — locked, do not deviate

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js 15, App Router, TypeScript** | Auth0 + Stripe both have first-class Next paths |
| Styling | **Tailwind CSS** | No component library. Hand-roll. Faster than learning someone's API at 3pm. |
| User auth | **`@auth0/nextjs-auth0` v4** | v4 has a different API from v3 — see §9.1 |
| Agent auth | **Raw `client_credentials` via fetch** | No SDK needed, it's one POST |
| Persistence | **In-memory singleton + JSON snapshot** | See §7.4. Do NOT add Postgres, Prisma, Supabase, or an ORM. |
| Payments | **`stripe` node SDK** | |
| LLM | **`@anthropic-ai/sdk`** | With a deterministic fallback (§11.3) |
| Streaming | **SSE via a Route Handler `ReadableStream`** | No websockets, no Pusher |
| Deploy | **Vercel** | Deploy at 2pm and keep deploying. Do not first deploy at 5pm. |

No monorepo. No Turborepo. One Next.js app.

---

## 3. Repo layout

```
/app
  /(marketing)/page.tsx              landing → "Sign in"
  /dashboard/page.tsx                buyer org home: jobs, mandate, tier
  /dashboard/mandate/page.tsx        admin-only: set agent mandate
  /deals/[id]/page.tsx               THE DEMO SCREEN — transcript + approval + payment
  /approve/[approvalId]/page.tsx     phone-facing approval screen (front-channel fallback)
  /vendor/page.tsx                   vendor org home + Connect onboarding CTA
  /api
    /auth/[auth0]/route.ts           @auth0/nextjs-auth0 v4 handler
    /jobs/route.ts                   POST: NL text → structured Job
    /deals/route.ts                  POST: open a deal room
    /deals/[id]/negotiate/route.ts   GET: SSE stream of negotiation turns
    /deals/[id]/pay/route.ts         POST: SCOPE-GATED. The 403 lives here.
    /approvals/route.ts              POST: request approval (CIBA or front-channel)
    /approvals/[id]/route.ts         GET: poll status  |  POST: approve/deny
    /stripe/connect/route.ts         POST: create Express account + onboarding link
    /stripe/subscribe/route.ts       POST: Billing Checkout session for Pro
    /stripe/webhook/route.ts         POST: raw-body webhook handler
/lib
  store.ts          in-memory singleton, seeded
  types.ts          §7 — write this FIRST, both people import from it
  auth0/
    session.ts      user session + org helpers
    agent.ts        M2M token minting, mandate claim extraction
    verify.ts       JWT verification via jose + JWKS
    ciba.ts         /bc-authorize + polling
  approval.ts       mode switch: ciba | frontchannel. One interface.
  fga.ts            canRead(actor, dealId, field). Mode switch: fga | local.
  stripe/
    client.ts
    connect.ts      Express accounts, destination charges
    billing.ts      subscription checkout
  agents/
    negotiate.ts    the loop
    personas.ts     buyer/vendor system prompts
    fallback.ts     scripted transcript when LLM is slow or absent
  seed.ts
/components
  Transcript.tsx    streaming turn list — the visual centerpiece
  MandateBadge.tsx  shows ceiling + live deal amount, turns red on breach
  ApprovalCard.tsx  pending → approved, with the RAR payload rendered
  PaymentPanel.tsx  Stripe result, fee split breakdown
```

---

## 4. Environment variables

Write `.env.example` with every one of these on day zero.

```bash
# --- Auth0 (user-facing app) ---
AUTH0_DOMAIN=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_SECRET=                      # openssl rand -hex 32
APP_BASE_URL=http://localhost:3000
AUTH0_AUDIENCE=https://api.mandate.dev

# --- Auth0 (agent M2M) ---
AUTH0_AGENT_CLIENT_ID=
AUTH0_AGENT_CLIENT_SECRET=

# --- Auth0 (CIBA client — may be the same app) ---
AUTH0_CIBA_CLIENT_ID=
AUTH0_CIBA_CLIENT_SECRET=

# --- Auth0 FGA (optional) ---
FGA_MODE=local                     # local | fga
FGA_STORE_ID=
FGA_CLIENT_ID=
FGA_CLIENT_SECRET=
FGA_API_URL=

# --- Stripe ---
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=

# --- Behavior flags (THE IMPORTANT ONES) ---
APPROVAL_MODE=ciba                 # ciba | frontchannel  — see §10
DEMO_MODE=live                     # live | mock          — see §14
NEGOTIATION_MODE=llm               # llm | scripted       — see §11.3
```

Every flag must work in every combination. `DEMO_MODE=mock` + `APPROVAL_MODE=frontchannel` + `NEGOTIATION_MODE=scripted` must produce a complete, convincing end-to-end run with **no external service configured at all**. That combination is the parachute.

---

## 5. Manual setup a human must do

Claude Code cannot click these. Generate `SETUP.md` containing them, print the list at the start of the session, and stub anything that's blocked rather than stalling.

**Stripe Projects (do this first — the judges asked for it):**
```bash
brew install stripe/stripe-cli/stripe
stripe plugin install projects
stripe projects init mandate
stripe projects add auth0/client
```
Screen-record this. It goes in the demo.

**Auth0 dashboard:**
1. **Get CIBA enabled.** It requires an Enterprise plan or add-on. Assume the tenant does not have it. Auth0 staff are in the room — ask at 1:01pm. If blocked, set `APPROVAL_MODE=frontchannel` and move on.
2. Create API `https://api.mandate.dev` with scopes `deals:negotiate`, `deals:read`, `payments:execute`.
3. On that API, register authorization detail type `procurement_payment` (required for RAR).
4. Create Organizations `org_acme` (buyer), `org_bright` + `org_delta` (vendors). Add members, assign roles `admin` / `requester`.
5. Create the M2M application for agents; authorize it for the API with `deals:negotiate` and `deals:read` **only**. Not `payments:execute`.
6. Enable the CIBA grant on the CIBA application.
7. Enroll a phone in **Guardian**. Do this at 1:05 — it's the second-longest-lead item after #1.
8. Add the Action from §9.3.

**Stripe dashboard:** enable Connect (Express), create the Pro price, `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

---

## 6. Build order

Build in phases. **Every phase ends with something demoable.** Never be in a state where nothing runs.

### Phase 0 (20 min) — skeleton
`lib/types.ts`, `lib/store.ts`, `lib/seed.ts`, routes stubbed returning fixtures, Tailwind shell. **Write types.ts before splitting work.** Both people import from it; this is what prevents integration hell at 4:15.

### Phase 1 (45 min) — THE WHOLE DEMO, FAKED
`DEMO_MODE=mock`. Scripted transcript streams over real SSE. Mandate breach detected. Fake approval card resolves after a 3s timer. Fake payment shows the fee split. The entire narrative arc works end to end.

**This is the single most important phase in the build.** It is your insurance policy. From here on you are *replacing fakes with real services one at a time*, and if you run out of clock you still have a demo. Do not skip ahead to "real" work because Phase 1 feels like cheating. It isn't; it's the plan.

### Phase 2 (30 min) — real Auth0 login + Organizations
Org-scoped session, role-gated mandate page, real member identities in the UI.

### Phase 3 (40 min) — real agent identity
M2M token with mandate claims. Server verifies JWT and reads the ceiling from claims. `/pay` scope gate returns a real 403. Ceiling in the UI now comes from a decoded token, and the UI shows the decoded claim.

### Phase 4 (60 min) — real approval  ← **the demo's spine, give it the better debugger**
CIBA or front-channel per `APPROVAL_MODE`. Phone buzzes. Approve. Elevated token unlocks `/pay`.

### Phase 5 (45 min) — real Stripe
Connect Express onboarding, destination charge with application fee, webhook-driven state.

### Phase 6 (30 min) — FGA
Real store if the clock allows, `local` mode if not. Same tuple model either way.

### Phase 7 (20 min) — Billing tier
Free vs Pro, gate a feature, let the paywall appear on screen for two seconds during the demo.

**Hard feature freeze at 4:45pm.** 4:45–5:15 is three full demo runs; record the backup on run #2.

---

## 7. Domain model

`lib/types.ts` — write this first, change it only by mutual agreement.

```ts
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
```

**§7.4 — the store.** A module-level singleton of plain Maps. Snapshot to `.data/store.json` on write so a dev-server restart mid-demo doesn't wipe state. Guard the singleton against Next.js hot-reload double-init with a `globalThis` key. No database. If you find yourself wanting one, you're building the wrong thing.

---

## 8. The authorization model

This is the product. Get it exactly right.

**The agent's normal token** (`client_credentials`, audience `https://api.mandate.dev`):
```json
{
  "sub": "agt_buyer_01@clients",
  "scope": "deals:negotiate deals:read",
  "https://mandate.dev/org_id": "org_acme",
  "https://mandate.dev/mandate": {
    "max_amount": 80000,
    "currency": "usd",
    "categories": ["electrical", "hvac"],
    "expires_at": 1785700000
  }
}
```

**The elevated token** (post-approval, from CIBA or front-channel): adds `payments:execute` and carries `authorization_details` naming the specific deal and amount.

**`POST /api/deals/:id/pay` must, in this order:**
1. Verify the bearer JWT against the tenant JWKS (`jose`, `createRemoteJWKSet`). Reject unsigned/expired.
2. Require `payments:execute` in `scope`. Missing → **403 with body `{ error: 'mandate_exceeded', ceiling, requested }`**. The UI renders this; it is a demo beat, not an error state to hide.
3. Require `authorization_details[0].deal_id === params.id`. A token approved for deal A must not pay deal B. Say this out loud in the demo — it's the detail that reads as *engineer wrote this*, and it's what the Stripe judge will probe.
4. Require `amount === deal.amountCents`. No amount substitution after approval.
5. Mark the approval consumed. Single use.
6. Only then call Stripe.

Never trust `mandateSnapshot` from the store for the authorization decision. It's there for display and audit. The decision reads verified claims.

---

## 9. Auth0 integration

### 9.1 v4 SDK notes
v4 differs substantially from v3. It uses middleware plus an `Auth0Client` instance, not `handleAuth()`. Create `lib/auth0.ts` exporting a configured client; use `auth0.getSession()` in server components and `auth0.middleware(req)` in `middleware.ts`. Check the installed version's types before writing against remembered v3 APIs — if there's a mismatch, trust the types in `node_modules`, not this file.

Org-scoped login: pass `authorizationParameters: { organization: orgId }` on the login route.

### 9.2 Agent token minting (`lib/auth0/agent.ts`)
```ts
POST https://${AUTH0_DOMAIN}/oauth/token
{ grant_type: 'client_credentials',
  client_id: AUTH0_AGENT_CLIENT_ID,
  client_secret: AUTH0_AGENT_CLIENT_SECRET,
  audience: AUTH0_AUDIENCE,
  organization: orgId }
```
Cache by org id until 60s before expiry.

### 9.3 The Action that injects the mandate
On the **Client Credentials Exchange** trigger, read the mandate from the org's metadata (or a static map keyed by `org_id` — acceptable for a hackathon, note the shortcut in a comment) and set:
```js
api.accessToken.setCustomClaim('https://mandate.dev/org_id', orgId);
api.accessToken.setCustomClaim('https://mandate.dev/mandate', mandate);
```

### 9.4 CIBA (`lib/auth0/ciba.ts`)
```
POST https://${AUTH0_DOMAIN}/bc-authorize
  content-type: application/x-www-form-urlencoded
  client_id, client_secret
  login_hint={"format":"iss_sub","iss":"https://${AUTH0_DOMAIN}/","sub":"auth0|USER_ID"}
  scope=openid payments:execute
  audience=${AUTH0_AUDIENCE}
  binding_message=Approve $850.00 to Bright Electric
  authorization_details=[{"type":"procurement_payment","deal_id":"deal_123",
    "amount":85000,"currency":"usd","vendor":"Bright Electric",
    "scope_of_work":"200A panel upgrade, suite 300","deadline":"2026-11-03"}]
  requested_expiry=300
```

Then poll:
```
POST https://${AUTH0_DOMAIN}/oauth/token
  grant_type=urn:openid:params:grant-type:ciba
  auth_req_id=...
  client_id, client_secret
```

**Rules that will bite you:**
- `binding_message` is **required**, max 64 chars, alphanumeric + `+-_.,:#` only. **A `$` will be rejected.** Write `Approve 850.00 USD to Bright Electric`.
- `requested_expiry` **must be ≤ 300**. Above 300 Auth0 switches to email delivery and the phone never buzzes.
- The grant type is documented as `urn:openid:params:grant-type:ciba`. Some references show `urn:openid:params:oauth:grant-type:ciba`. Try the documented one first; if you get `unsupported_grant_type`, try the other before assuming anything else is wrong.
- Every `type` in `authorization_details` must be pre-registered on the API in the dashboard or the request fails.
- Poll at the `interval` from the response. On `slow_down`, back off to the new interval. Handle `authorization_pending`, `access_denied`, `expired_token` distinctly — the UI should say *why*.

Poll server-side and expose status to the client via `GET /api/approvals/:id`. The browser polls your API every 1s; your server polls Auth0 at its interval. Do not poll Auth0 from the browser.

### 9.5 FGA (`lib/fga.ts`)
One interface, two implementations, `FGA_MODE` selects.

```
type: deal
  relations:
    buyer_agent, vendor_agent, buyer_admin
  permissions:
    view_terms:            buyer_agent | vendor_agent | buyer_admin
    view_budget_ceiling:   buyer_agent | buyer_admin        # NOT vendor
    view_vendor_floor:     vendor_agent                     # NOT buyer
```

Every field handed into an agent's prompt context goes through `canRead()`. That's the point: the vendor agent cannot be prompt-injected into revealing the buyer's ceiling because it was never given it. Expect this question from the Auth0 judge and have the model on a slide.

In `local` mode, implement the identical tuple checks in-process. Do not fake the *answers* — fake only the *storage*. And say which mode you're in when asked.

---

## 10. The approval abstraction

`lib/approval.ts` exposes exactly this, and nothing upstream knows which mode is active:

```ts
requestApproval(deal, approverUserId): Promise<Approval>
getApproval(id): Promise<Approval>
resolveApproval(id, 'approved'|'denied'): Promise<Approval>   // frontchannel only
```

**`ciba` mode:** §9.4.

**`frontchannel` mode** (when CIBA isn't licensed):
1. Create the `Approval` with the same `authorizationDetails` payload.
2. Send the approver a link to `/approve/[approvalId]` — SMS, or just show a QR code on screen. **A QR code the presenter scans on stage is nearly as good theater as a push, and has zero external dependencies.** Strongly consider this even as a backup for CIBA mode.
3. The phone opens it, authenticates through normal Auth0 login, sees the deal terms.
4. On approve, mint a short-lived single-use token scoped to `payments:execute` for that deal id only, and store it on the approval.

The downstream `/pay` gate is byte-identical in both modes. Say the honest line in the demo: *"on an Enterprise tenant this is CIBA with a RAR payload; we're showing the same authorization model over the front channel."*

---

## 11. Negotiation engine

### 11.1 Rigged seed data — do not change these numbers
```
Job:            200A panel upgrade, suite 300, category "electrical"
Buyer mandate:  maxAmountCents 80000        ($800.00)
Bright Electric floorCents:   85000         ($850.00)
Delta Contracting floorCents: 92000         ($920.00)
```
The cheapest vendor's floor is **above** the ceiling. The negotiation therefore *always* breaches. This is deliberate and load-bearing. Do not "fix" it.

### 11.2 The loop
Max 3 rounds. Buyer opens low, vendor counters, converge toward the vendor floor, settle at `min(vendorFloors)` = 85000. Stream each turn over SSE with a 600–900ms delay between turns — it reads as *thinking* and gives the presenter room to talk. Instant text is worse theater.

Each agent's prompt context is assembled through `canRead()` (§9.5). The buyer agent knows the ceiling. The vendor agent does not, and vice versa.

On settle: compare `amountCents` to the **token's** mandate claim. Above → state `awaiting_approval`, create the approval, and the UI turns red. Below → `settled_within_mandate` and pay straight through (build this path; it proves the ceiling actually gates rather than always firing).

### 11.3 Fallback
`NEGOTIATION_MODE=scripted` replays a hand-written transcript with identical timing and the identical settle amount. **Flip to scripted if any round takes over 4 seconds.** Wire a keyboard shortcut or query param to force it — `?scripted=1`. You want that switch reachable in one second while standing at a podium.

Write the scripted transcript by hand and make it *good*. Give the vendor agent a line about travel time and permit costs. Judges remember personality.

---

## 12. UI requirements

The deal page carries 90 of your 180 demo seconds. It deserves disproportionate polish.

- **Transcript** — chat-style, buyer left, vendor right, offer amounts as inline badges. Auto-scroll. Each turn fades in.
- **MandateBadge** — persistently visible: `Ceiling $800.00`. When the settle exceeds it, it turns red and animates once. This is the visual beat the whole demo pivots on. Make it unmissable from the back of a room.
- **ApprovalCard** — renders the RAR payload as human text, not JSON. Show a spinner reading *"waiting for approver…"*. When it resolves, show who approved and when. Include a small collapsed `<details>` with the raw payload for the judge who asks.
- **PaymentPanel** — `$850.00 → Bright Electric $824.50 · Mandate fee $25.50`. Real numbers from the Stripe response, not computed client-side.
- **Decoded token drawer** — a collapsible panel showing the agent's live decoded claims. Costs 15 minutes, and it's the fastest way to prove the mandate is in a signed token rather than a database row.

Dark UI. Large type. Assume a projector and a room at the back.

---

## 13. Stripe integration

**Connect Express onboarding** — `accounts.create({ type: 'express' })` then `accountLinks.create`. Test mode autofills fast. Do this for `org_bright` early and keep the account id; if onboarding drags past 45 minutes, hardcode a pre-created connected account id and move on.

**The charge** — destination charge, server-confirmed for demo determinism:
```ts
stripe.paymentIntents.create({
  amount: deal.amountCents,
  currency: 'usd',
  payment_method: 'pm_card_visa',
  confirm: true,
  automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
  application_fee_amount: Math.round(deal.amountCents * 0.03),
  transfer_data: { destination: vendor.stripeAccountId },
  metadata: { deal_id: deal.id, approval_id: deal.approvalId },
}, { idempotencyKey: `deal_${deal.id}_pay` });
```
The idempotency key is not optional. It's keyed on the deal so a double-click can't double-charge, and it is exactly the kind of detail a Stripe staff engineer scans for.

**Billing** — Checkout Session in `subscription` mode for Pro. Webhook on `checkout.session.completed` flips `org.tier`. Gate something visible on `tier === 'free'` so the paywall appears on screen.

**Webhooks** — raw body (`await req.text()`), verify with `constructEvent`, handle `payment_intent.succeeded`, `payment_intent.payment_failed`, `checkout.session.completed`, `account.updated`. Drive deal state from webhooks, don't poll. Log every event to a visible in-app feed — it makes the system feel alive and it's free credibility.

---

## 14. Demo mode

`DEMO_MODE=mock` must run the complete flow with **no external service configured**: scripted negotiation, timer-resolved approval, fabricated payment result with correct-looking fee math. Clearly marked in the UI with a small `MOCK` chip — never let a judge think a mock is real. This is what you run if the venue wifi dies.

---

## 15. Do not build

Deleting these is what makes 4.5 hours work.

- Fetch.ai, uAgents, AgentVerse, any blockchain, any on-chain payment protocol
- Postgres, Supabase, Prisma, any ORM or migration
- Self-serve signup, password reset, email verification, org creation UI
- Vendor calendars, scheduling, status tracking, aggregate dashboards, profile builders
- More than 2 agents, or more than 3 negotiation rounds
- Tests, beyond one smoke script that runs the happy path headlessly
- Mobile responsive layouts — it's a projector
- Dark/light toggle, i18n, an admin panel, a settings page
- Stripe Shared Payment Tokens **unless** a Stripe engineer on site unblocks a network business profile before 2:30pm. It's a preview API (`Stripe-Version: 2026-04-22.preview`) and it's a rabbit hole. If you skip it, put it on the roadmap slide — `usage_limits.max_amount` *is* the mandate enforced by Stripe, and knowing that reads well.

---

## 16. Gotchas

- **CIBA needs Enterprise.** Assume you don't have it until someone confirms otherwise. `APPROVAL_MODE=frontchannel` is a first-class path, not a consolation prize.
- **`binding_message` rejects `$`.** Alphanumeric and `+-_.,:#` only, 64 chars max.
- **`requested_expiry > 300` silently switches to email.** Your phone will not buzz and you will lose 30 minutes finding out why.
- **RAR types must be pre-registered** on the API or `/bc-authorize` fails.
- **Guardian push needs the phone on cellular data**, not conference wifi.
- **Next.js hot reload re-instantiates module singletons.** Pin the store to `globalThis`.
- **Stripe webhooks need the raw body.** `req.text()`, never `req.json()`.
- **`@auth0/nextjs-auth0` v4 ≠ v3.** Read the installed types.
- **SSE through Vercel** needs the route to stream properly; test the deployed URL by 3pm, not at 5pm.
- **Never log a token, even truncated.** You'll be screen-sharing.

---

## 17. Commands

```bash
npm run dev
npm run seed                 # reset store to §11.1 fixtures — bind this to a key, you'll run it 30 times
npm run demo:check           # headless happy path: negotiate → breach → approve → pay
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

`npm run seed` must be instant and total. Between demo runs you will need to reset in under two seconds while talking.

---

## 18. Working agreement

- **`lib/types.ts` is the contract.** Changing it requires telling the other person out loud.
- Person A owns `/lib/auth0/**`, `/lib/approval.ts`, `/lib/fga.ts`. Person B owns `/lib/stripe/**`, `/lib/agents/**`. Shared: `types.ts`, `store.ts`, components.
- Commit every 15 minutes. Push. A lost laptop at 4pm should cost 15 minutes, not the day.
- **Never break `main`.** If it's broken, fixing it preempts everything.
- At 4:45 the branch is frozen. After that: run the demo, fix only what's broken on stage, write the script.
