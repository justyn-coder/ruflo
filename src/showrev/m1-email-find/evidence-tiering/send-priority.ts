/**
 * send-priority.ts — Composite Send Priority scoring (operator-approved 2026-06-09)
 *
 * Reduces 4 underlying signals (email confidence, ICP fit, research depth,
 * hallucination check) to ONE 1-10 priority score + one-line AE summary +
 * a band (SEND / OK / HOLD / KILL / MUST_NOT_SEND) so AEs can scan their
 * queue and decide in 3 seconds per prospect.
 *
 * Honest design constraints:
 *   - DETERMINISTIC — same inputs → same score. No LLM. No randomness.
 *     This is the foundation of operator trust.
 *   - INTERPRETABLE — the one-liner names the weakest underlying signal so
 *     the AE knows WHY a prospect scored what it did.
 *   - SAFETY — hallucination check failure or DNC overrides everything to
 *     MUST_NOT_SEND. Operator E2E concern (2026-06-09) confirmed: bad data
 *     → client reputation risk; bad email → sender domain harm. The band
 *     KILL/MUST_NOT_SEND keeps those out of the normal send flow.
 *
 * Output written to sr_engine_output + sr_prospects so the portal can sort
 * by priority_score DESC and surface the band visually.
 */

import type { TieredDossier, ComposedEmail } from './types.js';
import type { Tier3HallucinationResult } from './tiered-judge.js';

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export type EmailLevel = 'Send' | 'Low Risk' | 'Medium Risk' | 'Risk';
export type IcpStrength = 'Strong Fit' | 'Good Fit' | 'Fit' | 'Uncertain';
export type ResearchLevel = 'Cited & Verified' | 'Cited (1 source)' | 'Alluded-not-cited' | 'Generalized';
export type SendBand = 'SEND' | 'OK' | 'HOLD' | 'KILL' | 'MUST_NOT_SEND';

export interface PriorityResult {
  score: number;              // 1-10 integer
  band: SendBand;
  oneLiner: string;           // ≤25 words, names the weakest signal if score<8
  emailLevel: EmailLevel;
  icpStrength: IcpStrength;
  researchLevel: ResearchLevel;
  mustNotSendReason?: string; // populated only when band=MUST_NOT_SEND
}

export interface PriorityInputs {
  /** Final email confidence color from pipeline (green / yellow / amber / red). */
  confidenceColor: string;
  /** Email-find result tactics — what verification path succeeded. */
  tacticsAttempted?: string[];
  /** MV result if available — 'good' / 'catch_all' / 'risky' / 'bad' / 'unknown'. */
  mvResult?: string;
  /** Apollo path-B confidence — 'high' / 'medium' / 'low' / 'guessed'. */
  apolloConfidence?: string;
  /** ICP gate output. */
  icpType?: 'fiber_operator' | 'ae_firm';
  /** Volume verdict from substrate. */
  icpVolumeVerdict?: 'fit' | 'leaning_fit' | 'miss' | string;
  /** BDC location count (when available). */
  bdcLocationCount?: number;
  /** Composer mode — specific (has substrate) vs generalized (industry-frame). */
  composerMode?: 'specific' | 'generalized';
  /** Dossier substrate counts. */
  useDirectlyCount?: number;
  useToShapeCount?: number;
  /** Distinct source citations in dossier (multiple URLs / publications). */
  distinctSourceCount?: number;
  /** Tier 3 hallucination check result. */
  hallucinationCheck?: Tier3HallucinationResult;
  /** DNC match flag (operator's HubSpot DNC enforcement runs downstream, but if
   * this flag is set here we still want to surface it visibly). */
  dncMatch?: boolean;
}

// ----------------------------------------------------------------------------
// Email level — 4 buckets, max 4 points
// ----------------------------------------------------------------------------
//
// Mapping (operator-approved):
//   Send         (4 pts) — MV 'good' OR SMTP-verified non-catch-all
//   Low Risk     (3 pts) — MV 'catch_all' but Apollo high-confidence person at company
//   Medium Risk  (2 pts) — SMTP yellow / pattern-derived / Apollo 'medium' or 'guessed' with peer
//   Risk         (1 pt)  — all paths failed, pattern best-guess only

export function computeEmailLevel(i: PriorityInputs): { level: EmailLevel; points: number; how: string } {
  const cc = (i.confidenceColor || '').toLowerCase();
  const mv = (i.mvResult || '').toLowerCase();
  const apollo = (i.apolloConfidence || '').toLowerCase();
  const tactics = (i.tacticsAttempted || []).join(' ').toLowerCase();

  // SMTP-verified non-catch-all = Send
  if (cc === 'green' && !tactics.includes('catch-all')) {
    return { level: 'Send', points: 4, how: 'SMTP-verified non-catch-all' };
  }
  // MV explicitly says good = Send (MV trumps catch-all heuristic)
  if (mv === 'good' || mv === 'valid' || mv === 'safe-to-send') {
    return { level: 'Send', points: 4, how: 'MillionVerifier confirmed valid' };
  }
  // MV catch_all + Apollo high = Low Risk (real person found, server can't disambiguate)
  if (mv === 'catch_all' && apollo === 'high') {
    return { level: 'Low Risk', points: 3, how: 'Apollo-confirmed person on catch-all domain' };
  }
  // amber = Apollo-guessed pattern (Path 1 = amber)
  if (cc === 'amber') {
    return { level: 'Low Risk', points: 3, how: 'Apollo peer-pattern derived' };
  }
  // yellow = SMTP pattern-derived, no full verification
  if (cc === 'yellow') {
    return { level: 'Medium Risk', points: 2, how: 'pattern-derived; SMTP partial signal' };
  }
  // Apollo medium/guessed/low with no other signal = Medium
  if (['medium', 'guessed', 'low'].includes(apollo)) {
    return { level: 'Medium Risk', points: 2, how: 'Apollo low-confidence match' };
  }
  // Default: red = Risk
  return { level: 'Risk', points: 1, how: 'all verification paths failed' };
}

// ----------------------------------------------------------------------------
// ICP strength — 4 buckets, max 3 points
// ----------------------------------------------------------------------------

export function computeIcpStrength(i: PriorityInputs): { strength: IcpStrength; points: number; how: string } {
  const verdict = (i.icpVolumeVerdict || '').toLowerCase();
  const bdcCount = i.bdcLocationCount || 0;

  // Strong Fit: fit + meaningful BDC volume
  if (verdict === 'fit' && bdcCount >= 5000) {
    return { strength: 'Strong Fit', points: 3, how: `confirmed ${i.icpType?.replace('_', ' ')}, ${bdcCount.toLocaleString()} BDC locations` };
  }
  // Good Fit: fit + some BDC volume OR rich substrate but no BDC
  if (verdict === 'fit' && bdcCount >= 1000) {
    return { strength: 'Good Fit', points: 2.5, how: `confirmed ${i.icpType?.replace('_', ' ')}, ${bdcCount.toLocaleString()} BDC locations` };
  }
  // Fit: verdict says fit but no volume signal
  if (verdict === 'fit') {
    return { strength: 'Fit', points: 2, how: `confirmed ${i.icpType?.replace('_', ' ')} (no volume signal)` };
  }
  // Leaning fit: substrate present, no hard volume verdict
  if (verdict === 'leaning_fit') {
    return { strength: 'Uncertain', points: 1, how: 'leaning toward fit but no volume confirmation' };
  }
  // No verdict / miss / unknown — Uncertain
  return { strength: 'Uncertain', points: 1, how: 'no volume verdict available' };
}

// ----------------------------------------------------------------------------
// Research level — 4 buckets, max 3 points
// ----------------------------------------------------------------------------

export function computeResearchLevel(i: PriorityInputs, composed?: ComposedEmail): { level: ResearchLevel; points: number; how: string } {
  // Generalized mode = no company-specific substrate
  if (i.composerMode === 'generalized') {
    return { level: 'Generalized', points: 0.5, how: 'industry-frame only, no company-specific evidence' };
  }
  const useDir = i.useDirectlyCount || 0;
  const distinctSources = i.distinctSourceCount || 0;
  // Count claim_ids actually cited in body_sentences
  const bodyCitedCount = (composed?.bodySentences || []).reduce(
    (acc, s) => acc + (Array.isArray(s.claim_ids) ? s.claim_ids.length : 0),
    0,
  );
  // Cited & Verified: 2+ USE_DIRECTLY claims AND ≥2 distinct sources AND body actually cites
  if (useDir >= 2 && distinctSources >= 2 && bodyCitedCount >= 2) {
    return { level: 'Cited & Verified', points: 3, how: `${bodyCitedCount} body citations across ${distinctSources} sources` };
  }
  // Cited (1 source): cites exist but from single publication
  if (bodyCitedCount >= 1 && distinctSources === 1) {
    return { level: 'Cited (1 source)', points: 2, how: `${bodyCitedCount} body citation(s) from a single source` };
  }
  // Cited but with multiple sources (lower-cite count case)
  if (bodyCitedCount >= 1) {
    return { level: 'Cited (1 source)', points: 2, how: `${bodyCitedCount} body citation(s), few sources` };
  }
  // Substrate exists but body didn't cite (the 60%-hallucinated case)
  if (useDir > 0) {
    return { level: 'Alluded-not-cited', points: 1, how: `${useDir} substrate claims available but body has zero citations` };
  }
  return { level: 'Generalized', points: 0.5, how: 'no substrate present' };
}

// ----------------------------------------------------------------------------
// Final priority + band + one-liner
// ----------------------------------------------------------------------------

const BAND_THRESHOLDS = {
  SEND: 9,
  OK: 6,
  HOLD: 3,
} as const;

function scoreToBand(score: number): SendBand {
  if (score >= BAND_THRESHOLDS.SEND) return 'SEND';
  if (score >= BAND_THRESHOLDS.OK) return 'OK';
  if (score >= BAND_THRESHOLDS.HOLD) return 'HOLD';
  return 'KILL';
}

/**
 * Build the one-line AE summary. Names the weakest signal when score < 8 so
 * the AE knows WHY this scored below SEND tier.
 */
function buildOneLiner(
  emailLvl: ReturnType<typeof computeEmailLevel>,
  icpLvl: ReturnType<typeof computeIcpStrength>,
  resLvl: ReturnType<typeof computeResearchLevel>,
  score: number,
): string {
  // Identify the weakest signal by points-relative-to-max
  const weakest = [
    { name: 'email', label: emailLvl.level, points: emailLvl.points, max: 4, how: emailLvl.how },
    { name: 'icp', label: icpLvl.strength, points: icpLvl.points, max: 3, how: icpLvl.how },
    { name: 'research', label: resLvl.level, points: resLvl.points, max: 3, how: resLvl.how },
  ].sort((a, b) => (a.points / a.max) - (b.points / b.max))[0];

  if (score >= BAND_THRESHOLDS.SEND) {
    // SEND tier — celebrate the strongest signal
    return `${emailLvl.how}; ${icpLvl.how}; ${resLvl.how}.`.replace(/;\s+\(/g, ' (');
  }
  if (score >= BAND_THRESHOLDS.OK) {
    // OK tier — name the weakest as the caveat
    return `${emailLvl.how}; ${icpLvl.how}; but ${weakest.name}: ${weakest.how}.`;
  }
  if (score >= BAND_THRESHOLDS.HOLD) {
    return `HOLD: ${weakest.name} is ${weakest.label.toLowerCase()} — ${weakest.how}.`;
  }
  return `KILL: email is ${emailLvl.level.toLowerCase()}; ICP ${icpLvl.strength.toLowerCase()}; research ${resLvl.level.toLowerCase()}.`;
}

/**
 * Compute send priority from underlying signals.
 *
 * Overrides:
 *   - hallucinationCheck.verdict === 'fail' → MUST_NOT_SEND (score 0)
 *   - dncMatch === true → MUST_NOT_SEND (score 0)
 */
export function computeSendPriority(
  inputs: PriorityInputs,
  composed?: ComposedEmail,
): PriorityResult {
  const emailLvl = computeEmailLevel(inputs);
  const icpLvl = computeIcpStrength(inputs);
  const resLvl = computeResearchLevel(inputs, composed);

  // SAFETY OVERRIDES — never send these even if score would be high
  if (inputs.dncMatch) {
    return {
      score: 0,
      band: 'MUST_NOT_SEND',
      oneLiner: 'Company on Inorsa DNC list — never send.',
      emailLevel: emailLvl.level,
      icpStrength: icpLvl.strength,
      researchLevel: resLvl.level,
      mustNotSendReason: 'DNC match',
    };
  }
  if (inputs.hallucinationCheck?.verdict === 'fail' &&
      inputs.hallucinationCheck.unsupportedClaims.length > 0) {
    const firstClaim = inputs.hallucinationCheck.unsupportedClaims[0].slice(0, 60);
    return {
      score: 0,
      band: 'MUST_NOT_SEND',
      oneLiner: `Hallucination check failed: "${firstClaim}..." not supported by substrate. DO NOT SEND.`,
      emailLevel: emailLvl.level,
      icpStrength: icpLvl.strength,
      researchLevel: resLvl.level,
      mustNotSendReason: 'Hallucination check failed',
    };
  }

  // Composite — round to nearest integer
  const rawScore = emailLvl.points + icpLvl.points + resLvl.points;
  const score = Math.max(1, Math.min(10, Math.round(rawScore)));
  const band = scoreToBand(score);
  const oneLiner = buildOneLiner(emailLvl, icpLvl, resLvl, score);

  return {
    score,
    band,
    oneLiner,
    emailLevel: emailLvl.level,
    icpStrength: icpLvl.strength,
    researchLevel: resLvl.level,
  };
}

/**
 * Convert dossier to count of distinct source URLs / publications across all
 * USE_DIRECTLY claims. Used by computeResearchLevel.
 */
export function countDistinctSources(dossier?: TieredDossier): number {
  if (!dossier) return 0;
  const claims = [
    ...(dossier.claims?.company_fact || []),
    ...(dossier.claims?.persona_signal || []),
    ...(dossier.claims?.industry_context || []),
  ].filter(c => c.tier === 'USE_DIRECTLY');
  const sources = new Set<string>();
  for (const c of claims) {
    // Use source citation URL/publication as the dedup key
    const key = (c.source?.citation || '').split(/[\s—-]/).slice(0, 4).join(' ').slice(0, 80);
    if (key) sources.add(key);
  }
  return sources.size;
}
