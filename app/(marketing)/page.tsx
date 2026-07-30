export default function MarketingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="rounded-full border border-line bg-panel px-4 py-1 text-xs uppercase tracking-widest text-white/50">
        Auth0 × Stripe hackathon
      </div>
      <h1 className="text-5xl font-bold leading-tight">
        Two agents negotiate.
        <br />A human holds the wallet.
      </h1>
      <p className="max-w-xl text-lg text-white/60">
        Auth0 governs whether an agent may act. Stripe governs where the money goes. The agent&rsquo;s mandate lives in a
        signed token — not a database row — and it cannot pay without your approval.
      </p>
      <div className="flex gap-4">
        <a
          href="/auth/login"
          className="rounded-lg bg-buyer px-6 py-3 font-semibold text-black transition hover:opacity-90"
        >
          Sign in
        </a>
        <a
          href="/dashboard"
          className="rounded-lg border border-line px-6 py-3 font-semibold text-white/80 transition hover:bg-panel"
        >
          Enter demo (mock mode)
        </a>
      </div>
    </main>
  );
}
