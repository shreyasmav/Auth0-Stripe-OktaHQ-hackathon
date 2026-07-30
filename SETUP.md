# SETUP.md — human steps

Things Claude cannot click. Do them in this order. Everything is optional except step 1: the app runs fully in mock mode with zero external services.

## 1. Stripe CLI login (BLOCKS the judged Auth0 provisioning)

Claude keeps a pairing poll running. Open the link Claude posted in chat and confirm the code. After that Claude runs, with no further input:

```bash
stripe projects init agentmarketplace --skip-skills
stripe projects add auth0/client
stripe projects env --pull
```

## 2. Auth0 dashboard (after step 1 provisions the tenant)

1. Skip CIBA. It needs Enterprise. `APPROVAL_MODE=frontchannel` is wired and is the plan.
2. Add callback URLs when Claude asks: `http://localhost:3000/auth/callback` plus the Vercel domain.
3. Optional if time: create API `https://api.mandate.dev` with scopes `deals:negotiate`, `deals:read`, `payments:execute`, and an M2M app authorized WITHOUT `payments:execute`. This upgrades the token drawer from mock claims to real signed JWT claims. Demo works either way.

## 3. Stripe test mode (optional, upgrades mock payment to real test charge)

- Nothing to click if the provisioned sandbox has test keys; Claude pulls them via `stripe projects env --pull`.
- Connect Express onboarding for Bright Electric: only if time is left after the demo runs clean.

## 4. Leaderboard submission (before 5:20 PM, MANDATORY)

- projects.dev/leaderboard, "Submit Your Project"
- Email: shreyasmavanoor@gmail.com, verification code arrives by email (Claude can read it)
- Hackathon: Built Different (slug `auth0-sanfrancisco-2026`)
- Repo: https://github.com/shreyasmav/Auth0-Stripe-OktaHQ-hackathon
- Demo URL: the Vercel deployment

## 5. Demo (5:30)

- Phone on cellular data, open the QR the approval card shows.
- `npm run seed` between takes (2 seconds, resets everything).
- `?scripted=1` on the deal page forces the scripted negotiation if anything is slow.
