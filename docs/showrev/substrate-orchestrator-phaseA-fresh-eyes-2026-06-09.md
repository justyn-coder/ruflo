---
title: Substrate Orchestrator Phase A — Fresh-Eyes Audit
status: ACTIVE
last_updated: 2026-06-09 14:00 EST
version: v1
---

## Verdict: NEEDS_REVISION

Four known bugs all real. Two more found that block tests AND production. Internal critiques caught compute paths but missed packaging, fixture, and integration realities.

## The 4 known bugs — verified real?

1. **`defaultMapPath()` off-by-one — REAL.** Path `src/showrev/m1-email-find/evidence-tiering/rich-dossier/` is 5 segments from repo root. Code goes `../../../../../../` = 6 levels, landing at `/.claude/worktrees/` (no `data/`). Same bug in `persona-map.ts:38` AND `kb-classifier.ts:42` (`defaultKbPath`) AND `kb-classifier.ts:39` (`cacheDir`). Four files.
2. **`publisherFromCitation` doesn't split on `#` — REAL.** Splitter is `/\s*::\s*|\s*\|\s*|\s+—\s+/`. Citation `"ntia-bead-subgrantees#0cdebf46 (BEAD Sub-Grantees: Missouri)"` returns full lowercased string → no map hit → throws. **Tests 1, 11 use exactly this shape; both fail before assertion.**
3. **`computeRecencyBoost` leaks `Date.now()` — REAL.** Determinism contract in module docstring claims "no random, no time" — directly violated. Two-call comparison of same row will diverge across day boundary. `gcKbCache` and `readCache` TTL also use `Date.now()` but those are best-effort; the score one is load-bearing.
4. **`.env` `${SUPABASE_URL}` placeholder — UNVERIFIED.** Bash blocked reading `.env`. Code falls back to a hardcoded literal URL when env missing, so this only bites when env IS set but is the literal `${SUPABASE_URL}` string — plausible bug, treat as real.

## NEW issues found (not caught by internal critiques)

**A. Test fixture directory does not exist.** Tests reference `tests/showrev/fixtures/kb-labels.json` and `publisher-labels.json`. The `tests/showrev/fixtures/` directory is not present in the worktree. Test 7 + Test 8 throw ENOENT, not assertion failure — so the "≥27/30" SC #4 acceptance gate has never run. Internal adversarial critique stopped at the test file; never checked the fixtures resolve.

**B. Module-level mutable state shared across concurrent calls.** `cachedMap`, `cachedRules`, `cachedKbBody`, `cachedKbHash` are module singletons. Test seam `_setAuthorityMapForTests` mutates them. If a backfill script and the production pipeline ever share a Node process (or tests run in parallel), one call's fixture poisons the other. Not flagged by "concurrency" lens because internal critique assumed isolation.

**C. `getRichDossier` swallows non-Supabase errors mid-loop.** Lines 263–289 only catch `SubstrateQueryError`. `UnknownPublisherError` thrown from `scoreRow` (line 311) inside the `for` loop bubbles past the dossier — caller receives a thrown exception, NOT a dossier with `empty_reason`. Spec §6 says "fail loud", but composers expect a dossier object. Integration with `run-pipeline-v2.ts` `.map`/`.forEach` over prospects will halt the cohort on one unknown publisher unless every call site wraps in try/catch. No call-site contract documented.

**D. YAML schema brittleness — silent ignore.** `loadMap` only checks `Array.isArray(parsed.publishers)`. A row like `{ publisher: "foo" }` (missing tier) becomes `m.set("foo", undefined)` → later `map.get` returns `undefined` → unknown-publisher throw. Operator never told their YAML was malformed. No `tier in {A,B,C,D}` guard. Same shape in `persona-map.ts` rules.

**E. Substrate fetch races a thrown DB error.** `Promise.all([selectRows, fetchSubstrate])` — if `selectRows` throws fast, `fetchSubstrate` is still in-flight with its 1.5s AbortController unfired. Hot leak on every DB failure. Minor but cumulative under high error rate.

**F. Caller API smell.** `_injectRows` test hook lives in the public signature. Production callers will eventually pass it by accident or by copy-paste. Should be split into a `getRichDossierForTest` or moved behind a separate import path.

## Integration risk assessment

`run-pipeline-v2.ts` does NOT yet import `getRichDossier`. It still calls `orchestrateEvidence` + `TieredDossier`. The integration ticket is not done. Composers (`specific-composer`, `microsite-composer`) consume `TieredDossier`, not `RichDossier` — no shim layer drafted. Slot-in risk is moderate: types are incompatible, so the cutover is a rewrite, not a swap. Plan for a 1-week composer migration before Phase A delivers value.

## Recommendation for operator

Hold ship. Fix order:

1. Path off-by-one (4 files, 1 line each) — blocks every run.
2. `publisherFromCitation` `#` split — blocks Tests 1, 11 and any NTIA-shape citation in production.
3. Create `tests/showrev/fixtures/` with kb-labels.json + publisher-labels.json — SC #4 gate cannot currently fire.
4. Inject `now()` into `computeRecencyBoost` — accept a `now` arg defaulting to `Date.now`; tests pass a fixed epoch.
5. Wrap `scoreRow` in try/catch inside the loop so `UnknownPublisherError` becomes a per-row skip with a counter, OR document the throw contract at every call site.
6. YAML schema validation (zod or hand-rolled) — tier enum guard + non-empty publisher.
7. Draft composer migration ticket before integration, not after.

Phase B (the actual `run-pipeline-v2` cutover) should not start until 1–4 are merged and the fixture-driven SC #4 gate passes once on real data.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 14:00 | Claude | Initial fresh-eyes audit |
