'use client';

import { useEffect, useRef, useState } from 'react';
import { toDataURL } from 'qrcode';
import type { Approval, Deal } from '@/lib/types';
import type { PayResult } from './PaymentPanel';

const usd = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Loose view of one RAR entry. Builder A composes the real payload. */
type RarDetail = {
  type?: string;
  deal_id?: string;
  amount?: number;
  currency?: string;
  vendor?: string;
  scope_of_work?: string;
  deadline?: string;
};

function firstDetail(raw: unknown): RarDetail | null {
  if (Array.isArray(raw) && raw.length > 0 && raw[0] && typeof raw[0] === 'object') {
    return raw[0] as RarDetail;
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as RarDetail;
  return null;
}

/**
 * The approval beat. Requests an approval once, polls it every second,
 * shows the RAR payload as human lines plus a QR code the presenter can
 * scan on stage. Once approved it exposes the two payment buttons,
 * including the deliberate 403 demo.
 */
export default function ApprovalCard({
  deal,
  vendorName,
  approval,
  onApproval,
  onPaid,
}: {
  deal: Deal;
  vendorName: string;
  approval: Approval | null;
  onApproval: (a: Approval) => void;
  onPaid: (payment: PayResult, deal: Deal) => void;
}) {
  const requestedRef = useRef(false);
  const [qr, setQr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [paying, setPaying] = useState<'demo' | 'real' | null>(null);
  const [demo403, setDemo403] = useState<{ status: number; body: unknown } | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  // Create the approval exactly once, unless the deal already has one.
  useEffect(() => {
    if (approval || requestedRef.current) return;
    requestedRef.current = true;
    (async () => {
      try {
        const res = await fetch('/api/approvals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealId: deal.id }),
        });
        if (!res.ok) throw new Error(`POST /api/approvals returned ${res.status}`);
        const data = (await res.json()) as { approval: Approval };
        onApproval(data.approval);
      } catch (e) {
        setWarn(`Could not request approval. ${e instanceof Error ? e.message : ''}`);
        requestedRef.current = false;
      }
    })();
  }, [approval, deal.id, onApproval]);

  // Poll while pending, and keep polling if approved but the elevated
  // token has not landed yet. The approver resolves from their phone.
  useEffect(() => {
    if (!approval) return;
    const unsettled =
      approval.status === 'pending' || (approval.status === 'approved' && !approval.grantedToken);
    if (!unsettled) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/approvals/${approval.id}`);
        if (!res.ok) return;
        const data = (await res.json()) as { approval: Approval };
        if (!data.approval) return;
        const changed =
          data.approval.status !== approval.status ||
          data.approval.grantedToken !== approval.grantedToken;
        if (changed) onApproval(data.approval);
      } catch {
        // Keep polling. Transient failures should not kill the demo.
      }
    }, 1000);
    return () => clearInterval(t);
  }, [approval, onApproval]);

  const [deciding, setDeciding] = useState(false);

  /** Resolve the approval from this page. Same endpoint the phone screen posts
   *  to, so the downstream gate is byte-identical either way. */
  async function decide(action: 'approved' | 'denied') {
    if (!approval || deciding) return;
    setDeciding(true);
    try {
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = (await res.json()) as { approval: Approval };
        if (data.approval) onApproval(data.approval);
      }
    } finally {
      setDeciding(false);
    }
  }

  // QR code for the phone-facing approval screen.
  const approvalId = approval?.id;
  useEffect(() => {
    if (!approvalId) return;
    toDataURL(`${window.location.origin}/approve/${approvalId}`, {
      width: 220,
      margin: 1,
      color: { dark: '#1d1d1f', light: '#ffffff' },
    })
      .then(setQr)
      .catch(() => {
        // The plain link below covers a QR failure.
      });
  }, [approvalId]);

  const usdAmount = usd(deal.amountCents ?? 0);

  /**
   * Accept the settled price and hand off to Stripe's hosted Checkout.
   *
   * The elevated token still rides on the request: /checkout runs the same
   * §8 gate as /pay, so being redirected to Stripe is not a way around the
   * mandate. The approval is consumed on completion, not here, so abandoning
   * the Stripe page leaves the deal payable.
   */
  async function goToStripe(token: string) {
    if (redirecting) return;
    setRedirecting(true);
    setPayError(null);
    try {
      const res = await fetch(`/api/deals/${deal.id}/checkout`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as { url?: string; error?: string; message?: string };
      if (res.ok && body.url) {
        window.location.href = body.url;
        return;
      }
      setPayError(
        body.error === 'stripe_not_configured'
          ? 'Stripe is not configured. Add STRIPE_SECRET_KEY, or use the server-side charge below.'
          : `Could not open Stripe checkout: ${body.message ?? body.error ?? res.status}`,
      );
    } catch (err) {
      setPayError(`Could not reach the checkout endpoint: ${(err as Error).message}`);
    } finally {
      setRedirecting(false);
    }
  }

  async function pay(token: string, isDenialDemo: boolean) {
    setPaying(isDenialDemo ? 'demo' : 'real');
    if (!isDenialDemo) setPayError(null);
    try {
      const res = await fetch(`/api/deals/${deal.id}/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body: unknown = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (res.ok) {
        const data = body as { deal: Deal; payment: PayResult };
        setDemo403(null);
        onPaid(data.payment, data.deal);
      } else if (isDenialDemo) {
        // This 403 is the point. Show the raw refusal.
        setDemo403({ status: res.status, body });
      } else {
        setPayError(`Payment failed (${res.status}): ${JSON.stringify(body)}`);
      }
    } catch (e) {
      const msg = `Payment request did not reach the server. ${e instanceof Error ? e.message : ''}`;
      if (isDenialDemo) setDemo403({ status: 0, body: { error: msg } });
      else setPayError(msg);
    } finally {
      setPaying(null);
    }
  }

  const detail = firstDetail(approval?.authorizationDetails);
  const amountCents = detail?.amount ?? deal.amountCents;
  const approved = approval?.status === 'approved';
  const denied = approval?.status === 'denied' || approval?.status === 'expired';
  const paid = deal.state === 'paid';

  return (
    <div className={`card p-6 ${denied ? 'border-red' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">
          {approved ? 'Approved' : denied ? 'Declined' : 'Approval required'}
        </h2>
        {approved && <span className="chip chip-ok">Authorized</span>}
        {!approved && !denied && <span className="chip chip-warn">Pending</span>}
      </div>

      {warn && <p className="mt-3 text-[14px] text-amber">{warn}</p>}

      {/* The RAR payload, rendered as human text. Raw JSON lives in the details tag. */}
      {approval && (
        <dl className="mt-4 space-y-2.5 text-[15px]">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">To</dt>
            <dd className="text-right font-medium">{detail?.vendor ?? vendorName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Amount</dt>
            <dd className="price font-semibold">
              {amountCents !== undefined ? usd(amountCents) : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Scope</dt>
            <dd className="text-right">{detail?.scope_of_work ?? `Deal ${deal.id}`}</dd>
          </div>
          {detail?.deadline && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Deadline</dt>
              <dd className="text-right">{detail.deadline}</dd>
            </div>
          )}
        </dl>
      )}

      {/* Pending: spinner, QR, plain link. */}
      {approval && approval.status === 'pending' && (
        <div className="mt-5 space-y-4">
          <div className="flex items-center gap-2 text-[14px] text-muted">
            <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-amber" />
            <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-amber" />
            <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-amber" />
            <span className="ml-1">Waiting for approver…</span>
          </div>

          {/* Approve in place. The QR below is the phone-facing path and the
              honest demo beat, but requiring a tab switch to resolve every
              approval made the flow feel stalled. */}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => void decide('approved')}
              disabled={deciding}
              className="btn-pill-sm btn-primary flex-1"
            >
              {deciding ? 'Authorizing…' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={() => void decide('denied')}
              disabled={deciding}
              className="btn-pill-sm btn-secondary"
            >
              Decline
            </button>
          </div>

          <p className="text-center text-[13px] text-muted">Or scan to approve from a phone</p>
          {qr && (
            <div className="flex justify-center rounded-[12px] border border-rule bg-white p-3">
              {/* Data URI QR: next/image adds nothing here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt={`QR code linking to the approval screen for ${approval.id}`}
                width={220}
                height={220}
              />
            </div>
          )}
          <a
            href={`/approve/${approval.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-center text-[13px] text-blue hover:underline"
          >
            /approve/{approval.id}
          </a>
        </div>
      )}

      {/* Resolved: who and when, raw payload for the judge who asks. */}
      {approval && (approved || denied) && (
        <div className="mt-5 space-y-3">
          <p className={`text-[14px] ${approved ? 'text-green' : 'text-red'}`}>
            {approved ? 'Approved' : 'Declined'} by {approval.approverUserId}
            {approval.resolvedAt && (
              <> at {new Date(approval.resolvedAt).toLocaleTimeString('en-US', { hour12: false })}</>
            )}
          </p>
          <details className="well p-3">
            <summary className="cursor-pointer text-[13px] text-muted">
              Raw authorization payload
            </summary>
            <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-relaxed text-muted">
              {JSON.stringify(
                {
                  binding_message: approval.bindingMessage,
                  authorization_details: approval.authorizationDetails,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      )}

      {/* The two payment buttons. The 403 attempt is a demo beat, not an error. */}
      {approved && !paid && (
        <div className="mt-5 space-y-3 border-t border-rule pt-5">
          <button
            onClick={() => approval?.grantedToken && void goToStripe(approval.grantedToken)}
            disabled={paying !== null || redirecting || !approval?.grantedToken}
            className="btn-pill btn-primary w-full"
          >
            {redirecting ? 'Opening Stripe…' : `Accept ${usdAmount} and pay`}
          </button>
          <p className="text-center text-[12px] text-muted">
            You will be redirected to Stripe to enter card details.
          </p>

          <button
            onClick={() => pay('invalid', true)}
            disabled={paying !== null}
            className="btn-pill-sm btn-danger w-full"
          >
            {paying === 'demo' ? 'Trying…' : 'Try to pay without approval'}
          </button>
          {demo403 && (
            <pre className="overflow-x-auto rounded-[12px] border border-red/40 bg-red/5 p-3 font-mono text-[11px] leading-relaxed text-red">
              {`HTTP ${demo403.status || 'ERR'}\n${JSON.stringify(demo403.body, null, 2)}`}
            </pre>
          )}

          {/* Server-confirmed charge, kept for an unattended run where nobody
              is at the keyboard to complete a hosted checkout. */}
          <button
            onClick={() => approval?.grantedToken && pay(approval.grantedToken, false)}
            disabled={paying !== null || redirecting || !approval?.grantedToken}
            className="w-full text-center text-[13px] text-blue hover:underline disabled:opacity-50"
          >
            {paying === 'real' ? 'Executing…' : 'Charge server-side instead (unattended demo)'}
          </button>

          {!approval?.grantedToken && (
            <p className="text-[13px] text-amber">
              Approval is granted but no elevated token arrived yet. Poll again or check the
              approval service.
            </p>
          )}
          {payError && <p className="text-[14px] text-amber">{payError}</p>}
        </div>
      )}
    </div>
  );
}
