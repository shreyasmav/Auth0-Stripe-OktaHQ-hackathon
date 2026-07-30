'use client';

import { useCallback, useEffect, useState } from 'react';

type Status = 'pending' | 'approved' | 'denied' | 'expired';

/**
 * Client island for the phone approval screen. Posts the decision and keeps
 * the status fresh so a resolution made elsewhere (mock auto-approve, the
 * dashboard) shows up here without a refresh.
 */
export default function ApprovalActions({
  approvalId,
  initialStatus,
}: {
  approvalId: string;
  initialStatus: Status;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'pending') return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/approvals/${approvalId}`);
        if (!res.ok) return;
        const data = (await res.json()) as { approval?: { status?: Status } };
        const next = data.approval?.status;
        if (next && next !== 'pending') setStatus(next);
      } catch {
        // Network blip. The next poll retries.
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [approvalId, status]);

  const act = useCallback(
    async (action: 'approved' | 'denied') => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/approvals/${approvalId}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const data = (await res.json()) as {
          approval?: { status?: Status };
          error?: string;
        };
        if (!res.ok) {
          setError(data.error ?? 'request_failed');
          return;
        }
        if (data.approval?.status) setStatus(data.approval.status);
      } catch {
        setError('network_error');
      } finally {
        setBusy(false);
      }
    },
    [approvalId],
  );

  if (status === 'approved') {
    return (
      <div className="mt-8 rounded-2xl bg-green-500/15 border border-green-500/40 px-6 py-8 text-center">
        <p className="text-3xl font-bold text-green-400">Approved</p>
        <p className="mt-2 text-neutral-300">Payment is now authorized to proceed.</p>
      </div>
    );
  }
  if (status === 'denied') {
    return (
      <div className="mt-8 rounded-2xl bg-red-500/15 border border-red-500/40 px-6 py-8 text-center">
        <p className="text-3xl font-bold text-red-400">Denied</p>
        <p className="mt-2 text-neutral-300">No payment will move for this deal.</p>
      </div>
    );
  }
  if (status === 'expired') {
    return (
      <div className="mt-8 rounded-2xl bg-neutral-800 border border-neutral-700 px-6 py-8 text-center">
        <p className="text-3xl font-bold text-neutral-400">Expired</p>
        <p className="mt-2 text-neutral-400">This approval request timed out.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-4">
      <button
        onClick={() => act('approved')}
        disabled={busy}
        className="h-20 rounded-2xl bg-green-500 text-neutral-950 text-3xl font-bold tracking-tight active:bg-green-400 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        onClick={() => act('denied')}
        disabled={busy}
        className="h-14 rounded-2xl border-2 border-red-500/60 text-red-400 text-xl font-semibold active:bg-red-500/10 disabled:opacity-50"
      >
        Deny
      </button>
      {error && (
        <p className="text-center text-sm text-red-400">Something went wrong: {error}</p>
      )}
    </div>
  );
}
