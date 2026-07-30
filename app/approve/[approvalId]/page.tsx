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
      <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-2xl font-bold">Approval not found</p>
          <p className="mt-2 text-neutral-400">
            This link may be stale. Ask the requester to send a fresh one.
          </p>
        </div>
      </main>
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
  const usd = `$${(amountCents / 100).toFixed(2)}`;
  const showMockChip = !auth0Configured() || flags.demoMode === 'mock';

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium uppercase tracking-widest text-neutral-500">
            Payment approval
          </p>
          {showMockChip && (
            <span className="rounded-full bg-amber-500/20 border border-amber-500/50 px-3 py-1 text-xs font-bold text-amber-400">
              MOCK
            </span>
          )}
        </div>

        <h1 className="mt-6 text-6xl font-bold tracking-tight">{usd}</h1>
        <p className="mt-2 text-2xl text-neutral-300">
          to <span className="font-semibold text-white">{vendorName}</span>
        </p>

        <div className="mt-8 space-y-4 rounded-2xl bg-neutral-900 border border-neutral-800 p-5">
          {detail?.scope_of_work && (
            <div>
              <p className="text-xs uppercase tracking-widest text-neutral-500">Scope of work</p>
              <p className="mt-1 text-lg text-neutral-200">{detail.scope_of_work}</p>
            </div>
          )}
          {detail?.deadline && (
            <div>
              <p className="text-xs uppercase tracking-widest text-neutral-500">Deadline</p>
              <p className="mt-1 text-lg text-neutral-200">{detail.deadline}</p>
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-widest text-neutral-500">Deal</p>
            <p className="mt-1 font-mono text-sm text-neutral-400">{approval.dealId}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-neutral-500">Requested by agent</p>
            <p className="mt-1 text-lg text-neutral-200">
              This amount exceeds the agent&apos;s mandate. Your authorization is required
              before any payment can move.
            </p>
          </div>
        </div>

        <ApprovalActions approvalId={approval.id} initialStatus={approval.status} />

        {/* For the judge who asks to see the raw RAR payload. */}
        <details className="mt-8 text-neutral-500">
          <summary className="cursor-pointer text-sm">Raw authorization details</summary>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-neutral-900 p-4 text-xs text-neutral-400">
            {JSON.stringify(approval.authorizationDetails, null, 2)}
          </pre>
        </details>
      </div>
    </main>
  );
}
