// The approval abstraction — CLAUDE.md §10. Nothing upstream of this module
// knows whether CIBA or the front-channel is doing the work; the downstream
// /pay gate is byte-identical either way. APPROVAL_MODE selects the mode.
import type { Approval, Deal } from "./types";
import { db } from "./store";
import {
  bcAuthorize,
  buildAuthorizationDetails,
  buildBindingMessage,
  pollCiba,
} from "./auth0/ciba";
import { mintElevatedToken } from "./auth0/agent";

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function approvalMode(): "ciba" | "frontchannel" {
  return process.env.APPROVAL_MODE === "ciba" ? "ciba" : "frontchannel";
}

/**
 * Kicks off CIBA polling in the background at the interval Auth0 returns
 * (backing off further on slow_down), and writes the resolved status/token
 * back onto the Approval record. The browser polls OUR /api/approvals/:id,
 * never Auth0 directly — this is the only thing that talks to Auth0.
 */
function pollCibaInBackground(approvalId: string, authReqId: string, intervalSeconds: number) {
  let interval = intervalSeconds;
  const tick = async () => {
    const approval = db.approvals.get(approvalId);
    if (!approval || approval.status !== "pending") return;

    const result = await pollCiba(authReqId);
    if (result.status === "pending") {
      setTimeout(tick, interval * 1000);
      return;
    }

    const resolved: Approval = {
      ...approval,
      status: result.status === "approved" ? "approved" : result.status,
      grantedToken: result.status === "approved" ? result.token : undefined,
      resolvedAt: Date.now(),
    };
    db.approvals.put(resolved);
  };
  setTimeout(tick, interval * 1000);
}

export async function requestApproval(
  deal: Deal,
  approverUserId: string,
  vendorName: string,
  scopeOfWork: string,
  deadline: string,
): Promise<Approval> {
  const mode = approvalMode();
  const bindingMessage = buildBindingMessage(deal.amountCents ?? 0, vendorName);
  const authorizationDetails = buildAuthorizationDetails(deal, vendorName, scopeOfWork, deadline);

  const approval: Approval = {
    id: newId("apr"),
    dealId: deal.id,
    approverUserId,
    mode,
    status: "pending",
    bindingMessage,
    authorizationDetails,
    createdAt: Date.now(),
  };

  if (mode === "ciba") {
    try {
      const { authReqId, interval } = await bcAuthorize(approverUserId, bindingMessage, authorizationDetails);
      approval.authReqId = authReqId;
      db.approvals.put(approval);
      pollCibaInBackground(approval.id, authReqId, interval);
      return approval;
    } catch {
      // CIBA not licensed on this tenant, or bc-authorize failed — fall
      // through to the front-channel path rather than stalling the demo.
      approval.mode = "frontchannel";
    }
  }

  db.approvals.put(approval);
  return approval;
}

export async function getApproval(id: string): Promise<Approval | undefined> {
  return db.approvals.get(id);
}

/**
 * Front-channel only: the approver hit /approve/[approvalId], authenticated,
 * and tapped approve/deny. Mints the elevated single-use token scoped to
 * exactly this deal id and amount.
 */
export async function resolveApproval(
  id: string,
  decision: "approved" | "denied",
  deal: Deal,
  orgId: string,
): Promise<Approval> {
  const approval = db.approvals.get(id);
  if (!approval) throw new Error("approval_not_found");
  if (approval.status !== "pending") return approval;

  const grantedToken =
    decision === "approved"
      ? await mintElevatedToken(orgId, deal.id, deal.amountCents ?? 0, approval.approverUserId)
      : undefined;

  const resolved: Approval = {
    ...approval,
    status: decision,
    grantedToken,
    resolvedAt: Date.now(),
  };
  db.approvals.put(resolved);
  return resolved;
}
