import { store } from '@/lib/store';

export const dynamic = 'force-dynamic';

// GET /api/events -> {events}. Last 50, oldest first. Feeds the live event
// panel that makes the system feel alive (§13).
export async function GET() {
  return Response.json({ events: store.events.slice(-50) });
}
