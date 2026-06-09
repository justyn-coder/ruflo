/**
 * Substrate-tiering type definitions — v2 (post-critique 2026-06-08)
 *
 * Implements the 2-tier claim model from
 * `docs/specs/substrate-tiering-architecture-spec.md` v2.
 *
 * These types are the contract between:
 *   - The evidence orchestrator (produces TieredDossier)
 *   - The composer (consumes TieredDossier and emits sentence-level attribution)
 *   - The portal (renders attribution per claim_id, click-sentence-see-source)
 *
 * Per P2-PILOT-ALIGNMENT.md, Claude decides what's true; the composer
 * dresses it up. This file's job is to make that decision auditable
 * and traceable AT SENTENCE LEVEL.
 *
 * V2 changes from V1 (post-critique):
 *   - 4 tiers collapsed to 2 (USE_DIRECTLY + USE_TO_SHAPE)
 *   - Discarded claims don't get records (no WEAKLY_INFERRED clutter)
 *   - GENERALIZED is a composer-mode switch, not a tier
 *   - prospectScope dropped; category simplified 8→3
 *   - Sentence-level sources_used schema (was email-level)
 *   - source_index Record dropped — sentence-level attribution doesn't need it
 */

/**
 * 2-tier model — operator's contract verbatim:
 *   - USE_DIRECTLY:  Operator's "Verified" — willing to stake reputation on it.
 *                    Composer may reference, but NUMERIC claims still framed as
 *                    approximations ("north of 1,500 miles") unless cross-source
 *                    confirmed within 12 months. Closes the stale-Apollo failure mode.
 *   - USE_TO_SHAPE:  Operator's "Likely" merged with "Strongly inferred" — defensible
 *                    enough to inform the pitch POV. Composer must NOT quote as fact.
 *                    Frame implicitly ("for operators at this scale…").
 *
 * Operator's "Not confident" tier → discard (no record kept).
 * Operator's "Nothing usable" → composer_mode='generalized' (mode switch, not tier).
 *
 * See spec v2 §2 for composer usage rules per tier.
 */
export type ClaimTier = 'USE_DIRECTLY' | 'USE_TO_SHAPE';

/**
 * Source kind — where the claim was retrieved from.
 * Used by the deterministic tier rules in spec v2 §3.2.
 *
 * Per critique consequence-analysis: source-kind table maps mechanically to
 * a tier ceiling. No LLM 'synthesizer' decides tier — pure rules only.
 */
export type SourceKind =
  | 'apollo'              // Apollo people-match or org-enrich
  | 'apollo_cross'        // Apollo + concordance with a 2nd source <12mo (promotes to USE_DIRECTLY)
  | 'brain'               // AgentDB entity store (per-prospect history)
  | 'substrate'           // Industry chunks (podcasts, articles, reports)
  | 'substrate_quoted'    // Substrate quote where speaker.company === prospect.company AND speaker.role qualifies
  | 'web_research'        // Live 3-persona research with citation
  | 'web_research_dated'  // Live web research with explicit publication date <12mo
  | 'csv_input'           // Operator-provided input data
  | 'manual';             // Operator override or hand-curated source

/**
 * Claim category — simplified 8→3 per critique simplicity-cut.
 *
 *   company_fact:     anything specific to this prospect's company
 *                     (volume, growth, projects, articulated pain/gain/JTBD)
 *   persona_signal:   decision-authority, role-level signals
 *   industry_context: regional/sector framing for the email (BEAD timeline,
 *                     FBA stats, peer comparisons). Used heavily in generalized mode.
 */
export type ClaimCategory = 'company_fact' | 'persona_signal' | 'industry_context';

/**
 * Composer mode — switched by the orchestrator based on USE_DIRECTLY +
 * USE_TO_SHAPE count vs SPECIFIC_MODE_THRESHOLD. See spec v2 §6.
 *
 *   specific:    ≥ threshold usable claims → company-specific composer prompt
 *   generalized: < threshold → generalized composer prompt (no company-specific
 *                claims; industry/region/peer framing only)
 */
export type ComposerMode = 'specific' | 'generalized';

/**
 * One atomic claim with its provenance and tier classification.
 *
 * Atomicity: each EvidenceRecord wraps ONE claim ≤30 words.
 *
 * Tier is computed by deterministic source-kind rules, not LLM judgment.
 */
export interface EvidenceRecord {
  /** Hash of (source.citation + claim) — stable across runs for dedup. */
  id: string;

  /** Single atomic claim, ≤30 words. */
  claim: string;

  /** Provenance metadata. */
  source: {
    kind: SourceKind;
    /** URL, file path, Apollo endpoint name, or other locator. */
    citation: string;
    /** ISO timestamp when this claim was retrieved. */
    fetched_at: string;
    /** If the source has its own publication date (relevant for staleness). */
    sourceDate?: string;
  };

  /** Tier classification. Computed by deterministic rules per spec v2 §3.2. */
  tier: ClaimTier;

  /** Single-sentence explanation of why this tier was assigned. */
  tierReason: string;

  /** Bucket this claim serves in the dossier. */
  category: ClaimCategory;
}

/**
 * Per-tier counts. Used by the orchestrator to decide composer_mode and
 * by the portal to show "we have N usable facts about this prospect."
 *
 * Note: discarded (operator's "Not confident") claims don't get records;
 * generalized claims live in TieredDossier.generalizedFraming, not in tier counts.
 */
export interface TierCounts {
  useDirectly: number;
  useToShape: number;
}

/**
 * Research quality — computed scalar used in the ICP rank composite.
 * Spec v2 §5:
 *   high:   ≥3 USE_DIRECTLY claims
 *   medium: 1-2 USE_DIRECTLY, OR ≥4 USE_TO_SHAPE
 *   low:    everything else (triggers generalized mode)
 */
export type ResearchQuality = 'high' | 'medium' | 'low';

/**
 * ICP volume verdict — preserved from the current intel-structurer.
 */
export type IcpVolumeVerdict = 'fit' | 'leaning_fit' | 'miss';

/**
 * Prospect handle — minimal identifying info threaded through the dossier.
 */
export interface ProspectIdentity {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  state?: string;
}

/**
 * The TieredDossier replaces today's `structuredIntel` object.
 *
 * Composer reads this. Portal renders attribution from this.
 *
 * `claims` is grouped by category for composer ergonomics. Only USE_DIRECTLY +
 * USE_TO_SHAPE appear. Discarded (operator's "Not confident") claims don't
 * get records.
 *
 * `generalizedFraming` is populated when composer_mode='generalized' and holds
 * industry/region/peer framing material drawn from Brain + Substrate + SoT.
 */
export interface TieredDossier {
  prospect: ProspectIdentity;

  /** Per-tier counts. */
  tierCounts: TierCounts;

  /** Claims grouped by category. Only USE_DIRECTLY + USE_TO_SHAPE. */
  claims: Record<ClaimCategory, EvidenceRecord[]>;

  /**
   * Generalized framing populated only when composer_mode='generalized'.
   * Drawn from Brain peer-data + Substrate industry context + SoT.
   * Composer reads these in fallback mode (no company-specific claims).
   */
  generalizedFraming: EvidenceRecord[];

  /** ICP volume verdict — preserved from intel-structurer. */
  icp_volume_verdict: IcpVolumeVerdict;
  icp_volume_reasoning: string;

  /** Computed scalar. Feeds ICP rank composite. */
  research_quality: ResearchQuality;

  /**
   * Composer mode handoff. Computed by orchestrator from tierCounts:
   *   (useDirectly + useToShape) >= SPECIFIC_MODE_THRESHOLD → 'specific'
   *   otherwise                                              → 'generalized'
   */
  composer_mode: ComposerMode;
}

/**
 * Composer mode trigger threshold. Drop to generalized when fewer than
 * this many USE_DIRECTLY + USE_TO_SHAPE claims exist in the dossier.
 *
 * Per critique consequence-analysis #6: calibration-first sequencing. Run the
 * orchestrator on the 28 true-cold P2 prospects BEFORE picking N. Hard floor:
 * if >70% would hit generalized mode at chosen N, do not ship specific mode.
 */
export const SPECIFIC_MODE_THRESHOLD = 3;

/**
 * ONE composed email sentence with its claim attribution.
 *
 * Per critique operator-alignment #5: BL-002 promise requires sentence-level
 * attribution. Email-level sources_used cannot answer "which sentence cited X."
 *
 * The portal renders this as click-sentence-see-source.
 */
export interface AttributedSentence {
  /** The sentence as it appears in the composed email body. */
  text: string;
  /** EvidenceRecord.id values this sentence drew from. May be empty for
   *  industry/general framing sentences that don't cite a specific claim. */
  claim_ids: string[];
}

/**
 * Composer output — what gets persisted to Supabase per prospect.
 *
 * Per spec v2 §6.3. Sentence-level attribution enables the portal's
 * click-sentence-see-source trace (BL-002 fix).
 */
export interface ComposedEmail {
  subject: string;
  /** Full body string — kept for backwards compatibility with portal email view. */
  body: string;
  /** Sentence-by-sentence breakdown of the body with claim attribution. */
  bodySentences: AttributedSentence[];
  ps: string;
  composer_mode: ComposerMode;
  /** Counts for quick portal rendering. */
  tier_breakdown: {
    use_directly_count: number;
    use_to_shape_count: number;
    generalized_count: number;
  };
}

/**
 * Helper — count the tiers from a list of EvidenceRecords.
 */
export function computeTierCounts(records: EvidenceRecord[]): TierCounts {
  const counts: TierCounts = { useDirectly: 0, useToShape: 0 };
  for (const r of records) {
    if (r.tier === 'USE_DIRECTLY') counts.useDirectly++;
    else if (r.tier === 'USE_TO_SHAPE') counts.useToShape++;
  }
  return counts;
}

/**
 * Helper — decide composer mode from tier counts.
 * `specific` requires at least SPECIFIC_MODE_THRESHOLD usable claims.
 */
export function computeComposerMode(counts: TierCounts): ComposerMode {
  const usable = counts.useDirectly + counts.useToShape;
  return usable >= SPECIFIC_MODE_THRESHOLD ? 'specific' : 'generalized';
}

/**
 * Helper — compute research_quality scalar from tier counts.
 */
export function computeResearchQuality(counts: TierCounts): ResearchQuality {
  if (counts.useDirectly >= 3) return 'high';
  if (counts.useDirectly >= 1 || counts.useToShape >= 4) return 'medium';
  return 'low';
}

/**
 * Stable id generator — hash of (citation + claim).
 * Identical claims from identical sources collapse to one record.
 */
export function evidenceRecordId(source: { citation: string }, claim: string): string {
  const s = `${source.citation}|${claim}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return `ev_${h.toString(16).padStart(8, '0')}`;
}

/**
 * Deterministic tier rules — source-kind table per critique consequence #2.
 *
 * Maps SourceKind mechanically to tier ceiling. No LLM judgment.
 *
 * Apollo-only data (without cross-source) is USE_TO_SHAPE because Apollo
 * data is crowdsourced/scraped, not authoritative. Apollo + 2nd source
 * dated <12mo → apollo_cross kind → USE_DIRECTLY.
 *
 * Substrate quotes require speaker.company === prospect.company AND
 * speaker.role in (CEO/COO/VP-Ops/similar). When that's satisfied, source
 * kind is substrate_quoted → USE_DIRECTLY. Otherwise plain substrate → USE_TO_SHAPE.
 */
export function tierBySourceKind(kind: SourceKind): ClaimTier {
  switch (kind) {
    // USE_DIRECTLY — cross-confirmed or authoritative + datable
    case 'apollo_cross':         return 'USE_DIRECTLY';
    case 'substrate_quoted':     return 'USE_DIRECTLY';
    case 'web_research_dated':   return 'USE_DIRECTLY';
    case 'csv_input':            return 'USE_DIRECTLY'; // operator-provided
    case 'manual':               return 'USE_DIRECTLY'; // operator override

    // USE_TO_SHAPE — defensible but not authoritative
    case 'apollo':               return 'USE_TO_SHAPE'; // Apollo alone = inferred
    case 'brain':                return 'USE_TO_SHAPE'; // prior dossier carries forward
    case 'substrate':            return 'USE_TO_SHAPE'; // industry context, not company-quoted
    case 'web_research':         return 'USE_TO_SHAPE'; // research without date confidence
  }
}
