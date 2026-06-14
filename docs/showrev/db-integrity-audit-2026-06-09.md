---
title: ShowRev Supabase DB Integrity Audit
status: ACTIVE
last_updated: 2026-06-09 PM EST
version: v1
---

# Supabase DB Integrity Audit — 2026-06-09

**Project:** `slttpknnuthbttjuzrnz`
**Pipeline reviewed:** `src/showrev/m1-email-find/evidence-tiering/run-pipeline-v2.ts` (1,165 lines)
**Row totals:** sr_engine_output=344 · sr_prospects=180 · sr_microsites=76 · sr_company_evidence=756 · sr_company_contacts=620
**Distinct engine prospect_ids:** 78 across 11 run_ids (avg 4.4 rows/prospect — re-runs accumulating)

---

## CHECK 1 — Schema completeness

Code writes (`persistToSupabase` body lines 687–737, `prospectBody` 776–796, `micrositeRow` 933–950) cross-referenced against `information_schema.columns`.

🟢 **All fields the pipeline writes exist in their target tables.** No missing-column writes detected. `system_brief` is now present in BOTH `sr_engine_output` and `sr_prospects` (the earlier gap is closed).

NOT NULL columns the code may not populate:
- `sr_engine_output.prospect_id`, `run_id` — code always sets. OK.
- `sr_prospects.tier` — code always writes `'A'`. OK.
- `sr_prospects.first_name`, `last_name`, `email`, `company` — code writes them; `email` can be `''` when not found, which satisfies NOT NULL but is semantically null. 🟡 LOW.
- `sr_company_contacts.name`, `company_name`, `source_kind`, `source_citation` NOT NULL — not written by this pipeline file (different module). Out of scope.
- `sr_microsites.slug`, `company_name` NOT NULL — code always provides.

🟢 No NOT-NULL violation risk found in `run-pipeline-v2.ts`.

---

## CHECK 2 — Orphan + dangling rows

| Check | Count | Severity |
|---|---|---|
| sr_engine_output rows with no matching sr_prospects | **1** (`joshua-turiano-blue-stream-fiber`, run `v2-mq6xkhhf`, icp=pass, send_status=flag) | 🟡 MEDIUM |
| sr_prospects rows with no matching sr_engine_output | **103** | 🟢 EXPECTED |
| sr_microsites with null prospect_id | 0 | 🟢 |
| sr_microsites with dangling prospect_id | 0 | 🟢 |
| sr_company_contacts with email AND name both blank | 0 | 🟢 |

The 103 prospects-without-engine break down: P1/A=77, P1/Cold=6, P1/Hot=1, P1/NEW dnc=1, P1/NEW send=2, P1/Warm=5, P2/A=11. These are legitimate — P1 prospects came from a different loader and were never run through `v2`. **Not orphans, just pre-engine data.**

The 1 orphan engine row (Joshua Turiano) is a real bug — `persistToSupabase` upserted the engine row but the `sr_prospects` upsert at line 797 either failed silently (warn-only, line 810) or the early `return` at line 765 fired because `icp_verdict !== 'pass'` was true at that moment. Worth a code-path audit.

Evidence "dead substrate" check: 340/344 engine rows have JSON `research_summary` with a `body_sentences[].claim_ids` array. Spot-check shows `claim_ids: []` empty in tested rows — the composer is not actually citing evidence IDs back. **756 evidence rows, 0 confirmed back-references.** 🟡 MEDIUM — evidence is being collected but not provably wired into sentence-level citations. Possibly fine if used pre-LLM only.

---

## CHECK 3 — Null integrity

🔴 **CRITICAL — `send_status` is NULL in 314/344 engine rows (91%)** despite line 723 unconditionally writing `finalSendStatus`. Per-run breakdown shows 10/11 runs have 100% NULL send_status. Only run `v2-mq6xkhhf` (30 rows) writes it correctly. **This means the line-687 `body` object's `send_status` field is being stripped before upsert in 10 of 11 runs.** Most likely cause: the runs predate the 2026-06-09 unified-send_status fix; the column was added but old runs were not backfilled. Verify with `MIN(created_at)` per run — all are 2026-06-09 so this is a same-day code-version skew. 🔴 PIPELINE FAILURE: portal queries filtering on `sr_engine_output.send_status` see almost nothing.

🔴 **CRITICAL — `system_brief` NULL in 316/344 (92%)** engine rows and 180/180 (100%) prospects rows. The fix from earlier today is not landing on prospects writes at all. Line 790 writes `system_brief: systemBrief` but `systemBrief` is `null` unless `flagged === true` (line 680). For non-flagged pending rows there is no brief — that's intended. But 100% NULL on prospects means even flagged ones never made it. Worth a closer look at whether the `flagged` branch fires.

🟡 **MEDIUM — `persona_bucket` NULL in 119/344 (35%) engine rows and 177/180 (98%) prospects rows.** `persona_bucket` is written by `sr_engine_output` (line 716) but NOT by `prospectBody` (lines 776–796). Portal can read it from engine but the prospects table is effectively persona-blind. 🟡 Add to prospectBody.

🟡 **MEDIUM — `assigned_ae` NULL in 89/180 (49%) prospects.** Same root cause: `prospectBody` sets `assigned_ae` only when AE is resolved — but the older P1 loader didn't populate it.

🟢 `icp_volume_verdict` NULL in 1/344 (0.3%) — fine.
🟢 `confidence_color` NULL in 0/344 — fine.
🟢 `email` not literally null (uses `''`) — semantic OK.
🟢 `icp_status` 0 nulls — fine.

---

## CHECK 4 — Cross-table consistency

🔴 **CRITICAL — 342/344 engine rows disagree with their prospect on send_status.** Of these:
- 314 are `engine=NULL vs prospect=pending` — the engine-side write of `send_status` is dropping (see CHECK 3).
- 28 are `engine=flag vs prospect=pending` — flag fired on engine but the prospect upsert either silently failed (warn-only error path, line 810) OR the early `return` at line 765 (`icp_verdict !== 'pass'`) skipped the prospect upsert leaving the previous `'pending'` in place.

Latest-engine-row dedup (one row per prospect, most recent) confirms: 76/77 prospects disagree with their latest engine row. Same root causes.

🟢 `prospect_id` referential integrity: every engine.prospect_id except the 1 Joshua Turiano case exists in sr_prospects.
🟢 sr_microsites.prospect_id FK to sr_prospects is enforced by the schema (foreign key constraint confirmed).
🟢 sr_microsites.dossier_id FK to sr_dossiers also enforced.

---

## CHECK 5 — Stale / legacy data

🟢 **No rows older than 30 days in any of the 5 tables.** Engine + prospects + microsites all dated 2026-06-08 or 2026-06-09. The pipeline is brand new.

11 distinct run_ids, all from 2026-06-08–09. The 10 oldest runs (predating the send_status fix) account for 314 of the 344 engine rows. Consider purging or backfilling.

No test/example/placeholder data detected (`%test%`, `%example%` matches returned 0 across all 3 tables).

🟡 **Re-run accumulation:** 344 engine rows but only 78 distinct prospect_ids — avg 4.4 rows/prospect. Top offenders: dan-gillan-dobson-fiber (8), 3 others at 7, 6 at 6. Each run is creating a new row (the `(prospect_id, run_id)` unique constraint allows this). This is by design but the portal needs to know to use latest-only. Recommend a `latest_engine_per_prospect` materialized view.

---

## CHECK 6 — Indexes

Existing indexes are reasonable:

- **sr_engine_output:** PK(id), UNIQUE(prospect_id, run_id), idx(send_status). 🟡 Missing: `prospect_id` alone (the unique partial covers it but portal often queries by prospect_id without run_id), `created_at DESC` (for "latest row per prospect").
- **sr_prospects:** PK(id), idx(company), idx(icp_status), idx(state), idx(tier). 🟡 Missing: `send_status` (portal filters heavily on this), `campaign` (P1/P2 split), `(campaign, send_status)` composite.
- **sr_microsites:** PK(id), UNIQUE(slug), idx(slug), idx(status). 🟢 Adequate.
- **sr_company_evidence:** PK(id), idx(company_normalized), idx(category), idx(source_kind), idx(extracted_at DESC). 🟢 Strong.
- **sr_company_contacts:** PK(id), UNIQUE(lower(name), company_normalized), idx(company_normalized), idx(email), idx(linkedin). 🟢 Strong.

🟡 Recommended additions:
```sql
CREATE INDEX idx_sr_engine_output_prospect_id ON sr_engine_output(prospect_id);
CREATE INDEX idx_sr_engine_output_created_at ON sr_engine_output(created_at DESC);
CREATE INDEX idx_sr_prospects_send_status ON sr_prospects(send_status);
CREATE INDEX idx_sr_prospects_campaign_send ON sr_prospects(campaign, send_status);
```

---

## Priority Summary

🔴 **CRITICAL (fix before next run):**
1. `send_status` NULL on 314/344 engine rows. Pipeline-side write of `finalSendStatus` not landing for 10 of 11 runs. Backfill from `sr_prospects.send_status` or re-run; ALSO confirm current code path actually writes the field.
2. `send_status` engine↔prospect disagreement on 342/344 rows. Same root cause + the warn-only error path at line 810 hides prospect-upsert failures. Promote to error or add retry.
3. 28 prospects show `engine=flag, prospect=pending` — flagged work invisible in the portal. Re-emit prospect upsert for flagged rows.

🟡 **MEDIUM (data quality):**
4. `system_brief` NULL on 180/180 prospects — the flagged-branch write at line 790 is not firing. Audit `shouldFlag()` + `generateFlagSystemBrief()`.
5. `persona_bucket` missing from `prospectBody` (line 776 block). Add it — portal expects it.
6. 1 orphan engine row (Joshua Turiano) — investigate code path that wrote engine but skipped prospect.
7. Evidence rows (756) with 0 confirmed back-references via `claim_ids`. Either wire composer to cite or document it as pre-LLM input only.
8. 49% of prospects have NULL `assigned_ae` — backfill from `sr_engine_output.assigned_ae`.

🟢 **LOW (cleanup):**
9. 344 engine rows for 78 prospects from same-day reruns. Add a "latest engine per prospect" view or purge old runs.
10. Add 4 recommended indexes (Check 6).
11. 4 engine rows with non-JSON `research_summary` text. Coerce to JSON or document the legacy shape.

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 PM | Claude | Initial audit covering 6 checks; 3 critical, 5 medium, 3 low issues identified |
