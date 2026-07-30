import { randomUUID } from 'node:crypto';
import type { Approval, Deal } from '@/lib/types';
import { logEvent, snapshot, store } from '@/lib/store';
import { flags } from '@/lib/env';
import {
  CibaUnavailableError,
  pollCiba,
  sanitizeBindingMessage,
  startCiba,
} from '@/lib/auth0/ciba';

// §10: one interface, two modes. Nothing upstream knows which is active.
// The /pay gate downstream is byte-identical in both modes.

function fmtUsd(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** RAR payload shown on the phone and rendered in the ApprovalCard. */
function buildAuthorizationDetails(deal: Deal) {
  const vendor = store.orgs.get(deal.vendorOrgId);
  const job = store.jobs.get(deal.jobId);
  return [
    {
      type: 'procurement_payment',
      deal_id: deal.id,
      amount: deal.amountCents ?? 0,
      currency: 'usd',
      vendor: vendor?.name ?? deal.vendorOrgId,
      scope_of_work: job?.scope ?? '',
      deadline: job?.deadline ?? '',
    },
  ];
}

function persist(approval: Approval, deal: Deal) {
  store.approvals.set(approval.id, approval);
  deal.approvalId = approval.id;
  store.deals.set(deal.id, deal);
  snapshot();
}

/** Mirrors a resolved approval onto the deal so the UI can read one state. */
function syncDealState(approval: Approval) {
  const deal = store.deals.get(approval.dealId);
  if (!deal || deal.state !== 'awaiting_approval') return;
  if (approval.status === 'approved') deal.state = 'approved';
  if (approval.status === 'denied') deal.state = 'denied';
  store.deals.set(deal.id, deal);
}

/**
 * Requests human approval for a deal that breached the mandate.
 * ciba mode pushes to the phone and polls server-side. frontchannel mode
 * waits for /approve/[approvalId]. Idempotent per deal: a second call
 * returns the existing pending or approved approval.
 */
export async function requestApproval(deal: Deal, approverUserId: string): Promise<Approval> {
  if (deal.approvalId) {
    const existing = store.approvals.get(deal.approvalId);
    if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
      return existing;
    }
  }

  const vendorName = store.orgs.get(deal.vendorOrgId)?.name ?? deal.vendorOrgId;
  const amount = deal.amountCents ?? 0;
  // No dollar sign here. The CIBA binding message charset rejects it.
  const bindingMessage = sanitizeBindingMessage(
    `Approve ${fmtUsd(amount)} USD to ${vendorName}`,
  );
  const authorizationDetails = buildAuthorizationDetails(deal);

  const approval: Approval = {
    id: `apr_${randomUUID()}`,
    dealId: deal.id,
    approverUserId,
    mode: 'frontchannel',
    status: 'pending',
    bindingMessage,
    authorizationDetails,
    createdAt: Date.now(),
  };

  if (flags.approvalMode === 'ciba') {
    try {
      const start = await startCiba({
        approverSub: approverUserId,
        bindingMessage,
        authorizationDetails,
      });
      approval.mode = 'ciba';
      approval.authReqId = start.authReqId;
      persist(approval, deal);
      logEvent('auth0', `CIBA push sent to approver: ${bindingMessage}`);
      schedulePolling(approval.id, start.interval, start.expiresIn);
      return approval;
    } catch (err) {
      if (!(err instanceof CibaUnavailableError)) throw err;
      logEvent('auth0', 'CIBA unavailable, falling back to front-channel approval');
    }
  }

  persist(approval, deal);
  logEvent('auth0', `Approval requested: ${bindingMessage}`);

  // §14 insurance: in mock mode an unattended demo still completes.
  // Auto-approve after ~6s, only if a human has not resolved it first.
  if (flags.demoMode === 'mock') {
    setTimeout(() => {
      const a = store.approvals.get(approval.id);
      if (a && a.status === 'pending') {
        void resolveApproval(a.id, 'approved')
          .then(() => logEvent('system', 'Mock mode auto-approved after 6s'))
          .catch(() => {});
      }
    }, 6000);
  }

  return approval;
}

export async function getApproval(id: string): Promise<Approval | undefined> {
  return store.approvals.get(id);
}

/**
 * Resolves a front-channel approval. On approve, mints the opaque
 * single-use grantedToken the pay route exchanges for elevation.
 * Already-resolved approvals return unchanged, so the human tap and the
 * mock auto-approve timer cannot double-resolve.
 */
export async function resolveApproval(
  id: string,
  action: 'approved' | 'denied',
): Promise<Approval> {
  const approval = store.approvals.get(id);
  if (!approval) throw new Error('approval_not_found');
  if (approval.status !== 'pending') return approval;

  approval.status = action;
  approval.resolvedAt = Date.now();
  if (action === 'approved') {
    approval.grantedToken = `apv_${randomUUID()}`;
  }
  syncDealState(approval);
  snapshot();
  logEvent(
    'auth0',
    action === 'approved'
      ? `Approval granted for deal ${approval.dealId}`
      : `Approval denied for deal ${approval.dealId}`,
  );
  return approval;
}

/**
 * §8 step 5: single use. The pay route calls this after a successful charge.
 * Clearing grantedToken makes a replayed token fail verification.
 */
export function consumeApproval(id: string): void {
  const approval = store.approvals.get(id);
  if (!approval || approval.grantedToken === undefined) return;
  approval.grantedToken = undefined;
  snapshot();
  logEvent('auth0', `Approval consumed for deal ${approval.dealId}. Token was single use.`);
}

/**
 * Server-side CIBA polling loop. The browser polls our own API instead.
 * Respects the interval from bc-authorize and backs off on slow_down.
 */
function schedulePolling(approvalId: string, intervalSec: number, expiresIn: number) {
  const deadline = Date.now() + expiresIn * 1000;
  let delayMs = Math.max(1, intervalSec) * 1000;

  const tick = async () => {
    const approval = store.approvals.get(approvalId);
    if (!approval || approval.status !== 'pending') return;

    if (Date.now() > deadline) {
      approval.status = 'expired';
      approval.resolvedAt = Date.now();
      snapshot();
      logEvent('auth0', `CIBA approval expired for deal ${approval.dealId}`);
      return;
    }

    try {
      const result = await pollCiba(approval.authReqId ?? '');
      if (result.status === 'pending') {
        if (result.slowDown) delayMs += 5000;
        setTimeout(tick, delayMs);
        return;
      }
      if (result.status === 'approved') {
        approval.status = 'approved';
        approval.resolvedAt = Date.now();
        // The real elevated JWT from Auth0. verifyBearer validates it
        // against the tenant JWKS, same as any other bearer.
        approval.grantedToken = result.accessToken;
        syncDealState(approval);
        snapshot();
        logEvent('auth0', `CIBA push approved for deal ${approval.dealId}`);
        return;
      }
      approval.status = result.status === 'denied' ? 'denied' : 'expired';
      approval.resolvedAt = Date.now();
      syncDealState(approval);
      snapshot();
      logEvent('auth0', `CIBA ${result.status} for deal ${approval.dealId}`);
    } catch {
      // Transient failure. Keep polling until the deadline.
      setTimeout(tick, delayMs);
    }
  };

  setTimeout(tick, delayMs);
}
