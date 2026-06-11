/**
 * Evidence Orchestrator — 3-phase Pull / Gap-fill / Tier+emit
 *
 * Per substrate-tiering-architecture-spec.md v2 §4. Replaces the existing
 * pipeline's Phase 3 (research) + Phase 3c (intel structurer) + Phase 4
 * (substrate search) sequence with a single coordinated call that emits
 * a TieredDossier.
 *
 * The orchestrator is the integration point — it calls:
 *   - substrate-query.getCompanyEvidence() (primary source)
 *   - apollo-client.enrichOrganization() (fallback structured-fact source)
 *   - substrate-query.getAssociationPriorities() (industry context)
 *   - Future: getFccCoverage() per fcc-bdc-ingestion-spec.md (when ingested)
 *
 * Phase 1 calls all primary sources in parallel.
 * Phase 2 detects gaps by category and triggers second-best re-query loops
 * (operator's "find second-best, or third" rule from challenge #3).
 * Phase 3 applies deterministic source-kind tier rules and emits the dossier.
 *
 * No LLM tier-consolidator. Tier is computed by hard rules in types.ts.
 */

import type {
  TieredDossier,
  EvidenceRecord,
  ClaimCategory,
  ProspectIdentity,
  IcpVolumeVerdict,
} from './types.js';
import {
  computeTierCounts,
  computeComposerMode,
  computeResearchQuality,
} from './types.js';
import {
  getCompanyEvidence,
  getAssociationPriorities,
  getFccCoverage,
  writeEvidence,
} from './substrate-query.js';
import {
  enrichOrganization,
  enrichmentToEvidence,
  ApolloCreditTracker,
  type OrgEnrichResult,
} from './apollo-client.js';

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export interface OrchestratorOptions {
  /** ICP type — gates which sources are most relevant. */
  icpType: 'fiber_operator' | 'ae_firm';
  /** Verbose log to stdout for development. */
  verbose?: boolean;
  /** Skip Apollo (e.g., when running in substrate-only mode for testing). */
  skipApollo?: boolean;
  /** Persist new Apollo-derived evidence to sr_company_evidence. */
  persistApolloEvidence?: boolean;
  /** Override the cred tracker. */
  apolloCreditTracker?: ApolloCreditTracker;
  /**
   * Optional canonical name override from per-company directory. Passed through
   * to substrate-query.getCompanyEvidence so the substrate query keys on the
   * canonical name (e.g. "GFiber") rather than the raw prospect company (e.g.
   * "Google-GFiber"). Closes the substrate-keying mismatch class identified
   * in the substrate audit. Directory integration 2026-06-11.
   */
  companyAlias?: string;
}

export interface OrchestratorResult {
  dossier: TieredDossier;
  /** Telemetry per phase. */
  phaseTimings: {
    pull_ms: number;
    gapfill_ms: number;
    tier_ms: number;
    total_ms: number;
  };
  /** What was retrieved. */
  pullStats: {
    substrate_records: number;
    apollo_matched: boolean;
    industry_records: number;
  };
  /** Categories that needed gap-fill (operator's "second-best" loop). */
  gapfillCategoriesAttempted: ClaimCategory[];
  /** Apollo cost incurred. */
  apolloCreditsUsed: number;
}

// ----------------------------------------------------------------------------
// Phase 1 — Pull facts
// ----------------------------------------------------------------------------

interface Phase1Output {
  /** Evidence from substrate (tagged + semantic fallback). */
  substrateEvidence: EvidenceRecord[];
  /** Industry-context evidence from association priorities. */
  industryEvidence: EvidenceRecord[];
  /** Apollo org-enrichment raw result (kept for telemetry). */
  apolloResult: OrgEnrichResult | null;
  /** Apollo-derived EvidenceRecord[]. */
  apolloEvidence: EvidenceRecord[];
  /** FCC BDC coverage evidence (USE_DIRECTLY — regulatory filing). */
  fccEvidence: EvidenceRecord[];
  /** FCC BDC matched? telemetry */
  fccMatched: boolean;
}

async function phase1Pull(
  prospect: ProspectIdentity,
  options: OrchestratorOptions,
  creditTracker: ApolloCreditTracker,
): Promise<Phase1Output> {
  const { verbose } = options;
  if (verbose) console.log(`  [phase 1] Pull facts for ${prospect.company}`);

  // Four sources run in parallel (substrate-query + Apollo + association + FCC BDC)
  const [substrateEvidence, industryEvidence, apolloResult, fccResult] = await Promise.all([
    // Primary: tagged substrate + semantic fallback. companyAlias plumbs the
    // directory canonical_name through so substrate queries hit the correct key.
    getCompanyEvidence(prospect.company, {
      semanticContext: { state: prospect.state, icpType: options.icpType },
      companyAlias: options.companyAlias,
    }),
    // Industry context (used heavily in generalized mode + as bridge framing)
    getAssociationPriorities({ matchesCompany: prospect.company, topN: 5 }),
    // Apollo fallback (only if not skipped)
    options.skipApollo
      ? Promise.resolve(null)
      : enrichOrganization(prospect.company),
    // FCC BDC authoritative coverage (no-op until ingestion runs)
    getFccCoverage(prospect.company),
  ]);

  const apolloEvidence =
    apolloResult?.matched ? enrichmentToEvidence(apolloResult) : [];
  const fccEvidence = fccResult.matched ? fccResult.evidence : [];

  if (apolloResult) {
    creditTracker.add(apolloResult.creditsUsed);
  }

  if (verbose) {
    console.log(
      `  [phase 1] substrate=${substrateEvidence.length}, ` +
        `apollo=${apolloEvidence.length} (${apolloResult?.matched ? 'matched' : 'no-match'}), ` +
        `industry=${industryEvidence.length}, ` +
        `fcc_bdc=${fccEvidence.length} (${fccResult.matched ? 'matched' : 'no-data'})`,
    );
  }

  return {
    substrateEvidence,
    industryEvidence,
    apolloResult,
    apolloEvidence,
    fccEvidence,
    fccMatched: fccResult.matched,
  };
}

// ----------------------------------------------------------------------------
// Phase 2 — Gap-fill (operator's "second-best, or third" loop)
// ----------------------------------------------------------------------------

/**
 * Determine which categories have insufficient evidence and would benefit
 * from a second-best query angle.
 *
 * Per operator challenge #3: when a category yields only weak evidence,
 * try a second-best query angle BEFORE declaring the category empty.
 * That's the "find second-best, or third" rule — keep looking, don't
 * silently discard.
 *
 * For now, gap-fill is a substrate semantic re-search with a different
 * query angle. Future enhancement: targeted web search + FCC BDC lookup
 * for fiber operators.
 */
async function phase2GapFill(
  prospect: ProspectIdentity,
  options: OrchestratorOptions,
  phase1: Phase1Output,
): Promise<{ additionalEvidence: EvidenceRecord[]; categoriesAttempted: ClaimCategory[] }> {
  const { verbose } = options;

  // Count evidence per category
  const byCategory = new Map<ClaimCategory, number>();
  for (const e of [...phase1.substrateEvidence, ...phase1.apolloEvidence]) {
    byCategory.set(e.category, (byCategory.get(e.category) || 0) + 1);
  }

  // Categories with <2 records are "thin" — trigger second-best search
  const thinCategories: ClaimCategory[] = [];
  for (const cat of ['company_fact', 'persona_signal', 'industry_context'] as ClaimCategory[]) {
    if ((byCategory.get(cat) || 0) < 2) thinCategories.push(cat);
  }

  if (thinCategories.length === 0) {
    if (verbose) console.log(`  [phase 2] No gap-fill needed`);
    return { additionalEvidence: [], categoriesAttempted: [] };
  }

  if (verbose) {
    console.log(
      `  [phase 2] Gap-fill triggered for: ${thinCategories.join(', ')}`,
    );
  }

  // Second-best query: try a different angle per category
  // Currently uses substrate semantic re-search (cheap, no LLM call).
  // Future: targeted web research per gap.
  const additionalEvidence: EvidenceRecord[] = [];
  for (const cat of thinCategories) {
    const angleQuery = secondBestQueryForCategory(prospect, cat, options.icpType);
    if (!angleQuery) continue;
    // Reuse the semantic fallback in getCompanyEvidence by re-calling with
    // semanticFallbackThreshold=99 to force semantic search even when we
    // have some records.
    try {
      const more = await getCompanyEvidence(angleQuery, {
        semanticFallbackThreshold: 99,
        semanticContext: { state: prospect.state, icpType: options.icpType },
      });
      additionalEvidence.push(
        ...more.filter(e => !phase1.substrateEvidence.some(s => s.id === e.id)),
      );
    } catch (err) {
      if (verbose) console.log(`  [phase 2] ${cat} re-query failed: ${(err as Error).message}`);
    }
  }

  if (verbose) {
    console.log(`  [phase 2] Gap-fill returned ${additionalEvidence.length} additional records`);
  }

  return { additionalEvidence, categoriesAttempted: thinCategories };
}

/**
 * Second-best query angle per category. Returns a query string that
 * approaches the category from a different angle than the original
 * company-name lookup.
 */
function secondBestQueryForCategory(
  prospect: ProspectIdentity,
  category: ClaimCategory,
  icpType: 'fiber_operator' | 'ae_firm',
): string | null {
  const state = prospect.state || '';
  switch (category) {
    case 'company_fact':
      // Try the prospect's state + ICP segment instead of company name
      return icpType === 'fiber_operator'
        ? `${state} rural fiber operator BEAD construction`
        : `${state} A&E firm fiber design drawing throughput`;
    case 'persona_signal':
      return `${prospect.title} fiber operator pain decision`;
    case 'industry_context':
      return icpType === 'fiber_operator'
        ? `fiber operator permit cycle drawing throughput crew utilization`
        : `A&E firm design capacity drawing throughput cost recovery`;
    default:
      return null;
  }
}

// ----------------------------------------------------------------------------
// Phase 3 — Tier + emit
// ----------------------------------------------------------------------------

interface Phase3Input {
  prospect: ProspectIdentity;
  /** All evidence collected from Phase 1 + 2, NOT yet grouped by category. */
  allEvidence: EvidenceRecord[];
  /** Industry-context evidence kept separate for generalizedFraming. */
  industryEvidence: EvidenceRecord[];
  /** Apollo result for ICP volume verdict computation. */
  apolloResult: OrgEnrichResult | null;
}

function phase3TierAndEmit(input: Phase3Input): TieredDossier {
  const { prospect, allEvidence, industryEvidence, apolloResult } = input;

  // Group by category — only USE_DIRECTLY + USE_TO_SHAPE appear in dossier.claims
  const claims: Record<ClaimCategory, EvidenceRecord[]> = {
    company_fact: [],
    persona_signal: [],
    industry_context: [],
  };
  for (const e of allEvidence) {
    if (e.tier === 'USE_DIRECTLY' || e.tier === 'USE_TO_SHAPE') {
      claims[e.category].push(e);
    }
  }

  // Industry context evidence enriches both buckets — split it:
  // - High-volume signal industry records → industry_context category
  // - The rest → generalizedFraming (used in generalized mode only)
  const generalizedFraming = industryEvidence.slice(0, 8);

  // Tier counts + composer mode
  const allRelevant = [...claims.company_fact, ...claims.persona_signal, ...claims.industry_context];
  const tierCounts = computeTierCounts(allRelevant);
  const composerMode = computeComposerMode(tierCounts);
  const researchQuality = computeResearchQuality(tierCounts);

  // ICP volume verdict (preserved from intel-structurer)
  // Heuristic: any USE_DIRECTLY company_fact mentioning miles/locations counts
  // as a confirmation signal. Otherwise default to leaning_fit.
  const icpVolumeVerdict = inferIcpVolumeVerdict(
    claims.company_fact,
    apolloResult,
  );
  const icpVolumeReasoning = buildIcpReasoning(icpVolumeVerdict, claims.company_fact, apolloResult);

  return {
    prospect,
    tierCounts,
    claims,
    generalizedFraming,
    icp_volume_verdict: icpVolumeVerdict,
    icp_volume_reasoning: icpVolumeReasoning,
    research_quality: researchQuality,
    composer_mode: composerMode,
  };
}

function inferIcpVolumeVerdict(
  companyFacts: EvidenceRecord[],
  apolloResult: OrgEnrichResult | null,
): IcpVolumeVerdict {
  // USE_DIRECTLY company fact with mile/location number → 'fit'
  for (const e of companyFacts) {
    if (e.tier !== 'USE_DIRECTLY') continue;
    if (/\d[\d,]*\s*(miles?|locations?|customers?)/i.test(e.claim)) {
      return 'fit';
    }
  }
  // Apollo volume signals — these are USE_TO_SHAPE but they're indicative
  if (apolloResult?.volumeSignals.some(s => typeof s.value === 'number' && s.value > 500)) {
    return 'leaning_fit';
  }
  // No volume signal at all
  return 'leaning_fit';
}

function buildIcpReasoning(
  verdict: IcpVolumeVerdict,
  companyFacts: EvidenceRecord[],
  apolloResult: OrgEnrichResult | null,
): string {
  if (verdict === 'fit') {
    const evidence = companyFacts
      .filter(e => e.tier === 'USE_DIRECTLY')
      .map(e => e.claim)
      .join('; ');
    return `Definitively a fit. Evidence: ${evidence.slice(0, 400)}`;
  }
  if (verdict === 'miss') {
    return 'Definitively a miss based on direct contrary evidence.';
  }
  const signals = apolloResult?.volumeSignals.map(s => `${s.metric}=${s.value}`).join('; ') || 'none';
  return `Uncertain but leaning to yes. Direct volume signal not found in primary sources. Apollo indirect signals: ${signals}.`;
}

// ----------------------------------------------------------------------------
// Public entrypoint
// ----------------------------------------------------------------------------

/**
 * Run the orchestrator for a single prospect.
 *
 * Returns:
 *   - The TieredDossier (consumed by composer)
 *   - Telemetry (phase timings, pull stats, gap-fill activity, Apollo cost)
 *
 * Caller decides what to do with the dossier:
 *   - composeSpecific() if dossier.composer_mode === 'specific'
 *   - composeGeneralized() if dossier.composer_mode === 'generalized'
 *   - (specific-composer auto-falls-back if invoked with thin dossier)
 */
export async function orchestrateEvidence(
  prospect: ProspectIdentity,
  options: OrchestratorOptions,
): Promise<OrchestratorResult> {
  const t0 = Date.now();
  const creditTracker = options.apolloCreditTracker || new ApolloCreditTracker();

  // Phase 1 — pull facts
  const t1 = Date.now();
  const phase1 = await phase1Pull(prospect, options, creditTracker);
  const pullMs = Date.now() - t1;

  // Optional: persist Apollo evidence so it accumulates for future runs
  if (options.persistApolloEvidence && phase1.apolloResult?.matched) {
    const apolloEvidenceRows = phase1.apolloEvidence.map(e => ({
      company_name: prospect.company,
      claim: e.claim,
      source_kind: e.source.kind,
      source_citation: e.source.citation,
      source_date: e.source.sourceDate,
      category: e.category,
    }));
    await writeEvidence(apolloEvidenceRows).catch(() => {
      // non-blocking
    });
  }

  // Phase 2 — gap-fill (only if Phase 1 returned thin coverage)
  const t2 = Date.now();
  const phase2 = await phase2GapFill(prospect, options, phase1);
  const gapfillMs = Date.now() - t2;

  // Phase 3 — tier + emit
  const t3 = Date.now();
  const allEvidence = [
    ...phase1.substrateEvidence,
    ...phase1.apolloEvidence,
    ...phase1.fccEvidence,
    ...phase2.additionalEvidence,
  ];
  const dossier = phase3TierAndEmit({
    prospect,
    allEvidence,
    industryEvidence: phase1.industryEvidence,
    apolloResult: phase1.apolloResult,
  });
  const tierMs = Date.now() - t3;

  return {
    dossier,
    phaseTimings: {
      pull_ms: pullMs,
      gapfill_ms: gapfillMs,
      tier_ms: tierMs,
      total_ms: Date.now() - t0,
    },
    pullStats: {
      substrate_records: phase1.substrateEvidence.length,
      apollo_matched: phase1.apolloResult?.matched === true,
      industry_records: phase1.industryEvidence.length,
    },
    gapfillCategoriesAttempted: phase2.categoriesAttempted,
    apolloCreditsUsed: creditTracker.total(),
  };
}
