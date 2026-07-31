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

"This Auth0 tenant was provisioned from the terminal, at 5:12 this afternoon, with one command: stripe projects add auth0/client. Multi-user, monetized, and the agent never once touched money it wasn't mandated to spend."

If a judge asks what is real: the Stripe charges are real test-mode PaymentIntents,
visible in the dashboard with deal and approval ids in the metadata. The Auth0
client is really provisioned through Stripe Projects. CIBA is coded but the tenant
is not licensed for it, so approval runs over the front channel with the identical
authorization model. FGA runs the same tuple checks in process rather than against
the cloud store. Say all of that plainly, it reads as engineering judgment.

## DO NOT RESTART THE DEV SERVER BEFORE THE DEMO

Auth0 credentials landed in .env at 5:12pm. The running server started before
that file existed, so it is still using the built-in demo user and every screen
works. Restarting it makes auth0Configured() true, which switches the app to
real Auth0 login, and the provisioned tenant has no localhost callback URL
registered yet. That would break the demo. Wire real login after you present.

## Phone reachability (read before going on stage)

The approval QR encodes the page origin. Open the app on the laptop via
http://172.16.35.119:3000 (venue wifi IP), NOT localhost, so the phone can
reach the approve page. Phone must be on the same wifi. If the venue wifi
isolates clients, skip the QR and click the approval link on the laptop
screen instead. The narrative is identical.

## Failure recovery

- Negotiation slow or wifi dying: reload with `?scripted=1`.
- Phone dead: click the approval link on screen instead of scanning the QR.
- Everything on fire: DEMO_MODE=mock runs the entire arc with zero external services.
