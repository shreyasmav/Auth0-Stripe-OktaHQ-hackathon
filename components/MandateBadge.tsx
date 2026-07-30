"use client";

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function MandateBadge({
  ceilingCents,
  settledCents,
}: {
  ceilingCents: number;
  settledCents?: number;
}) {
  const breached = settledCents !== undefined && settledCents > ceilingCents;

  return (
    <div
      className={`flex items-center gap-4 rounded-lg border px-5 py-3 transition-colors ${
        breached ? "border-breach bg-breach/10 mandate-breach" : "border-line bg-panel"
      }`}
    >
      <div>
        <div className="text-xs uppercase tracking-wide text-white/50">Mandate ceiling</div>
        <div className="text-2xl font-semibold tabular-nums">{fmt(ceilingCents)}</div>
      </div>
      {settledCents !== undefined && (
        <div className="border-l border-line pl-4">
          <div className="text-xs uppercase tracking-wide text-white/50">Settled at</div>
          <div className={`text-2xl font-semibold tabular-nums ${breached ? "text-breach" : "text-ok"}`}>
            {fmt(settledCents)}
          </div>
        </div>
      )}
      {breached && (
        <div className="ml-auto rounded bg-breach px-3 py-1 text-sm font-semibold text-white">
          Exceeds mandate — approval required
        </div>
      )}
    </div>
  );
}
