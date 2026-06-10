---
title: Session hand-off — evening 2026-06-09 (mid smoke test)
status: ACTIVE
date: 2026-06-09 ~19:55 EDT
author: Claude
red_teamed: true
---

# READ THIS FIRST

You're picking up a context-heavy session that hit rate limits. Everything that's done is committed + pushed to `origin/main`. Operator wants the smoke test fired next — but operator-directive says use **existing portal prospects**, not fresh attendees. The 5 prospects are pre-selected in §3 below.

## Verify clean state before doing anything

```
cd /Users/justynszymczyk/Documents/GitHub/ruflo
git log --oneline -5
# Expect: 734f731b7 -> 56a836885 -> 620b9e17f -> 869e895f7 -> d7b134e14
git log HEAD..origin/main --oneline
# Expect: (empty) — we're in sync
```

If those don't match, **STOP** and investigate before running anything.

---

# 1. What's in `main` (newest commits first)

| Commit | What |
|---|---|
| `734f731b7` | feat(intel-structurer): ICP volume verdict (inform-only per SoT §15) |
| `56a836885` | feat(pipeline): **Phase B + Phase C integration** into composer + pipeline |
| `620b9e17f` | fix(source-of-truth): expunge tower content per operator directive |
| `869e895f7` | feat(stat-library + ae-skills): round-2 citation audit + save AE skills |
| `d7b134e14` | fix(stat-library): citation audit cleanup — 29 to 24 stats |

Tests state at hand-off:
- `npx tsx src/showrev/m1-email-find/evidence-tiering/tests/stat-library.test.ts` → **82/82 PASS**
- `npx tsx src/showrev/m1-email-find/evidence-tiering/tests/refutation.test.ts` → **48/48 PASS**
- `tsc --noEmit` clean on Phase B/C integration files. Pre-existing errors in `orchestrator.ts:821` (null vs undefined) and `premium-pipeline.ts:597/628` (PatternSelection type + 3 implicit `any` params) — NOT introduced by Phase B/C, do not block.

# 2. Phase B + C integration summary

## Phase B (Stat library) — what changed in `influence.ts`

- `PSVariantDef` gained optional `requiresStatTopic` field (a TopicTag).
- `PS_VARIANTS.industry_data_hook`: now `requiresStatTopic: 'permit-cycle'`. Render uses verifiedStat verbatim OR falls back to curiosity-gap line.
- `PS_VARIANTS.loss_frame_anchor`: now `requiresStatTopic: 'bead'`. Same fallback pattern.
- **What this kills:** the hardcoded `P.S. FBA data shows 40-50% of utility permits get rejected first pass` (fabricated, verified 2026-06-09) and `P.S. FBA flagged permit-cycle delay as THE top reason BEAD timelines slip` (overstated).
- New helper: `selectPSVariantWithAudit()` returns `{ps, variantKey, psClaimId}` for DB audit trail.
- Legacy `selectPSVariant()` kept as wrapper for backward compat (still all sync, no async).
- Default `applicabilityTags = ['bead-funded']` — all ShowRev cold prospects are BEAD-impacted.
- Stat library imported lazily via `require` to keep persona-detect cold-start cheap.

## Phase C (Substrate refutation) — what changed in `run-pipeline-v2.ts`

- Phase 3.5 block was wired but dormant on `result.refutation_frame`. Now sets default frame per ICP type:
  - `fiber_operator → 'bead_timeline_v1'` (BEAD obligations on the clock)
  - `ae_firm → 'gis_pain_v1'` (GIS-to-CAD friction)
- Existing handler does the rest: clear → proceed; swap → re-call composer; halt → `send_status='flag'` with naming `system_brief`.

# 3. SMOKE TEST — 5 prospects (operator-selected from existing portal data)

Operator-directive: **use existing portal prospects**, not fresh attendees. These 5 are specifically chosen to exercise Phase B + Phase C end-to-end.

| # | Name | Company | Email | State | Title | Why selected |
|---|---|---|---|---|---|---|
| 1 | Corey Hodge | Fastwyre Broadband | corey.hodge@fastwyre.com | AL | Market Manager | Clean SEND path test (green confidence, fit) |
| 2 | **Darin Jackson** | **ALLO Communications** | darin.jackson@allocommunications.com | NE | Senior Manager of Supply Chain & Logistics | **Phase C MUST halt/swap.** ALLO's substrate has BEAD-delay layoffs (9% July 2025) refuting `bead_timeline_v1`. Existing email contains fabricated P.S. — Phase B should now replace with verified stat or fallback. |
| 3 | **David Wojcik** | **Finley Engineering** | d.wojcik@finleyusa.com | (check) | Engineer | **Phase C MUST halt/swap.** Finley publicly champions "outgrowing AutoCAD, leveraging GIS" — should refute `gis_pain_v1` (Finley is A&E firm). |
| 4 | Doug Spurlin | Frontier Communications | doug.spurlin@frontiergrp.com | MN | Sr. Director of Operations | Mid case (red email originally) |
| 5 | Mark Evans | Fidium Fiber | mark.evans@fidium.com | IL | Director of Business Development | Mid case (red email originally) |

**DNC safety check — confirmed clean for these 5.** The full DNC list lives in `~/.claude/hooks/inorsa_compliance_check.py` (`DNC_COMPANY_NAMES` array, 18 entries). The hook auto-blocks on Write/Edit if any DNC name appears in content. None of our 5 smoke-test companies are on it. Do NOT list DNC names in this hand-off doc — the hook will block the write.

## 3a. CSV format (verified by reading parseCsv in run-pipeline-v2.ts:60-95)

CSV headers are **case-insensitive lowercased**. Required fields:
- `firstname` (or `fname`)
- `lastname` (or `lname`)
- `company` (or `company name`)
- `title` (or `role`) — optional
- `state` — optional

**DO NOT include an `email` column** — per SoT §16, the engine FINDS the email. If you put an email column it's ignored. The smoke test will RE-FIND emails for these 5 prospects (will probably match the cached ones, but verify).

Create the CSV:

```bash
cat > data/showrev/test/phase-bc-smoke-5.csv << 'EOF'
firstname,lastname,company,title,state
Corey,Hodge,Fastwyre Broadband,Market Manager,AL
Darin,Jackson,ALLO Communications,Senior Manager of Supply Chain & Logistics,NE
David,Wojcik,Finley Engineering,Engineer,KS
Doug,Spurlin,Frontier Communications,Sr. Director of Operations,MN
Mark,Evans,Fidium Fiber,Director of Business Development,IL
EOF
```

(David Wojcik's title/state guessed — verify via Supabase if you need precise: `SELECT title, state FROM sr_engine_output WHERE lower(company) = 'finley engineering' AND lower(last_name) = 'wojcik' LIMIT 1;`)

## 3b. Run the pipeline

**Verified CLI** (from `process.argv` parsing at line 1152 + usage string at 1175):

```bash
cd /Users/justynszymczyk/Documents/GitHub/ruflo
npx tsx src/showrev/m1-email-find/evidence-tiering/run-pipeline-v2.ts \
  --input data/showrev/test/phase-bc-smoke-5.csv \
  --limit 5 \
  --verbose
```

**Flag corrections (my earlier draft had these wrong):**
- Flag is `--input <csv-path>`, NOT `--csv`
- There is NO `--run-id` flag — pipeline generates internally (format like `v2-mq6xkhhf`)
- There is NO `--dry-run` flag — **pipeline ALWAYS writes to DB**
- `--skip-apollo` available (if you want to avoid Apollo credit usage during smoke test — but Apollo helps email-find, so leave it on for a real smoke test)
- `--max-apollo-credits N` for cap (e.g., `--max-apollo-credits 50`)
- `--max-mv-credits N` MillionVerifier cap
- `--limit N` for safety constraint
- `--include-flagged` to re-process flagged prospects

Capture the run_id from stdout — looks like `run_id v2-XXXXXXX` in the summary block.

## 3c. Verify Phase B (the fabricated stat is GONE)

```sql
SELECT first_name, last_name, company, email_ps_t1
FROM sr_engine_output
WHERE run_id = 'v2-YOUR-RUN-ID'
  AND lower(company) = 'allo communications';
```

**Pass criteria:** `email_ps_t1` MUST NOT start with the fabricated `P.S. FBA data shows 40-50%` line. Should be either:
- A verified stat from the library (e.g., one of the new Mitrovich/FBA-verified stats) OR
- The fallback curiosity-gap line: `P.S. Built a 4-question diagnostic that pinpoints where your drawing cycle actually breaks. 60 seconds: https://fiber.inorsa.com/assess/...`

## 3d. Verify Phase C (refutation fires on ALLO + Finley)

```sql
SELECT first_name, last_name, company, send_status, system_brief
FROM sr_engine_output
WHERE run_id = 'v2-YOUR-RUN-ID'
  AND lower(company) IN ('allo communications', 'finley engineering');
```

**Pass criteria for ALLO:** `send_status='flag'` AND `system_brief` mentions "refutation" / refuter claims about BEAD delays/layoffs.

**Pass criteria for Finley:** `send_status='flag'` AND `system_brief` mentions "refutation" / Finley's GIS-mastery positioning.

Also check `sr_decision_trace` for the audit entries:

```sql
SELECT prospect_id, decision_kind, payload->>'status' as ref_status, payload->'refuters'
FROM sr_decision_trace
WHERE stage = 'refutation'
  AND created_at > NOW() - INTERVAL '30 minutes'
ORDER BY created_at DESC
LIMIT 10;
```

## 3e. Roll-back if smoke test fails or surfaces issues

The pipeline always writes to live DB. To "undo" a bad run:

```sql
-- Mark the run as rolled-back (preserves audit, hides from portal)
UPDATE sr_engine_output
SET send_status = 'rollback-2026-06-09-smoke'
WHERE run_id = 'v2-YOUR-RUN-ID';
```

# 4. What's NOT pushed but might be in working tree (not blocking)

Working tree at hand-off contains untracked files (operator's overnight work + audit docs from this session). None are code; they're:
- Audit docs (`docs/showrev/*-2026-06-09.md`) — informational
- CSV scratch files in `data/showrev/test/`, `data/showrev/premium/calibration-*`
- Session transcripts in `canon/_session_transcripts/`
- Operator's `data/brain/` updates
- A deleted file `data/showrev/p2-cold/focus-100.csv` (operator's deliberate delete earlier today)
- Modified `agentdb.rvf.lock` (operator's tooling)

**Do NOT commit these without operator approval.** They're either operator's overnight files or audit artifacts that need a separate decision.

# 5. After smoke test passes — critical path

5. **Archive pre-cleanup portal data.** Operator wants the portal to start fresh with new Phase B/C-protected emails. Rename old `run_id` values to `pre-b-c-cleanup-{original}` so portal filters them out by default. Approximate query:
   ```sql
   UPDATE sr_engine_output
   SET run_id = 'pre-b-c-cleanup-' || run_id
   WHERE created_at < '2026-06-09 19:00 EDT'
     AND run_id NOT LIKE 'pre-b-c-cleanup-%';
   ```
   **VERIFY** operator wants this before firing — it touches every existing row.
6. **Fire 180-prospect cohort.** Pull top 180 by priority from `data/showrev/p2-cold/cohort-batches/cohort-batch-001.csv` (300 revenue-leader prospects, persona-prioritized).
7. **Stream review** — first 30 land in portal in ~5 min, 90+ landed by 15-20 min, all 180 done by ~36 min (~60s per prospect with concurrency 5 in current code).

# 6. WHAT COULD GO WRONG (red-team)

| Risk | What you'd see | What to do |
|---|---|---|
| Email finder returns different result than cached | Some of the 5 land with new email addresses | Fine for smoke test — Phase B + C work regardless of email accuracy |
| Phase C halts ALLO but `system_brief` is empty | Status=flag but no naming of refuters | Check `sr_decision_trace` — the audit row should exist. If trace empty, the 409 fix might have regressed. |
| Phase B fallback doesn't trigger for ALLO | P.S. is still the old fabricated FBA line | Pipeline didn't re-compose; check if compose phase actually ran (`durations_ms.compose` > 0) |
| Phase C frame_registry doesn't recognize frame | Error in refutation phase | Confirm frame-registry.ts has 'bead_timeline_v1' and 'gis_pain_v1' registered |
| Compliance hook blocks a write | Hook error in stderr | Check stderr for "§16 violation" or "§10 DNC" — none of our 5 are flagged, but composer might generate forbidden phrases |
| Apollo credits empty | "max apollo credits hit" warning | Add `--max-apollo-credits 100` or check `.env` `APOLLO_API_KEY` |
| MV credits empty | "max mv credits hit" warning | Operator clipboard had MV key earlier; check `.env` `MILLIONVERIFIER_API_KEY` |
| Pre-existing TS errors regress | `tsc` fails on premium-pipeline.ts or orchestrator.ts | NOT introduced by Phase B/C. Don't block on these. |
| Phase C halts ALL 5 prospects | All 5 flagged | Possible if frame defaults are too aggressive. Lean into it — verify the halts are correct. Tune frame selection later. |
| `osascript` text send fails | Bash succeeds but no text arrives | iMessage on macOS — check Console for Messages app errors |

# 7. Operator preferences + constraints (carry forward)

- **Default to TOWER unless explicitly fiber.** All Inorsa content unless labeled fiber should be assumed tower. ShowRev = fiber-only. Pipeline has 5-layer filter + we just expunged tower references from canonical files.
- **Word count:** 60-70 target body, 100 ceiling on body + P.S. excluding URL.
- **Brief responses.** Pyramid Principle, CEO brevity, no fluff.
- **Always quote evidence.** Default-to-expunge unverifiable content.
- **DNC list authority** is in `~/.claude/hooks/inorsa_compliance_check.py` (`DNC_COMPANY_NAMES` array). Hook auto-blocks on Write/Edit. Do NOT enumerate the names in any doc — the hook will block your own write.
- **Text Justyn at +14165666025** via `osascript -e 'tell application "Messages" to send "..." to buddy "+14165666025"'` when integrations complete or blockers hit. The `send-text` skill wraps this.
- **No commits without operator approval on operator-owned files** (anything in `data/brain/`, `canon/_session_transcripts/`, etc.).

# 8. Backlog (deferred, not blocking smoke test)

- 5 paywalled stats (all resolved earlier this session)
- System Brief (Option D — deferred until Substrate Orchestrator integrates → which is now done. Re-spec is operator decision.)
- Backup-clone P1 recovery (operator-deferred)
- Pre-existing TS errors in `premium-pipeline.ts` + `orchestrator.ts:821` (unrelated)
- The 4 auto-memory file rewrites are in operator's `~/.claude/projects/.../memory/` — NOT in git. If the session that wrote them gets compacted, the operator's auto-memory will reflect the cleaned versions. Future sessions inherit the fiber-only versions.

# 9. Quick-glance state for the next session

- **Branch:** `main`
- **HEAD:** `734f731b7`
- **In sync with origin:** YES
- **Tests passing:** stat library 82/82, refutation 48/48
- **Phase B integration:** LIVE in `influence.ts` (lazy stat lookup, fallback on miss)
- **Phase C activation:** LIVE in `run-pipeline-v2.ts` Phase 3.5 (default frames per ICP type)
- **Smoke test target:** 5 prospects in §3 above
- **Operator wants text** confirming smoke test result or any blocker

# I'm here when you start.
