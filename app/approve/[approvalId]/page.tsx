import { db } from "@/lib/store";
import { ApproveButtons } from "./ApproveButtons";

export default async function ApprovePage({ params }: { params: Promise<{ approvalId: string }> }) {
  const { approvalId } = await params;
  const approval = db.approvals.get(approvalId);

  if (!approval) {
    return <main className="mx-auto max-w-md px-6 py-16 text-center text-white/50">Approval not found.</main>;
  }

  const deal = db.deals.get(approval.dealId);
  const details = (approval.authorizationDetails as Array<{ amount: number; vendor: string; scope_of_work: string; deadline: string }>)?.[0];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="text-center text-xs uppercase tracking-widest text-white/40">Mandate approval request</div>

      {details && (
        <div className="rounded-lg border border-line bg-panel p-6 text-center">
          <div className="text-3xl font-bold">${(details.amount / 100).toFixed(2)}</div>
          <div className="mt-1 text-white/70">to {details.vendor}</div>
          <div className="mt-3 text-sm text-white/50">{details.scope_of_work}</div>
          <div className="text-sm text-white/50">Needed by {details.deadline}</div>
        </div>
      )}

      <div className="rounded-lg border border-breach/40 bg-breach/5 p-4 text-center text-sm text-breach">
        This exceeds the buying agent&rsquo;s mandate. It holds no token that permits paying — your approval mints
        the one that does.
      </div>

      <ApproveButtons approvalId={approvalId} initialStatus={approval.status} dealState={deal?.state} />
    </main>
  );
}
