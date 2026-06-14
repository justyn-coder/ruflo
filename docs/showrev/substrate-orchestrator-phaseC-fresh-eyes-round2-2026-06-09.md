---
title: Substrate-Orchestrator Phase C — Fresh-Eyes Re-Audit (Round 2)
status: ACTIVE
last_updated: 2026-06-09 18:00 EST
version: v1
---

## Verdict

**Ship.** All four Round-1 blockers closed. Two follow-ups also landed.
Integration wired into `run-pipeline-v2.ts`. Spot-tests against the real DB
pass for both idempotency and FK fail-loud. No new blockers found.

## Per-blocker status (Round 1 → Round 2)

### B1 — 409 silent-swallow rewrite (FK pre-check / fail-loud)
**FIXED.** `refutation.ts:283-307`. On HTTP 409 the body is parsed; if
`code === '23503'` (`foreign_key_violation`) the call throws
`RefutationDBError('insertTrace', …)` with a clear message. Empty-body 409
is treated as the legitimate `ON CONFLICT` ignore. Conservative default
when JSON parse fails. The ALLO/Finley fabrication class is closed.

### B2 — Expression index migration applied
**FIXED.** Verified via `pg_indexes` against project `slttpknnuthbttjuzrnz`:

```
idx_sr_decision_trace_idempotent UNIQUE btree
  (prospect_id, stage, ((metadata ->> 'runId'::text)))
```

Spot-test with real `prospect_id='adam-aalexander-armstrong'`:
- First INSERT … ON CONFLICT … DO NOTHING → row written.
- Second identical INSERT → 0 rows; final `COUNT(*)=1`. Idempotency real.
- Cleanup confirmed.

FK-violation spot-test with `prospect_id='nonexistent-prospect-xyz'`
inside a PL/pgSQL block raised `foreign_key_violation` cleanly.

### B3 — `safeAlternatives` referential validation at load
**FIXED.** `frame-registry.ts:345-356` sweeps every entry on registry
build; any `safeAlternatives` id missing from `_registryMap` throws
`FrameSchemaInvalid` at construction, not at runtime swap.
`registerFrameForTest` (line 387-393) enforces the same check on dynamic
inserts. Phase B typos now crash early with a named pointer.

### B4 — `halt` → `system_brief` wiring (no silent disappearance)
**FIXED.** Phase 3.5 added at `run-pipeline-v2.ts:365-400`. Gated on
`result.refutation_frame` so it lights up automatically when Phase B
emits frame selections. On `halt`: `decideSendStatus` returns
`'substrate_refuted'` (line 540), and `system_brief` (line 589-611) names
the refuter claims, method, and frame for operator review. Halted
prospects flow to `flag` cohort instead of vanishing.

## Follow-ups also closed

- **Judge double-bill on timeout** — `refutation.ts:448` skips retry on
  AbortError/timeout regex match. Same outcome, half the Haiku spend.
- **`pickSafeAlternative` `seen` set** — now per-path via `childSeen =
  new Set(seen)` at line 507. Sibling branches don't poison each other in
  dense frame graphs.
- **`premiseAxis` enum** — `CANONICAL_PREMISE_AXES` declared and frozen
  at line 106; opt-in `ENFORCE_CANONICAL_AXES` flag at line 173 lets
  Phase B migrate at its own pace. Sensible staging.

## Integration spot-checks

- `grep checkSubstrateRefutation run-pipeline-v2.ts` → 1 call site (line 380).
- Halt path → `decideSendStatus === 'substrate_refuted'` → `system_brief`
  block at line 589 surfaces refuter list, reason, method, frame.
- 40/40 refutation tests pass per commit message; tests/stub still simulate
  ON CONFLICT but the real DB now enforces it (B2), so test stub realism
  no longer matters at runtime.
- TypeScript errors observed during compile are pre-existing
  (`ae-config.js` missing; unrelated orchestrator null/number mismatch) —
  none introduced by Phase C changes.

## New risks (none blocking)

1. Phase 3.5 is gated on `result.refutation_frame` being set upstream;
   until Phase B emits this, the gate runs zero times. Acceptable — fail-
   safe default is "skip", not "always halt".
2. `CANONICAL_PREMISE_AXES` enforcement is off by default. Phase B should
   flip the flag once the registry is migrated.

## Recommendation

Phase C is integration-ready. Operator can merge the Phase C worktree.
Phase B should publish real frames with canonical axes and confirm the
gate fires end-to-end on a wet-run prospect before P2 cold-prospecting
relies on the audit layer.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 18:00 | Claude | Round-2 re-audit: 4 blockers + 3 follow-ups verified closed; DB spot-tests pass; integration confirmed |
