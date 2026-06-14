---
title: Substrate-Orchestrator Phase C — Fresh-Eyes Audit
status: ACTIVE
last_updated: 2026-06-09 16:00 EST
version: v1
---

## Verdict

**Conditional ship.** Algorithm + fail-closed posture are correct; the trace-write
path has a class of silent-failure bugs that must close before integration.
Phase C is intentionally not yet wired to `run-pipeline-v2.ts` (per file header),
so we have a window. Block on items 1, 2, 4 below — others are follow-ups.

## Known 409 bug — severity + impact

**Severity: HIGH (silent audit loss), not data loss.**

Verified via Supabase:
- `sr_decision_trace.prospect_id` is `text NULLABLE` with FK to `sr_prospects(id)`.
- **No unique index exists** on `(prospect_id, stage, metadata->>'runId')`. Only
  the PK on `id` + two non-unique btree indexes.
- Current row count: 2 total, both `stage='refutation'` (smoke).

Consequence of `refutation.ts:276`'s `if (!res.ok && res.status !== 409)`:

1. **FK violation** on a non-existent `prospect_id` returns 409 (PostgREST maps
   `foreign_key_violation` to 409 Conflict). Today this is silently swallowed —
   the refutation decision returns to the caller as if traced, but no row lands.
   This is the ALLO/Finley fabrication class re-introduced at the audit layer.
2. **Idempotency** is also broken: the spec's expression index doesn't exist,
   so `Prefer: resolution=ignore-duplicates` has no unique constraint to engage
   against. Re-runs with the same `runId` will create duplicate rows in
   production — the test suite passes only because the stub fakes the index.

**Frequency in practice:** every prospect composed *before* promotion to
`sr_prospects` (which is the default path in `run-pipeline-v2.ts`: harvest →
compose → promote). On current 5-prospect P2 wet-run that's ~100% of refutation
calls. This bug, unfixed, defeats the module's entire purpose.

**Fix (must ship before integration):**
- Treat 409 as the FK case unless we can prove duplicate-runId — fail loud.
- Land the expression-index migration named in spec §6 before relying on it.
- Belt+braces: pre-verify `prospect_id` exists OR insert a synthetic prospect
  row at promotion time before any compose-stage write.

## Frame registry handoff risk

`frame-registry.ts` is explicit about its placeholder status (header §STATUS).
Schema validator `validateFrameRegistryEntry` will catch missing axis, both-empty
refuters, bad types — that's solid. **Two gaps:**

1. **No cross-frame referential check.** `safeAlternatives: ['bead_timeline_v1']`
   is not validated at load. If Phase B publishes frames whose alternatives
   point to non-existent ids, the failure surfaces only at runtime inside
   `pickSafeAlternative` (which silently `continue`s on `getFrame` miss — line
   444-448). The pipeline degrades to halt-no-alt without ever flagging the
   typo. Add load-time validation: every id in `safeAlternatives` must resolve.
2. **`premiseAxis` is freeform string.** Two frames could share intent under
   different axis labels (`"gis-pain"` vs `"operational-pain-gis"`) and the
   theatre-swap defense quietly fails. Phase B should publish an enum, and the
   validator should pin to it.

## NEW issues found

1. **Judge non-determinism (Q3).** `temperature=0` is necessary but not
   sufficient. Anthropic returns text blocks whose order can shift on retry,
   and `JSON.parse` over a multi-block join is brittle. Worse: the 1-retry loop
   at line 392 will issue **two billable Haiku calls** on every timeout, and
   the second result is taken as truth without comparing to the first. For an
   audit module this is fine; for cost it's a doubling.
2. **`pickSafeAlternative` shares `seen` set with recursion (line 435).** Once
   a depth-1 alt is rejected, depth-2 cannot reconsider it via a different
   parent — could starve legitimate swaps in a dense frame graph. Low risk
   today (3 frames), real risk at Phase B scale.
3. **`Number.isFinite(ms)` swallow at line 244.** A malformed `extracted_at`
   silently excludes the row. Should log + count, not drop.
4. **Test 10's idempotency assertion is fake.** The stub at `refutation.test.ts:107`
   *simulates* `ON CONFLICT DO NOTHING` in memory. The real DB has no such
   constraint. Green test, red production.
5. **`source_citation` lost on judge path.** Judge returns `{id, reason}`; we
   re-hydrate from `top10` (line 639), but if Haiku hallucinates an id not in
   top10 it's silently dropped from refuters — judge swap with empty refuters
   list could ship.

## Integration handoff (refutation → composer → pipeline)

**Currently undocumented.** `refutation.ts` produces `RefutationResult` with
`status: 'swap' | 'clear' | 'halt'`. Composer (`specific-composer.ts:267`
`composeSpecific`, `generalized-composer.ts`) takes no `frame` parameter today
— frame selection is implicit in the prompt scaffolding.

When `swap` returns `{ original, alternative }`, **no caller code rewrites the
composer input.** `run-pipeline-v2.ts` does not import `checkSubstrateRefutation`
(grep confirms zero call sites in the worktree). The follow-up integration
commit must:
- Add `frameId` param to `composeSpecific` / generalized composer.
- Route `swap.alternative` into that param.
- For `halt`, route to `generateFlagSystemBrief` (already exists at
  `run-pipeline-v2.ts:680`) with a new flag reason — without this, halted
  prospects silently disappear from cohort. Q6 answer: **today they would
  disappear.**

## Recommendation for operator

**Hold integration commit until 4 fixes land:**

1. 409-handling rewrite + FK pre-check (the actual bug).
2. Expression-index migration applied to `sr_decision_trace` (or drop the
   idempotency claim from spec §6).
3. `safeAlternatives` referential validation at registry load.
4. `halt` → `system_brief` wiring documented + reserved flag reason.

Algorithm correctness is good. The work to finish is plumbing, not redesign.
Estimated <4h. Phase B can author real frames in parallel.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 16:00 | Claude | Fresh-eyes audit, 4 blockers + 5 new issues |
