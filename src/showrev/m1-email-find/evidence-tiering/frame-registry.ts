/**
 * frame-registry — types + minimal seed registry for the substrate-orchestrator's
 * Phase B (frame selection).
 *
 * STATUS: PHASE-B PLACEHOLDER (2026-06-09)
 * --------------------------------------------------------------
 * Phase B owns this file's authoritative content. Phase C
 * (`refutation.ts`) depends on the TYPES and the schema validator
 * exported here; the runtime entries (FRAME_REGISTRY) are a small
 * seed so the Phase C module can compile, self-test, and be wired
 * before Phase B publishes the full catalog of frames.
 *
 * When Phase B lands:
 *   - Replace FRAME_REGISTRY contents with the full set.
 *   - DO NOT alter the FrameRegistryEntry interface unless Phase C
 *     is updated in the same commit (the schema validator is the
 *     single source of truth for both).
 *   - The schema validator (`validateFrameRegistryEntry`) is the
 *     enforcement point — Phase B must keep frames passing it.
 *
 * Defended against by Phase C spec §2: "throw FrameSchemaInvalid on
 * load if any frame violates above". Validation runs once at module
 * load time below.
 */

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

/** A FrameId is just a string but kept as a brand-style alias for clarity. */
export type FrameId = string;

/**
 * The categories that a substrate claim might fall into. We carry the same
 * `category` string the DB uses verbatim — see `sr_company_evidence.category`.
 *
 * The default `permanentClaimCategories` set in spec §2 names four categories
 * that should NEVER expire from refutation eligibility (awards don't un-happen,
 * acquisitions don't reverse, etc.). Phase B can extend this list per-frame.
 */
export interface FrameRegistryEntry {
  /** Stable id used as the map key. Spec §2. */
  frameId: FrameId;
  /** One-line premise the frame leans on. Used for trace + reasoning. */
  premise: string;
  /**
   * Required, non-empty axis label (e.g. "growth-narrative",
   * "operational-pain-gis", "bead-timeline"). Two frames sharing the
   * same axis are NOT materially-different alternatives — the
   * pickSafeAlternative path rejects them (spec §3.6). This is what
   * defeats the "theatre swap" failure mode.
   */
  premiseAxis: string;
  /**
   * Lowercase tokens. Refutation fires when any keyword is found in
   * `claim.toLowerCase()`. Must be non-empty OR `refuterSemanticPrompt`
   * must be non-empty — enforced by validateFrameRegistryEntry.
   */
  refuterKeywords: string[];
  /**
   * Free-form prompt fragment passed to Haiku in the judge pass.
   * Empty string disables the judge pass for this frame (spec §3.7).
   */
  refuterSemanticPrompt: string;
  /** Freshness horizon in days for ephemeral claims. */
  freshnessHorizonDays: number;
  /**
   * Claim categories that survive recency cutoff. Default lives in
   * `DEFAULT_PERMANENT_CLAIM_CATEGORIES` below — Phase B can override
   * per-frame.
   */
  permanentClaimCategories: string[];
  /**
   * Alternatives to swap into. Order matters: the first one that (a)
   * does not share `premiseAxis` and (b) passes recursive refutation
   * (max depth 2) is selected. Spec §3.6.
   */
  safeAlternatives: FrameId[];
  /**
   * If true and zero evidence rows exist for this company, the run
   * halts as `insufficient_evidence`. If false, missing evidence is
   * treated as `clear`. Spec §5 (Edge Cases).
   */
  requiresEvidence: boolean;
}

/** Spec §2 default — Phase C ships this list. Phase B can override per-frame. */
export const DEFAULT_PERMANENT_CLAIM_CATEGORIES: ReadonlyArray<string> = Object.freeze([
  'award',
  'acquisition',
  'leadership_change',
  'public_statement',
]);

/**
 * Canonical premiseAxis enum (audit fresh-eyes 2026-06-09 §"Frame registry
 * handoff risk" #2). Two frames sharing the same intent under different
 * axis labels (e.g. "gis-pain" vs "operational-pain-gis") silently break
 * the theatre-swap defense. This list is the source of truth; Phase B
 * must pin every frame to one of these values.
 *
 * Phase B may extend this list, but every addition must be reviewed against
 * the theatre-swap test: would frame X under axis A and frame Y under axis B
 * actually be saying the same thing? If yes, they share an axis.
 */
export const CANONICAL_PREMISE_AXES: ReadonlyArray<string> = Object.freeze([
  'operational-pain-gis',   // GIS-to-CAD friction, drafting bottleneck, design throughput
  'bead-timeline',          // BEAD obligations on the clock, deadline pressure
  'growth-narrative',       // Growth win, BEAD/RDOF momentum, expansion announcement
  'partner-pride',          // Vendor partnership praise, integrator referral
  'capital-pressure',       // Capital raise, runway, financing event
  'workforce-scaling',      // Hiring, in-house capability build, acquisition for talent
  'compliance-risk',        // Permit, reporting, regulatory deadline pressure
  'judge-axis',             // Generic axis for judge-only frames (Phase B placeholder)
]);

/**
 * Phase C internal: allow tests + Phase B placeholders to use axes outside
 * the canonical list without crashing at load. Set to true in production
 * builds once Phase B has migrated all frames to canonical axes.
 */
const ENFORCE_CANONICAL_AXES = false;

// ----------------------------------------------------------------------------
// Errors — public so callers can `instanceof` them
// ----------------------------------------------------------------------------

export class FrameSchemaInvalid extends Error {
  constructor(public readonly frameId: string, message: string) {
    super(`FrameSchemaInvalid[${frameId}]: ${message}`);
    this.name = 'FrameSchemaInvalid';
  }
}

export class FrameRegistryMissing extends Error {
  constructor(public readonly frameId: string) {
    super(`FrameRegistryMissing: '${frameId}' is not registered`);
    this.name = 'FrameRegistryMissing';
  }
}

// ----------------------------------------------------------------------------
// Schema validation (the enforcement point)
// ----------------------------------------------------------------------------

/**
 * Validates a single frame entry. Throws FrameSchemaInvalid with the offending
 * frameId baked into the message. Phase C calls this:
 *   (1) at module load on FRAME_REGISTRY (catches dev-time mistakes immediately)
 *   (2) at the top of `checkSubstrateRefutation` before any work runs
 *
 * Defended against (spec §2): empty refuterKeywords AND empty
 * refuterSemanticPrompt (silent-clear path = ALLO/Finley fabrication class).
 */
export function validateFrameRegistryEntry(
  entry: FrameRegistryEntry,
): void {
  if (!entry.frameId || typeof entry.frameId !== 'string') {
    throw new FrameSchemaInvalid(String(entry.frameId), 'frameId must be a non-empty string');
  }
  if (!entry.premise || typeof entry.premise !== 'string') {
    throw new FrameSchemaInvalid(entry.frameId, 'premise must be a non-empty string');
  }
  // Spec §2: premiseAxis required, non-empty. Defeats "theatre swap" failure mode.
  if (!entry.premiseAxis || typeof entry.premiseAxis !== 'string' || !entry.premiseAxis.trim()) {
    throw new FrameSchemaInvalid(entry.frameId, 'premiseAxis must be a non-empty string');
  }
  // Audit fresh-eyes 2026-06-09 §"Frame registry handoff risk" #2: when
  // canonical-axis enforcement is on (Phase B migration complete), reject
  // any frame whose axis label isn't in CANONICAL_PREMISE_AXES. Until then
  // (ENFORCE_CANONICAL_AXES=false) just permit any non-empty string so
  // placeholder Phase B frames keep working.
  if (ENFORCE_CANONICAL_AXES && !CANONICAL_PREMISE_AXES.includes(entry.premiseAxis)) {
    throw new FrameSchemaInvalid(
      entry.frameId,
      `premiseAxis "${entry.premiseAxis}" not in canonical set ` +
        `(${CANONICAL_PREMISE_AXES.join(', ')}); ` +
        `Phase B must pin axes to canonical values to defeat theatre swaps`,
    );
  }
  if (!Array.isArray(entry.refuterKeywords)) {
    throw new FrameSchemaInvalid(entry.frameId, 'refuterKeywords must be an array');
  }
  if (typeof entry.refuterSemanticPrompt !== 'string') {
    throw new FrameSchemaInvalid(entry.frameId, 'refuterSemanticPrompt must be a string (may be empty)');
  }
  // Spec §2: refuterKeywords>=1 OR refuterSemanticPrompt non-empty.
  // Both empty = the silent-clear path we're defending against. Fail closed at load time.
  if (entry.refuterKeywords.length === 0 && entry.refuterSemanticPrompt.trim() === '') {
    throw new FrameSchemaInvalid(
      entry.frameId,
      'must have at least one refuterKeyword OR a non-empty refuterSemanticPrompt; ' +
        'silent-clear path is the ALLO/Finley fabrication class',
    );
  }
  if (typeof entry.freshnessHorizonDays !== 'number' || entry.freshnessHorizonDays <= 0) {
    throw new FrameSchemaInvalid(entry.frameId, 'freshnessHorizonDays must be a positive number');
  }
  if (!Array.isArray(entry.permanentClaimCategories)) {
    throw new FrameSchemaInvalid(entry.frameId, 'permanentClaimCategories must be an array');
  }
  if (!Array.isArray(entry.safeAlternatives)) {
    throw new FrameSchemaInvalid(entry.frameId, 'safeAlternatives must be an array');
  }
  if (typeof entry.requiresEvidence !== 'boolean') {
    throw new FrameSchemaInvalid(entry.frameId, 'requiresEvidence must be a boolean');
  }
}

// ----------------------------------------------------------------------------
// Seed registry — minimal placeholder so Phase C compiles + self-tests.
// PHASE B will replace this with the full catalog.
// ----------------------------------------------------------------------------

/**
 * Seed entries derived from the two prospects named in the spec
 * (ALLO + Finley). Used by Phase C tests (`tests/refutation.test.ts`) and
 * during the Phase B/C interim. The shapes here MUST be consistent with
 * what Phase B emits, since `pickSafeAlternative` recurses through them.
 */
const SEED_FRAMES: FrameRegistryEntry[] = [
  // -----------------------------------------------------------------------
  // Frame: GIS-pain (operational-pain-gis axis)
  //   - The classic ALLO frame; refuted by recent BEAD-win / growth claims.
  //   - swap target: bead_timeline_v1 (different axis).
  // -----------------------------------------------------------------------
  {
    frameId: 'gis_pain_v1',
    premise: 'Prospect feels GIS-to-CAD friction slowing their build',
    premiseAxis: 'operational-pain-gis',
    refuterKeywords: [
      'bead award',
      'bead win',
      'broadband award',
      'grant award',
      'rdof award',
      'reconnect award',
      'expanded into',
      'launched in',
      // 2026-06-09 ALLO learning: these are the substrate patterns that
      // contradict "GIS friction is your top pain". When they appear we
      // pivot to a timeline frame, not delete the email.
    ],
    refuterSemanticPrompt:
      'Does the substrate contain an announcement of a major BEAD/RDOF/ReConnect ' +
      'award, capital raise, expansion launch, or executive statement in the ' +
      'last 12 months that would make a "you must be struggling with GIS" ' +
      'opener feel out of touch?',
    freshnessHorizonDays: 365,
    permanentClaimCategories: [...DEFAULT_PERMANENT_CLAIM_CATEGORIES],
    safeAlternatives: ['bead_timeline_v1'],
    requiresEvidence: false,
  },
  // -----------------------------------------------------------------------
  // Frame: BEAD-timeline (bead-timeline axis)
  //   - Suitable for prospects with active BEAD activity. Refuted by
  //     substrate indicating they have ALREADY closed their A&E gap
  //     (e.g. an in-house drafting team announcement).
  // -----------------------------------------------------------------------
  {
    frameId: 'bead_timeline_v1',
    premise: 'Prospect has BEAD obligations on the clock',
    premiseAxis: 'bead-timeline',
    refuterKeywords: [
      'in-house drafting',
      'opened drafting',
      'hired drafting team',
      'expanded engineering team',
      'acquired engineering firm',
    ],
    refuterSemanticPrompt:
      'Does the substrate indicate the prospect has solved their drafting/engineering ' +
      'capacity gap in-house (acquisition, large hire, opened internal team)?',
    freshnessHorizonDays: 365,
    permanentClaimCategories: [...DEFAULT_PERMANENT_CLAIM_CATEGORIES],
    // Spec §3.6 supports depth-2 recursion through safeAlternatives. Original
    // entry was empty solely for halt-no-alt unit-test coverage — that test
    // is now also covered by strict_required_v1 (axis 'strict-required',
    // safeAlternatives: []), so we wire the production chain here.
    //
    // Production chain (verified on Frontier Communications 2026-06-10):
    //   bead_timeline_v1 → bead_growth_v1 (growth-narrative axis,
    //     different premise, captures Verizon-acquisition / 30M-passings
    //     style substrate that refutes timeline-pressure framing)
    //   bead_growth_v1 → gis_pain_v1 (depth-1 recursion, operational-pain
    //     axis, fallback for prospects whose growth narrative is itself
    //     refuted by layoff/retraction substrate)
    safeAlternatives: ['bead_growth_v1'],
    requiresEvidence: false,
  },
  // -----------------------------------------------------------------------
  // Frame: BEAD-growth (growth-narrative axis)
  //   - Finley-style: lean into their growth win. Refuted if substrate
  //     shows a retraction, layoff, or write-down.
  // -----------------------------------------------------------------------
  {
    frameId: 'bead_growth_v1',
    premise: 'Prospect is publicly growing on the back of BEAD/RDOF momentum',
    premiseAxis: 'growth-narrative',
    refuterKeywords: [
      'layoff',
      'restructuring',
      'write-down',
      'write down',
      'paused expansion',
      'halted construction',
    ],
    refuterSemanticPrompt:
      'Does the substrate indicate that the prospect has slowed, paused, ' +
      'or reversed their growth trajectory?',
    freshnessHorizonDays: 365,
    permanentClaimCategories: [...DEFAULT_PERMANENT_CLAIM_CATEGORIES],
    safeAlternatives: ['gis_pain_v1'],
    requiresEvidence: false,
  },
  // -----------------------------------------------------------------------
  // Frame used by axis_collision test: shares axis 'operational-pain-gis'
  // with gis_pain_v1 and is therefore an invalid alternative for it. We
  // keep it here so the test fixture is self-contained.
  // -----------------------------------------------------------------------
  {
    frameId: 'gis_pain_v1_theatre',
    premise: 'Reworded GIS-pain frame (same axis) — used for axis-collision test',
    premiseAxis: 'operational-pain-gis',
    refuterKeywords: ['placeholder'], // any non-empty value to pass schema
    refuterSemanticPrompt: '',
    freshnessHorizonDays: 365,
    permanentClaimCategories: [...DEFAULT_PERMANENT_CLAIM_CATEGORIES],
    safeAlternatives: ['bead_timeline_v1'],
    requiresEvidence: false,
  },
  // -----------------------------------------------------------------------
  // Frame used by the halt_insufficient test (requiresEvidence=true).
  // -----------------------------------------------------------------------
  {
    frameId: 'strict_required_v1',
    premise: 'Frame requires substrate to even attempt (used to test halt path)',
    premiseAxis: 'strict-required',
    refuterKeywords: ['placeholder'],
    refuterSemanticPrompt: '',
    freshnessHorizonDays: 365,
    permanentClaimCategories: [...DEFAULT_PERMANENT_CLAIM_CATEGORIES],
    safeAlternatives: [],
    requiresEvidence: true,
  },
];

/** Frozen map; throws at load if any seed entry violates the schema. */
const _registryMap: Map<FrameId, FrameRegistryEntry> = (() => {
  const m = new Map<FrameId, FrameRegistryEntry>();
  for (const entry of SEED_FRAMES) {
    // Validate at load — spec §2 forcing function. Crash early on bad config.
    validateFrameRegistryEntry(entry);
    m.set(entry.frameId, Object.freeze({ ...entry }) as FrameRegistryEntry);
  }
  // Audit fresh-eyes 2026-06-09 §"Frame registry handoff risk" #1:
  // cross-frame referential check. Every id in `safeAlternatives` must
  // resolve to a registered frame. Without this, a Phase B typo surfaces
  // only at runtime inside pickSafeAlternative — silently degrading to
  // halt-no-alt instead of failing loud at load.
  for (const entry of m.values()) {
    for (const altId of entry.safeAlternatives) {
      if (!m.has(altId)) {
        throw new FrameSchemaInvalid(
          entry.frameId,
          `safeAlternatives contains unknown frameId "${altId}"; ` +
            `Phase B mis-config — every alternative must be registered`,
        );
      }
    }
  }
  return m;
})();

/**
 * Public read-only accessor. Throws FrameRegistryMissing if absent —
 * Phase C uses this to satisfy spec §5 "Frame missing from registry".
 */
export function getFrame(frameId: FrameId): FrameRegistryEntry {
  const entry = _registryMap.get(frameId);
  if (!entry) throw new FrameRegistryMissing(frameId);
  return entry;
}

/**
 * Test-only: register/override a frame at runtime. Intended for unit-test
 * fixtures so test cases can introduce edge-case frames without polluting
 * the production seed. Validates first.
 *
 * NOT for production wiring — Phase B should be the only thing populating
 * the registry for real runs.
 */
export function registerFrameForTest(entry: FrameRegistryEntry): void {
  validateFrameRegistryEntry(entry);
  // Per-entry safeAlternatives check (same as the registry-load sweep).
  // Allowed to self-reference an alt that hasn't been registered yet ONLY
  // if it's the entry being registered right now — supports two-frame
  // mutual-alt patterns in tests where both frames are registered in sequence.
  for (const altId of entry.safeAlternatives) {
    if (!_registryMap.has(altId) && altId !== entry.frameId) {
      throw new FrameSchemaInvalid(
        entry.frameId,
        `safeAlternatives contains unknown frameId "${altId}" at registerFrameForTest`,
      );
    }
  }
  _registryMap.set(entry.frameId, Object.freeze({ ...entry }) as FrameRegistryEntry);
}

/** Test-only: clear a single frame so a test can verify "missing" behavior. */
export function unregisterFrameForTest(frameId: FrameId): void {
  _registryMap.delete(frameId);
}

/** Test-only: list registered frame ids. */
export function listFrameIdsForTest(): FrameId[] {
  return Array.from(_registryMap.keys());
}
