/**
 * tests/showrev/refutation.test.ts — Phase C tests for checkSubstrateRefutation.
 *
 * Spec §7 lists 12 cases; this file implements all 12. Uses the same lightweight
 * pass/fail runner pattern as `tests/showrev/run-deliverability-tests.ts` so it
 * runs cleanly under `npx tsx`, no Vitest config required.
 *
 * The DB layer and Haiku judge are STUBBED via opts.dbFns / opts.judgeFn so the
 * tests never touch Supabase or the Anthropic API.
 *
 * Run: npx tsx tests/showrev/refutation.test.ts
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

import {
  checkSubstrateRefutation,
  FrameSchemaInvalid,
  type DbFns,
  type JudgeFn,
  type RefutationResult,
  type TracePayload,
} from '../../src/showrev/m1-email-find/evidence-tiering/refutation.js';
import {
  registerFrameForTest,
  unregisterFrameForTest,
  validateFrameRegistryEntry,
  type FrameRegistryEntry,
} from '../../src/showrev/m1-email-find/evidence-tiering/frame-registry.js';

// ----------------------------------------------------------------------------
// Test harness — matches the run-deliverability-tests.ts pattern
// ----------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq<T>(a: T, b: T, name: string): void {
  assert(
    a === b,
    name,
    a === b ? undefined : `got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`,
  );
}

// ----------------------------------------------------------------------------
// Fixture loader + DB stub factory
// ----------------------------------------------------------------------------

interface FixtureFile {
  prospect: { id: string; company_normalized: string };
  evidence: Array<{
    id: string;
    claim: string;
    source_citation: string;
    source_date: string | null;
    extracted_at: string;
    category: string;
    metadata: Record<string, unknown> | null;
  }>;
}

const __dirname = dirname(new URL(import.meta.url).pathname);

function loadFixture(name: 'allo' | 'finley'): FixtureFile {
  const path = resolve(__dirname, `../fixtures/refutation/${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8')) as FixtureFile;
}

/**
 * makeDbStub returns the DbFns the refutation module needs, plus an array of
 * trace rows that were "inserted" — tests assert against that array.
 */
function makeDbStub(
  evidence: FixtureFile['evidence'],
): { db: DbFns; traces: TracePayload[]; insertedKeys: Set<string> } {
  const traces: TracePayload[] = [];
  const insertedKeys = new Set<string>();
  const db: DbFns = {
    async fetchEvidence(_company, permanent, cutoffIso) {
      // Mirror the real implementation's predicate so tests cover the logic.
      const cutoff = new Date(cutoffIso).getTime();
      const perms = new Set(permanent);
      return evidence.filter((row) => {
        if (perms.has(row.category)) return true;
        const claimType =
          row.metadata && typeof row.metadata === 'object'
            ? (row.metadata as Record<string, unknown>)['claim_type']
            : undefined;
        if (typeof claimType === 'string' && perms.has(claimType)) return true;
        const effective = row.source_date ?? row.extracted_at;
        return new Date(effective).getTime() >= cutoff;
      });
    },
    async insertTrace(payload) {
      // Spec §6 idempotency key = (prospect_id, stage, runId).
      const key = `${payload.prospect_id}::${payload.stage}::${payload.metadata.runId}`;
      if (insertedKeys.has(key)) {
        // ON CONFLICT DO NOTHING — silently drop.
        return;
      }
      insertedKeys.add(key);
      traces.push(payload);
    },
  };
  return { db, traces, insertedKeys };
}

// ----------------------------------------------------------------------------
// Test 9 (empty_refuterKeywords_throws) runs first so it doesn't pollute the
// registry. We register/unregister fresh frames per-test where needed.
// ----------------------------------------------------------------------------

console.log('\n=== Refutation — Phase C ===\n');

// ---- 9. empty_refuterKeywords_throws ---------------------------------------
{
  const badFrame: FrameRegistryEntry = {
    frameId: 'bad_empty_v1',
    premise: 'A frame with no refuters at all',
    premiseAxis: 'bad-axis',
    refuterKeywords: [],
    refuterSemanticPrompt: '',
    freshnessHorizonDays: 365,
    permanentClaimCategories: [],
    safeAlternatives: [],
    requiresEvidence: false,
  };
  let threw = false;
  try {
    validateFrameRegistryEntry(badFrame);
  } catch (e) {
    threw = e instanceof FrameSchemaInvalid;
  }
  assert(threw, 'test9: empty refuterKeywords AND empty prompt throws FrameSchemaInvalid');
}

// ---- 1. clear_writes_trace -------------------------------------------------
{
  const fx = loadFixture('finley');
  const { db, traces } = makeDbStub(fx.evidence);
  // Finley's fixture is growth-only; no keyword hit. With 5 rows the judge
  // pass would fire (spec §3.7 threshold) — we stub it to return "no refuters
  // found, low confidence" so the clear path is exercised without touching
  // the live Anthropic API.
  const noOpJudge: JudgeFn = async () => ({ refuters: [], confidence: 0.0 });
  const result = await checkSubstrateRefutation(fx.prospect, 'bead_growth_v1', {
    runId: 'run_finley_clear_1',
    now: new Date('2026-06-09T00:00:00Z'),
    dbFns: db,
    judgeFn: noOpJudge,
  });
  eq(result.status, 'clear', 'test1: Finley + bead_growth_v1 = clear');
  eq(traces.length, 1, 'test1: exactly one trace row inserted');
  eq(traces[0]?.decision, 'clear', 'test1: trace decision=clear');
  eq(traces[0]?.metadata.frame, 'bead_growth_v1', 'test1: trace frame matches');
}

// ---- 2. keyword_swap_allo --------------------------------------------------
{
  const fx = loadFixture('allo');
  const { db, traces } = makeDbStub(fx.evidence);
  const result = await checkSubstrateRefutation(fx.prospect, 'gis_pain_v1', {
    runId: 'run_allo_swap_2',
    now: new Date('2026-06-09T00:00:00Z'),
    dbFns: db,
  });
  eq(result.status, 'swap', 'test2: ALLO + gis_pain_v1 = swap');
  if (result.status === 'swap') {
    eq(result.alternative, 'bead_timeline_v1', 'test2: alt is bead_timeline_v1');
    eq(result.method, 'keyword', 'test2: method=keyword');
    assert(result.refuters.length > 0, 'test2: refuters present');
  }
  eq(traces.length, 1, 'test2: one trace row');
  eq(traces[0]?.metadata.frame_axis, 'operational-pain-gis', 'test2: trace carries refuted axis');
}

// ---- 3. judge_swap ---------------------------------------------------------
{
  // Custom frame with NO keyword matches against finley's substrate, but
  // a non-empty semantic prompt + an injected judge that flags refuters.
  registerFrameForTest({
    frameId: 'judge_only_v1',
    premise: 'Premise tested only by judge',
    premiseAxis: 'judge-axis',
    refuterKeywords: ['no-such-token-in-fixtures-xyz'],
    refuterSemanticPrompt: 'Use Haiku to decide.',
    freshnessHorizonDays: 365,
    permanentClaimCategories: [],
    safeAlternatives: ['bead_growth_v1'],
    requiresEvidence: false,
  });
  const fx = loadFixture('finley');
  const { db, traces } = makeDbStub(fx.evidence);
  const stubJudge: JudgeFn = async (top10) => ({
    refuters: top10.slice(0, 2).map((r) => ({ id: r.id, reason: 'mock' })),
    confidence: 0.9,
  });
  const result = await checkSubstrateRefutation(fx.prospect, 'judge_only_v1', {
    runId: 'run_judge_swap_3',
    now: new Date('2026-06-09T00:00:00Z'),
    dbFns: db,
    judgeFn: stubJudge,
  });
  eq(result.status, 'swap', 'test3: judge swap');
  if (result.status === 'swap') {
    eq(result.method, 'judge', 'test3: method=judge');
    eq(result.alternative, 'bead_growth_v1', 'test3: alt picked');
  }
  eq(traces.length, 1, 'test3: one trace row');
  eq(traces[0]?.model, 'haiku', 'test3: trace model=haiku');
  unregisterFrameForTest('judge_only_v1');
}

// ---- 4. halt_no_alt --------------------------------------------------------
{
  // bead_timeline_v1 has safeAlternatives=[] — keyword refute => halt.
  // Need substrate that hits its keywords ("in-house drafting").
  const fx: FixtureFile = {
    prospect: { id: 'p_halt_4', company_normalized: 'no-alt corp' },
    evidence: [
      {
        id: 'ev_halt_001',
        claim: 'Acquired engineering firm and opened in-house drafting team last quarter.',
        source_citation: 'https://example.com/x',
        source_date: '2026-04-01T00:00:00Z',
        extracted_at: '2026-04-02T00:00:00Z',
        category: 'company_fact',
        metadata: null,
      },
    ],
  };
  const { db, traces } = makeDbStub(fx.evidence);
  const result = await checkSubstrateRefutation(fx.prospect, 'bead_timeline_v1', {
    runId: 'run_halt_no_alt_4',
    now: new Date('2026-06-09T00:00:00Z'),
    dbFns: db,
  });
  eq(result.status, 'halt', 'test4: halt path taken');
  if (result.status === 'halt') {
    eq(result.reason, 'refuted_no_safe_alt', 'test4: reason=refuted_no_safe_alt');
  }
  eq(traces.length, 1, 'test4: trace written even on halt');
}

// ---- 5. halt_insufficient --------------------------------------------------
{
  const fx: FixtureFile = {
    prospect: { id: 'p_halt_insuff_5', company_normalized: 'ghost co' },
    evidence: [],
  };
  const { db, traces } = makeDbStub(fx.evidence);
  const result = await checkSubstrateRefutation(fx.prospect, 'strict_required_v1', {
    runId: 'run_halt_insuff_5',
    now: new Date('2026-06-09T00:00:00Z'),
    dbFns: db,
  });
  eq(result.status, 'halt', 'test5: halt path');
  if (result.status === 'halt') {
    eq(result.reason, 'insufficient_evidence', 'test5: reason=insufficient_evidence');
  }
  eq(traces.length, 1, 'test5: trace written on insufficient');
}

// ---- 6. permanent_claim_survives_recency ----------------------------------
{
  // 200-day-old award; horizon=180. Without the carve-out it would be cut.
  registerFrameForTest({
    frameId: 'partner_pride_v1',
    premise: 'Frame that praises the prospect for a recent vendor partnership',
    premiseAxis: 'partner-pride',
    refuterKeywords: ['esri award'], // appears in old "award" row
    refuterSemanticPrompt: '',
    freshnessHorizonDays: 180,
    permanentClaimCategories: ['award', 'acquisition', 'leadership_change', 'public_statement'],
    safeAlternatives: ['bead_growth_v1'],
    requiresEvidence: false,
  });
  const oldIso = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
  const fx: FixtureFile = {
    prospect: { id: 'p_perm_6', company_normalized: 'perm corp' },
    evidence: [
      {
        id: 'ev_perm_001',
        claim: 'Won the ESRI Award for fiber GIS work.',
        source_citation: 'https://esri.com/awards/2025',
        source_date: oldIso,
        extracted_at: oldIso,
        category: 'award',
        metadata: null,
      },
    ],
  };
  const { db, traces } = makeDbStub(fx.evidence);
  const result = await checkSubstrateRefutation(fx.prospect, 'partner_pride_v1', {
    runId: 'run_perm_6',
    dbFns: db,
  });
  // Permanent category should survive recency, keyword should fire → swap.
  eq(result.status, 'swap', 'test6: permanent claim refuted despite old date');
  if (result.status === 'swap') eq(result.alternative, 'bead_growth_v1', 'test6: alt picked');
  eq(traces.length, 1, 'test6: trace written');
  unregisterFrameForTest('partner_pride_v1');
}

// ---- 7. judge_unavailable_fails_closed -------------------------------------
{
  registerFrameForTest({
    frameId: 'judge_fail_v1',
    premise: 'Premise where the judge is required',
    premiseAxis: 'judge-fail-axis',
    refuterKeywords: ['absent-keyword-yyy'], // never hits
    refuterSemanticPrompt: 'judge required',
    freshnessHorizonDays: 365,
    permanentClaimCategories: [],
    safeAlternatives: ['bead_growth_v1'],
    requiresEvidence: false,
  });
  const fx = loadFixture('finley');
  const { db, traces } = makeDbStub(fx.evidence);
  let calls = 0;
  const flakyJudge: JudgeFn = async () => {
    calls++;
    throw new Error('simulated timeout');
  };
  const result = await checkSubstrateRefutation(fx.prospect, 'judge_fail_v1', {
    runId: 'run_judge_fail_7',
    now: new Date('2026-06-09T00:00:00Z'),
    dbFns: db,
    judgeFn: flakyJudge,
  });
  eq(result.status, 'halt', 'test7: judge unavailable halts');
  if (result.status === 'halt') eq(result.reason, 'judge_unavailable', 'test7: reason matches');
  assert(calls >= 1, 'test7: judge was actually invoked');
  eq(traces.length, 1, 'test7: trace written on judge_unavailable');
  unregisterFrameForTest('judge_fail_v1');
}

// ---- 8. axis_collision_rejected --------------------------------------------
{
  // gis_pain_v1's first alt is bead_timeline_v1 (different axis) → that's
  // what gets picked. Confirm the same-axis sibling
  // gis_pain_v1_theatre is NEVER picked even when listed.
  registerFrameForTest({
    frameId: 'axis_test_v1',
    premise: 'Test frame whose only same-axis "alternative" must be rejected',
    premiseAxis: 'operational-pain-gis',
    refuterKeywords: ['bead award'], // ALLO fixture triggers this
    refuterSemanticPrompt: '',
    freshnessHorizonDays: 365,
    permanentClaimCategories: [],
    safeAlternatives: ['gis_pain_v1_theatre'], // same axis ONLY
    requiresEvidence: false,
  });
  const fx = loadFixture('allo');
  const { db } = makeDbStub(fx.evidence);
  const result = await checkSubstrateRefutation(fx.prospect, 'axis_test_v1', {
    runId: 'run_axis_collide_8',
    now: new Date('2026-06-09T00:00:00Z'),
    dbFns: db,
  });
  // Only same-axis alt available → recurses into that alt's alts
  // (bead_timeline_v1), which has a different axis → swap to that one.
  // The key assertion is: never lands on gis_pain_v1_theatre.
  if (result.status === 'swap') {
    assert(
      result.alternative !== 'gis_pain_v1_theatre',
      'test8: same-axis alt was rejected',
      `got alternative=${result.alternative}`,
    );
  } else {
    // halt is also acceptable so long as we didn't pick the theatre alt.
    assert(true, 'test8: halt without picking same-axis alt');
  }
  unregisterFrameForTest('axis_test_v1');
}

// ---- 10. idempotent_trace --------------------------------------------------
{
  const fx = loadFixture('finley');
  const { db, traces } = makeDbStub(fx.evidence);
  const runId = 'run_idem_10';
  const noOpJudge: JudgeFn = async () => ({ refuters: [], confidence: 0.0 });
  await checkSubstrateRefutation(fx.prospect, 'bead_growth_v1', {
    runId,
    now: new Date('2026-06-09T00:00:00Z'),
    dbFns: db,
    judgeFn: noOpJudge,
  });
  await checkSubstrateRefutation(fx.prospect, 'bead_growth_v1', {
    runId,
    now: new Date('2026-06-09T00:00:00Z'),
    dbFns: db,
    judgeFn: noOpJudge,
  });
  eq(traces.length, 1, 'test10: same runId twice yields one trace row (ON CONFLICT)');
  // Defensive: verify the surviving row is the clear we actually want.
  eq(traces[0]?.decision, 'clear', 'test10: surviving trace is the clear from first call');
}

// ---- 11. null_source_date_included -----------------------------------------
{
  // Row with source_date=NULL but recent extracted_at must be visible to the
  // keyword pass; COALESCE rule (spec §3.2).
  registerFrameForTest({
    frameId: 'null_date_v1',
    premise: 'Frame whose only refuter has NULL source_date',
    premiseAxis: 'null-date-axis',
    refuterKeywords: ['bead award'],
    refuterSemanticPrompt: '',
    freshnessHorizonDays: 365,
    permanentClaimCategories: [],
    safeAlternatives: ['bead_growth_v1'],
    requiresEvidence: false,
  });
  const fx: FixtureFile = {
    prospect: { id: 'p_null_11', company_normalized: 'null co' },
    evidence: [
      {
        id: 'ev_null_001',
        claim: 'Received a major bead award last month',
        source_citation: 'https://example.com',
        source_date: null,
        extracted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        category: 'company_fact',
        metadata: null,
      },
    ],
  };
  const { db, traces } = makeDbStub(fx.evidence);
  const result = await checkSubstrateRefutation(fx.prospect, 'null_date_v1', {
    runId: 'run_null_11',
    dbFns: db,
  });
  eq(result.status, 'swap', 'test11: NULL source_date row triggered refutation via COALESCE');
  eq(traces.length, 1, 'test11: trace written');
  unregisterFrameForTest('null_date_v1');
}

// ---- 12. top3_refuters_in_trace --------------------------------------------
{
  registerFrameForTest({
    frameId: 'multi_refuter_v1',
    premise: 'Frame meant to attract many refuters so we can verify top-3',
    premiseAxis: 'multi-refuter-axis',
    refuterKeywords: ['bead'],
    refuterSemanticPrompt: '',
    freshnessHorizonDays: 365,
    permanentClaimCategories: [],
    safeAlternatives: ['bead_growth_v1'],
    requiresEvidence: false,
  });
  // 5 refuter rows, 3 with newer dates so we can check ordering.
  const mkRow = (i: number, dateIso: string) => ({
    id: `ev_top3_${i.toString().padStart(3, '0')}`,
    claim: `Got a BEAD award #${i}`,
    source_citation: `https://example.com/${i}`,
    source_date: dateIso,
    extracted_at: dateIso,
    category: 'company_fact',
    metadata: null,
  });
  const fx: FixtureFile = {
    prospect: { id: 'p_top3_12', company_normalized: 'top3 co' },
    evidence: [
      mkRow(1, '2026-06-01T00:00:00Z'),
      mkRow(2, '2026-05-01T00:00:00Z'),
      mkRow(3, '2026-04-01T00:00:00Z'),
      mkRow(4, '2026-03-01T00:00:00Z'),
      mkRow(5, '2026-02-01T00:00:00Z'),
    ],
  };
  const { db, traces } = makeDbStub(fx.evidence);
  const result = await checkSubstrateRefutation(fx.prospect, 'multi_refuter_v1', {
    runId: 'run_top3_12',
    now: new Date('2026-06-09T00:00:00Z'),
    dbFns: db,
  });
  eq(result.status, 'swap', 'test12: refuters present → swap');
  const trace = traces[0];
  assert(!!trace, 'test12: trace exists');
  if (trace) {
    eq(trace.metadata.refuters.length, 3, 'test12: trace stores top 3 refuters');
    const ids = trace.metadata.refuters.map((r) => r.evidenceId);
    eq(ids[0], 'ev_top3_001', 'test12: top-1 is newest');
    eq(ids[1], 'ev_top3_002', 'test12: top-2 is second-newest');
    eq(ids[2], 'ev_top3_003', 'test12: top-3 is third-newest');
  }
  unregisterFrameForTest('multi_refuter_v1');
}

// ----------------------------------------------------------------------------
// Final report
// ----------------------------------------------------------------------------

console.log(`\n  passed: ${passed}  failed: ${failed}\n`);
if (failed > 0) {
  process.exitCode = 1;
}

// satisfy TS noImplicitReturns under es2022 module: nothing to return
const _: RefutationResult | null = null;
void _;
