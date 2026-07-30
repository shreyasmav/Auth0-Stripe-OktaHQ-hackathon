"use client";

import { useEffect, useRef } from "react";
import type { Turn } from "@/lib/types";

function fmt(cents?: number) {
  if (cents === undefined) return undefined;
  return `$${(cents / 100).toFixed(2)}`;
}

export function Transcript({ turns }: { turns: Turn[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  return (
    <div className="flex flex-col gap-3 overflow-y-auto rounded-lg border border-line bg-panel p-4" style={{ maxHeight: 480 }}>
      {turns.length === 0 && <div className="text-white/40">Waiting for the negotiation to start…</div>}
      {turns.map((turn, i) => {
        if (turn.speaker === "system") {
          return (
            <div key={i} className="turn-fade-in text-center text-sm text-white/60">
              — {turn.text} —
            </div>
          );
        }
        const isBuyer = turn.speaker === "buyer_agent";
        return (
          <div key={i} className={`turn-fade-in flex ${isBuyer ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[70%] rounded-xl px-4 py-3 ${
                isBuyer ? "bg-buyer/15 border border-buyer/40" : "bg-vendor/15 border border-vendor/40"
              }`}
            >
              <div className={`mb-1 text-xs font-semibold uppercase tracking-wide ${isBuyer ? "text-buyer" : "text-vendor"}`}>
                {isBuyer ? "Buyer agent" : "Vendor agent"}
              </div>
              <div className="text-white/90">{turn.text}</div>
              {turn.offerCents !== undefined && (
                <div className="mt-2 inline-block rounded bg-black/30 px-2 py-1 text-sm font-semibold tabular-nums">
                  {fmt(turn.offerCents)}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
