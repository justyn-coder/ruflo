/**
 * Rich-Dossier types — Phase A of the Substrate Query Orchestrator.
 *
 * Spec: docs/specs/substrate-query-orchestrator-phase-a-scope.md v4 §3, §5.
 *
 * WHY these types exist as a separate module from the V1 `evidence-tiering/types.ts`:
 *
 * The V1 types (EvidenceRecord / TieredDossier) emit tier-only ("USE_DIRECTLY" /
 * "USE_TO_SHAPE") — they answer "is this trustworthy?" but NOT "how confident am I
 * about the recency, the authority, the KB-grounding?" Composers consumed those
 * tiers and invented their own scoring on top, which is exactly the fan-out that
 * produced 60% fabrication in the 2026-06-09 hallucination sweep.
 *
 * Phase A replaces that with a scored ScoredClaim carrying ALL provenance
 * (authority before/after demotion, date confidence + penalty flag, KB confidence
 * + evidence quote, persona tags, inorsa angle hits). Composers become
 * deterministic renderers — they cannot fabricate because the dossier
 * carries the source row by construction (Hardening 3, spec §7.5).
 *
 * Empty dossiers expose `empty_reason` so composers can hard-stop to the
 * operator queue rather than silently regenerate (PM fix 4 + Hardening 3).
 */

/**
 * Persona tags — match operator's three-persona model.
 *
 * Sourced from category-to-persona-map.yaml (deterministic, no LLM).
 * A claim may belong to >1 persona (e.g. a CEO quoting BEAD capital pain
 * could match both `revenue_leader` and `ops_builder`).
 */
export type PersonaTag = 'revenue_leader' | 'ops_builder' | 'technical_designer';

/**
 * Authority tier — output of source-authority-map.yaml lookup.
 *
 *  A = primary/regulatory/operator-quoted (NTIA, FCC, company press release)
 *  B = trade press / podcast operator interviews (cbb-podcast, fiber-for-breakfast)
 *  C = analyst / industry-commentary (pots-and-pans, conference speaker pages)
 *  D = unknown publisher allowed only via --allow-unknown flag (Hardening 1)
 */
export type AuthorityTier = 'A' | 'B' | 'C' | 'D';

/**
 * KB classification status — output of the Haiku one-call-per-claim.
 *
 *  confirmed:    KB corroborates the claim
 *  contradicted: KB asserts the opposite
 *  unaddressed:  KB does not speak to this claim. Also the FORCED value when
 *                Haiku returns confidence<0.7 OR empty evidence_quote
 *                (PM fix 3, spec §4 step 7) — kills the "false confirm" path.
 */
export type KbStatus = 'confirmed' | 'contradicted' | 'unaddressed';

/**
 * Date confidence — drives composer temporal-language guard (Hardening 2).
 *
 *  verified: source_date present, was used to compute recency_boost
 *  unknown:  source_date NULL → composer MUST NOT use "recently", "this year", etc.
 *            See composer-guard.ts assertDossierFresh()
 */
export type DateConfidence = 'verified' | 'unknown';

/**
 * Reason an empty dossier was returned. Composer-facing — when set,
 * composer hard-stops to operator queue (spec §6, §7.5; SC #7).
 *
 *  no_rows:            zero rows in sr_company_evidence for this company
 *  all_dropped:        every row failed the SC #6 drop filter (no persona, no KB hit)
 *  all_low_authority:  every survivor tier=D after authority + date demotions
 *  timeout:            substrate edge-fn timed out AND no DB rows either
 *  db_error:           SubstrateQueryError caught — caller wraps + logs
 */
export type EmptyReason =
  | 'no_rows'
  | 'all_dropped'
  | 'all_low_authority'
  | 'timeout'
  | 'db_error';

/**
 * One claim, scored. Composers must NEVER discard fields — keep the audit trail
 * so the portal can render click-claim-see-source + click-claim-see-KB-quote
 * (BL-002 click trace requires every field downstream).
 *
 * `authority` vs `authority_original`:
 *   - `authority_original` is the raw YAML lookup (PM fix 1)
 *   - `authority` is after null-date demotion (§4 step 4)
 *   - When they differ, `date_penalty_applied=true`
 *
 * `kb_confidence` + `kb_evidence_quote`: PM fix 3 — surface so the operator
 * can spot Haiku low-confidence false-confirms in the portal.
 */
export interface ScoredClaim {
  claim: string;
  source_citation: string;
  source_kind: string;
  source_date: string | null;

  authority: AuthorityTier;
  authority_original: AuthorityTier;

  date_confidence: DateConfidence;
  date_penalty_applied: boolean;
  recency_boost: number;

  persona_tags: PersonaTag[];

  kb_status: KbStatus;
  kb_confidence: number;
  kb_evidence_quote: string;

  inorsa_relevance: string[];
  score: number;
}

/**
 * What composers consume. Renderers, not generators.
 *
 * `claims_by_persona` is pre-bucketed so a composer for `ops_builder`
 * just reads `dossier.claims_by_persona.ops_builder` — no filtering needed.
 *
 * `kb_corroborations` / `kb_contradictions` are convenience lists for
 * "we have N industry-confirmed claims about this prospect" callouts.
 *
 * `inorsa_angles` is union of all `inorsa_relevance` hits across surviving
 * claims — gives the composer a deterministic list of which Inorsa angles
 * the dossier supports (no LLM angle-picker required).
 *
 * `skipped_counts` is observability — silently dropped rows are no longer
 * invisible (Eng fix 3).
 *
 * `empty_reason` set => composer MUST early-return `{skip:true}` (spec §7.5).
 */
export interface RichDossier {
  prospect: {
    company_normalized: string;
    persona?: PersonaTag;
  };
  claims_by_persona: Record<PersonaTag, ScoredClaim[]>;
  kb_corroborations: ScoredClaim[];
  kb_contradictions: ScoredClaim[];
  inorsa_angles: string[];
  skipped_counts: { no_citation: number };
  empty_reason?: EmptyReason;
  /** Optional substrate-search results (industry chunks for generalized framing). */
  substrate: Array<{
    id: string;
    source: string;
    title: string;
    content: string;
  }>;
}

/**
 * Errors — fail-loud per Hardening 1 / 4 (spec §6).
 */
export class UnknownPublisherError extends Error {
  constructor(public publisher: string, public citation: string) {
    super(`Unknown publisher "${publisher}" in citation "${citation}". ` +
      `Add to data/showrev/source-authority-map.yaml or pass --allow-unknown.`);
    this.name = 'UnknownPublisherError';
  }
}

export class SubstrateQueryError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'SubstrateQueryError';
  }
}
