import Link from 'next/link';

/**
 * Landing. One screen, no scroll fluff. The demo lives at /deals/[id];
 * this page just sets the frame and points at the dashboard.
 */
export default function Home() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center gap-14 text-center">
      <div className="max-w-4xl">
        <p className="mb-5 font-mono text-sm uppercase tracking-[0.3em] text-accent">
          Agent-to-agent procurement
        </p>
        <h1 className="text-6xl font-semibold leading-[1.05] tracking-tight">
          Your agents negotiate.
          <br />
          <span className="text-accent">You stay in control of the money.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-dim">
          Every agent carries a signed spending mandate. Cross the ceiling and the deal
          stops until a human taps approve on their phone.
        </p>
      </div>

      <div className="flex items-center gap-4 text-lg">
        <div className="rounded-xl border border-line bg-raised px-6 py-4">
          <div className="font-mono text-xs uppercase tracking-widest text-dim">Step 1</div>
          <div className="mt-1 font-medium">Negotiate</div>
          <div className="mt-0.5 text-sm text-dim">Two agents, live transcript</div>
        </div>
        <span className="text-2xl text-accent" aria-hidden>
          &rarr;
        </span>
        <div className="rounded-xl border border-line bg-raised px-6 py-4">
          <div className="font-mono text-xs uppercase tracking-widest text-dim">Step 2</div>
          <div className="mt-1 font-medium">Approve on your phone</div>
          <div className="mt-0.5 text-sm text-dim">Auth0 push, real deal terms</div>
        </div>
        <span className="text-2xl text-accent" aria-hidden>
          &rarr;
        </span>
        <div className="rounded-xl border border-line bg-raised px-6 py-4">
          <div className="font-mono text-xs uppercase tracking-widest text-dim">Step 3</div>
          <div className="mt-1 font-medium">Paid via Stripe</div>
          <div className="mt-0.5 text-sm text-money">Split to vendor, fee to platform</div>
        </div>
      </div>

      <Link
        href="/dashboard"
        className="rounded-xl bg-accent px-8 py-4 text-lg font-semibold text-bg transition-colors hover:bg-accent-deep hover:text-ink"
      >
        Open dashboard
      </Link>
    </div>
  );
}
