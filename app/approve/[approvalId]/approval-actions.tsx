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
      <div className="card mt-8 px-6 py-8 text-center">
        <p className="text-[28px] font-semibold text-green">Approved</p>
        <p className="mt-2 text-[15px] text-muted">Payment is now authorized to proceed.</p>
      </div>
    );
  }
  if (status === 'denied') {
    return (
      <div className="card mt-8 border-red px-6 py-8 text-center">
        <p className="text-[28px] font-semibold text-red">Declined</p>
        <p className="mt-2 text-[15px] text-muted">No payment will move for this deal.</p>
      </div>
    );
  }
  if (status === 'expired') {
    return (
      <div className="card mt-8 px-6 py-8 text-center">
        <p className="text-[28px] font-semibold text-muted">Expired</p>
        <p className="mt-2 text-[15px] text-muted">This approval request timed out.</p>
      </div>
    );
  }

  // Thumb-sized targets: this screen is opened on a phone after scanning the
  // QR code, so the primary pill is deliberately taller than the desktop one.
  return (
    <div className="mt-8 flex flex-col gap-3">
      <button
        onClick={() => act('approved')}
        disabled={busy}
        className="btn-pill btn-primary h-16 text-[21px]"
      >
        Approve
      </button>
      <button
        onClick={() => act('denied')}
        disabled={busy}
        className="btn-pill btn-secondary h-12 text-[17px]"
      >
        Decline
      </button>
      {error && (
        <p className="text-center text-[14px] text-red">Something went wrong: {error}</p>
      )}
    </div>
  );
}
