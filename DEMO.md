# DEMO.md — 2-minute script

Reset first: `npm run seed`. Open /dashboard. Phone unlocked, on cellular.

## Beat 1 — the hook (20s)

"Everyone is giving AI agents credit cards. We did the opposite. AgentMarketplace lets agents negotiate business deals, but the money can only move when a human signs a mandate. Auth0 decides whether the agent may act. Stripe decides where the money goes. The human sits between them holding a phone."

## Beat 2 — the negotiation (45s)

- Click "Open deal room" on the 200A panel upgrade job.
- Two agents haggle live. Narrate the vendor's permit-cost pushback.
- Point at the mandate badge: "My agent's ceiling is 800 dollars. It is not a database row. It is a claim inside the agent's signed access token."
- They settle at 850. The badge goes red. "The deal is good. But it is above the mandate."

## Beat 3 — the block, then the human (35s)

- Click "Try pay WITHOUT approval". Show the raw 403: mandate_exceeded. "This is a real scope gate. The agent's token carries deals:negotiate. It does not carry payments:execute. There is no code path around this."
- Scan the QR with the phone. Approve the exact deal terms on screen.

## Beat 4 — the money (20s)

- Click "Execute payment". Stripe captures 850, vendor gets 824.50, platform keeps the 3% fee.
- "One approval, one deal, one amount. The approval token is single-use and bound to this deal id. A token approved for deal A cannot pay deal B."

## Closer (10s)

"Auth0 was provisioned from the terminal in one Stripe Projects command. Multi-user, monetized, and the agent never once touched money it wasn't mandated to spend."

## Failure recovery

- Negotiation slow or wifi dying: reload with `?scripted=1`.
- Phone dead: click the approval link on screen instead of scanning the QR.
- Everything on fire: DEMO_MODE=mock runs the entire arc with zero external services.
