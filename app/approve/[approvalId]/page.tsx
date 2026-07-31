import { redirect } from 'next/navigation';
import { getApproval } from '@/lib/approval';
import { getSessionUser } from '@/lib/auth0/session';
import { auth0Configured, flags } from '@/lib/env';
import { store } from '@/lib/store';
import ApprovalActions from './approval-actions';

// Reads the in-memory store per request. Never statically render this.
export const dynamic = 'force-dynamic';

type RarDetail = {
  type?: string;
  deal_id?: string;
  amount?: number;
  currency?: string;
  vendor?: string;
  scope_of_work?: string;
  deadline?: string;
};

/**
 * Phone-facing approval screen (§10 front channel). This is what the
 * presenter opens after scanning the QR code on stage. Big type, dark,
 * one huge green button.
 */
export default async function ApprovePage({
  params,
}: {
  params: Promise<{ approvalId: string }>;
}) {
  const { approvalId } = await params;

  if (auth0Configured()) {
    const user = await getSessionUser();
    if (!user) {
      redirect(`/auth/login?returnTo=${encodeURIComponent(`/approve/${approvalId}`)}`);
    }
  }

  const approval = await getApproval(approvalId);
  if (!approval) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6 text-center">
        <div>
          <p className="text-[28px] font-semibold">Approval not found</p>
          <p className="mt-2 text-[17px] text-muted">
            This link may be stale. Ask the requester to send a fresh one.
          </p>
        </div>
      </div>
    );
  }

  const details = Array.isArray(approval.authorizationDetails)
    ? (approval.authorizationDetails as RarDetail[])
    : [];
  const detail = details[0];
  const deal = store.deals.get(approval.dealId);
  const vendorName =
    detail?.vendor ?? store.orgs.get(deal?.vendorOrgId ?? '')?.name ?? 'Vendor';
  const amountCents = detail?.amount ?? deal?.amountCents ?? 0;
  const usd =
    '$' +
    (amountCents / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const showMockChip = !auth0Configured() || flags.demoMode === 'mock';

  return (
    <div className="mx-auto w-full max-w-md px-6 py-12">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Payment approval</p>
        {showMockChip && <span className="chip">MOCK</span>}
      </div>

      <h1 className="price mt-6 text-[64px] leading-none font-semibold">{usd}</h1>
      <p className="mt-3 text-[21px] text-muted">
        to <span className="font-medium text-ink">{vendorName}</span>
      </p>

      <div className="card mt-8 divide-y divide-rule">
        {detail?.scope_of_work && (
          <div className="px-6 py-4">
            <p className="eyebrow">Scope of work</p>
            <p className="mt-1.5 text-[17px] leading-[1.4]">{detail.scope_of_work}</p>
          </div>
        )}
        {detail?.deadline && (
          <div className="px-6 py-4">
            <p className="eyebrow">Deadline</p>
            <p className="mt-1.5 text-[17px]">{detail.deadline}</p>
          </div>
        )}
        <div className="px-6 py-4">
          <p className="eyebrow">Deal</p>
          <p className="mt-1.5 font-mono text-[13px] text-muted">{approval.dealId}</p>
        </div>
        <div className="px-6 py-4">
          <p className="eyebrow">Why you are being asked</p>
          <p className="mt-1.5 text-[15px] leading-[1.5] text-muted">
            This amount exceeds the agent&apos;s mandate. Your authorization is required before any
            payment can move.
          </p>
        </div>
      </div>

      <ApprovalActions approvalId={approval.id} initialStatus={approval.status} />

      {/* For the judge who asks to see the raw RAR payload. */}
      <details className="mt-8 text-muted">
        <summary className="cursor-pointer text-[14px]">Raw authorization details</summary>
        <pre className="well mt-2 overflow-x-auto p-4 font-mono text-[11px] leading-relaxed">
          {JSON.stringify(approval.authorizationDetails, null, 2)}
        </pre>
      </details>
    </div>
  );
}
