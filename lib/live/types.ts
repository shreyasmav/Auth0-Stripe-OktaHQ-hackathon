// Types for the live path: real user input -> real sourced vendors -> real
// negotiation -> real charge. The simulated path (lib/seed.ts fixtures) still
// exists and is what runs when nothing is configured.

/** A user's free-text request, parsed into something the agents can act on. */
export type JobSpec = {
  title: string;
  category: string;
  scope: string;
  location: string; // free text: "Austin TX", "suite 300, Chicago"
  deadline: string;
  quantity?: string;
  /** Verbatim user input. Never paraphrased away, so the UI can show it. */
  rawText: string;
};

export type SourceRef = {
  title: string;
  url: string;
};

/** A real vendor discovered by research, with its own economics. */
export type VendorLead = {
  name: string;
  /** Where the research found them. Empty when the model gave no citation. */
  sources: SourceRef[];
  /** What this vendor would plausibly charge, in cents, from real signals. */
  quoteLowCents: number;
  quoteHighCents: number;
  /**
   * The vendor agent's walk-away price. Derived from the researched low end,
   * NOT invented, and never shown to the buyer agent (see lib/fga.ts).
   */
  floorCents: number;
  rationale: string;
};

export type MarketResearch = {
  spec: JobSpec;
  vendors: VendorLead[];
  /** Prevailing market range for this job, in cents. */
  marketLowCents: number;
  marketHighCents: number;
  sources: SourceRef[];
  /** true when this came from fixtures rather than live research. */
  simulated: boolean;
  /** Human-readable note about why, when simulated. */
  note?: string;
};
