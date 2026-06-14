---
title: Code Wiring Audit — ShowRev m1-email-find
status: ACTIVE
last_updated: 2026-06-09 16:00 EST
version: v1
---

# Code Wiring Audit — 2026-06-09

Scope: `src/showrev/m1-email-find/evidence-tiering/`, `src/showrev/m1-email-find/email-finder/`, `src/showrev/m1-email-find/` root, `scripts/`.

Method: read-only grep audit. Verified each finding by tracing imports + call sites.

---

## CHECK 5 (lead with the load-bearing part) — Recent SPM-pass agent merges

All 6 recent commits land cleanly. No ghost wiring.

| Site | Wired? | Notes |
|---|---|---|
| `tiered-judge.ts` `runTier3HallucinationCheck` | YES | Called from `runTieredJudgeOnProspect` line 597 (always-on when substrate present). Drives `action='flag-hallucination'`. |
| `runTieredJudgeOnProspect` -> pipeline | YES | `run-pipeline-v2.ts:400`. Result mapped to `send_status='pending'\|'flag'` at line 415-417. |
| `send_status='flag'` from halluc | YES | `flag-hallucination` collapses into the unified `flag` value (line 417 + 682). Distinction preserved in `classifyFlagReason` line 493 for the brief. |
| `MvCreditTracker` constructed | YES | `run-pipeline-v2.ts:1133`, passed to `findEmail` via `mvCreditTracker` option. Honored in `orchestrator.ts:189,315,968,1046,1094` (5 guard points). |
| `checkParticipialDensity` | YES | Called in BOTH `generalized-composer.ts:385` and `specific-composer.ts:364`. |
| `checkSentenceLengthVariance` | YES | `generalized-composer.ts:387`, `specific-composer.ts:366`. |
| `checkEchoedStructures` | YES | `generalized-composer.ts:389`, `specific-composer.ts:368`. |
| `checkReadingAge` | YES | `generalized-composer.ts:392`, `specific-composer.ts:371`. |
| `pickSubjectWinner` (A/B subjects) | YES | `generalized-composer.ts:465`, `specific-composer.ts:437`. |
| `composeMicrosite` | YES | `run-pipeline-v2.ts:891`. Result lands in `sr_microsites` via `persistMicrosite` (REST upsert at line 953). |
| `scripts/spam-score-sample.ts --dry-run` | YES | Flag wired at line 107; `--dry-run` short-circuits at line 511. |

No critical SPM-pass wiring gaps.

---

## CHECK 1 — Exported but never imported externally

### evidence-tiering/

`composer-constraints.ts`
- 🟢 `scoreSubject` (L626), `SubjectScore` (L621), `ALL_BANNED` (L86), `countSyllables` (L474), `fleschKincaidGrade` (L493), `bannedPhrasesPromptBlock` (L106) — used internally only. **Recommend: drop `export` keyword** (visibility-too-public, not dead).
- 🟢 `enforceMaxParagraphs`/`enforceMinParagraphs` — not found; ignore.

`tiered-judge.ts`
- 🟢 `runTier1`, `runTier2`, `runTier3` (L153, L246, L306) — called only from `runTieredJudgeOnProspect` in the same file. **Recommend: drop `export`** unless tests need them.
- 🟢 `getJudgeMonitorState` (L834) — no consumers. **Recommend: keep-as-debug-util** (cheap, useful in REPL).
- 🟢 Types `Tier1Result`, `Tier2Result`, `Tier3Result`, `Tier3HallucinationResult`, `ProspectContext`, `RunTieredJudgeOptions` — internal-only. Drop `export` or leave for future tests.

`microsite-composer.ts` (evidence-tiering) — `composeMicrosite` wired. Clean.

### email-finder/

`index.ts` (the 35-line barrel)
- 🟡 **Nobody imports from `./email-finder/index.js`**. All consumers go direct to `orchestrator.js`, `million-verifier.js`, `apollo-fallback.js`, `peer-pattern.js`. Barrel re-exports of `findEmail`, `findEmails`, `summarizeResults`, `resolveDomain`, `verifyEmail`, `verifyBatch`, `detectMailProvider`, `generateCandidates`, `detectPatternFromWeb`, `inferPattern`, `queryCompanyPeers`, `inferPatternFromPeers`, `applyPatternToProspect`, `createApolloEnrichFn`, `verifyBatchMV`, `summarizeMVResults` are technically used elsewhere but not via this file. **Recommend: delete `index.ts` or document it as the intended public API and migrate imports.**
- 🟢 `summarizeResults`, `verifyBatch`, `verifyBatchMV`, `summarizeMVResults` — exported by the sub-modules and never called anywhere (only re-exported by the orphan barrel). **Recommend: delete** (or keep if you want them as a benchmark API).

`peer-pattern.ts` — `normalizeCompanyName` is also defined in `evidence-tiering/substrate-query.ts:180` (independent reimplementation). 🟡 **Naming collision** — different normalization rules. Not a wiring bug but worth a rename.

### Root m1-email-find/

Modules with no inbound imports (CLI entry points by `process.argv[1]` check):
- 🟢 `substrate-loader.ts` (L146 self-detect) — CLI util.
- 🟢 `p2-processor.ts` — CLI per docstring.
- 🟢 `verify-emails.ts` — superseded standalone verifier (microsite arch doc explicitly notes "NOT wired — redundant with MV integration"). **Recommend: delete** (Findymail-based, replaced by MillionVerifier).
- 🟢 `verify-wiring.ts` — meta-grep verifier ("PROVE IT Protocol"). **Recommend: keep-as-CLI-util**.
- 🟢 `validate-only.ts`, `run-quality-check.ts`, `run-verification-sweep.ts`, `backfill-intel.ts`, `test-wave2.ts`, `test-thesis.ts`, `test-quality-checker.ts`, `watcher.ts` — operator-intent CLIs; keep.

Modules wired into `premium-pipeline.ts` and/or `run-pipeline.ts` (the old v1 entry):
- All of `composer.ts`, `lean-composer.ts`, `judge.ts`, `judges.ts`, `researcher.ts`, `personas.ts`, `influence.ts`, `intel-structurer.ts`, `brain-ingest.ts`, `brain-agentdb.ts`, `hubspot-loader.ts`, `prioritizer.ts`, `icp-gate.ts`, `importer.ts`, `microsite-composer.ts` (root), `supabase-adapter.ts`, `semantic-verifier.ts`, `llm-client.ts`, `verify-facts.ts`, `ae-config.ts`, `logo-resolver.ts`, `cross-model-judge.ts`. Wired.
- 🟢 `pipeline.ts` (root) — older entry. Imports `importer`/`researcher`/`composer`/`judge`. **Status: parallel v1 path**, still callable. Keep.
- 🟢 `dossier-schema.ts` — used by older composer paths. Keep.
- 🟢 `prompt-optimizer.ts` — no inbound imports found. **Recommend: investigate** (may be CLI tool — header says "experimental").
- 🟢 `substrate-harvester.ts`, `substrate-indexer.ts` — no inbound imports. Likely Brain-side CLIs. Keep-as-CLI-util.

---

## CHECK 2 — Imported but never called

Sampled 4 highest-traffic files (`tiered-judge.ts`, `run-pipeline-v2.ts`, `generalized-composer.ts`, `specific-composer.ts`). All named imports referenced in body. No imported-but-dead findings.

`logo-resolver.ts` — `verifyLogoUrl` exported and only used internally by `resolveOrVerify`. 🟢 Drop `export` or leave.

---

## CHECK 3 — Conditional / unreachable + silent catches

Silent `catch {}` blocks (no body, no log):
- 🟡 `email-finder/benchmark-8.ts:49` — CLI benchmark; acceptable.
- 🟢 `email-finder/orchestrator.ts:417`, `email-finder/smtp-verifier.ts:86`, `email-finder/domain-resolver.ts:254,379,1208`, `email-finder/pattern-detector.ts:489,731,780,820` — `} catch {` followed by continue/return-null. Inspected: each is a per-candidate probe where any error means "skip this candidate". Intentional. Keep.
- 🟢 `evidence-tiering/tiered-judge.ts:361,470` — JSON parse fallback returns a `split` verdict (fail-open). Intentional per the design comment. Keep.
- 🟢 `evidence-tiering/substrate-query.ts:402,495`, `generalized-composer.ts:159`, `complete-substrate-tagging.ts:163`, `morning-status.ts:147`, `load-email-workflow-sql.ts:229` — all probe-style or fallback-to-default. Intentional.

No always-true/always-false conditional dead branches found in the SPM-pass code.

No "function that throws at the end" patterns found.

---

## CHECK 4 — Module-level dead code

Pipeline-orphan modules (no inbound imports, not declared CLI):

| File | Status | Recommend | Severity |
|---|---|---|---|
| `email-finder/benchmark-8.ts` | benchmark only | keep-as-CLI-util | 🟢 |
| `email-finder/benchmark-83.ts` | benchmark only | keep-as-CLI-util | 🟢 |
| `email-finder/test-harness.ts` | dev harness | keep-as-CLI-util | 🟢 |
| `email-finder/tactic-eval.ts` | dev harness, referenced in domain-resolver comment | keep-as-CLI-util | 🟢 |
| `email-finder/index.ts` | barrel — no consumers | **delete or migrate imports to barrel** | 🟡 |
| `evidence-tiering/test-microsite-ab.ts` | test entry | keep-as-CLI-util | 🟢 |
| `evidence-tiering/test-orchestrator-e2e.ts` | test entry | keep-as-CLI-util | 🟢 |
| `evidence-tiering/test-generalized.ts` | test entry | keep-as-CLI-util | 🟢 |
| `m1-email-find/verify-emails.ts` | superseded by MV (arch doc says so) | **delete** | 🟡 |
| `m1-email-find/prompt-optimizer.ts` | unclear consumer | investigate or delete | 🟡 |

No half-wired-pipeline modules detected. The substrate-first pipeline (`run-pipeline-v2.ts`) is fully integrated.

---

## Summary

**No 🔴 critical findings. All recent SPM-pass agent merges (84805aeff..HEAD) are properly wired into the pipeline.**

Top action items, in priority order:

1. 🟡 Delete or repurpose `src/showrev/m1-email-find/email-finder/index.ts` — barrel re-exports nobody imports.
2. 🟡 Delete `src/showrev/m1-email-find/verify-emails.ts` — Findymail-based standalone verifier explicitly superseded by MillionVerifier integration (per `microsite/public/architecture/data.js:333`).
3. 🟡 Investigate `src/showrev/m1-email-find/prompt-optimizer.ts` — no inbound imports, unclear if CLI or dead.
4. 🟡 Rename one of the two `normalizeCompanyName` functions (`peer-pattern.ts` vs `substrate-query.ts:180`) — different normalization rules, collision risk on future barrel imports.
5. 🟢 Tighten visibility (drop `export` keyword) on internal-only helpers in `composer-constraints.ts` (`scoreSubject`, `ALL_BANNED`, `countSyllables`, `fleschKincaidGrade`, `bannedPhrasesPromptBlock`) and `tiered-judge.ts` (`runTier1`, `runTier2`, `runTier3`, `getJudgeMonitorState`, Tier* types).

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 16:00 | Claude | Initial wiring audit covering 5 checks. |
