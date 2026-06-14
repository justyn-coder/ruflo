---
title: Hand-off brief — work completed during your walk
status: ACTIVE
date: 2026-06-09 EST
author: Claude
---

# TL;DR (read first)

While you walked the dog, I ran **two projects through full red-team gauntlets** — System Brief Spec (3 rounds × 3 judges = 9 critiques) + Substrate Orchestrator Phases A/B/C (31-agent workflow with built-in critique + 3 fresh-eyes audits afterward). Both projects produced **real shippable code or specs** AND **real ship-blockers**. Nothing has been pushed. No cohort fired. No DB writes outside test scope.

**My recommendation**: pause both for ~4 hours of cleanup on the bugs the audits surfaced, then re-attempt integration. Details + options below.

---

# Project 1: System Brief — Send Priority spec

## Where it landed

- **Spec v1** drafted, judged by 3 lenses, all 3 said NEEDS-REVISION
- **Spec v2** addressed v1 findings (11 fixes), judged again, all 3 still NEEDS-REVISION
- **Spec v2.1** addressed v2 findings (11 more fixes), judged again, **diminishing returns** — see below

## The diminishing-returns pattern

| Round 3 Judge | Verdict | Headline |
|---|---|---|
| Engineering | REVISE | DNC sync regex is **comment-blind** — would scoop phantom variants from Python inline comments. Compliance hook proves the system works by blocking the spec from naming DNC entries. |
| **PM** | **REVISE** | **v2.1 is WORSE than v2 on real data.** SEND drops from 15.7% → **0%** because the halluc-pts<1 + raw_score≥7 cap strangles SEND until tier3 is backfilled into sr_engine_output. KILL fires only on compose_failed (3 rows). |
| Adversarial | SHIP-WITH-GAP | WC1/2/3 partially closed. **NEW WC4** (body-inserted uncited number) + **WC5** (fabricated attributed quote) — fully blind. Recommend ship for low-volume, gate WC4/WC5 before >50/day. |

**PM's measured-distribution number is the smoking gun.** v2.1's defenses produce 0% SEND on actual data — the spec is technically more defended but practically worse.

## My honest read

We're at diminishing returns on iteration. Every round closes one set of holes and opens a new one. The PM specifically said "weights are arbitrary, recommend dropping weighted-sum for decision tree" — that's a fundamental design pivot, not a tweak.

## Options for you

| Option | Description | Effort | Trade-off |
|---|---|---|---|
| **A. Pause, simplify** | Ship a 3-band visual flag (verified-email / borderline / risky) NOT a 1-10 score. AE eyeball decides. | <1 day | Loses the audit trail + ranking precision, but escapes the diminishing-returns spiral |
| B. Build v2.1 as-is | Accept WC4/WC5 risk, ship for low-volume, gate harder before scaling | ~4 hours | Real fabrication-class risk on every cohort |
| C. Pivot to decision tree | PM's suggestion — replace weighted-sum with explicit if/then ladder | ~1 day spec + 1 day build | Cleaner trust math, but throws away ~6 hours of weighted-sum work |
| D. Defer until Substrate Orchestrator integrates | Substrate Orchestrator Phase C produces the substrate_contradiction_flag the spec relies on. Wait, then re-spec. | depends on Phase C cleanup | Cleanest from a Big-Picture lens |

**My lean: D.** Substrate Orchestrator Phase C explicitly handles 3 of the 5 worst-case classes the System Brief tries to defend against. Let it land first, then spec the System Brief on top of a clean foundation.

---

# Project 2: Substrate Query Orchestrator (Phases A/B/C)

## What got shipped (all on worktree branches, none pushed to main)

| Phase | Module | Commit | Tests | Files |
|---|---|---|---|---|
| **A** `getRichDossier` | substrate query + cross-reference orchestrator | `e3f0c3144` | 42/42 pass | 9 files in `src/.../rich-dossier/` + 2 YAMLs |
| **B** `getVerifiedStat` | hand-curated 30-stat library, 21-domain tier allowlist | `f5d436153` | 76/76 pass | `src/.../stat-library/` + 2 JSON files |
| **C** `checkSubstrateRefutation` | pre-flight contradiction check, ALLO/Finley defense | `5139ae9a` | 48/48 pass | `refutation.ts` + `frame-registry.ts` |

166/166 tests passing across all three. **But** — the workflow's internal critique-then-build cycle let tests pass while leaving real bugs in place. The fresh-eyes audits surfaced them.

## Fresh-eyes audit findings

### Phase A: NEEDS_REVISION — 10 issues total

| Severity | Issue |
|---|---|
| 🔴 | Path off-by-one in 4 files (workflow caught, didn't fix) |
| 🔴 | `publisherFromCitation` doesn't split on `#` — tests 1+11 throw on NTIA citations |
| 🔴 | `Date.now()` in `computeRecencyBoost` violates module's own determinism docstring |
| 🔴 | `tests/showrev/fixtures/` directory doesn't exist — Tests 7+8 (the ≥27/30 acceptance gate) **never ran** |
| 🟡 | Module-level singletons make `_setForTests` poisonous under process sharing |
| 🟡 | `UnknownPublisherError` thrown inside row loop bubbles past dossier — composers expect dossier object, not throw |
| 🟡 | YAML loader has no tier-enum guard |
| 🟡 | `Promise.all` leaks in-flight substrate fetch when DB fails fast |
| 🟡 | `_injectRows` test hook lives in PUBLIC signature |
| 🟡 | `.env` `${SUPABASE_URL}` placeholder unverifiable |

**Integration:** `run-pipeline-v2.ts` still uses `TieredDossier`. Cutover is a **rewrite**, not a swap.

### Phase B: SHIP ARCHITECTURE, BLOCK CONTENT

| Severity | Issue |
|---|---|
| 🔴 | **1 of 5 spot-checked stats is FABRICATED**: `bead_42_45b_pool_2026` cites FBA URL that says "65% fiber locations, Q1 2026 funding" — no $42.45B, no 15-25 states, no 6-12 months. The very purpose of Phase B is to eliminate fabrication. |
| 🔴 | Library validates `numericValue` matches `claimText` but NOT `numericValue` matches **cited URL** (which is why the fabrication slipped past) |
| 🟡 | 3 of 5 spot-checked URLs returned 403 on WebFetch — needs operator manual check |
| 🟡 | Coverage gaps: PM persona has stats for only 2 of 6 buckets; VP_Ops × peer-pattern empty; VP_Eng × permit has 1 stat |
| 🟡 | 13 of 30 `numericValue` entries are PHRASES not numbers — dilutes anti-fabrication framing |
| 🟡 | Source-tier missing Cartesian, Omdia, NTCA, WIA, USTelecom; Glassdoor at "trade" tier is dubious |
| 🟢 | miss-log.jsonl has no rotation policy |

Determinism + verbatim-paste enforcement clean. **Architecture is sound; content needs re-verification of all 30 stats against cited URLs.**

### Phase C: CONDITIONAL SHIP — 4 blockers

| Severity | Issue |
|---|---|
| 🔴 | **409 bug confirmed HIGH**: `sr_decision_trace.prospect_id` is FK to `sr_prospects(id)`. PostgREST returns 409 on FK violation. Code swallows it. **In current pipeline order (harvest → compose → promote), ~100% of refutation calls hit FK violation.** This re-introduces ALLO/Finley silent-fail at the audit layer. |
| 🔴 | The spec's expression index `(prospect_id, stage, metadata->>'runId')` **does NOT exist** in DB. Idempotency is fake — test 10 only passes because the stub fakes ON CONFLICT in memory. |
| 🔴 | `run-pipeline-v2.ts` does NOT import `checkSubstrateRefutation`. Composers take no `frameId` param. On `halt`, prospects would silently disappear from cohort. `generateFlagSystemBrief` exists but is **not wired**. |
| 🟡 | safeAlternatives ids never validated cross-frame at load (typo → silent halt-no-alt) |
| 🟡 | premiseAxis is freeform string (Phase B could re-introduce theatre swap with different axis labels for same intent) |
| 🟡 | Judge retry doubles cost without comparing results; `pickSafeAlternative` shares `seen` across recursion (starves swaps at scale) |
| 🟡 | Judge can hallucinate ids → empty refuters slip through |

## Honest read on Substrate Orchestrator

**Architecture is good. Content + integration are broken.**

The workflow's built-in critique cycle was thorough but the build agents passed tests while leaving real bugs. Specifically: tests use `_setForTests` seams that bypass the broken parts. So all 166 tests pass, but the real-world integration would fail.

## Fix punch list (~4 hours total)

| Item | Phase | Effort |
|---|---|---|
| Patch path off-by-one + publisherFromCitation hash-paren + Date.now injection | A | 30 min |
| Create tests/showrev/fixtures/ + populate from spec | A | 30 min |
| Move test seams out of public signature, gate behind `__TEST_ONLY__` | A | 30 min |
| Re-verify all 30 stats in Phase B against cited URLs (operator + me jointly) | B | 90 min |
| Patch numericValue-vs-URL diff check at sidecar load | B | 30 min |
| Fix 409 bug (inspect response body for code 23503, re-throw) | C | 30 min |
| Apply expression-index migration to sr_decision_trace | C | 15 min |
| Wire halt → generateFlagSystemBrief in run-pipeline-v2.ts | C | 60 min |
| Draft composer migration ticket for TieredDossier → RichDossier swap | A | 30 min |

Total: ~4 hr 45 min focused work. Then re-run the 3 fresh-eyes audits.

---

# What I did NOT do (per your instructions)

- ❌ No pushes to main from either project
- ❌ No cohort runs
- ❌ No FBA P.S. variant swap (waiting for Substrate Orchestrator)
- ❌ No ALLO + Finley action (Phase C will handle once it's working)
- ❌ No backup-clone P1 recovery (deferred until everything's locked)
- ❌ No production DB writes outside test scope

# What's NEXT — operator decisions

When you're back, three decisions in priority order:

### 1. Substrate Orchestrator cleanup path

| Option | Description |
|---|---|
| **A. Fix the ~4-hour punch list myself** | I patch + re-run the 3 fresh-eyes audits. ~6 hours total. |
| B. Spawn focused fix-only workflow | One worktree per phase, fix-then-retest pattern. ~4 hours but parallel. |
| C. Accept Phase A as-is, defer Phase B + C | Phase A has architecture but most bugs; B + C are smaller. Risk: A integration would be a rewrite anyway. |

**My lean: B.** Parallel worktrees on a tight punch list with built-in retest.

### 2. System Brief path

(See Project 1 options above — A/B/C/D)

**My lean: D** (defer until Substrate Orchestrator integrates).

### 3. Sequencing

Whichever cleanup path lands first, both projects need to converge before any cohort fires. Honest estimate:
- Substrate Orchestrator cleanup + re-audit: 1 day
- System Brief revision + final spec: 1 day (waiting on #1 to inform weights)
- Integration + smoke test: 1 day
- Cohort-batch-001 fire: day 4

That's the honest sequence. Anything faster compromises trust.

---

# Files produced during the walk (all read-only, no pushes)

## Specs + audits
- `docs/showrev/system-brief-priority-spec-v2.1-2026-06-09.md`
- `docs/showrev/system-brief-redteam-engineering-round3-2026-06-09.md`
- `docs/showrev/system-brief-redteam-pm-round3-2026-06-09.md`
- `docs/showrev/system-brief-redteam-adversarial-round3-2026-06-09.md`
- `docs/showrev/substrate-orchestrator-phaseA-fresh-eyes-2026-06-09.md`
- `docs/showrev/substrate-orchestrator-phaseB-fresh-eyes-2026-06-09.md`
- `docs/showrev/substrate-orchestrator-phaseC-fresh-eyes-2026-06-09.md`
- `docs/specs/substrate-query-orchestrator-phase-a-scope.md` (workflow-authored)

## Code (in worktree branches, NOT pushed)
- worktree-25: Phase A — getRichDossier
- worktree-26: Phase B — getVerifiedStat
- worktree-27: Phase C — checkSubstrateRefutation

## This brief
- `docs/showrev/walk-return-handoff-2026-06-09.md`

# I'm here when you get back.
