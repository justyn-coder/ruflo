/**
 * tests/refutation.test.ts — Phase C tests for checkSubstrateRefutation.
 *
 * Implements all 12 cases from spec v2 FINAL §8 TEST PLAN, plus:
 *   - real-DB integration test against Supabase project slttpknnuthbttjuzrnz
 *     using a known company (comcast) — confirms fetchEvidence + insertTrace
 *     work end-to-end against the live schema.
 *   - determinism check: same input → same output across 3 invocations
 *     (algorithmic guarantee from spec §8).
 *
 * Tests run via `npx tsx` — no Vitest config required. The lightweight
 * pass/fail runner pattern matches tests/showrev/run-deliverability-tests.ts
 * so output is grep-friendly for CI.
 *
 * Stub DB + Stub judge are used everywhere EXCEPT the integration block,
 * which deliberately exercises makeRealDbFns + a no-op judge against live
 * Supabase.
 *
 * Run:
 *   npx tsx src/showrev/m1-email-find/evidence-tiering/tests/refutation.test.ts
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { config as loadEnv } from 'dotenv';

// Load .env from the m1-email-find directory (same pattern as substrate-query
// and refutation itself).
const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../../.env') });

import {
  checkSubstrateRefutation,
  FrameSchemaInvalid,
  type DbFns,
  type JudgeFn,
  type RefutationResult,
  type TracePayload,
} from '../refutation.js';
import {
  registerFrameForTest,
  unregisterFrameForTest,
  validateFrameRegistryEntry,
  type FrameRegistryEntry,
} from '../frame-registry.js';

// ----------------------------------------------------------------------------
// Test harness — matches the run-deliverability-tests.ts style
// ----------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    const msg = `${name}${detail ? ` — ${detail}` : ''}`;
    failures.push(msg);
    console.error(`  FAIL  ${msg}`);
  }
}

function eq<T>(a: T, b: T, name: string): void {
  assert(
    a === b,
    name,
    a === b ? undefined : `got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`,
  );
}

async function section(title: string, fn: () => Promise<void> | void): Promise<void> {
  console.log(`\n--- ${title} ---`);
  try {
    await fn();
  } catch (err) {
    failed++;
    const msg = `${title} threw: ${err instanceof Error ? err.message : String(err)}`;
    failures.push(msg);
    console.error(`  FAIL  ${msg}`);
  }
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

function loadFixture(name: 'allo' | 'finley'): FixtureFile {
  const path = resolve(__dirname, `fixtures/${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8')) as FixtureFile;
}

/**
 * makeDbStub mirrors the real-implementation predicate so tests cover the
 * logical filter, not just the algorithm. Returns the stub plus a captured
 * traces array so tests can assert against the trace stream.
 */
function makeDbStub(
  evidence: FixtureFile['evidence'],
): { db: DbFns; traces: TracePayload[]; insertedKeys: Set<string> } {
  const traces: TracePayload[] = [];
  const insertedKeys = new Set<string>();
  const db: DbFns = {
    async fetchEvidence(_company, permanent, cutoffIso) {
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
      if (insertedKeys.has(key)) return; // ON CONFLICT DO NOTHING
      insertedKeys.add(key);
      traces.push(payload);
    },
  };
  return { db, traces, insertedKeys };
}

// ----------------------------------------------------------------------------
// Begin tests
// ----------------------------------------------------------------------------

console.log('\n=== Phase C — checkSubstrateRefutation ===');
const t0 = Date.now();

// ---- 9. empty_refuterKeywords_throws (runs FIRST — schema-load gate) -------
await section('test9: empty refuterKeywords AND empty prompt throws FrameSchemaInvalid', () => {
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
  assert(threw, 'FrameSchemaInvalid thrown on empty refuters + empty prompt');
});

// ---- 1. clear_writes_trace -------------------------------------------------
await section('test1: clear_writes_trace (Finley + bead_growth_v1)', async () => {
  const fx = loadFixture('finley');
  const { db, traces } = makeDbStub(fx.evidence);
  // Finley's growth substrate has no keyword refuters for bead_growth_v1. With
  // 5 rows the judge pass would otherwise fire; stub it to "no refuters,
  // 0.0 confidence" so the clear path is exercised without live Haiku calls.
  const noOpJudge: JudgeFn = async () => ({ refuters: [], confidence: 0.0 });
  const result = await checkSubstrateRefutation(fx.prospect, 'bead_growth_v1', {
    runId: 'run_finley_clear_1',
    now: new Date('2026-06-09T00:00:00Z'),
    dbFns: db,
    judgeFn: noOpJudge,
  });
  eq(result.status, 'clear', 'result.status=clear');
  eq(traces.length, 1, 'exactly one trace row');
  eq(traces[0]?.decision, 'clear', 'trace decision=clear');
  eq(traces[0]?.metadata.frame, 'bead_growth_v1', 'trace frame=bead_growth_v1');
  eq(traces[0]?.model, 'none', 'trace model=none on clear');
});

// ---- 2. keyword_swap_allo --------------------------------------------------
await section('test2: keyword_swap_allo (ALLO + gis_pain_v1)', async () => {
  const fx = loadFixture('allo');
  const { db, traces } = makeDbStub(fx.evidence);
  const result = await checkSubstrateRefutation(fx.prospect, 'gis_pain_v1', {
    runId: 'run_allo_swap_2',
    now: new Date('2026-06-09T00:00:00Z'),
    dbFns: db,
  });
  eq(result.status, 'swap', 'result.status=swap');
  if (result.status === 'swap') {
    eq(result.alternative, 'bead_timeline_v1', 'alt is bead_timeline_v1 (different axis)');
    eq(result.method, 'keyword', 'method=keyword');
    assert(result.refuters.length > 0, 'refuters present');
  }
  eq(traces.length, 1, 'one trace row');
  eq(traces[0]?.metadata.frame_axis, 'operational-pain-gis', 'trace carries refuted axis');
});

// ---- 3. judge_swap ---------------------------------------------------------
await section('test3: judge_swap (keyword miss + judge hits)', async () => {
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
  try {
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
    eq(result.status, 'swap', 'judge swap');
    if (result.status === 'swap') {
      eq(result.method, 'judge', 'method=judge');
      eq(result.alternative, 'bead_growth_v1', 'alt picked');
    }
    eq(traces.length, 1, 'one trace row');
    eq(traces[0]?.model, 'haiku', 'trace model=haiku');
  } finally {
    unregisterFrameForTest('judge_only_v1');
  }
});

// ---- 4. halt_no_alt --------------------------------------------------------
// Uses a test-only frame so the halt-no-alt path stays covered regardless of
// what production safeAlternatives chains look like. Previously this test
// used bead_timeline_v1's empty safeAlternatives — that field was wired up
// 2026-06-10 (L1: bead_timeline_v1 → bead_growth_v1), so the test was
// repointed to an isolated fixture frame.
await section('test4: halt_no_alt (isolated test-only frame, no safe alts)', async () => {
  registerFrameForTest({
    frameId: 'halt_no_alt_test_v1',
    premise: 'Test-only frame for halt-no-alt path coverage',
    premiseAxis: 'halt-test',
    refuterKeywords: ['acquired engineering firm', 'in-house drafting'],
    refuterSemanticPrompt: 'Does the substrate refute the test premise?',
    freshnessHorizonDays: 365,
    permanentClaimCategories: ['company_fact'],
    safeAlternatives: [],
    requiresEvidence: false,
  });
  try {
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
    const result = await checkSubstrateRefutation(fx.prospect, 'halt_no_alt_test_v1', {
      runId: 'run_halt_no_alt_4',
      now: new Date('2026-06-09T00:00:00Z'),
      dbFns: db,
    });
    eq(result.status, 'halt', 'halt path taken');
    if (result.status === 'halt') {
      eq(result.reason, 'refuted_no_safe_alt', 'reason=refuted_no_safe_alt');
    }
    eq(traces.length, 1, 'trace written even on halt');
  } finally {
    unregisterFrameForTest('halt_no_alt_test_v1');
  }
});

// ---- 5. halt_insufficient --------------------------------------------------
await section('test5: halt_insufficient (zero evidence + requiresEvidence=true)', async () => {
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
  eq(result.status, 'halt', 'halt path');
  if (result.status === 'halt') {
    eq(result.reason, 'insufficient_evidence', 'reason=insufficient_evidence');
  }
  eq(traces.length, 1, 'trace written on insufficient');
});

// ---- 6. permanent_claim_survives_recency ----------------------------------
await section('test6: permanent_claim_survives_recency (200-day-old ESRI award)', async () => {
  registerFrameForTest({
    frameId: 'partner_pride_v1',
    premise: 'Frame that praises the prospect for a recent vendor partnership',
    premiseAxis: 'partner-pride',
    refuterKeywords: ['esri award'],
    refuterSemanticPrompt: '',
    freshnessHorizonDays: 180,
    permanentClaimCategories: ['award', 'acquisition', 'leadership_change', 'public_statement'],
    safeAlternatives: ['bead_growth_v1'],
    requiresEvidence: false,
  });
  try {
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
    eq(result.status, 'swap', 'permanent claim refuted despite 200-day age');
    if (result.status === 'swap') eq(result.alternative, 'bead_growth_v1', 'alt picked');
    eq(traces.length, 1, 'trace written');
  } finally {
    unregisterFrameForTest('partner_pride_v1');
  }
});

// ---- 7. judge_unavailable_fails_closed -------------------------------------
await section('test7: judge_unavailable_fails_closed (always throws → halt)', async () => {
  registerFrameForTest({
    frameId: 'judge_fail_v1',
    premise: 'Premise where the judge is required',
    premiseAxis: 'judge-fail-axis',
    refuterKeywords: ['absent-keyword-yyy'],
    refuterSemanticPrompt: 'judge required',
    freshnessHorizonDays: 365,
    permanentClaimCategories: [],
    safeAlternatives: ['bead_growth_v1'],
    requiresEvidence: false,
  });
  try {
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
    eq(result.status, 'halt', 'judge unavailable halts');
    if (result.status === 'halt') eq(result.reason, 'judge_unavailable', 'reason matches');
    assert(calls >= 1, 'judge was actually invoked');
    eq(traces.length, 1, 'trace written on judge_unavailable');
  } finally {
    unregisterFrameForTest('judge_fail_v1');
  }
});

// ---- 8. axis_collision_rejected --------------------------------------------
await section('test8: axis_collision_rejected (same-axis alt never picked)', async () => {
  registerFrameForTest({
    frameId: 'axis_test_v1',
    premise: 'Test frame whose only same-axis "alternative" must be rejected',
    premiseAxis: 'operational-pain-gis',
    refuterKeywords: ['bead award'],
    refuterSemanticPrompt: '',
    freshnessHorizonDays: 365,
    permanentClaimCategories: [],
    safeAlternatives: ['gis_pain_v1_theatre'], // same axis ONLY
    requiresEvidence: false,
  });
  try {
    const fx = loadFixture('allo');
    const { db } = makeDbStub(fx.evidence);
    const result = await checkSubstrateRefutation(fx.prospect, 'axis_test_v1', {
      runId: 'run_axis_collide_8',
      now: new Date('2026-06-09T00:00:00Z'),
      dbFns: db,
    });
    // The recursive pick can dig into the same-axis alt's OWN alternatives
    // (which are different-axis), so a swap to bead_timeline_v1 is acceptable.
    // The non-negotiable assertion: never land on gis_pain_v1_theatre.
    if (result.status === 'swap') {
      assert(
        result.alternative !== 'gis_pain_v1_theatre',
        'same-axis alt rejected',
        `got alternative=${result.alternative}`,
      );
    } else {
      assert(true, 'halt acceptable so long as same-axis alt was not picked');
    }
  } finally {
    unregisterFrameForTest('axis_test_v1');
  }
});

// ---- 10. idempotent_trace --------------------------------------------------
await section('test10: idempotent_trace (same runId twice → one trace row)', async () => {
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
  eq(traces.length, 1, 'one trace row after two same-runId calls');
  eq(traces[0]?.decision, 'clear', 'surviving trace is the clear from first call');
});

// ---- 11. null_source_date_included -----------------------------------------
await section('test11: null_source_date_included (COALESCE rule)', async () => {
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
  try {
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
    eq(result.status, 'swap', 'NULL source_date triggered keyword refutation via COALESCE');
    eq(traces.length, 1, 'trace written');
  } finally {
    unregisterFrameForTest('null_date_v1');
  }
});

// ---- 12. top3_refuters_in_trace --------------------------------------------
await section('test12: top3_refuters_in_trace (5 refuters → top 3 by date)', async () => {
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
  try {
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
    eq(result.status, 'swap', 'refuters present → swap');
    const trace = traces[0];
    assert(!!trace, 'trace exists');
    if (trace) {
      eq(trace.metadata.refuters.length, 3, 'trace stores top 3 refuters');
      const ids = trace.metadata.refuters.map((r) => r.evidenceId);
      eq(ids[0], 'ev_top3_001', 'top-1 is newest');
      eq(ids[1], 'ev_top3_002', 'top-2 is second-newest');
      eq(ids[2], 'ev_top3_003', 'top-3 is third-newest');
    }
  } finally {
    unregisterFrameForTest('multi_refuter_v1');
  }
});

// ---- DET. determinism — same input → same output across 3 invocations -----
await section('det: determinism (3 stub invocations → byte-identical results)', async () => {
  const fx = loadFixture('allo');
  // We use 3 INDEPENDENT stub DBs so trace-state side-effects don't perturb
  // the result. The algorithm's claim is purely about the returned shape.
  const runs: RefutationResult[] = [];
  for (let i = 0; i < 3; i++) {
    const { db } = makeDbStub(fx.evidence);
    const r = await checkSubstrateRefutation(fx.prospect, 'gis_pain_v1', {
      runId: `run_det_${i}`,
      now: new Date('2026-06-09T00:00:00Z'),
      dbFns: db,
    });
    runs.push(r);
  }
  // Compare by JSON (refuters array shape is stable per spec §3.5 + §6).
  const s0 = JSON.stringify(runs[0]);
  const s1 = JSON.stringify(runs[1]);
  const s2 = JSON.stringify(runs[2]);
  eq(s0, s1, 'run #1 === run #2');
  eq(s1, s2, 'run #2 === run #3');
  // Sanity: it actually did something.
  assert(runs[0]?.status === 'swap', 'runs produced swap (sanity check)');
});

// ---- INT. real-DB integration test against Supabase -----------------------
// Hits sr_company_evidence + sr_decision_trace against project slttpknnuthbttjuzrnz.
// Uses 'darin-jackson-allo-communications' — a real prospect row whose company
// normalizes to 'allo communications' (10 substrate rows). Required because
// sr_decision_trace.prospect_id is FK-constrained to sr_prospects.id; a synthetic
// id silently 409s and would mask the integration entirely.
//
// 2026-06-09 finding logged during this test build: refutation.ts:283 treats
// HTTP 409 as success (intended for ON CONFLICT dedup), but PostgREST also
// returns 409 for FK violations (code 23503). With no idempotent unique index
// in place yet (spec §6 migration unapplied), a missing prospect FK is silently
// swallowed. Flagged in the deliverable summary so the next iteration can
// tighten the response-body inspection.
//
// Expected outcome: ALLO's substrate contains the "bead award" keyword that
// refutes gis_pain_v1 — should swap to bead_timeline_v1.
await section('integration: real Supabase fetchEvidence + insertTrace (allo)', async () => {
  const haveCreds =
    !!(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co') &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!haveCreds) {
    console.log('     [integration] skipped — SUPABASE_SERVICE_ROLE_KEY missing');
    return;
  }
  const prospect = {
    id: 'darin-jackson-allo-communications', // real row in sr_prospects
    company_normalized: 'allo communications',
  };
  const runId = `run_int_${Date.now()}`;
  const noOpJudge: JudgeFn = async () => ({ refuters: [], confidence: 0.0 });
  const result = await checkSubstrateRefutation(prospect, 'gis_pain_v1', {
    runId,
    now: new Date('2026-06-09T00:00:00Z'),
    judgeFn: noOpJudge,
    // dbFns omitted → uses makeRealDbFns() against live Supabase.
  });
  assert(
    result.status === 'clear' || result.status === 'swap' || result.status === 'halt',
    'well-formed result shape from real DB',
    `got status=${result.status}`,
  );
  console.log(`     [integration] live result.status=${result.status} runId=${runId}`);

  // Verify the trace row actually landed in sr_decision_trace.
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const verifyRes = await fetch(
    `${url}/rest/v1/sr_decision_trace?select=decision,model,metadata` +
      `&prospect_id=eq.${encodeURIComponent(prospect.id)}` +
      `&metadata->>runId=eq.${encodeURIComponent(runId)}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } },
  );
  assert(verifyRes.ok, 'verify query returned 2xx', `status=${verifyRes.status}`);
  const rows = (await verifyRes.json()) as Array<{
    decision: string;
    model: string;
    metadata: Record<string, unknown>;
  }>;
  assert(rows.length === 1, 'exactly one trace row landed in sr_decision_trace', `got rows.length=${rows.length}`);
  if (rows.length === 1) {
    eq(rows[0]?.decision, result.status, 'trace decision matches returned status');
  }
});

// ----------------------------------------------------------------------------
// Final report
// ----------------------------------------------------------------------------

const elapsed = Date.now() - t0;
console.log(`\n=== Summary: ${passed} passed, ${failed} failed (${elapsed}ms) ===\n`);
if (failed > 0) {
  console.log('Failures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}

// satisfy TS noImplicitReturns under es2022 module — nothing to return
const _: RefutationResult | null = null;
void _;
