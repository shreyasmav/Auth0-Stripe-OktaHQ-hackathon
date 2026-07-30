# Manual setup

Claude Code cannot click these. Do them in roughly this order — the
longest-lead items (CIBA licensing, Guardian enrollment) go first.

## The parachute (do this zero-th, it needs nothing else)

```bash
cp .env.example .env.local
npm install
npm run seed
npm run dev
```

With the defaults in `.env.example` (`DEMO_MODE=mock`,
`APPROVAL_MODE=frontchannel`, `NEGOTIATION_MODE=scripted`), the full flow —
negotiate → breach → approve → pay — runs with **no external service
configured at all**. Visit `/dashboard`, submit the pre-filled job, and
follow the deal room. This is what you run if the venue wifi dies.

## Stripe Projects (do this first for real — the judges asked for it)

```bash
brew install stripe/stripe-cli/stripe
stripe plugin install projects
stripe projects init mandate
stripe projects add auth0/client
```

Screen-record this. It goes in the demo.

## Auth0 dashboard

1. **Get CIBA enabled.** It requires an Enterprise plan or add-on. Assume
   the tenant does not have it. Ask Auth0 staff early. If blocked, leave
   `APPROVAL_MODE=frontchannel` — it is a first-class path, not a
   consolation prize.
2. Create API `https://api.mandate.dev` with scopes `deals:negotiate`,
   `deals:read`, `payments:execute`.
3. On that API, register authorization detail type `procurement_payment`
   (required for RAR / CIBA's `authorization_details`).
4. Create Organizations `org_acme` (buyer), `org_bright` + `org_delta`
   (vendors). Add members, assign roles `admin` / `requester`.
5. Create the M2M application for agents; authorize it for the API with
   `deals:negotiate` and `deals:read` **only**. Not `payments:execute`.
6. Enable the CIBA grant on the CIBA application (if licensed).
7. Enroll a phone in **Guardian**, on cellular data (conference wifi blocks
   the push).
8. Add the Client Credentials Exchange Action described in
   `lib/auth0/agent.ts` — it sets the `https://mandate.dev/org_id` and
   `https://mandate.dev/mandate` custom claims.

Set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`,
`AUTH0_AGENT_CLIENT_ID`/`SECRET`, `AUTH0_CIBA_CLIENT_ID`/`SECRET` once these
exist. Until then the app mints and verifies locally-signed tokens with the
identical claim shape (see `lib/auth0/agent.ts` and `lib/auth0/verify.ts`) —
the JWT-verification code path is real either way, only the key source
differs.

## Stripe dashboard

1. Enable Connect (Express).
2. Create the Pro subscription price, set `STRIPE_PRO_PRICE_ID`.
3. `stripe listen --forward-to localhost:3000/api/stripe/webhook`, set
   `STRIPE_WEBHOOK_SECRET` from its output.
4. Set `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` from the
   dashboard's API keys page.
5. On `/vendor`, click "Connect with Stripe" for each vendor org and finish
   the (fast, autofilled in test mode) Express onboarding.

## A note on `@auth0/nextjs-auth0` v4

This repo does **not** ship an `app/api/auth/[auth0]/route.ts` handler. v4
handles `/auth/login`, `/auth/logout`, `/auth/callback`, `/auth/profile`,
and `/auth/access-token` entirely through `middleware.ts` — there's no
route file to write. That's the biggest v3→v4 surface change; if you're
used to v3's `handleAuth()`, read `lib/auth0client.ts` and `middleware.ts`
before changing either.

## Flipping to live

Once the above is done, flip `.env.local`:

```bash
DEMO_MODE=live
NEGOTIATION_MODE=llm        # requires ANTHROPIC_API_KEY
APPROVAL_MODE=ciba          # if CIBA is licensed, else leave frontchannel
```

Every combination of the three flags must produce a complete run. Test the
deployed Vercel URL by 3pm, not 5pm — SSE through Vercel needs the route to
actually stream.
