---
title: ShowRev P2 FIX-Sprint v1 — 2026-06-13
status: DRAFT v1 — pending rubric build + judge panel + operator red-team
last_updated: 2026-06-13 EDT
version: v1
source_audit: data/showrev/forensic-2026-06-13-claude/audit-report.md
tool_audit_input: data/showrev/forensic-2026-06-13-claude/tool-audit.md
authored_by: Claude (Opus 4.7) — fix-plan session, post-audit
operator_decisions_locked:
  - Start now, sprint shape (not trickle)
  - Operator owns all loop decisions (no direct Tim/Nick contact from Claude)
  - P1 send-results = warm-ceiling reference, label clearly (not P2 benchmark)
  - Microsite live-flip = per-prospect manual approval default, batch option exists
  - Sunday smoke = 2026-06-14 6-9pm recipient LOCAL (NOT 8-10am)
  - Substrate / data fixes FIRST, Tim re-judge LAST (operator correction 2026-06-13)
  - Smoke roster size = 15
  - HS mistakes scope = 5 wrong Mike contacts + 2 invented-tag contacts; DO NOT overwrite Joe Kunz
  - Judge scripts inline REST in ruflo (not showrev/engine — keeps stay_inside_ruflo_repo)
  - Judge iteration cap = 3 rounds then escalate to operator
  - Model = stay on Opus 4.7 for this session
  - Stop-hook R5-lite IN scope (within-session judge learning loop)
---

# ShowRev P2 FIX-Sprint v1

> **Capability spine** — every item below maps to one of the four binding capabilities from the audit:
> (1) **Measure outcomes** (M) — observability writes
> (2) **Know what is true** (K) — verified data, defensible claims
> (3) **Close the loop** (L) — bounce/reply → composer choices
> (4) **Scale humans** (S) — portal absorbs review load

---

## Sprint shape

Four concurrent workstreams + one terminal gate:

| Workstream | Time | Owner | Capability |
|---|---|---|---|
| **W1. URGENT-1: P1 microsite restoration** | ~1 hr | Claude (Supabase ops) | K + S |
| **W2. MAIN fix-sprint** (F1-F10 + Stop-hook R5-lite, substrate-first order) | ~13 hrs | Claude (code + verify) | M + K + L + S |
| **W3. AE proxy enrollment test** (parallel design + execute) | ~3 hrs | Claude (design) + operator (sign-off) | S |
| **W4. HS mistakes remediation** (pre-Sunday-evening) | ~30 min | Claude (HS MCP) + operator (per-case approve) | K |
| **GATE. Pre-send pre-fire** (Tim re-judge → operator approve → 15 fire 6-9pm Sun) | ~2 hr | Claude (re-judge) + operator (approve) | K |

**Total: ~20 hr Claude time + ~1-2 hr operator time, distributed Sat 2026-06-13 → 3pm Sun 2026-06-14.**

The 3pm Sunday checkpoint is the operator-set gate: anything not done by then defers to post-smoke; what IS done feeds the smoke-roster re-judge.

---

## W1 — URGENT-1: P1 microsite restoration

**Why this is URGENT-1, not part of the F-bucket:** 45 P1 booth-visitor contacts received emails last week. Their microsite links are currently dead-on-click under anon RLS (only `status='live'` is exposed). This is a live trust-degradation event every day until fixed.

**Source state:** Production Supabase `slttpknnuthbttjuzrnz` was wiped by a prior agent. Pre-erase state captured in `joxzazwuehhvywanyrze.supabase.co` (P1 Restore project): 31 prospects, 5 sr_engine_output rows, 4 sr_microsites — **all `status='draft'`**.

**Steps:**

1. **Verify restore-DB inventory** (5 min) — Supabase MCP query against `joxzazwuehhvywanyrze`. Confirm 31 prospects + 5 engine outputs + 4 microsites; note which 4 microsites correspond to which P1 contacts.
2. **Cross-reference to live HS** (10 min) — HubSpot MCP: for each of the 4 microsite slugs, confirm a matching contact exists in the FC2026 P1 lists (Lucas Spencer Sends 7, Nathan Dunn Sends 14, Mike Rutski Sends 24).
3. **Restore the 4 microsites + 5 engine outputs + 31 prospects to production `slttpknnuthbttjuzrnz`** (20 min) — Supabase MCP. Idempotent UPSERT on `(prospect_id, content_type)` to avoid duplicating any rows that survived the wipe.
4. **Flip status to 'live' on the 4 microsites that have an actual P1-send-recipient match** (10 min) — `UPDATE sr_microsites SET status='live' WHERE id IN (...)`. Operator-approved per microsite (use the /ops portal Approve action if F10 is shipped by then; otherwise direct SQL with operator green-light per row).
5. **Smoke-test 1 live microsite anonymously** (5 min) — visit the URL in incognito; confirm page renders, no 403.

**Test plan:**
- Production DB query: `SELECT COUNT(*) FROM sr_microsites WHERE status='live'` → expect 4 (or whatever the operator approves).
- Anonymous HTTPS fetch on each live URL → expect 200 + rendered microsite content.

**Rollback:**
- `UPDATE sr_microsites SET status='draft' WHERE id IN (<the 4 ids>);` (one SQL; reversible per-microsite).

**Dependencies:** None internal. Blocks nothing else in the sprint.

**Capability:** K (recipients see verified content instead of nothing) + S (each live microsite reduces a future support-cost touchpoint).

---

## W2 — MAIN fix-sprint (F1-F10 + Stop-hook R5-lite)

### Order of operations

Per operator correction 2026-06-13 (substrate first, re-judge last), the F-bucket ships in this order:

```
SUBSTRATE TRUTH:    F1 → F2 → F3
OBSERVABILITY:      F8 → F9 (OTEL path) → Stop-hook R5-lite
VERIFICATION:       F4 → F5
MECHANICAL/PORTAL:  F6 → F7 → F10
```

Each subsection below states: **file/lines, test plan, rollback, dependencies, capability.**

---

### F1 — Kill-list regex in PRODUCT_GUARDS (BL-016)

**File:** `src/showrev/m1-email-find/evidence-tiering/composer-constraints.ts`
**Edit:** Add 5 regex entries to the `PRODUCT_GUARDS` array. Source phrases at `canon/sources/inorsa-product-truth-nick-2026-06-04.md` lines 57-61.

**Patterns to add (verbatim from canon, regex-escaped):**
```typescript
{ pattern: /\bInorsa\s+validates\s+inputs\b/i, label: 'kill-list: Inorsa validates inputs (Nick canon)' },
{ pattern: /\bInorsa\s+validates\s+design\s+data\b/i, label: 'kill-list: Inorsa validates design data' },
{ pattern: /\bInorsa\s+validates\s+design\s+inputs\b/i, label: 'kill-list: Inorsa validates design inputs' },
{ pattern: /\bInorsa\s+catches\s+input\s+errors\b/i, label: 'kill-list: Inorsa catches input errors' },
{ pattern: /\bInorsa\s+validates\s+inputs\s+before\s+generating\b/i, label: 'kill-list: Inorsa validates inputs before generating' },
```

**Test plan:**
- Unit test in `src/showrev/m1-email-find/evidence-tiering/__tests__/composer-constraints.test.ts` (create if absent): pass each killed phrase + a benign control sentence to the constraint checker; expect ALL_BANNED match on the 5, none on control.
- Replay the 5 historical P2-cold emails that carried this hallucination class (operator-flagged) against the updated constraints; expect mechanical block.

**Rollback:**
- Git: `git checkout HEAD -- src/showrev/m1-email-find/evidence-tiering/composer-constraints.ts`

**Dependencies:** None — pure regex add.

**Capability:** K — hard gate on highest-leverage hallucination class.

**Effort:** 20 min.

---

### F2 — Source-of-truth doc alignment

**File:** `data/showrev/inorsa-source-of-truth.md`
**Lines:** 65 + 70 — replace the "Validation Suite — catches errors before permit submission" framing with canon-aligned wording ("Inorsa accelerates production so the team has time for thorough QC").

**Why this matters:** The composer can read this doc at compose time; if it carries contradictory signal to the canon, the LLM may regress on substrate trust. Two-doc alignment closes a soft-enforcement seam.

**Test plan:**
- Diff the file pre/post: confirm lines 65 + 70 no longer contain the contradictory phrasing.
- Confirm the canon at `canon/sources/inorsa-product-truth-nick-2026-06-04.md` lines 14-28 is the authoritative source — no edit needed there.

**Rollback:** `git checkout HEAD -- data/showrev/inorsa-source-of-truth.md`

**Dependencies:** None.

**Capability:** K.

**Effort:** 10 min.

---

### F3 — URL-domain classifier wired into substrate ingest

**Files:**
- New column on two tables (DDL):
  ```sql
  ALTER TABLE sr_company_evidence ADD COLUMN IF NOT EXISTS domain_tier TEXT;
  ALTER TABLE sr_brain_substrate ADD COLUMN IF NOT EXISTS domain_tier TEXT;
  CREATE INDEX IF NOT EXISTS idx_evidence_domain_tier ON sr_company_evidence (domain_tier);
  ```
- Stranded classifier to wire: `src/showrev/m1-email-find/verify-facts.ts` (~336 lines)
- Wire target: `src/showrev/m1-email-find/evidence-tiering/substrate-query.ts`
  - In `writeEvidence()`: call `classifyDomainTier(url)`, refuse insert if `PROHIBITED`, set `domain_tier` on insert
  - In `getCompanyEvidence()`: filter `domain_tier != 'PROHIBITED'`; force `T3/T4 → USE_TO_SHAPE` regardless of `source_kind`
- Backfill script: `scripts/backfill-domain-tier.ts` — classify all 1,522 existing `sr_company_evidence` rows + 6,512 `sr_brain_substrate` rows by URL; set `domain_tier`; quarantine PROHIBITED rows by tagging (do NOT delete — operator audit trail).

**Test plan:**
- Unit test in `src/showrev/m1-email-find/__tests__/verify-facts.test.ts`: fixture URLs (zoominfo.com, leadiq.com, rocketreach.co → PROHIBITED; sec.gov, fcc.gov → T1; reuters.com → T2; etc.); expect classifier returns the right tier.
- Integration: write a test evidence row with ZoomInfo URL via `writeEvidence()`; expect insert refusal.
- Post-backfill DB query: `SELECT domain_tier, COUNT(*) FROM sr_company_evidence GROUP BY domain_tier` — confirm 21 confirmed PROHIBITED-domain rows are now tagged.

**Rollback:**
- Code: `git revert <commit>` (covers wiring + backfill script)
- Schema: `ALTER TABLE sr_company_evidence DROP COLUMN domain_tier; ALTER TABLE sr_brain_substrate DROP COLUMN domain_tier;` (reversible — column drop)
- Backfill: backfill is idempotent and read-only-classify; rollback is the column drop above.

**Dependencies:** None at the F-level. F1 + F2 already shipped is preferable so the composer doesn't ingest contradictory substrate while this lands, but not blocking.

**Capability:** K — single biggest substrate-trust win.

**Effort:** 5-6 hrs.

---

### F8 — sr_pipeline_runs telemetry (OTEL path per tool audit)

**Tool-audit insight (item 13 + 16):** Claude Code 2.1.145-2.1.172 exposes OTEL telemetry with agent_id + parent_agent_id on tool spans, plus stdio MCP receives `CLAUDE_CODE_SESSION_ID`. Together: ~30 min routing vs ~3 hrs of scattered INSERTs through the pipeline.

**Implementation path (OTEL):**
1. Configure `~/.claude/settings.json` to enable OTEL export with `OTEL_METRICS_INCLUDE_ENTRYPOINT=true` (per CLAUDE.md Tool Chain Reference item 19, late-May release).
2. Add a thin OTEL receiver as a node script at `scripts/otel-receiver-to-supabase.ts` that ingests spans from Claude Code, filters for ShowRev pipeline spans (by tool name + cwd), and writes one row per pipeline invocation to `sr_pipeline_runs` (run_id, started_at, ended_at, status, summary jsonb).
3. Use `post-session` hook (Claude Code 2.1.169, Jun 8) to batch-flush any in-flight spans at session close.

**Implementation path (fallback, only if OTEL path is fragile):**
- Add `await supabase.from('sr_pipeline_runs').insert(...)` at start + end of `run-pipeline-v2.ts` (~10 lines, ~30 min). Less elegant but guaranteed to work.

**Test plan:**
- Run pipeline on 1 prospect; check `SELECT * FROM sr_pipeline_runs ORDER BY started_at DESC LIMIT 1`; expect 1 row with non-null started_at, ended_at, status, summary.
- Cross-system check: confirm the row's `summary.session_id` matches the `CLAUDE_CODE_SESSION_ID` for the session that ran the pipeline.

**Rollback:**
- Disable OTEL export in settings.json (single setting flip)
- Drop the OTEL receiver script (kept for re-use)

**Dependencies:** None blocking. Pairs naturally with F9.

**Capability:** M — primary observability infrastructure.

**Effort:** 30-45 min via OTEL; 1 hr if fallback.

---

### F9 — sr_emails per-send persistence

**Same OTEL approach as F8** — extend the receiver to also write to `sr_emails` (one row per composed-then-shipped touch, with subject/body/judge_verdict/human_edited).

**File:** `scripts/otel-receiver-to-supabase.ts` (same as F8, extended)

**Test plan:**
- Compose 1 email through the pipeline; check `SELECT * FROM sr_emails ORDER BY composed_at DESC LIMIT 1`; expect 1 row with subject, body, judge verdict.
- Sanity: `sr_emails.prospect_id` resolves to a valid `sr_prospects.id`.

**Rollback:** Same as F8.

**Dependencies:** F8 (shared receiver script).

**Capability:** M — per-send audit trail.

**Effort:** ~1 hr (extends F8 work).

---

### Stop-hook R5-lite (NEW in scope, per operator decision)

**Why included:** Tool audit item 7 — Claude Code 2.1.152 Stop / SubagentStop hook `additionalContext` return turns the tiered-judge cascade into a within-session learning loop without standing up R3/R5 first.

**File:** `.claude/hooks/judge_feedback_to_context.py` (NEW)

**Behavior:**
1. After every assistant turn (Stop event), read the last batch of judge verdicts from `sr_engine_output.judge_verdict` for any prospects composed in the current Claude Code session (matched via `CLAUDE_CODE_SESSION_ID`).
2. If the batch has at least 5 verdicts AND the success rate moved >10 percentage points vs the running session average, return a short `additionalContext` summary like: `"Judge feedback: last 5 emails averaged 87% T1-pass (up from 71%). Continue current substrate selection pattern."` or `"Judge feedback: 3 of last 5 emails flagged hallucination-check on PROHIBITED-domain claims. Tighten substrate filter."`
3. **Gate:** If the signal is noisy (fewer than 5 verdicts, or std-dev > 25), return NOTHING. Prevents hook pollution per the downside flagged to operator.

**Test plan:**
- Compose 5 emails in a session; manually check Stop-hook output via `~/.claude/logs/`; expect `additionalContext` to contain the calibrated summary.
- Compose 2 emails (sample too small); expect Stop-hook to return nothing.

**Rollback:** Delete the hook file + remove from `.claude/settings.json` Stop hook array. Atomic.

**Dependencies:** F9 must ship first (the hook reads from `sr_emails` / `sr_engine_output.judge_verdict`).

**Capability:** L — within-session loop closure.

**Effort:** 1-2 hrs.

**Downside acknowledged (per operator Q):**
- Fires only during Claude Code sessions, NOT production pipeline runs.
- Doesn't replace persistent R5/R3 long-term.
- Bounded scope add.

---

### F4 — Source-date backfill on sr_company_evidence

**Script:** `scripts/backfill-source-date.ts` (NEW)
**Target:** 1,288 null-source-date rows in `sr_company_evidence` where the citation URL or content contains a parseable date.

**Logic:**
1. SELECT all rows where `source_date IS NULL` AND `(url IS NOT NULL OR raw_content IS NOT NULL)`
2. Per row: regex date-extract from URL (e.g., `/2024/03/15/...`) or first 500 chars of `raw_content`
3. UPDATE row with extracted date

**Test plan:**
- Pre-run count: `SELECT COUNT(*) FROM sr_company_evidence WHERE source_date IS NULL` (expect ~1,288)
- Post-run count: same query (expect dropped by 30-50%, depending on extractability)
- Spot-check 20 backfilled rows: confirm `source_date` matches a date visible in the URL or content.

**Rollback:**
- `UPDATE sr_company_evidence SET source_date = NULL WHERE source_date_backfilled_at = '<run_timestamp>'` (add a `source_date_backfilled_at` audit column for reversibility)

**Dependencies:** F3 useful first (so PROHIBITED rows don't pollute the date-backfill set), but not strictly blocking.

**Capability:** K — enables the existing 24-month staleness check.

**Effort:** ~1 hr (script + run + verify).

---

### F5 — sr_prospects.hubspot_contact_id backfill + forward wire

**Two parts:**

**5a — Backfill the 18 Sunday-smoke contacts** (~10 min):
1. HubSpot MCP search: get the contact IDs for each of the 18 loaded prospects (search by email).
2. SQL UPDATE: `UPDATE sr_prospects SET hubspot_contact_id = '<hs_id>' WHERE email = '<email>'`.

**5b — Forward-wire so future loads backfill automatically** (~20 min):
- File: `scripts/smoke-load-2026-06-11.ts` + `src/showrev/m1-email-find/hubspot-loader.ts`
- After every successful HS contact create / upsert, capture the returned `contactId` and UPSERT into `sr_prospects.hubspot_contact_id` in the same transaction.

**Test plan:**
- Post-5a: `SELECT COUNT(*) FROM sr_prospects WHERE hubspot_contact_id IS NOT NULL` should equal 18.
- Post-5b: simulate a load of 1 new test contact; expect `sr_prospects.hubspot_contact_id` populated within the same script execution.

**Rollback:**
- 5a backfill: `UPDATE sr_prospects SET hubspot_contact_id = NULL WHERE id IN (<the 18 ids>)`
- 5b code: `git checkout HEAD -- scripts/smoke-load-2026-06-11.ts src/showrev/m1-email-find/hubspot-loader.ts`

**Dependencies:** Independent. Useful before AE proxy test (so the test contact gets a clean HS-id backfill).

**Capability:** M — DB knows what's in HS.

**Effort:** 30 min total.

---

### F6 — Rename + reset on Tim approval semantics

**Per operator correction 2026-06-13:** this fix runs late in the sprint — substrate must be clean first, otherwise we re-judge against gates that haven't shipped yet (wasted work).

**Two parts:**

**6a — Column rename + new column** (DDL):
```sql
ALTER TABLE sr_engine_output RENAME COLUMN composition_reviewed_by TO craft_reviewed_by;
ALTER TABLE sr_engine_output ADD COLUMN IF NOT EXISTS facts_reviewed_by TEXT;
ALTER TABLE sr_engine_output ADD COLUMN IF NOT EXISTS facts_reviewed_at TIMESTAMPTZ;
```

**6b — Auto-reset trigger** (SQL):
```sql
CREATE OR REPLACE FUNCTION reset_craft_review_on_red() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.confidence_color = 'red' AND OLD.confidence_color != 'red' THEN
    NEW.craft_reviewed_by := NULL;
    NEW.craft_reviewed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reset_craft_review_on_red
BEFORE UPDATE ON sr_engine_output
FOR EACH ROW EXECUTE FUNCTION reset_craft_review_on_red();
```

**6c — Portal surface update** (~30 min):
- File: `src/showrev/microsite/app/ops/page.tsx` (or wherever Tim-approval surface is rendered)
- Change "Tim Approved" badge → "Craft Approved (Tim)" + separate "Facts Approved (operator)" badge
- "Reset since" indicator if `craft_reviewed_at < confidence_color_changed_at`

**Test plan:**
- Pre-rename: confirm `composition_reviewed_by` populated on N rows
- Post-rename: confirm `craft_reviewed_by` populated on same N rows
- Trigger test: UPDATE a row to set `confidence_color = 'red'`; expect `craft_reviewed_by` reset to NULL
- Portal: load /ops, confirm craft vs facts badges render correctly

**Rollback:**
- Reverse the column rename + drop the new columns + drop the trigger (all reversible SQL)
- `git checkout HEAD -- src/showrev/microsite/app/ops/page.tsx`

**Dependencies:** Should ship AFTER F1+F3 (substrate gates) so the re-judge that follows isn't re-judging against a moving target.

**Capability:** K + S — clear semantic separation prevents downstream gates from misreading craft as fact.

**Effort:** 1 hr.

---

### F7 — Single-call HS upsert (GOSPEL alignment)

**File:** `src/showrev/m1-email-find/hubspot-loader.ts`
**Lines:** ~397-401 (the current 2-call create-then-PUT pattern per HUBSPOT-INTEGRATION-RESEARCH Q7).

**Change:** Switch from `POST /crm/v3/objects/contacts` → `PUT /crm/v4/objects/contacts/{cid}/associations/companies/{cid}` to single-request `POST` with `associations` array in the body.

**Test plan:**
- Dry-run on 1 prospect with `--dry-run`: confirm request body contains `associations` array.
- Wet load on the test contact (justyn@tasteforyourself.com): confirm only 1 API call recorded in `sr_hs_api_calls` (per POST-PORTAL v6 Component 0 wrapper).

**Rollback:** `git checkout HEAD -- src/showrev/m1-email-find/hubspot-loader.ts`

**Dependencies:** None.

**Capability:** S — 30% fewer HS API calls; faster loads.

**Effort:** 45 min.

---

### F10 — Microsite status promotion via /ops portal

**Files:**
- `src/showrev/microsite/app/ops/page.tsx` — add an "Approve + Go Live" action per prospect row
- `src/showrev/microsite/app/api/microsite-promote/route.ts` (NEW) — Next.js API route that flips `sr_microsites.status` to `live` AND sets `sr_prospects.operator_go = true` in one transaction; logs to `sr_review_actions`
- Bulk action: "Approve + Go Live (all passing)" — same logic over selected rows (per operator: per-prospect default + batch option)

**Pre-send gate:** HS sequence enrollment script (W3 / W4) refuses to enroll any prospect where `sr_prospects.operator_go != true` OR `NOT EXISTS (SELECT 1 FROM sr_microsites WHERE prospect_id = p.id AND status = 'live')`.

**Test plan:**
- Single-prospect: click "Approve + Go Live" on 1 row; confirm `sr_microsites.status = 'live'` + `sr_prospects.operator_go = true` + `sr_review_actions` row written.
- Batch: select 5 rows, click batch action; confirm 5 status flips.
- Negative: try to enroll a contact whose `operator_go = false` — expect script refusal.
- Anonymous fetch on the now-live microsite URL → expect 200.

**Rollback:**
- DB: `UPDATE sr_microsites SET status = 'draft' WHERE id IN (<promoted ids>); UPDATE sr_prospects SET operator_go = false WHERE id IN (<promoted prospect ids>);`
- Code: `git checkout HEAD -- src/showrev/microsite/app/ops/page.tsx src/showrev/microsite/app/api/microsite-promote/route.ts`

**Dependencies:** F5 (HS contact id backfill) makes the enroll-refusal logic cleaner.

**Capability:** K + S — prospect-facing pages are actually reachable; operator scans by exception.

**Effort:** 2-3 hrs.

---

### F-bucket sequencing summary

```
Hour 0-1:    URGENT-1 (W1) + F1 + F2 (substrate consistency)
Hour 1-7:    F3 (URL-domain classifier, 5-6 hrs) ← biggest single block
Hour 7-8:    F8 + F9 setup (OTEL receiver + Supabase write)
Hour 8-10:   Stop-hook R5-lite (depends on F9)
Hour 10-11:  F4 (source-date backfill, ~1 hr)
Hour 11-12:  F5 (HS id backfill + forward-wire)
Hour 12-13:  F6 (Tim/craft semantic rename + reset trigger) ← after substrate is clean
Hour 13-14:  F7 (single-call HS upsert)
Hour 14-17:  F10 (portal Approve + Go Live action, 2-3 hrs)
```

**Defended sequencing logic:**
- URGENT-1 first because trust degrades every day until fixed.
- F1 + F2 are 30-min consistency wins that prevent regression while F3 lands.
- F3 is the highest-leverage substrate-trust fix — eats the morning, but everything downstream is cleaner after.
- F8 + F9 + Stop-hook cluster together because they share the OTEL substrate.
- F4 + F5 backfill jobs run while telemetry is recording (gives signal on how often backfilled fields actually fire).
- F6 + F7 + F10 are smaller mechanical / portal wins, fall naturally to the back half once substrate + observability are in.
- Tim re-judge (separate GATE workstream below) is the LAST step before smoke fire.

---

## W3 — AE Proxy Enrollment Test (parallel workstream)

**Per operator clarification 2026-06-13:** Yesterday with Breeze, the operator devised an API-based proxy enrollment test. The literal step-by-step from that chat wasn't captured in a standalone doc. Reconstructed below using POST-PORTAL v6 Component 0 (HS API wrapper) + HUBSPOT-INTEGRATION-RESEARCH Q1/Q2/Q10/Q13/Q16.

**Test goal:** Confirm that the system can enroll a list on behalf of an AE via the Sequences API direct-enrollment path (Pro-tier supported per Q10), without the AE manually clicking "Enroll contacts" in the HS UI.

**Test design (reconstructed):**

1. **Create test artifacts in HS:**
   - Test list: `FC2026 P2 - AE Proxy Test` (1 contact: `justyn+apienrolltest@tasteforyourself.com`)
   - Test sequence: `FC2026 — Mike Rutski AE Proxy Test` (single-step, references showrev_pre_show_t1_* tokens like production sequences)
   - Test contact properties: populate `showrev_engagement_slug = inorsa-fiberconnect-2026-cold`, AE-owner = Mike Rutski, all per-paragraph tokens with Chad-Mueller substrate (any benign test content)

2. **Execute proxy enrollment via HS API:**
   - Use `POST /automation/sequences/2026-03/enrollments` with `senderEmail: mike@inorsa.com` (per Q1 endpoint, Q10 per-sender independence)
   - Body: `{ contactId: <test contact id>, senderEmail: 'mike@inorsa.com' }`
   - Wrap call in POST-PORTAL v6 Component 0 `hsApi()` for 429 retry + rate-limit logging

3. **Verify success criteria** (all four must pass):
   - **(a) API returns 200 / 201 success** (not 403 permission error, not silent skip).
   - **(b) Email actually fires** within 10 min (per Q8 — first-step sends ASAP).
   - **(c) Recipient sees AE-branded send** — operator's `justyn+apienrolltest@tasteforyourself.com` inbox receives email; `From:` header = `Mike Rutski <mike@inorsa.com>`, `Reply-To:` = `mike@inorsa.com`, signature = Mike's.
   - **(d) Subsequent step fires on schedule** (verify Day 2 step lands within configured delay, with no AE intervention).

4. **Scope-guard check** (per yesterday's blocker note):
   - Confirm the WatchTower private app token has `automation.sequences.enrollments.write` scope.
   - If missing → test will fail with permission error; surface to operator to add scope via HS app config.

**Pass criteria:** All 4 verification points met.
**Fail criteria:** Any one of (a)-(d) fails.

**Go-no-go for Sunday smoke (operator decision at 3pm Sun):**
- If PASS → operator decides: use proxy enrollment for the 15-contact smoke OR keep manual + use proxy for post-pilot scale.
- If FAIL → manual enrollment for the smoke (POST-PORTAL v6 path).

**Time budget:** 1 hr design + 1 hr execute + 1 hr verify = ~3 hrs.

**Dependencies:**
- HS API client wrapper (POST-PORTAL v6 Component 0) must exist — if not yet wired, ~1.5 hr added scope.
- Operator must provide green-light + sub-addressed test email.

**Capability:** S — if proxy works, the 800-prospect P2 cohort can be enrolled without per-prospect AE involvement.

---

## W4 — HS Mistakes Remediation (pre-Sunday-evening)

**Source:** `docs/showrev/HANDOFF-2026-06-12-PM-harness-build.md` — blocker section.

**Scope (operator-confirmed):**
1. **5 wrong Mike contacts to remove** (loaded by an earlier session before the 18-contact roster was finalized) — identify by query + operator per-case approve.
2. **2 contacts re-tag from invented `excluded-prohibited-substrate` → canonical `inorsa-fiberconnect-2026-cold`:**
   - Brendan Karchner
   - Laurie Turck
3. **GUARDRAIL: Joe Kunz — DO NOT overwrite.** Tom Marciano is the DETECTED legitimate owner per the GOSPEL HubSpot Loading Protocol memory.

**Steps:**

1. **Identify the 5 wrong Mike contacts** (10 min):
   - HubSpot MCP search: `hubspot_owner_id = 89105202 (Mike) AND showrev_engagement_slug = inorsa-fiberconnect-2026-cold`
   - Cross-reference against the canonical 18-contact roster (`HANDOFF-2026-06-12-FRESH-SESSION.md` lists Mike's 6 + dummy)
   - The 5 wrong ones are: any showing up in HS not on the canonical list. Surface to operator with names + IDs.

2. **Operator per-case approve** (5 min):
   - Operator confirms each of the 5 is genuinely wrong and should be removed (delete or re-tag to `inorsa-fiberconnect-2026-cold-mv-risky-excluded` per the prior pattern, operator decides).

3. **Re-tag Brendan + Laurie** (5 min):
   - HubSpot MCP update: `showrev_engagement_slug = inorsa-fiberconnect-2026-cold` on both
   - Verify by HS MCP query post-update

4. **Verify guardrail on Joe Kunz** (2 min):
   - HS MCP get: confirm Joe Kunz's contact owner is Tom Marciano (not overwritten)
   - If overwritten → escalate to operator (NOT auto-revert per GOSPEL — operator decides)

**Test plan:**
- Post-remediation HS query: Mike's cold-list count = 6 (matches canonical roster).
- Post-retag HS query: Brendan + Laurie show `showrev_engagement_slug = inorsa-fiberconnect-2026-cold`.
- Joe Kunz query: owner unchanged.

**Rollback:**
- If a contact was deleted in error: re-create via HS UI (no API-undelete; would need operator to restore from HS audit log)
- Tag changes: re-tag back to prior value via single MCP call

**Dependencies:** None blocking, but must complete BEFORE the smoke-roster pre-send gate.

**Capability:** K — clean client CRM state going into the smoke.

**Effort:** ~30 min total (most of it is operator per-case approval).

---

## GATE — Pre-send (3pm Sunday checkpoint → 6-9pm Sun smoke fire)

**Per operator correction 2026-06-13:** Tim re-judge happens HERE, not early in the sprint.

**Steps (3pm Sunday 2026-06-14):**

1. **Assess sprint progress** (5 min):
   - Which F-items shipped? Which deferred?
   - Did URGENT-1 + F1 + F2 + F3 ship? (Substrate-trust foundations — required for re-judge.)
   - Did W4 (HS mistakes remediation) ship? (Required to prevent re-loading wrong contacts.)
   - Did AE proxy test (W3) PASS or FAIL?

2. **Re-judge the 15 smoke-roster emails against new gates** (~30 min):
   - Re-run `tiered-judge.ts` on each of the 15 with F1 (kill-list) + F3 (domain-tier filter) active
   - Output: per-email PASS / FAIL-mechanical / FAIL-hallucination
   - For FAILs: re-compose via existing `specific-composer.ts` (which now sees the cleaned substrate)

3. **Operator approval per re-composed email** (~15 min):
   - Each re-composed email surfaces in /ops portal with the "Approve + Go Live" action (F10)
   - Operator clicks per-prospect approve (or batch approve all passing per F10)
   - This sets `operator_go = true` + microsite `status = live`

4. **Final pre-send check** (5 min):
   - Run `preload-verify.ts` on the 15
   - All 11 BLOCKING checks (including the new SPF/DKIM/DMARC from POST-PORTAL v6 A2) must pass

5. **Smoke fire** (6-9pm recipient local, automatic via HS sequence):
   - If AE proxy test passed AND operator green-lighted proxy → fire via Sequences API per W3 design
   - Otherwise → AE manual bulk-enroll per POST-PORTAL v6

6. **Watch** (post-fire, into Mon-Wed):
   - F8 / F9 telemetry capturing sends + bounces
   - Stop-hook R5-lite calibrating judge during any session work that happens
   - Manual: operator checks `justyn+*` inboxes for sender-identity validation (3 dummies if running with proxy)

**Test plan:**
- 15 of 15 have `operator_go = true` + live microsite + cleared all 11 preload checks
- HS sequence stats show 15 enrollments within 1 hr of fire
- Bounce monitor (POST-PORTAL v6 Component 4) reports <5% hard-bounce on the 15

**Rollback:**
- Mid-fire halt: HS Sequences > Actions > Pause All (per Q5)
- Post-fire: unenroll any individual contact via HS UI

**Dependencies:** Everything in W1, W2 (F1-F10 + Stop-hook), W3 (proxy test outcome), W4 (HS clean).

**Capability:** K (gate) + L (post-fire telemetry feeds back).

---

## REBUILD bucket — Operator-decision dependencies (NOT for this sprint)

R1-R5 don't code yet. Each has operator-decision dependencies that must be resolved before scoping. **Tight question block to surface in next sprint session:**

1. **R1 (KB-to-DB + `getOperatorTruths()`):** Which JTBD tags get weighted most heavily for retrieval? Nick's 14 rows are tagged `jtbd_*`; do we treat all equally, or rank (e.g., kickback-cascade > BEAD-economics > standardize-across-clients)?

2. **R2 (send-confidence calibration loop):** What's the operator-ranking sample size for the first calibration pass? Spec says "operator-ranks-10"; do we want 10, 20, or 30 for a more stable least-squares fit?

3. **R3 (Brain distillation layer):** Which 3 bellwether-account slots get the first periodic LLM-synthesized snapshots? Greenlight, Frontier, plus one more? Operator names the third.

4. **R4 (refutation gate wire-in):** Should refutation fire on every composed email or only when send-confidence is below a threshold (cost vs coverage)?

5. **R5 (Bounce Monitor + DNC + Cohort Status persistence):** What's the cohort-status dashboard's audience — operator-only, or shared with AEs?

These will be the operator-question block in the next sprint's planning session (post-smoke reply data lands Mon-Wed).

---

## RE-ORCH bucket — Cadence + owner per item

| # | Item | Cadence | Owner |
|---|---|---|---|
| O1 | Manual Nick / operator DM capture → SQL → `sr_company_evidence` | As needed (each DM) | Operator surfaces, Claude writes SQL |
| O2 | Operator pre-send sign-off via /ops portal | Per cohort fire | Operator |
| O3 | Per-AE per-day cap enforcement (warn at 80%, red at 95% of 500/day) | Daily, automated check | Claude script + operator decisions on warn flags |
| O4 | Substrate refresh ingest (NTCA report, FBA Fiber Market Trends, USTelecom, FCC BDC, public-operator earnings) | Monthly | Claude scripts + operator approves additions |
| O5 | Weekly reply retro (reply rate by source-tier × persona × send-window × PS variant) | Weekly (Friday) | Claude generates, operator reviews |
| O6 | Pre-show / per-show / post-show substrate cycle | Per show in roadmap | Operator declares show, Claude executes per-phase |

---

## Open assumptions flagged (for operator confirmation if any differ)

1. **Tim re-judge handling defaults to auto-re-compose with audit-trail entry** — no per-email visibility gate before re-compose. Operator can override if they want to see the "failing" list first.
2. **AE proxy test runs in parallel during sprint; Sunday smoke fires manual unless operator overrides** at 3pm Sunday checkpoint.
3. **Per-prospect microsite approval is the default for F10**, with batch option exposed via "Approve all passing" button (per operator decision 5 at session start).
4. **OTEL path is preferred for F8/F9**, fallback is scattered INSERTs if OTEL is fragile.

---

## What this plan does NOT include (out-of-scope, explicit)

- **No new tables.** Per audit's own constraint. Schema changes are 4 ALTER + 1 CREATE TRIGGER + 1 CREATE FUNCTION.
- **No API enrollment as default.** POST-PORTAL v6 manual is the default; AE proxy is a parallel TEST, not a re-architecture.
- **No composer rewrites.** Composer is fine.
- **No tiered-judge rewrites.** Judge is rigorous.
- **No move off v2 pipeline.** v2 is production; v1 retired.
- **No REBUILD (R1-R5) code.** Operator-decision dependencies must resolve first.
- **No Opus 4.8 / Fable 5 switch this session.** Operator-side decision deferred.
- **No CLAUDE.md baseline refresh** (40+ Ruflo patch releases stale per audit). Separate workstream.
- **No memory-system audit pass.** Surgical 2-edit fix done; broader audit deferred.

---

## Next steps in the governance protocol

1. **Spawn rubric-builder agent** to author the evaluation rubric for THIS plan (per operator-confirmed governance protocol).
2. **Surface rubric + rationale to operator** for review (operator audit gate).
3. **Run cross-family judge panel** (external-judge subagent + inline REST to Gemini / GPT-5 / Grok / DeepSeek) against the rubric.
4. **Iterate** — cap at 3 rounds; if scores still moving meaningfully at round 3, escalate to operator per their explicit decision.
5. **Present final plan** for operator red-team approval before any code ships.

---

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 EDT | Claude (Opus 4.7) | Initial draft after operator's 5 answers + 3 corrections (smoke roster=15, substrate-first ordering, HS mistakes scope) + tool audit findings (OTEL F8/F9 substitution + Stop-hook R5-lite in scope) + operator-confirmed governance protocol (rubric → judge panel → iterate). Pending rubric build + judge panel + operator red-team. |
