'use client';

import { useEffect, useState } from 'react';
import type { EventLogEntry } from '@/lib/types';

const SOURCE_COLOR: Record<EventLogEntry['source'], string> = {
  auth0: 'text-accent',
  stripe: 'text-money',
  agent: 'text-ink',
  system: 'text-dim',
};

/**
 * Quiet console-style feed. Polls GET /api/events every 2s and shows the
 * last dozen entries, newest first. Free credibility: the system feels alive.
 */
export default function EventFeed() {
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch('/api/events');
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { events: EventLogEntry[] };
        if (alive) {
          setEvents((data.events ?? []).slice(-12).reverse());
          setWarn(false);
        }
      } catch {
        if (alive) setWarn(true);
      }
    }
    poll();
    const t = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="rounded-xl border border-line bg-inset p-4">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.25em] text-dim">Event log</h3>
      {warn && (
        <p className="mt-2 font-mono text-xs text-warn">event feed unreachable, retrying...</p>
      )}
      <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto font-mono text-xs leading-relaxed">
        {events.length === 0 && !warn && <p className="text-dim/60">waiting for activity...</p>}
        {events.map((e) => (
          <div key={e.id} className="flex gap-2">
            <span className="shrink-0 text-dim/60">
              {new Date(e.ts).toLocaleTimeString('en-US', { hour12: false })}
            </span>
            <span className={`shrink-0 ${SOURCE_COLOR[e.source] ?? 'text-dim'}`}>
              [{e.source}]
            </span>
            <span className="text-dim">{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
