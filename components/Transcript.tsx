'use client';

import { useEffect, useRef, useState } from 'react';
import type { Turn } from '@/lib/types';

const usd = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SPEAKER_LABEL: Record<Turn['speaker'], string> = {
  buyer_agent: 'Buyer agent',
  vendor_agent: 'Vendor agent',
  system: 'system',
};

/** Counts up so a slow live round is visibly progressing, not frozen. */
function ElapsedCounter() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <p className="text-[13px] text-muted">{secs}s elapsed</p>;
}

/**
 * The visual centerpiece. Buyer left, vendor right, system centered.
 *
 * Message bubbles follow the iMessage grammar rather than a chat-app one:
 * generous 20px radius, the incoming side in the grey band colour, the
 * outgoing side in blue, and no borders anywhere. Offer amounts sit under
 * the text as their own line so they read at a distance.
 */
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
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-rule px-6 py-4">
        <h2 className="text-[17px] font-semibold">Negotiation</h2>
        {negotiating && (
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            Live
            <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-blue" />
            <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-blue" />
            <span className="dot inline-block h-1.5 w-1.5 rounded-full bg-blue" />
          </span>
        )}
      </div>

      <div ref={paneRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-[17px] text-muted">{emptyHint ?? 'Opening the deal room…'}</p>
            <span className="flex items-center gap-1.5">
              <span className="dot inline-block h-2 w-2 rounded-full bg-blue" />
              <span className="dot inline-block h-2 w-2 rounded-full bg-blue" />
              <span className="dot inline-block h-2 w-2 rounded-full bg-blue" />
            </span>
            <ElapsedCounter />
          </div>
        )}

        {turns.map((turn, i) => {
          if (turn.speaker === 'system') {
            return (
              <div key={i} className="turn-in text-center">
                <span className="inline-block max-w-[85%] text-[14px] leading-[1.45] text-muted">
                  {turn.text}
                </span>
              </div>
            );
          }
          const isBuyer = turn.speaker === 'buyer_agent';
          return (
            <div key={i} className={`turn-in flex ${isBuyer ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[78%] ${isBuyer ? 'text-left' : 'text-right'}`}>
                <div className="mb-1.5 px-1 text-[12px] text-muted">
                  {SPEAKER_LABEL[turn.speaker]}
                </div>
                <div
                  className={`rounded-[20px] px-5 py-3.5 text-left ${
                    isBuyer ? 'bg-band text-ink' : 'bg-blue text-white'
                  }`}
                >
                  <p className="text-[17px] leading-[1.45]">{turn.text}</p>
                  {typeof turn.offerCents === 'number' && (
                    <span
                      className={`price mt-2.5 block text-[22px] font-semibold ${
                        isBuyer ? 'text-ink' : 'text-white'
                      }`}
                    >
                      {usd(turn.offerCents)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {negotiating && turns.length > 0 && (
          <div className="flex justify-center gap-1.5 pt-1">
            <span className="dot inline-block h-2 w-2 rounded-full bg-muted" />
            <span className="dot inline-block h-2 w-2 rounded-full bg-muted" />
            <span className="dot inline-block h-2 w-2 rounded-full bg-muted" />
          </div>
        )}
      </div>
    </div>
  );
}
