import AuthCta from '@/components/AuthCta';

/**
 * Landing, in Apple's buy-page grammar: a centred hero with an oversized
 * tight-tracked headline and one grey sub-line, then an alternating
 * white / #f5f5f7 band carrying the three steps as cards.
 */
export default function Home() {
  return (
    <div>
      {/* Hero. Apple gives this the whole viewport and nothing else. */}
      <section className="px-6 pt-20 pb-16 text-center">
        <p className="eyebrow mb-4">Agent-to-agent procurement</p>
        <h1 className="mx-auto max-w-4xl text-[56px] leading-[1.05] font-semibold sm:text-[72px]">
          Your agents negotiate.
          <br />
          You approve the spend.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[21px] leading-[1.4] text-muted">
          Every agent carries a signed spending mandate. Cross the ceiling and the deal stops
          until a person says yes.
        </p>

        <div className="mt-9 flex flex-col items-center gap-4">
          <AuthCta />
          <a href="#how" className="link-arrow">
            See how it works &rsaquo;
          </a>
        </div>
      </section>

      {/* Band. The alternating #f5f5f7 section is the most recognisable
          structural move on an Apple buy page. */}
      <section id="how" className="bg-band px-6 py-20">
        <div className="mx-auto max-w-[1024px]">
          <h2 className="mb-2 text-[40px] leading-tight font-semibold">How it works.</h2>
          <p className="mb-10 text-[19px] text-muted">Three steps, one of them yours.</p>

          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                n: '01',
                title: 'Negotiate',
                body: 'Two agents work real market prices in a live transcript, and keep haggling until the number is one you can authorize.',
              },
              {
                n: '02',
                title: 'Approve',
                body: 'Above your ceiling the agent simply cannot pay. It holds no token that permits it, so the deal waits for you.',
              },
              {
                n: '03',
                title: 'Pay',
                body: 'Accept the settled price and pay on Stripe. The vendor is paid directly and the platform fee is split out.',
              },
            ].map((s) => (
              <div key={s.n} className="card card-hover p-7 text-left">
                <div className="mb-4 font-mono text-[13px] text-muted">{s.n}</div>
                <h3 className="mb-2 text-[21px] font-semibold">{s.title}</h3>
                <p className="text-[15px] leading-[1.5] text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16 text-center">
        <p className="text-[14px] text-muted">
          Auth0 decides whether the agent may act. Stripe decides where the money goes.
        </p>
      </section>
    </div>
  );
}
