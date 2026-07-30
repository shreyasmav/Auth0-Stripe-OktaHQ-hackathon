'use client';

import { useEffect, useRef, useState } from 'react';
import type { Turn } from '@/lib/types';

const usd = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SPEAKER_LABEL: Record<Turn['speaker'], string> = {
  buyer_agent: 'Acme buyer agent',
  vendor_agent: 'Bright Electric agent',
  system: 'system',
};

/**
 * The visual centerpiece. Buyer left, vendor right, system centered.
 * Offers render as inline mono badges. Each turn fades in once and the
 * pane keeps itself scrolled to the newest turn.
 */
/** Counts up so a slow live round is visibly progressing, not frozen. */
function ElapsedCounter() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <p className="font-mono text-xs text-dim/40">{secs}s elapsed</p>;
}

export default function Transcript({
  turns,
  negotiating,
  emptyHint,
}: {
  turns: Turn[];
  negotiating: boolean;
  /** Shown while there are no turns yet. Live rounds take 15-30s each, and a
   *  bare "opening..." with no elapsed feedback reads as a hung page. */
  emptyHint?: string;
}) {
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = paneRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, negotiating]);

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-raised">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-dim">
            Negotiation transcript
          </h2>
          <span className="fig-label">FIG. 02 &middot; AGENT TO AGENT &middot; REV A</span>
        </div>
        {negotiating && (
          <span className="flex items-center gap-1.5 font-mono text-xs text-accent">
            live
            <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
        )}
      </div>

      <div ref={paneRef} className="flex-1 space-y-4 overflow-y-auto p-6">
        {turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="font-mono text-sm uppercase tracking-[0.25em] text-dim/60">
              {emptyHint ?? 'Opening the deal room...'}
            </p>
            <span className="flex items-center gap-1.5">
              <span className="dot inline-block h-2 w-2 rounded-full bg-accent" />
              <span className="dot inline-block h-2 w-2 rounded-full bg-accent" />
              <span className="dot inline-block h-2 w-2 rounded-full bg-accent" />
            </span>
            <ElapsedCounter />
          </div>
        )}

        {turns.map((turn, i) => {
          if (turn.speaker === 'system') {
            return (
              <div key={i} className="turn-in text-center">
                <span className="inline-block max-w-[85%] rounded-lg border border-line/60 bg-inset px-4 py-2 font-mono text-base text-dim">
                  {turn.text}
                </span>
              </div>
            );
          }
          const isBuyer = turn.speaker === 'buyer_agent';
          return (
            <div key={i} className={`turn-in flex ${isBuyer ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[80%] rounded-xl border px-5 py-4 ${
                  isBuyer
                    ? 'border-accent/30 bg-accent/10 rounded-tl-sm'
                    : 'border-line bg-inset rounded-tr-sm'
                }`}
              >
                <div
                  className={`mb-1.5 font-mono text-[11px] uppercase tracking-widest ${
                    isBuyer ? 'text-accent' : 'text-dim'
                  }`}
                >
                  {SPEAKER_LABEL[turn.speaker]}
                </div>
                <p className="text-xl leading-relaxed">{turn.text}</p>
                {typeof turn.offerCents === 'number' && (
                  <span
                    className={`mt-3 inline-block rounded-md px-3 py-1 font-mono text-lg font-bold tabular-nums ${
                      isBuyer ? 'bg-accent/20 text-accent' : 'bg-line text-ink'
                    }`}
                  >
                    {usd(turn.offerCents)}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {negotiating && turns.length > 0 && (
          <div className="flex justify-center gap-1.5 pt-1">
            <span className="dot inline-block h-2 w-2 rounded-full bg-dim" />
            <span className="dot inline-block h-2 w-2 rounded-full bg-dim" />
            <span className="dot inline-block h-2 w-2 rounded-full bg-dim" />
          </div>
        )}
      </div>
    </div>
  );
}
