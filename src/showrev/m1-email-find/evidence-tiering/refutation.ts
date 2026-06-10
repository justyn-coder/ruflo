/**
 * refutation — Phase C of the substrate-orchestrator.
 *
 * Pre-flight gate after Phase B frame selection, BEFORE LLM compose.
 * Queries `sr_company_evidence` for the prospect and asks:
 *   "Does the substrate refute this frame's premise?"
 *
 * On refutation, swap to a materially-different alternative OR halt.
 * FAIL-CLOSED BY DESIGN — every silent-clear path is the ALLO/Finley
 * fabrication class we're shipping this module to defeat.
 *
 * Spec: spec v2 FINAL (2026-06-09).
 *
 * Integration note: this module is intentionally NOT yet wired into
 * `run-pipeline-v2.ts`. Per the implementation task it produces the
 * module + tests only; integration happens in a follow-up commit.
 *
 * --------------------------------------------------------------------------
 * Defended against (failure-mode index):
 *   - NULL source_date: COALESCE(source_date, extracted_at).
 *   - Empty refuters frame: schema validator throws at load (frame-registry).
 *   - Permanent claims (awards, leadership): bypass freshness cutoff (§3.3).
 *   - Theatre swap (alt shares premiseAxis): rejected (§3.6).
 *   - Judge fail-open: timeout/invalid JSON => halt('judge_unavailable') (§3.7).
 *   - Silent-clear gap: ALWAYS write a trace row (spec §6).
 *   - Audit dedup: runId ON CONFLICT DO NOTHING (spec §6).
 *   - DB error: throw RefutationDBError (spec §5).
 */

import { resolve, dirname } from 'path';
import { config as loadEnv } from 'dotenv';

// Pull .env from src/showrev/m1-email-find/.env (same pattern as substrate-query).
const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../.env') });

import {
  type FrameId,
  type FrameRegistryEntry,
  getFrame,
  validateFrameRegistryEntry,
  FrameSchemaInvalid,
  FrameRegistryMissing,
} from './frame-registry.js';

// ----------------------------------------------------------------------------
// Public types — spec §4 interface verbatim
// ----------------------------------------------------------------------------

export { FrameSchemaInvalid, FrameRegistryMissing };
export type { FrameId, FrameRegistryEntry };

/**
 * Optional knobs. `runId` is REQUIRED (idempotency key — spec §4 + §6
 * unique-index migration). `now` is injectable so tests can freeze time.
 * `judgeFallback` is reserved for callers that want to opt out of the
 * Haiku pass at call time (defaults to true; presence of
 * `refuterSemanticPrompt` is the real gate, per spec §3.7).
 */
export interface RefutationOpts {
  runId: string;
  now?: Date;
  judgeFallback?: boolean;
  /** Test-only: inject a stub Haiku for deterministic replay. */
  judgeFn?: JudgeFn;
  /** Test-only: stub the DB layer wholesale. */
  dbFns?: Partial<DbFns>;
}

export interface Refuter {
  evidenceId: string;
  claim: string;
  source_citation: string;
  source_date: string | null;
  extracted_at: string;
  category: string;
}

export type RefutationResult =
  | { status: 'clear'; frame: FrameId }
  | {
      status: 'swap';
      original: FrameId;
      alternative: FrameId;
      refuters: Refuter[];
      method: 'keyword' | 'judge';
    }
  | {
      status: 'halt';
      reason:
        | 'refuted_no_safe_alt'
        | 'insufficient_evidence'
        | 'judge_unavailable';
      refuters: Refuter[];
      method: 'keyword' | 'judge' | 'none';
    };

export class InvalidProspect extends Error {
  constructor(message: string) {
    super(`InvalidProspect: ${message}`);
    this.name = 'InvalidProspect';
  }
}

export class RefutationDBError extends Error {
  constructor(op: string, cause: unknown) {
    super(`RefutationDBError(${op}): ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'RefutationDBError';
  }
}

// ----------------------------------------------------------------------------
// Storage shape — mirrors sr_company_evidence DDL (verified via
// information_schema 2026-06-09: id text, company_normalized text, claim text,
// source_citation text, source_date timestamptz NULLABLE, extracted_at
// timestamptz NOT NULL, category text NOT NULL, metadata jsonb).
// ----------------------------------------------------------------------------

interface EvidenceRow {
  id: string;
  claim: string;
  source_citation: string;
  source_date: string | null;
  extracted_at: string;
  category: string;
  metadata: Record<string, unknown> | null;
}

// ----------------------------------------------------------------------------
// DB layer — kept tiny + injectable so tests don't need Supabase.
// ----------------------------------------------------------------------------

export interface DbFns {
  fetchEvidence(
    companyNormalized: string,
    permanentCategories: string[],
    cutoffIso: string,
  ): Promise<EvidenceRow[]>;
  insertTrace(payload: TracePayload): Promise<void>;
}

export interface TracePayload {
  prospect_id: string;
  stage: 'refutation';
  decision: 'clear' | 'swap' | 'halt';
  alternatives: string | null;
  reasoning: string;
  confidence: number;
  metadata: {
    frame: FrameId;
    refuters: Refuter[];
    method: 'keyword' | 'judge' | 'none';
    runId: string;
    frame_axis: string;
    [k: string]: unknown;
  };
  model: 'haiku' | 'keyword' | 'none';
}

function supabaseConfig() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://slttpknnuthbttjuzrnz.supabase.co';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return { url, key };
}

/**
 * Real Supabase implementation of the DB layer. Lives behind the DbFns
 * interface so tests can pass a stub (spec §7 fixture freeze).
 *
 * Note on the SELECT shape (spec §3.3): the predicate is
 *     (category in permanentClaimCategories) OR
 *     (COALESCE(source_date, extracted_at) >= cutoff)
 * Permanent claims (awards, acquisitions) survive recency cutoff.
 * ORDER BY id ASC keeps results deterministic.
 *
 * Index required (spec §2):
 *   CREATE INDEX idx_evidence_company_category_date
 *   ON sr_company_evidence (company_normalized, category,
 *                           COALESCE(source_date, extracted_at) DESC);
 */
function makeRealDbFns(): DbFns {
  const { url, key } = supabaseConfig();
  if (!key) {
    // Defer error to first call so tests/callers that inject dbFns aren't
    // blocked by missing creds.
    return {
      async fetchEvidence() {
        throw new RefutationDBError('fetchEvidence', new Error('SUPABASE key missing from env'));
      },
      async insertTrace() {
        throw new RefutationDBError('insertTrace', new Error('SUPABASE key missing from env'));
      },
    };
  }
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return {
    async fetchEvidence(companyNormalized, permanentCategories, cutoffIso) {
      try {
        // PostgREST OR predicate: cat in (perms) OR COALESCE(source_date,extracted_at) >= cutoff
        // PostgREST doesn't natively expose COALESCE in URL filters, so we
        // emulate via two passes joined OR. Approach: pull a generous page
        // sorted by id, then apply the predicate in code. The composite
        // index (spec §2) makes this cheap; row count per company is small
        // (avg ~10, max ~120 in the 756-row table).
        const path =
          `/rest/v1/sr_company_evidence` +
          `?select=id,claim,source_citation,source_date,extracted_at,category,metadata` +
          `&company_normalized=eq.${encodeURIComponent(companyNormalized)}` +
          `&category=in.(company_fact,persona_signal)` +
          `&order=id.asc` +
          `&limit=500`;
        const res = await fetch(`${url}${path}`, { headers });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        const rows = (await res.json()) as EvidenceRow[];
        const cutoff = new Date(cutoffIso).getTime();
        const permanentSet = new Set(permanentCategories);
        return rows.filter((row) => {
          // Spec §3.3: permanent categories bypass freshness gate. We honor
          // either the category column itself OR a metadata->>claim_type
          // override (Phase B may tag awards via metadata, not category).
          const claimType =
            row.metadata && typeof row.metadata === 'object'
              ? (row.metadata as Record<string, unknown>)['claim_type']
              : undefined;
          if (permanentSet.has(row.category)) return true;
          if (typeof claimType === 'string' && permanentSet.has(claimType)) return true;
          // Freshness window using COALESCE(source_date, extracted_at).
          const effective = row.source_date ?? row.extracted_at;
          const ms = new Date(effective).getTime();
          return Number.isFinite(ms) && ms >= cutoff;
        });
      } catch (cause) {
        throw new RefutationDBError('fetchEvidence', cause);
      }
    },
    async insertTrace(payload) {
      try {
        // Spec §6: ON CONFLICT(prospect_id, stage, metadata->>runId) DO NOTHING.
        // PostgREST `on_conflict=...` works on unique-index columns; the
        // expression-index migration (applied 2026-06-09: idx_sr_decision_trace_idempotent)
        // engages the server-side ON CONFLICT short-circuit. Without this index
        // a re-run with same runId would create duplicate rows (loud rather
        // than silent — but operationally bad).
        const res = await fetch(`${url}/rest/v1/sr_decision_trace`, {
          method: 'POST',
          headers: {
            ...headers,
            Prefer: 'resolution=ignore-duplicates,return=minimal',
          },
          body: JSON.stringify({
            prospect_id: payload.prospect_id,
            stage: payload.stage,
            decision: payload.decision,
            alternatives: payload.alternatives,
            reasoning: payload.reasoning,
            confidence: payload.confidence,
            metadata: payload.metadata,
            model: payload.model,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          // 409 can be EITHER a real ON CONFLICT ignore (idempotent re-run)
          // OR a foreign-key violation (PostgREST maps fk_violation → 409 too).
          // FAIL-LOUD on FK: that's the ALLO/Finley fabrication class
          // (trace looks written but prospect_id doesn't exist). Postgres
          // foreign_key_violation has SQLSTATE code=23503.
          // Audit 2026-06-09 fresh-eyes review §"Known 409 bug".
          if (res.status === 409) {
            // Inspect body. PostgREST error JSON shape: { code, details, hint, message }.
            let isRealConflict = true;
            try {
              const parsed = JSON.parse(text) as { code?: string; message?: string };
              if (parsed && typeof parsed === 'object' && typeof parsed.code === 'string') {
                if (parsed.code === '23503') isRealConflict = false; // FK violation
                // 23505 (unique_violation) is the legitimate idempotency case.
              }
            } catch {
              // Empty body or non-JSON → assume real conflict (ON CONFLICT path
              // with Prefer: resolution=ignore-duplicates returns 201/empty,
              // not 409. If we see 409 with empty body something else happened).
              // Be conservative: treat as conflict only if body is empty.
              if (text.trim() !== '') isRealConflict = false;
            }
            if (!isRealConflict) {
              throw new Error(
                `FK or other constraint violation: HTTP 409 — ${text.slice(0, 200)}`,
              );
            }
            // Real ON CONFLICT — idempotent re-run, silent success.
            return;
          }
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
      } catch (cause) {
        throw new RefutationDBError('insertTrace', cause);
      }
    },
  };
}

// ----------------------------------------------------------------------------
// Judge layer (Haiku) — kept injectable for fixture replay.
// ----------------------------------------------------------------------------

export interface JudgeResponse {
  refuters: Array<{ id: string; reason: string }>;
  confidence: number;
}

export type JudgeFn = (
  evidenceTop10: EvidenceRow[],
  prompt: string,
  signal: AbortSignal,
) => Promise<JudgeResponse>;

const JUDGE_MODEL = 'claude-haiku-4-5-20251001';
// Bumped 1500 → 3000 on 2026-06-09 evening. Standalone Haiku latency for the
// refutation prompt is ~700-1000ms, but during a real pipeline run there are
// many parallel API calls (email-finder DNS verification, MillionVerifier,
// Apollo) competing for network. The retry-on-abort is intentionally
// disabled (audit decision: same wall clock, doubles the bill), so a single
// slow call halts the prospect. 3000ms gives ~3x headroom against typical
// latency without doubling worst-case wall-clock. Verified on Frontier
// substrate (v2-mq7iex0p halted at 1500ms cap).
// Phase C judge timeout: bumped 3000 → 5000ms on 2026-06-10 after smoke v2 found
// Amanda Griffith (123Net) regression — judge timed out on a previously-clean
// prospect, fail-closed flagged her. Anthropic API latency is variable under
// load. The "no retry on timeout" decision (audit 2026-06-09) is preserved —
// the fix here is just headroom, not a retry change.
const JUDGE_TIMEOUT_MS = 5000;

/**
 * Real Haiku-backed judge. JSON mode, temperature=0, 1500ms timeout, 1 retry.
 * Fail-closed: throws on timeout/invalid-JSON-after-retry — caller turns the
 * throw into halt('judge_unavailable') per spec §3.7.
 *
 * The shape of the JSON we ask for is fixed (see prompt). If Haiku ever
 * returns something else, we re-throw (rather than swallow + clear).
 */
async function realJudge(
  evidenceTop10: EvidenceRow[],
  frame: FrameRegistryEntry,
  signal: AbortSignal,
): Promise<JudgeResponse> {
  // Lazy-load the SDK — avoids forcing the dep into modules that don't use it.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY missing — judge cannot run');
  }
  const client = new Anthropic({ apiKey });
  // Spec §3.7: top-10 sorted by COALESCE(source_date, extracted_at) DESC,
  // id ASC tiebreak. The sort happened upstream; we pass through.
  const lines = evidenceTop10
    .map(
      (e) =>
        `id=${e.id} category=${e.category} date=${e.source_date ?? e.extracted_at} :: ${e.claim}`,
    )
    .join('\n');
  const prompt = `You are auditing whether substrate refutes a sales-email frame.

FRAME PREMISE: "${frame.premise}"
REFUTATION QUESTION: ${frame.refuterSemanticPrompt}

EVIDENCE (id, category, date, claim):
${lines}

Return ONLY a JSON object of shape:
{ "refuters": [{ "id": "<evidence_id>", "reason": "<short>" }], "confidence": <0..1> }

- Only include evidence items that materially contradict the premise.
- confidence is your aggregate certainty across the refuters (0 to 1).
- No prose, no fences, no preamble — pure JSON.`;
  const response = await client.messages.create(
    {
      model: JUDGE_MODEL,
      max_tokens: 600,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    },
    { signal },
  );
  // Treat content as a structural-union { type; text? } to avoid coupling to
  // the SDK's evolving ContentBlock shape (Anthropic added `citations` to
  // TextBlock + ThinkingBlock variants). We just want type==='text' blocks.
  const blocks = response.content as unknown as Array<{ type: string; text?: string }>;
  const text = blocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
    .trim();
  // JSON-mode: parse strictly; throw on any deviation. fail-closed (§3.7).
  // Haiku 4.5 wraps JSON in ```json ... ``` fences despite the prompt asking
  // for pure JSON — strip them before parsing. Verified 2026-06-09 evening
  // (smoke test v2-mq7hi71c halted all judge calls on this exact bug).
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as JudgeResponse).refuters) ||
    typeof (parsed as JudgeResponse).confidence !== 'number'
  ) {
    throw new Error('judge: response missing required fields');
  }
  // Coerce shape, drop any extra fields.
  const out: JudgeResponse = {
    refuters: (parsed as JudgeResponse).refuters
      .filter((r) => r && typeof r.id === 'string')
      .map((r) => ({ id: r.id, reason: typeof r.reason === 'string' ? r.reason : '' })),
    confidence: Math.max(0, Math.min(1, (parsed as JudgeResponse).confidence)),
  };
  return out;
}

/**
 * Wrap the judge with timeout + 1 retry. Returns a JudgeFn that the algorithm
 * calls. Spec §3.7 + §9: 1500ms × 1 retry = ~3s worst case before halt.
 *
 * Retry policy (audit fresh-eyes 2026-06-09 NEW issue #1): retry ONLY on
 * non-abort errors (parse errors, network blips, JSON-shape errors).
 * Do NOT retry on AbortError/timeout — the second call would hit the same
 * wall clock budget with the same result and double the Haiku bill for no
 * audit benefit. Halt fast on timeout; let the caller's halt-no-judge
 * branch take over.
 */
function defaultJudgeFn(frame: FrameRegistryEntry): JudgeFn {
  return async (evidenceTop10, _prompt, parentSignal) => {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      // Chain parent abort so callers can cancel.
      const onParentAbort = () => controller.abort();
      parentSignal.addEventListener('abort', onParentAbort);
      const timeout = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
      try {
        const r = await realJudge(evidenceTop10, frame, controller.signal);
        clearTimeout(timeout);
        parentSignal.removeEventListener('abort', onParentAbort);
        return r;
      } catch (err) {
        clearTimeout(timeout);
        parentSignal.removeEventListener('abort', onParentAbort);
        lastErr = err;
        // Audit fresh-eyes 2026-06-09: do not retry on abort/timeout.
        // The wall clock budget is the same, the SDK behavior is the same,
        // and we'd just bill twice for the same outcome.
        const isAbort =
          (err instanceof Error &&
            (err.name === 'AbortError' || /abort|timeout/i.test(err.message))) ||
          controller.signal.aborted;
        if (isAbort) break;
      }
    }
    throw lastErr ?? new Error('judge: unknown failure');
  };
}

// ----------------------------------------------------------------------------
// Core algorithm — spec §3
// ----------------------------------------------------------------------------

const MAX_ALT_RECURSION_DEPTH = 2; // spec §3.6

/**
 * Recursive alternative picker. Spec §3.6 / §5:
 *   - Skip any alt that shares premiseAxis with the refuted frame.
 *   - Skip any alt that fails its OWN keyword refutation against the
 *     same evidence set (recursion depth <=2).
 *   - Stop at depth > MAX_ALT_RECURSION_DEPTH.
 *
 * We intentionally only re-run KEYWORD refutation in the recursive check —
 * recursing into Haiku would blow the latency budget and the spec doesn't
 * require it.
 *
 * Audit fresh-eyes 2026-06-09 NEW issue #2: `seen` is now a per-path
 * accumulator (copied at each recursion frame), not a global cross-branch
 * Set. Cycle prevention is preserved along the current path, but a
 * depth-1 reject can be reconsidered as a depth-2 alt via a different
 * parent (avoids starving legitimate swaps in a dense frame graph).
 */
function pickSafeAlternative(
  refutedFrame: FrameRegistryEntry,
  evidence: EvidenceRow[],
  depth: number,
  seen: Set<FrameId>,
): FrameId | null {
  if (depth > MAX_ALT_RECURSION_DEPTH) return null;
  for (const altId of refutedFrame.safeAlternatives) {
    if (seen.has(altId)) continue;
    let alt: FrameRegistryEntry;
    try {
      alt = getFrame(altId);
    } catch {
      // Missing alternative — Phase B mis-config. Skip rather than throw,
      // so a partial registry doesn't take down the whole pipeline.
      // (Load-time validation in frame-registry.ts now catches this at
      //  registry build, so we should never hit it in production.)
      continue;
    }
    // (a) Reject same-axis (theatre swap defense).
    if (alt.premiseAxis === refutedFrame.premiseAxis) continue;
    // (b) Must pass its own keyword refutation.
    const refs = applyKeywordPass(alt, evidence);
    if (refs.length === 0) return altId;
    // (b-recurse) The alt is itself refuted — try ITS alternatives.
    // Per-path Set: copy `seen`, add the current alt as "on this path",
    // and recurse. Sibling branches at depth `depth` get their own copies.
    const childSeen = new Set(seen);
    childSeen.add(altId);
    const nested = pickSafeAlternative(alt, evidence, depth + 1, childSeen);
    if (nested) return nested;
  }
  return null;
}

/** Pure keyword filter. claim.toLowerCase().includes(keyword). */
function applyKeywordPass(
  frame: FrameRegistryEntry,
  evidence: EvidenceRow[],
): EvidenceRow[] {
  if (frame.refuterKeywords.length === 0) return [];
  const lowered = frame.refuterKeywords.map((k) => k.toLowerCase());
  return evidence.filter((row) => {
    const haystack = row.claim.toLowerCase();
    return lowered.some((kw) => haystack.includes(kw));
  });
}

/** Map a raw EvidenceRow into the public Refuter shape. */
function toRefuter(row: EvidenceRow): Refuter {
  return {
    evidenceId: row.id,
    claim: row.claim,
    source_citation: row.source_citation,
    source_date: row.source_date,
    extracted_at: row.extracted_at,
    category: row.category,
  };
}

/** Spec §6: top-3 refuters by date DESC (id ASC tiebreak). */
function selectTopRefuters(refuters: EvidenceRow[], n: number): EvidenceRow[] {
  return [...refuters]
    .sort((a, b) => {
      const ad = new Date(a.source_date ?? a.extracted_at).getTime();
      const bd = new Date(b.source_date ?? b.extracted_at).getTime();
      if (bd !== ad) return bd - ad;
      return a.id.localeCompare(b.id);
    })
    .slice(0, n);
}

/**
 * Build the top-10 evidence window for the judge. Spec §3.7 + §8:
 * "sorted by COALESCE(source_date, extracted_at) DESC, id ASC tiebreak".
 */
function selectTop10ForJudge(evidence: EvidenceRow[]): EvidenceRow[] {
  return [...evidence]
    .sort((a, b) => {
      const ad = new Date(a.source_date ?? a.extracted_at).getTime();
      const bd = new Date(b.source_date ?? b.extracted_at).getTime();
      if (bd !== ad) return bd - ad;
      return a.id.localeCompare(b.id);
    })
    .slice(0, 10);
}

// ----------------------------------------------------------------------------
// Public entry point — spec §4
// ----------------------------------------------------------------------------

/**
 * Pre-flight check. See spec §3 algorithm.
 *
 * Always emits a trace row (spec §6). The DB write uses Prefer:
 * resolution=ignore-duplicates so a re-run with the same runId is a no-op
 * (idempotency — spec §6 unique index migration).
 */
export async function checkSubstrateRefutation(
  prospect: { id: string; company_normalized: string },
  chosenFrame: FrameId,
  opts: RefutationOpts,
): Promise<RefutationResult> {
  // ---- 0. Input validation (spec §5) -----------------------------------
  if (!prospect || !prospect.id) {
    throw new InvalidProspect('prospect.id is required');
  }
  if (
    typeof prospect.company_normalized !== 'string' ||
    prospect.company_normalized.trim() === ''
  ) {
    throw new InvalidProspect('prospect.company_normalized is empty/NULL');
  }
  if (!opts || typeof opts.runId !== 'string' || opts.runId.trim() === '') {
    throw new InvalidProspect('opts.runId is required (idempotency key)');
  }

  // ---- 1. Resolve frame + validate schema (spec §3.1) ------------------
  // getFrame throws FrameRegistryMissing on miss (spec §5).
  const frame = getFrame(chosenFrame);
  validateFrameRegistryEntry(frame); // belt-and-suspenders; load-time also validates.

  // Resolve DB + judge (injectable for tests; spec §7).
  const realDb = makeRealDbFns();
  const db: DbFns = {
    fetchEvidence: opts.dbFns?.fetchEvidence ?? realDb.fetchEvidence,
    insertTrace: opts.dbFns?.insertTrace ?? realDb.insertTrace,
  };
  // Spec §3.7: judge only fires if frame.refuterSemanticPrompt is non-empty
  // AND evidence.length >= 5. judgeFallback defaults to true.
  const judgeEnabled = (opts.judgeFallback ?? true) && frame.refuterSemanticPrompt.trim() !== '';
  const judge: JudgeFn | null = judgeEnabled ? opts.judgeFn ?? defaultJudgeFn(frame) : null;

  // ---- 2. Compute freshness cutoff (spec §3.2) -------------------------
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - frame.freshnessHorizonDays * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString();

  // ---- 3. Fetch evidence (spec §3.3) -----------------------------------
  const evidence = await db.fetchEvidence(
    prospect.company_normalized.trim(),
    frame.permanentClaimCategories,
    cutoffIso,
  );

  // ---- 4. Zero-evidence branch (spec §3.4 + §5) ------------------------
  if (evidence.length === 0) {
    if (frame.requiresEvidence) {
      const result: RefutationResult = {
        status: 'halt',
        reason: 'insufficient_evidence',
        refuters: [],
        method: 'none',
      };
      await writeTrace(db, prospect.id, frame, result, opts.runId);
      return result;
    }
    const cleared: RefutationResult = { status: 'clear', frame: chosenFrame };
    await writeTrace(db, prospect.id, frame, cleared, opts.runId);
    return cleared;
  }

  // ---- 5. Keyword pass (spec §3.5) -------------------------------------
  const keywordRefuters = applyKeywordPass(frame, evidence);

  // ---- 6. Keyword swap-or-halt (spec §3.6) -----------------------------
  if (keywordRefuters.length > 0) {
    const altId = pickSafeAlternative(frame, evidence, 0, new Set([frame.frameId]));
    const top3 = selectTopRefuters(keywordRefuters, 3).map(toRefuter);
    if (altId) {
      const swapped: RefutationResult = {
        status: 'swap',
        original: chosenFrame,
        alternative: altId,
        refuters: top3,
        method: 'keyword',
      };
      await writeTrace(db, prospect.id, frame, swapped, opts.runId);
      return swapped;
    }
    const halted: RefutationResult = {
      status: 'halt',
      reason: 'refuted_no_safe_alt',
      refuters: top3,
      method: 'keyword',
    };
    await writeTrace(db, prospect.id, frame, halted, opts.runId);
    return halted;
  }

  // ---- 7. Judge pass (spec §3.7) ---------------------------------------
  // Only if judge enabled AND evidence.length >= 5 (spec §3.7 threshold).
  if (judge && evidence.length >= 5) {
    const top10 = selectTop10ForJudge(evidence);
    const judgeAbort = new AbortController();
    let parsed: JudgeResponse;
    try {
      parsed = await judge(top10, frame.refuterSemanticPrompt, judgeAbort.signal);
    } catch {
      // Timeout, invalid JSON, network, anything → fail-closed (spec §3.7).
      const halted: RefutationResult = {
        status: 'halt',
        reason: 'judge_unavailable',
        refuters: [],
        method: 'judge',
      };
      await writeTrace(db, prospect.id, frame, halted, opts.runId);
      return halted;
    }
    if (parsed.confidence >= 0.7 && parsed.refuters.length > 0) {
      // Map judge refuter ids back to EvidenceRows so we can preserve the
      // citation chain in the trace + return shape.
      const idSet = new Set(parsed.refuters.map((r) => r.id));
      const judgeRefuterRows = top10.filter((row) => idSet.has(row.id));
      const top3 = selectTopRefuters(judgeRefuterRows, 3).map(toRefuter);
      const altId = pickSafeAlternative(frame, evidence, 0, new Set([frame.frameId]));
      if (altId) {
        const swapped: RefutationResult = {
          status: 'swap',
          original: chosenFrame,
          alternative: altId,
          refuters: top3,
          method: 'judge',
        };
        await writeTrace(db, prospect.id, frame, swapped, opts.runId, parsed.confidence);
        return swapped;
      }
      const halted: RefutationResult = {
        status: 'halt',
        reason: 'refuted_no_safe_alt',
        refuters: top3,
        method: 'judge',
      };
      await writeTrace(db, prospect.id, frame, halted, opts.runId, parsed.confidence);
      return halted;
    }
    // Judge returned low confidence or no refuters — proceed to clear.
  }

  // ---- 8. Clear (spec §3.8 + §6 always-write rule) ---------------------
  const cleared: RefutationResult = { status: 'clear', frame: chosenFrame };
  await writeTrace(db, prospect.id, frame, cleared, opts.runId);
  return cleared;
}

// ----------------------------------------------------------------------------
// Trace writer — single source of truth for the trace payload shape
// ----------------------------------------------------------------------------

/**
 * Spec §6 payload. confidence=1.0 for keyword-derived decisions (we are
 * certain we saw the literal token); the judge's own confidence flows
 * through for judge-derived decisions.
 */
async function writeTrace(
  db: DbFns,
  prospectId: string,
  frame: FrameRegistryEntry,
  result: RefutationResult,
  runId: string,
  judgeConfidence?: number,
): Promise<void> {
  const method: 'keyword' | 'judge' | 'none' =
    result.status === 'clear' ? 'none' : result.method;
  const refuters: Refuter[] = result.status === 'clear' ? [] : result.refuters;
  const alternative =
    result.status === 'swap' ? result.alternative : null;
  // Spec §6: reasoning is the joined top-3 refuter claims (or '' for clear).
  const reasoning = refuters
    .slice(0, 3)
    .map((r) => r.claim)
    .join(' | ');
  const confidence = method === 'judge' ? (judgeConfidence ?? 1.0) : 1.0;
  const model: 'haiku' | 'keyword' | 'none' =
    method === 'judge' ? 'haiku' : method === 'keyword' ? 'keyword' : 'none';
  const payload: TracePayload = {
    prospect_id: prospectId,
    stage: 'refutation',
    decision: result.status,
    alternatives: alternative,
    reasoning,
    confidence,
    metadata: {
      frame: frame.frameId,
      refuters,
      method,
      runId,
      frame_axis: frame.premiseAxis,
    },
    model,
  };
  await db.insertTrace(payload);
}

// ----------------------------------------------------------------------------
// Test-only exports — keep test-surface explicit; production code does NOT
// reach into these.
// ----------------------------------------------------------------------------

export const __TEST_ONLY__ = {
  applyKeywordPass,
  pickSafeAlternative,
  selectTop10ForJudge,
  selectTopRefuters,
  makeRealDbFns,
};
