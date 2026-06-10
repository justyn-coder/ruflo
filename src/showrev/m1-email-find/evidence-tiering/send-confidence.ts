/**
 * Send-Confidence System v1.0-uncalibrated (2026-06-10)
 *
 * Computes 3 confidence axes per prospect (ICP fit / email address / substrate
 * richness) + composite send-confidence score. Lets operators dispute the
 * system's recommendation by seeing the underlying confidence rather than just
 * an opaque flag.
 *
 * Spec: docs/showrev/send-confidence-system-spec-2026-06-10.md
 *
 * Known limitations of v1.0-uncalibrated (intentional, per operator decision):
 * - Per-axis scoring formulas are my opinion, not calibrated against operator
 *   judgment. Iterate after seeing real data.
 * - Composite weights are uniform 1/3 each. Operator-calibration deferred to v2.
 * - Substrate score uses research_summary length as proxy — crude but works
 *   until we persist USE_DIRECTLY claim counts properly.
 * - Why-text is templated, not NLG. Keeps it predictable and cheap.
 */

export type AxisLabel = 'high' | 'medium' | 'low' | 'cannot_send';

export interface AxisScore {
  score: number; // 0-100
  label: AxisLabel;
  why: string; // human-readable explanation
}

export interface SendConfidence {
  icp: AxisScore;
  email: AxisScore;
  substrate: AxisScore;
  composite: {
    score: number; // 0-100
    label: AxisLabel;
    weights_calibrated: false; // v1.0 default; flips to true when operator calibrates
    weights: { icp: number; email: number; substrate: number };
  };
  version: 'v1.0-uncalibrated';
}

/**
 * Personas that qualify as "core ICP" for Inorsa fiber outreach.
 * Per Inorsa persona doctrine — operators / designers / revenue leaders are
 * the buyers; everything else is adjacent.
 */
const CORE_ICP_PERSONAS = new Set([
  'technical_designer',
  'ops_builder',
  'revenue_leader',
]);

/**
 * Compute ICP fit axis score.
 *
 * Formula (v1.0-uncalibrated, my opinion until operator calibration):
 *   40 if icp_status === 'pass'
 *   30 if icp_volume_verdict === 'fit'; 15 if 'leaning_fit'; 0 otherwise
 *   20 if persona_bucket in CORE_ICP_PERSONAS
 *   10 if intel_signal_strength === 'strong'
 *   = 0-100 (clamped)
 */
export function computeIcpScore(input: {
  icp_status?: string | null;
  icp_volume_verdict?: string | null;
  persona_bucket?: string | null;
  intel_signal_strength?: string | null;
}): AxisScore {
  let score = 0;
  const reasons: string[] = [];

  if (input.icp_status === 'pass') {
    score += 40;
    reasons.push('Passes the ICP filter');
  } else {
    reasons.push('Does not pass the ICP filter');
  }
  if (input.icp_volume_verdict === 'fit') {
    score += 30;
    reasons.push('volume signal confirms fit');
  } else if (input.icp_volume_verdict === 'leaning_fit') {
    score += 15;
    reasons.push('volume signal uncertain but leaning yes');
  } else if (input.icp_volume_verdict === 'miss') {
    reasons.push('volume signal says miss');
  }
  if (input.persona_bucket && CORE_ICP_PERSONAS.has(input.persona_bucket)) {
    score += 20;
    reasons.push(`${humanPersona(input.persona_bucket)} — core buyer persona`);
  } else if (input.persona_bucket) {
    reasons.push(`${humanPersona(input.persona_bucket)} — adjacent persona, not core buyer`);
  }
  if (input.intel_signal_strength === 'strong') {
    score += 10;
    reasons.push('strong qualitative fit signal');
  } else if (input.intel_signal_strength === 'weak') {
    reasons.push('weak qualitative fit signal');
  }

  const clamped = Math.max(0, Math.min(100, score));
  const label = labelFromScore(clamped);

  return {
    score: clamped,
    label,
    why: `${capitalize(reasons[0])}${reasons.slice(1).length ? '. ' + reasons.slice(1).map(capitalize).join('. ') : ''}.`,
  };
}

function humanPersona(p: string): string {
  const m: Record<string, string> = {
    technical_designer: 'Technical designer',
    ops_builder: 'Operations / builder',
    revenue_leader: 'Revenue leader',
    exec_leader: 'Executive',
    executive: 'Executive',
    technical_decision_maker: 'Technical decision maker',
    operations_manager: 'Operations manager',
    project_manager: 'Project manager',
    engineer: 'Engineer',
    business_development: 'Business development',
  };
  return m[p] || p;
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Compute Email address axis score.
 *
 * Formula (v1.0-uncalibrated):
 *   confidence_color === 'green' → 80 (high)
 *   confidence_color === 'amber' → 50 (medium)
 *   confidence_color === 'red'   → 25 (low)
 *   email null OR send_status === flag-email_not_found → 0 (cannot_send)
 *
 * Future v2: incorporate email_find_method (peer_verified gets 100, pattern_inferred 70, etc.)
 */
export function computeEmailScore(input: {
  confidence_color?: string | null;
  email?: string | null;
  system_brief?: string | null;
}): AxisScore {
  // Hard zero — no email = cannot send
  if (
    !input.email ||
    input.email.trim() === '' ||
    (input.system_brief && /email could not be (?:found|verified)/i.test(input.system_brief))
  ) {
    return {
      score: 0,
      label: 'cannot_send',
      why: 'No verified email address. Cannot send.',
    };
  }

  let score = 0;
  let detail = '';
  switch (input.confidence_color) {
    case 'green':
      score = 80;
      detail = 'Email address verified deliverable by MillionVerifier.';
      break;
    case 'yellow':
      score = 50;
      detail = 'Email pattern verified (SMTP-confirmed) but not MV-checked.';
      break;
    case 'amber':
      score = 50;
      detail = 'Email is a pattern guess — verifier returned uncertain.';
      break;
    case 'red':
      score = 25;
      detail = 'Email address could not be verified — pattern is low confidence.';
      break;
    default:
      score = 25;
      detail = 'Email address confidence unknown — treating as low.';
  }

  const label = labelFromScore(score);
  return {
    score,
    label,
    why: detail,
  };
}

/**
 * Compute Substrate richness axis score.
 *
 * v1.0-uncalibrated formula (now uses real tierCounts when available;
 * falls back to research_summary length if not — useful for backfill on
 * older rows that don't have tierCounts):
 *
 *   PRIMARY (when tierCounts.USE_DIRECTLY available):
 *     use_directly_count ≥10 → 60
 *     use_directly_count ≥5  → 40
 *     use_directly_count ≥3  → 25
 *     use_directly_count ≥1  → 12
 *     use_directly_count =0  → 0
 *
 *   FALLBACK (when tierCounts not available — older rows / backfill):
 *     research_summary length:
 *       ≥1500 → 50, ≥800 → 35, ≥300 → 18, <300 → 5
 *
 *   BONUSES (added to either path):
 *     composer_mode === 'specific'      → +25
 *     composer_mode === 'generalized'   → +5
 *     use_to_shape_count ≥ 5            → +10
 *     intel_talking_points populated    → +5  (signal of AE-ready intel)
 *
 *   clamped 0-100.
 */
export function computeSubstrateScore(input: {
  use_directly_count?: number | null;
  use_to_shape_count?: number | null;
  composer_mode?: string | null;
  research_summary?: string | null;
  company_summary?: string | null;
  challenger_insight?: string | null;
  intel_talking_points?: string | null;
}): AxisScore {
  let score = 0;
  const reasons: string[] = [];
  const hasTierCounts = typeof input.use_directly_count === 'number';

  if (hasTierCounts) {
    const ud = input.use_directly_count!;
    if (ud >= 10) {
      score += 60;
      reasons.push(`${ud} directly-citable claims about this company (rich research)`);
    } else if (ud >= 5) {
      score += 40;
      reasons.push(`${ud} directly-citable claims about this company (decent research)`);
    } else if (ud >= 3) {
      score += 25;
      reasons.push(`${ud} directly-citable claims about this company (thin research)`);
    } else if (ud >= 1) {
      score += 12;
      reasons.push(`only ${ud} directly-citable claim${ud === 1 ? '' : 's'} about this company (very thin research)`);
    } else {
      reasons.push('no directly-citable claims about this company');
    }
  } else {
    // Fallback — older row without tierCounts. Use research_summary length proxy.
    const summary = input.research_summary || input.company_summary || '';
    const len = summary.length;
    if (len >= 1500) {
      score += 50;
      reasons.push('rich research summary on file');
    } else if (len >= 800) {
      score += 35;
      reasons.push('medium-depth research summary on file');
    } else if (len >= 300) {
      score += 18;
      reasons.push('thin research summary on file');
    } else {
      score += 5;
      reasons.push('almost no research summary on file');
    }
  }

  if (input.composer_mode === 'specific') {
    score += 25;
    reasons.push('email is written company-specific, not generic');
  } else if (input.composer_mode === 'generalized') {
    score += 5;
    reasons.push('email falls back to a generic persona frame');
  }

  if (typeof input.use_to_shape_count === 'number' && input.use_to_shape_count >= 5) {
    score += 10;
    reasons.push(`${input.use_to_shape_count} supporting claims add context`);
  }

  if (input.intel_talking_points && input.intel_talking_points.trim().length > 30) {
    score += 5;
    reasons.push('AE-ready talking points available');
  }

  const clamped = Math.max(0, Math.min(100, score));
  const label = labelFromScore(clamped);

  return {
    score: clamped,
    label,
    why: `${capitalize(reasons[0])}${reasons.slice(1).length ? '. ' + reasons.slice(1).map(capitalize).join('. ') : ''}.`,
  };
}

/**
 * Map a numeric score to ordinal label.
 * Thresholds match the spec — adjustable in v2 if calibration says different.
 */
function labelFromScore(score: number): AxisLabel {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * Compute composite send-confidence (weighted average across 3 axes).
 *
 * v1.0-uncalibrated: weights are uniform 1/3 each. After operator calibration
 * (10-prospect ranking exercise per spec §"Operator calibration gate"), weights
 * get back-solved and stored per cohort.
 *
 * HARD RULE: if email_score = 0 (cannot send), composite = 0 regardless of
 * other axes. There is no send.
 */
export function computeComposite(
  icp: AxisScore,
  email: AxisScore,
  substrate: AxisScore,
  weights: { icp: number; email: number; substrate: number } = { icp: 1 / 3, email: 1 / 3, substrate: 1 / 3 },
  calibrated: boolean = false,
): SendConfidence['composite'] {
  // Hard zero on email_score = 0
  if (email.score === 0) {
    return {
      score: 0,
      label: 'cannot_send',
      weights_calibrated: false,
      weights,
    } as SendConfidence['composite'];
  }

  const weighted = icp.score * weights.icp + email.score * weights.email + substrate.score * weights.substrate;
  const clamped = Math.max(0, Math.min(100, weighted));
  const label = labelFromScore(clamped);

  return {
    score: Math.round(clamped * 10) / 10, // 1 decimal place
    label,
    weights_calibrated: calibrated,
    weights,
  } as SendConfidence['composite'];
}

/**
 * Compute all 3 axes + composite from an engine row's inputs.
 *
 * Single entry point. Use this from the pipeline AND from backfill SQL via
 * the small CLI wrapper.
 */
export function computeSendConfidence(input: {
  // ICP inputs
  icp_status?: string | null;
  icp_volume_verdict?: string | null;
  persona_bucket?: string | null;
  intel_signal_strength?: string | null;
  // Email inputs
  email?: string | null;
  confidence_color?: string | null;
  system_brief?: string | null;
  // Substrate inputs (primary path — pipeline)
  use_directly_count?: number | null;
  use_to_shape_count?: number | null;
  composer_mode?: string | null;
  // Substrate inputs (fallback path — older rows / backfill)
  research_summary?: string | null;
  company_summary?: string | null;
  challenger_insight?: string | null;
  intel_talking_points?: string | null;
}): SendConfidence {
  const icp = computeIcpScore(input);
  const email = computeEmailScore(input);
  const substrate = computeSubstrateScore(input);
  const composite = computeComposite(icp, email, substrate);

  return {
    icp,
    email,
    substrate,
    composite,
    version: 'v1.0-uncalibrated',
  };
}
