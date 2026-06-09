/**
 * Substrate-tiering type definitions
 *
 * Implements the 4-tier claim model from
 * `docs/specs/substrate-tiering-architecture-spec.md` §2-3.
 *
 * These types are the contract between:
 *   - The evidence orchestrator (produces TieredDossier)
 *   - The composer (consumes TieredDossier)
 *   - The portal (renders attribution per claim_id)
 *
 * Per P2-PILOT-ALIGNMENT.md, Claude decides what's true; the composer
 * dresses it up. This file's job is to make that decision auditable
 * and traceable.
 */

/**
 * 4-tier model — operator's contract:
 *   - VERIFIED: Direct evidence, Claude willing to stake reputation on it
 *   - STRONGLY_INFERRED: Reasoning chain from observable signals; defensible but not directly quotable
 *   - WEAKLY_INFERRED: Thin support; never appears in email body
 *   - GENERALIZED: Synthetic industry/region/peer framing when verified evidence is thin
 *
 * See spec §2 for composer usage rules per tier.
 */
export type ClaimTier =
  | 'VERIFIED'
  | 'STRONGLY_INFERRED'
  | 'WEAKLY_INFERRED'
  | 'GENERALIZED';

/**
 * Source kind — where the claim was retrieved from.
 * Used by the tier computation rules in spec §3.2.
 */
export type SourceKind =
  | 'apollo'        // Apollo people-match or org-enrich
  | 'brain'         // AgentDB entity store (per-prospect history)
  | 'substrate'     // Tagged industry chunks (podcasts, articles, reports)
  | 'web_research'  // Live 3-persona research
  | 'csv_input'     // Operator-provided input data
  | 'manual';       // Operator override or hand-curated source

/**
 * Source confidence — independent of tier. Tier is computed from
 * source kind + sourceConfidence + agreement count per §3.2.
 *
 *   authoritative: official/primary (Apollo's API, company's own site)
 *   reliable:      reputable secondary (FBA report, NTIA filing, named press)
 *   uncited:       claim appears in research output but source not traceable
 *   inferred:      not extracted from a document — derived by reasoning
 */
export type SourceConfidence =
  | 'authoritative'
  | 'reliable'
  | 'uncited'
  | 'inferred';

/**
 * Claim category — what bucket of the dossier this fact serves.
 * Composer reads claims by category when assembling the email
 * (e.g., opener pulls from `company_volume` or `project`, bridge from `pain`).
 */
export type ClaimCategory =
  | 'company_volume'    // miles of fiber, customer count, revenue scale
  | 'company_growth'    // BEAD awards, expansion announcements, hiring spikes
  | 'project'           // named projects with scope (e.g. ReConnect Round 3 award)
  | 'pain'              // articulated frustrations from research
  | 'gain'              // desired outcomes
  | 'jtbd'              // jobs-to-be-done at the persona level
  | 'persona'           // decision-authority, role signals
  | 'industry_context'  // regional/sector framing (BEAD timeline, FBA stats)
  | 'other';

/**
 * Scope of who a claim applies to.
 * `company` = specific to this prospect's company
 * `persona` = applies to this title/role generally
 * `industry` = applies to fiber operators or A&E firms broadly
 * `region` = applies to prospects in this state/county/region
 */
export type ClaimScope = 'company' | 'persona' | 'industry' | 'region';

/**
 * Composer mode — switched by the tier orchestrator based on the
 * tierCounts in the dossier. See spec §6.
 *
 *   specific:    ≥3 VERIFIED+STRONGLY_INFERRED → use company-specific composer prompt
 *   generalized: <3 → use generalized fallback prompt (no company-specific claims)
 */
export type ComposerMode = 'specific' | 'generalized';

/**
 * One atomic claim with its provenance and tier classification.
 *
 * Atomicity: each EvidenceRecord wraps ONE claim ≤30 words. A research
 * paragraph with 5 facts produces 5 EvidenceRecords. This keeps tier
 * decisions per-fact, not per-paragraph.
 *
 * Composer attribution (BL-002 fix): each sentence in the composed email
 * cites the claim_id(s) it drew from. The portal renders this trace.
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
    sourceConfidence: SourceConfidence;
  };

  /** Tier classification. Computed by orchestrator per spec §3.2. */
  tier: ClaimTier;

  /** Single-sentence explanation of why this tier was assigned. */
  tierReason: string;

  /** Bucket this claim serves in the dossier. */
  category: ClaimCategory;

  /** Who the claim applies to. */
  prospectScope: ClaimScope;
}

/**
 * Per-tier counts. Used by the orchestrator to decide composer_mode and
 * by the portal to show "we have N verified facts about this prospect."
 */
export interface TierCounts {
  verified: number;
  stronglyInferred: number;
  /** Counted for transparency; composer never sees these. */
  weaklyInferred: number;
  /** Synthetic claims from substrate/Brain for generalized mode. */
  generalized: number;
}

/**
 * Research quality — computed scalar used in the ICP rank composite.
 * Definition per spec §5:
 *   high:   ≥3 VERIFIED claims
 *   medium: 1-2 VERIFIED, OR ≥4 STRONGLY_INFERRED
 *   low:    everything else (triggers generalized mode)
 */
export type ResearchQuality = 'high' | 'medium' | 'low';

/**
 * ICP volume verdict — preserved from the current intel-structurer.
 * See SoT §15 and the intel-structurer ICP block.
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
 * `claims` is grouped by category for composer ergonomics. Only
 * VERIFIED + STRONGLY_INFERRED appear in the per-category arrays;
 * WEAKLY_INFERRED are tracked in `weaklyInferred` for transparency only.
 *
 * GENERALIZED claims are populated only when composer_mode='generalized'
 * and live in `generalizedFraming` (separate from the company-specific
 * claims to make the handoff explicit).
 */
export interface TieredDossier {
  prospect: ProspectIdentity;

  /** Per-tier counts including weakly inferred and generalized. */
  tierCounts: TierCounts;

  /** Claims grouped by category. Only VERIFIED + STRONGLY_INFERRED. */
  claims: Record<ClaimCategory, EvidenceRecord[]>;

  /**
   * Claims that didn't meet the tier bar. Tracked here for portal
   * transparency — operator can see what was found but rejected.
   * Composer never reads this field.
   */
  weaklyInferred: EvidenceRecord[];

  /**
   * Generalized framing claims populated only when composer_mode='generalized'.
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
   * Composer mode handoff. Computed by orchestrator from tierCounts.
   * Trigger: if (verified + stronglyInferred) < SPECIFIC_MODE_THRESHOLD
   * → generalized mode. Threshold currently 3 (calibrate during build).
   */
  composer_mode: ComposerMode;

  /**
   * Fast lookup: claim_id → EvidenceRecord. Used by composer for
   * sources_used attribution and by portal for the click-to-source trace.
   */
  source_index: Record<string, EvidenceRecord>;
}

/**
 * Composer mode trigger threshold. Drop to generalized when fewer than
 * this many VERIFIED + STRONGLY_INFERRED claims exist in the dossier.
 *
 * Calibrate during Step 5 cohort. Range 2-5 likely. Per spec §12.
 */
export const SPECIFIC_MODE_THRESHOLD = 3;

/**
 * Helper — count the tiers from a dossier's claim list.
 * Used by orchestrator and portal.
 */
export function computeTierCounts(
  allRecords: EvidenceRecord[],
): TierCounts {
  const counts: TierCounts = {
    verified: 0,
    stronglyInferred: 0,
    weaklyInferred: 0,
    generalized: 0,
  };
  for (const r of allRecords) {
    switch (r.tier) {
      case 'VERIFIED': counts.verified++; break;
      case 'STRONGLY_INFERRED': counts.stronglyInferred++; break;
      case 'WEAKLY_INFERRED': counts.weaklyInferred++; break;
      case 'GENERALIZED': counts.generalized++; break;
    }
  }
  return counts;
}

/**
 * Helper — decide composer mode from tier counts.
 * `specific` requires at least SPECIFIC_MODE_THRESHOLD usable claims.
 */
export function computeComposerMode(counts: TierCounts): ComposerMode {
  const usable = counts.verified + counts.stronglyInferred;
  return usable >= SPECIFIC_MODE_THRESHOLD ? 'specific' : 'generalized';
}

/**
 * Helper — compute research_quality scalar from tier counts.
 */
export function computeResearchQuality(counts: TierCounts): ResearchQuality {
  if (counts.verified >= 3) return 'high';
  if (counts.verified >= 1 || counts.stronglyInferred >= 4) return 'medium';
  return 'low';
}

/**
 * Stable id generator — hash of (citation + claim).
 * Identical claims from identical sources collapse to one record.
 */
export function evidenceRecordId(source: { citation: string }, claim: string): string {
  // Lightweight non-cryptographic hash (fnv-1a inspired) — stable across runs.
  // Good enough for dedup; not for security.
  const s = `${source.citation}|${claim}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return `ev_${h.toString(16).padStart(8, '0')}`;
}
