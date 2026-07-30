#!/usr/bin/env node
// Headless happy path (CLAUDE.md §17): seed -> job -> deal -> negotiate SSE ->
// gate 403 -> approval -> approve -> pay -> assert paid. Plain node fetch, no
// deps. Run the dev server first, then: node scripts/demo-check.mjs

const BASE = process.env.DEMO_BASE_URL || 'http://localhost:3000';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function step(name, fn) {
  try {
    const detail = await fn();
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } catch (err) {
    console.log(`FAIL  ${name}  ${err.message}`);
    console.log('\nDEMO CHECK FAILED');
    process.exit(1);
  }
}

async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body, leave data null
  }
  return { res, data };
}

// Consume the negotiate SSE stream to completion. Returns turn count and the
// final deal from the state event.
async function consumeSse(path) {
  const res = await fetch(BASE + path, { headers: { accept: 'text/event-stream' } });
  assert(res.ok, `SSE HTTP ${res.status}`);
  assert(res.body, 'SSE response had no body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let turns = 0;
  let finalDeal = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const evt = JSON.parse(line.slice(6));
        if (evt.type === 'turn') turns++;
        if (evt.type === 'state') finalDeal = evt.deal;
        if (evt.type === 'error') throw new Error(`SSE error event: ${evt.error}`);
      }
    }
  }
  return { turns, finalDeal };
}

let jobId = '';
let dealId = '';
let approvalId = '';
let grantedToken = '';

await step('seed: POST /api/seed resets the store', async () => {
  const { res, data } = await call('POST', '/api/seed');
  assert(res.ok, `HTTP ${res.status}`);
  assert(data?.ok === true, 'expected {ok:true}');
});

await step('job: POST /api/jobs parses raw text', async () => {
  const { res, data } = await call('POST', '/api/jobs', {
    rawText: 'We need a 200A electrical panel upgrade in suite 300 before the November inspection.',
  });
  assert(res.ok, `HTTP ${res.status}`);
  assert(data?.job?.id, 'no job id returned');
  assert(data.job.category === 'electrical', `category ${data.job.category}`);
  jobId = data.job.id;
  return jobId;
});

await step('deal: POST /api/deals opens vs cheapest-floor vendor', async () => {
  const { res, data } = await call('POST', '/api/deals', { jobId });
  assert(res.ok, `HTTP ${res.status}`);
  assert(data?.deal?.id, 'no deal id returned');
  assert(data.deal.vendorOrgId === 'org_bright', `vendor ${data.deal.vendorOrgId}, expected org_bright`);
  assert(data.deal.state === 'negotiating', `state ${data.deal.state}`);
  dealId = data.deal.id;
  return dealId;
});

await step('negotiate: SSE settles at 85000 above the 80000 ceiling', async () => {
  const { turns, finalDeal } = await consumeSse(`/api/deals/${dealId}/negotiate?scripted=1`);
  assert(turns >= 5, `only ${turns} turns streamed`);
  assert(finalDeal, 'no final state event');
  assert(finalDeal.amountCents === 85000, `amountCents ${finalDeal.amountCents}`);
  assert(finalDeal.state === 'awaiting_approval', `state ${finalDeal.state}`);
  return `${turns} turns`;
});

await step('gate: pay without approval returns 403 mandate_exceeded', async () => {
  const { res, data } = await call('POST', `/api/deals/${dealId}/pay`, undefined, {
    authorization: 'Bearer not_a_real_token',
  });
  assert(res.status === 403, `HTTP ${res.status}, expected 403`);
  assert(data?.error === 'mandate_exceeded', `error ${data?.error}`);
  assert(data.ceiling === 80000, `ceiling ${data.ceiling}`);
  assert(data.requested === 85000, `requested ${data.requested}`);
});

await step('approval: POST /api/approvals creates a pending approval', async () => {
  const { res, data } = await call('POST', '/api/approvals', { dealId });
  assert(res.ok, `HTTP ${res.status}`);
  assert(data?.approval?.id, 'no approval id returned');
  assert(data.approval.status === 'pending', `status ${data.approval.status}`);
  approvalId = data.approval.id;
  return approvalId;
});

await step('approve: POST /api/approvals/:id grants the elevated token', async () => {
  const { res, data } = await call('POST', `/api/approvals/${approvalId}`, { action: 'approved' });
  assert(res.ok, `HTTP ${res.status}`);
  assert(data?.approval?.status === 'approved', `status ${data?.approval?.status}`);
  assert(data.approval.grantedToken, 'no grantedToken on approved approval');
  grantedToken = data.approval.grantedToken;
});

await step('pay: elevated token clears the gate and captures payment', async () => {
  const { res, data } = await call('POST', `/api/deals/${dealId}/pay`, undefined, {
    authorization: `Bearer ${grantedToken}`,
  });
  assert(res.ok, `HTTP ${res.status}: ${JSON.stringify(data)}`);
  assert(data?.deal?.state === 'paid', `deal state ${data?.deal?.state}`);
  assert(data.payment?.amountCents === 85000, `amount ${data.payment?.amountCents}`);
  assert(data.payment.applicationFeeCents === 2550, `fee ${data.payment.applicationFeeCents}`);
  assert(data.payment.vendorNetCents === 82450, `vendor net ${data.payment.vendorNetCents}`);
  assert(data.payment.paymentIntentId, 'no paymentIntentId');
  return `${data.payment.paymentIntentId}${data.payment.mock ? ' (mock)' : ''}`;
});

console.log('\nALL CHECKS PASSED');
process.exit(0);
