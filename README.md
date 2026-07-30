# Mandate

Agent-to-agent B2B procurement marketplace, built for the Auth0 × Stripe
hackathon. Auth0 governs **whether an agent may act**; Stripe governs
**where the money goes**; a human sits between them holding a phone.

Two AI agents negotiate a contract in a live transcript. They settle above
the buying agent's mandate ceiling. The agent cannot pay — it holds no
token that permits it. A human approves on their phone (or a front-channel
stand-in). Stripe captures the payment, splits it to the vendor's connected
account, and takes the platform's 3%.

See `CLAUDE.md` for the full mandate this repo was built against, and
`SETUP.md` for the manual dashboard steps a human has to click through.

## Quickstart (zero external services)

```bash
cp .env.example .env.local
npm install
npm run seed
npm run dev
```

Open `/dashboard`, submit the pre-filled job, and follow the deal room at
`/deals/[id]`. The defaults (`DEMO_MODE=mock`, `APPROVAL_MODE=frontchannel`,
`NEGOTIATION_MODE=scripted`) run the complete negotiate → breach → approve →
pay flow with nothing configured.

## Commands

```bash
npm run dev          # start the app
npm run seed          # reset the store to the rigged §11.1 fixtures
npm run demo:check    # headless happy path: negotiate → breach → approve → pay
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Repo layout

See `CLAUDE.md` §3 for the intended layout; `SETUP.md` notes the one
deliberate deviation (no `app/api/auth/[auth0]/route.ts` — v4 of
`@auth0/nextjs-auth0` handles auth routes through `middleware.ts` instead).
