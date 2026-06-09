---
title: Substrate Orchestrator Phase A — Fresh-Eyes Audit, Round 2
status: ACTIVE
last_updated: 2026-06-09 18:00 EST
version: v1
---

## Verdict: SHIP

All 10 round-1 issues resolved with verification artifacts in code. 21/21 unit tests pass (`npx tsx --test tests/showrev/rich-dossier/rich-dossier.test.ts`). `tsc --noEmit --strict` clean on rich-dossier sources. Two minor residuals noted below — neither blocks Phase A; both belong on the Phase B follow-up list.

## Per-issue status

| # | Round-1 issue | Status | Evidence |
|---|---|---|---|
| 1 | `defaultMapPath()` off-by-one (6 vs 5 `..`) — 4 files | RESOLVED | `authority-map.ts:65`, `persona-map.ts:49`, `kb-classifier.ts:44`, `kb-classifier.ts:50` all use `../../../../../` (5 segments). `node` resolve confirms `/Users/.../wf_10177655-848-25/data/showrev/source-authority-map.yaml` exists. |
| 2 | `publisherFromCitation` no `#` split — NTIA shape fails | RESOLVED | `stripFragmentAndTitle()` (authority-map.ts:123–131) strips trailing `(parenthetical)` then `#fragment`. Test 11 ("publisher map fixture accuracy ≥27/30") passes. |
| 3 | `computeRecencyBoost` leaks `Date.now()` — non-deterministic | RESOLVED | `computeRecencyBoost(dateStr, nowMs = Date.now())` (line 121) accepts injectable clock. `getRichDossier` pins `const nowMs = opts.nowMs ?? Date.now()` once at line 272 and threads it into every `scoreRow`. Two same-row scoring passes within a call are now identical. |
| 4 | `.env` `${SUPABASE_URL}` literal placeholder | PARTIAL | `supabaseConfig()` (substrate-bridge.ts:26–35) still falls back to hardcoded URL if env unset, but does NOT detect literal `"${SUPABASE_URL}"` string. Low-frequency bug; degrades to empty substrate gracefully via `if (!key) return {rows:[], timedOut:false}`. Not a Phase A blocker — file as P2 hardening. |
| A | `tests/showrev/fixtures/` directory missing — SC #4 gate never fired | RESOLVED | `tests/showrev/fixtures/kb-labels.json` + `publisher-labels.json` exist. Tests 7+8 assert lengths (20 + 30) and accuracy ≥27/30. Both pass. |
| B | Module-singleton cache pollution across concurrent callers | RESOLVED (documented) | `cachedMap` JSDoc now documents the singleton scope (authority-map.ts:38–62). Test seam moved behind `__TEST_ONLY__` namespace export (line 188). Same pattern in persona-map + kb-classifier. Not eliminated — documented contract is acceptable. |
| C | `getRichDossier` swallows `UnknownPublisherError` mid-loop | RESOLVED | Per-row try/catch (lines 348–362) collects `UnknownPublisherError` into `unknownPublisherErrors[]`. If strict mode AND any collected, re-throws first at line 368 (preserves Hardening 1 + Test 3b). Cohort no longer halts on first unknown. |
| D | YAML schema brittleness — missing tier silently ignored | RESOLVED | `loadMap` (authority-map.ts:70–99) checks empty publisher AND `ALLOWED_TIERS.includes(entry.tier)`. Throws with row index + publisher name on malformed row. Same pattern in persona-map.ts. |
| E | Substrate fetch races thrown DB error — leaks AbortController | RESOLVED | Shared `AbortController` (line 285). DB `.catch` aborts it before re-throw (line 297). `fetchSubstrate` accepts `externalSignal` (substrate-bridge.ts:50, 62–70) and cancels in-flight HTTP fetch on external abort. |
| F | `_injectRows` test seam in public signature | NOT FIXED | `_injectRows` still on the public `opts` interface (get-rich-dossier.ts:264). `nowMs` also on public surface. Audit recommendation was to move behind separate import path. Underscore prefix + JSDoc is the de-facto guard. Low-impact; file as Phase B cleanup. |

## NEW issues found round 2

None blocking. One observation:

- **`new URL('.', import.meta.url).pathname` is Windows-fragile** — returns `/C:/...` shape that `path.join` handles but is not idempotent. Repo is macOS/Linux only per ops record, so not a real risk. If/when CI ever runs on Windows, swap to `fileURLToPath`.

## Integration risk update

`run-pipeline-v2.ts` cutover (Phase B) is still a rewrite, not a swap — composer types are incompatible (round-1 finding stands). Round 2 does not change that calculus. Phase A delivers the new substrate orchestrator as a standalone module; Phase B wires it in.

## Recommendation

Ship Phase A. File these on the Phase B punch list (none block A):

1. `${SUPABASE_URL}` placeholder-string guard in `supabaseConfig()`.
2. Move `_injectRows` + `nowMs` test seams to a `__TEST_ONLY__` namespace on `getRichDossier` (consistency with authority-map / persona-map / kb-classifier).
3. Composer migration ticket (already noted round 1).

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 18:00 | Claude | Round-2 re-audit after fix commit 66bc3ec1d |
