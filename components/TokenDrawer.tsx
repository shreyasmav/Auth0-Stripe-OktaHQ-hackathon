"use client";

// CLAUDE.md §12: "costs 15 minutes, and it's the fastest way to prove the
// mandate is in a signed token rather than a database row." Renders the
// agent's live decoded access token claims.
export function TokenDrawer({ claims }: { claims: Record<string, unknown> | null }) {
  return (
    <details className="rounded-lg border border-line bg-panel p-4 text-sm text-white/70">
      <summary className="cursor-pointer font-semibold text-white/90">
        Decoded agent token claims (live, verified JWT — not a database row)
      </summary>
      <pre className="mt-3 overflow-x-auto rounded bg-black/40 p-3 text-xs">
        {claims ? JSON.stringify(claims, null, 2) : "no token minted yet"}
      </pre>
    </details>
  );
}
