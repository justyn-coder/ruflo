/**
 * Inorsa-Angles — deterministic substring match of claims against
 * inorsa-source-of-truth.md v9 angle keywords.
 *
 * Spec: docs/specs/substrate-query-orchestrator-phase-a-scope.md v4 §4 step 8.
 *
 * WHY substring match instead of LLM:
 * The Inorsa angle list is small (≤10), and "which angles does this claim
 * support?" is a keyword question. Pulling Haiku in would add latency without
 * adding signal. The list of angle keywords is checked-in here, not read from
 * the SOT file — the SOT file is canon for narrative, not for runtime parsing.
 *
 * Add new angles by editing INORSA_ANGLES below. The constant is exported so
 * tests can assert the set without re-parsing markdown.
 */

/**
 * Angle key → keyword substrings that signal the angle.
 *
 * Keywords are case-insensitive. ANY hit anywhere in the claim qualifies.
 * Synonyms are clustered — e.g. 'permit cycle' covers 'permit cycles',
 * 'permitting cycle', 'permit-cycle'.
 *
 * Sourced from inorsa-source-of-truth.md v9 §3 (Angles) — keep the right
 * column in sync when SoT is edited. Periodic lint job not yet implemented;
 * for now relies on operator review.
 */
export const INORSA_ANGLES: Record<string, string[]> = {
  // Drawing throughput pain — primary GA product angle
  drawing_throughput: [
    'drawing throughput', 'drawings per engineer', 'design throughput',
    'design capacity', 'engineer per drawing', 'design backlog',
  ],

  // BEAD construction timeline pain
  bead_timeline: [
    'bead', 'bead deadline', 'bead timeline', 'bead construction',
    'bead subgrantee', '4-year service deadline',
  ],

  // GIS→CAD conversion pain
  gis_cad: [
    'gis to cad', 'gis-to-cad', 'gis→cad', 'gis cad', 'cad from gis',
    'as-built', 'as built',
  ],

  // Crew utilization / build manager pain
  crew_utilization: [
    'crew utilization', 'crew schedule', 'build schedule', 'crew capacity',
    'subcontractor utilization', 'build velocity',
  ],

  // Permit cycle pain
  permit_cycle: [
    'permit cycle', 'permitting cycle', 'permit delay', 'pole attachment',
    'permit backlog',
  ],

  // Cost recovery / capital pain — CRO/CEO angle
  cost_recovery: [
    'cost recovery', 'cost overrun', 'cost escalation', 'capital efficiency',
    'capex per mile', 'cost per location',
  ],

  // Drawing QC — Inorsa explicitly does NOT do QC; angle is to mention
  // QC as a gap they hand off, not as a product Inorsa sells.
  drawing_qc_gap: [
    'drawing qc', 'qc rework', 'drawing rework', 'design errors',
  ],
};

/**
 * Find all Inorsa angle keys that match keywords in the claim.
 *
 * Returns deduplicated angle keys (e.g. ['drawing_throughput', 'bead_timeline']).
 * Empty array is valid — claim simply doesn't tee up an Inorsa angle.
 */
export function matchInorsaAngles(claim: string): string[] {
  const lower = claim.toLowerCase();
  const hits = new Set<string>();
  for (const [angle, keywords] of Object.entries(INORSA_ANGLES)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        hits.add(angle);
        break; // one hit per angle is enough
      }
    }
  }
  return Array.from(hits);
}
