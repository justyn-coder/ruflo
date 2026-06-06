---
title: Red Team Report — Mission Control v3 Spec
status: ACTIVE
last_updated: 2026-06-02 14:30 EST
version: v1
---

# Red Team Report — Mission Control v3 Spec

## 1. Verdict: PASS WITH CONDITIONS

The spec is well-structured, comprehensive, and mostly buildable. It addresses the core user requirements. However, it has several issues that will cause real problems if not fixed before build:

- Two data model bugs that will produce wrong behavior at runtime
- A security design choice that is technically fine for now but creates a dangerous habit
- Upstream dependencies that don't exist yet and will block Phase 5-7
- Scope creep in the state machine that adds confusion without adding value
- A "last_reviewed_at" design that breaks for multi-reviewer scenarios

The spec should not be built as-is. Fix the critical findings, defer what's listed in section 4, and the remaining scope is tight and deliverable.

---

## 2. Critical Findings (Must Fix Before Build)

### C-1. `last_reviewed_at` / `last_reviewed_by` is per-record, not per-reviewer — breaks the core "changed since MY last review" feature

The spec adds `last_reviewed_at` and `last_reviewed_by` as single columns on `sr_engine_output`. When Tim calls `markReviewed()`, it sets `last_reviewed_at = now()` and `last_reviewed_by = 'Tim'`. When Justyn later calls `markReviewed()`, Tim's timestamp is overwritten.

This means when Tim filters for "changed since my last review," the system uses Justyn's timestamp, not Tim's. The entire change-tracking workflow is built on this filter. It will produce wrong results for every reviewer except the most recent one.

**Fix:** Create a `sr_review_timestamps` table:
```sql
CREATE TABLE sr_review_timestamps (
  prospect_id TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  last_reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (prospect_id, reviewer)
);
```
The `markReviewed()` action UPSERTs into this table. The "changed since my last review" filter joins against it using the current role's name. The `changed_since_review` boolean on `sr_engine_output` should be removed — it's redundant and misleading when there are multiple reviewers with different timestamps. Instead, compute it at query time: `change_log->-1->>'timestamp' > sr_review_timestamps.last_reviewed_at`.

### C-2. `changed_since_review` boolean is a denormalization that will go stale

Related to C-1. The spec sets `changed_since_review = true` when any change is logged, and `false` when any reviewer calls `markReviewed()`. With multiple reviewers, this is a race: Tim marks reviewed, boolean goes false, but Mike hasn't reviewed yet. Mike's view now incorrectly shows no changes.

**Fix:** Drop the boolean. Compute "changed since review" per-reviewer at query time using the `sr_review_timestamps` table from C-1. The `sr_action_queue` view's "changed records" section should also join against this table, parameterized by reviewer (which means it can't be a plain VIEW — it needs to be a function or the frontend filters client-side).

### C-3. The state machine has states that contradict each other

The state machine shows: PENDING -> SEND/HOLD/REJECT -> (note posted) -> CHANGED -> VERIFIED -> GO -> LOADED -> TRACKED.

Problems:
1. `send_status` column currently holds: send, hold, reject, dnc, partner, pending, go. The spec adds: verified, loaded, tracked. That's 10 states in one column. The existing `STATUS_CYCLE` in types.ts cycles through 6. The keyboard shortcut `a` sets `send` and `g` sets `go`. But `verified` is listed as a separate status — is it a status or a flag? The spec says AEs "mark verified" but the role matrix says AEs can't change `send_status`. Contradiction.

2. HOLD is described as an initial triage state (Justyn puts prospects on hold during sweep). But the state diagram shows HOLD records going through the same note/review/verify flow as SEND records. If HOLD means "I'll decide later," it should be a parking lot that exits back to PENDING, SEND, or REJECT — not its own review track.

3. LOADED and TRACKED are HubSpot integration states, not review states. Mixing review lifecycle with integration lifecycle in one field makes filtering confusing and the state machine harder to reason about.

**Fix:**
- Keep `send_status` as the review lifecycle: pending, send, hold, reject, dnc, partner, go.
- `ae_review_status` (already exists) handles verified/flagged/rejected from AEs — don't duplicate this into `send_status`.
- Add `hs_load_status` as a separate column: null, loaded, sent, opened, replied, bounced. This is an integration concern, not a review concern.
- Simplify the state machine diagram to match. Remove VERIFIED, LOADED, TRACKED as `send_status` values.

### C-4. The action queue view uses `NOW()` for HubSpot conflict `triggered_at` — wrong

```sql
-- HubSpot ownership conflicts
SELECT
  ...
  NOW() AS triggered_at,
  ...
```

Every time the view is queried, every HubSpot conflict gets a fresh timestamp. This means conflicts will always sort to the top of their priority band, and the "resolved" section's sorting will be nonsensical.

**Fix:** Store `hs_conflict_detected_at TIMESTAMPTZ` on `sr_engine_output`, set it when `checkHubSpotStatus()` detects a conflict. Use that column in the view instead of `NOW()`.

### C-5. No concurrency protection on `change_log` JSONB append

The `logChange()` action reads the current `change_log`, appends, and writes back. If two people (or a batch operation and a manual edit) fire simultaneously, one write will overwrite the other's append. Supabase/PostgreSQL doesn't do optimistic locking on JSONB by default.

**Fix:** Use a PostgreSQL function for atomic append:
```sql
CREATE OR REPLACE FUNCTION append_change_log(
  p_prospect_id TEXT,
  p_entry JSONB
) RETURNS VOID AS $$
  UPDATE sr_engine_output
  SET change_log = change_log || p_entry,
      updated_at = NOW()
  WHERE prospect_id = p_prospect_id;
$$ LANGUAGE SQL;
```
Call this from the server action via `supabase.rpc('append_change_log', {...})` instead of read-modify-write.

---

## 3. Important Findings (Should Fix Before Build)

### I-1. Author dropdown on notes form allows impersonation

The notes form has an author dropdown that "defaults to current role's name." But since role is just a URL parameter, and the author is a dropdown, Tim can post a note as "Mike Rutski" or "System." There's no enforcement.

**Fix for now:** Remove the author dropdown. Derive author from the role parameter automatically. Tim's role = reviewer, so author = "Tim." AE role with name=Mike = author "Mike Rutski." Don't let users choose.

### I-2. `has_unresolved_notes` boolean has the same staleness risk as `changed_since_review`

If the `resolveNote()` action crashes after setting `resolved = true` on the note but before recalculating `has_unresolved_notes` on the prospect, the flag goes stale. This is a denormalization consistency problem.

**Mitigation:** Acceptable for v3 given team size, but document it. Better: compute it in the query join (COUNT where resolved = false > 0) rather than maintaining a cached boolean. The index `idx_review_notes_unresolved` already supports this efficiently.

### I-3. HubSpot batch check at 200ms delay = 5 checks/second = HubSpot rate limit safe, but barely

HubSpot's private app rate limit is 100 requests per 10 seconds for Professional tier (200/10s for Enterprise). Each `checkHubSpotStatus` makes 1-2 API calls (search + get). At 200ms delay, that's ~10 API calls/second for the search+association combo. This is right at the limit for Professional, over it if other processes are also hitting the API.

**Fix:** Increase delay to 500ms for safety. Or batch the search using HubSpot's batch read endpoint (`POST /crm/v3/objects/contacts/batch/read`) which handles up to 100 contacts per call. One batch call replaces 100 individual ones.

### I-4. The spec says `prospect_id TEXT NOT NULL REFERENCES sr_engine_output(prospect_id)` for `sr_review_notes` — but `sr_engine_output.prospect_id` may not be a unique constraint

Looking at the existing codebase, `sr_engine_output` can have multiple rows per prospect (different `run_id`s). The FK reference assumes `prospect_id` is unique. If it's not, the FK will fail to create, or worse, it will create and then the join will multiply rows.

**Fix:** Verify `sr_engine_output` has a UNIQUE constraint on `prospect_id`. If not, either add one (and handle the implication that only one engine output row exists per prospect) or change the FK to reference `sr_prospects.id` instead.

### I-5. `page.tsx` will get slow — it fetches ALL prospects, ALL engine output, ALL pilot dossiers, and now ALL notes

The existing `page.tsx` already fetches from 3 tables with `select('*')`. v3 adds fetching from `sr_review_notes` and computing note counts per prospect. With 500+ prospects and growing notes, this server component will exceed the 2-second performance target.

**Fix:** Move to pagination or at minimum, fetch only the columns needed (not `select('*')`). Notes should be fetched per-prospect on expand, not pre-loaded for all.

### I-6. `resolveActionItem()` conflates different resolution mechanisms

The spec says `resolveActionItem(itemId, type)` handles 4 different item types with different resolution logic:
- note: resolves the note
- verification: clears blocker flag
- changed: clears `changed_since_review`
- hs_conflict: clears `hs_conflict`

But the `item_id` for non-note items is synthetic (e.g., `prospect_id + '-vfail'`). Parsing these IDs to extract the prospect_id is fragile.

**Fix:** Accept `prospect_id` and `item_type` as separate parameters instead of the synthetic `item_id`. Cleaner, no parsing needed.

### I-7. No "undo" path for accidental bulk status changes

`batchUpdateField()` and bulk status changes are irreversible. If Justyn accidentally approves 50 wrong prospects, the only recovery is manual — change each one back. The `change_log` records what happened, but there's no "undo batch" action.

**Fix for v3:** At minimum, add a confirmation dialog on bulk actions ("Change status to SEND for 42 records?"). Undo can be v4.

---

## 4. Deferrals (Can Safely Defer to v4)

These features should be cut from the v3 build to reduce scope and ship faster. None of them block the core review workflow.

### D-1. TRACKED state + engagement tracking (hs_send_status, hs_open_count, hs_reply_count, hs_bounce)

Post-load engagement tracking requires a polling job or webhook to sync HubSpot engagement data back to Supabase. This is a separate system concern. The spec acknowledges it barely ("HubSpot sync checks engagement") with no implementation detail.

Cut the 4 tracking columns and the TRACKED state. The HubSpot dashboard already shows engagement natively. Adding a shadow copy in Mission Control is duplicated effort with sync risk.

### D-2. Side-by-side email diff in EmailPreview

The "Show changes" toggle with left/right diff rendering is a nice-to-have. The Changes tab already shows field-level diffs. Rendering a parallel email preview with inline highlighting is 100+ lines of tricky UI code for a feature Tim will use rarely.

Cut. The Changes tab is sufficient.

### D-3. `triggerRecomposition()` server action

This requires the engine to expose a single-prospect recomposition API. The engine currently runs as a batch CLI script. Making it callable from a server action means either: (a) running the full pipeline for one record (slow, expensive), or (b) building a new single-record composition endpoint. Both are non-trivial upstream work.

Cut. If an email needs recomposition, Justyn re-runs the engine for that prospect from the CLI. Mission Control doesn't need to trigger it.

### D-4. Pipeline run history in the Action Queue page

The spec says to move the `PipelineDashboard.tsx` to a collapsed section at the bottom of the Action Queue. This is migration work that adds no value. Either leave `/ops/pipeline` working as-is, or just add the Action Queue as a new page at `/ops/queue` without touching pipeline.

### D-5. HubSpot conflict detection

Conflict detection (owner mismatch between ShowRev assignment and HubSpot ownership) is valuable but adds complexity to the HubSpot check flow and the action queue. For the first 69 prospects, the AE assignments are known and stable. Conflicts are unlikely.

Defer to v4 when multi-show support and larger volumes make conflicts a real risk.

### D-6. Keyboard shortcuts for notes and changes tabs (n, c, 4, 5, m, g)

The existing keyboard shortcuts (j/k, 1/2/3, a/r/h) cover navigation and triage. The new shortcuts for notes, changes, mark-reviewed, and GO can be added after the core features are working. They're polish, not functionality.

---

## 5. Missing Requirements

Checking each user requirement against spec coverage:

### R-1. "final human review/sweep where they can get comfortable with the work the System has done"
**Status: Covered.** The review queue with expand/filter/approve flow addresses this.

### R-2. "the final product (email/microsite) is accurate, a compelling and persuasive pitch"
**Status: Partially covered.** The email preview and verification summary address accuracy. But there's no microsite preview or link validation in Mission Control. The spec shows a "View Microsite" link in the existing v2 code, and the wireframe shows "Microsite: lhtc-rosenberg" below the email. But there's no check that the microsite actually exists, is deployed, and renders correctly. A broken microsite link in a sent email is worse than no microsite.

**Missing:** Add a microsite status indicator next to the link — green if the slug resolves (HTTP 200), red if not. Can be checked client-side with a HEAD request to `fiber.inorsa.com/brief/{slug}`.

### R-3. "it has the best chance of engaging the attention of the prospect"
**Status: Covered indirectly.** The call prep brief, verification summary, and full intel display give the reviewer enough context to judge engagement potential. No additional spec changes needed.

### R-4. "review the AE assignments including easily identifying which prospects and/or companies are already in HS and at what stage"
**Status: Covered.** HubSpot status integration addresses this directly.

### R-5. "whichever Operator is reviewing (Justyn, Tim, AEs) that they can post notes"
**Status: Covered.** Multi-reviewer notes with attribution.

### R-6. "when there's a note posted the prospect is easily identified by Justyn as having had a change"
**Status: Covered.** Purple dot indicator + "has unresolved notes" filter + Action Queue.

### R-7. "if a change is made then it needs to create a different flag to show something about the file has changed/been updated"
**Status: Covered.** Orange diamond indicator + change tracking. The spec correctly uses a different visual indicator (diamond vs dot) to distinguish "has notes" from "has changes."

### R-8. Missing requirement the user didn't explicitly state but will hit immediately: "What does Tim actually DO after posting a note?"

The spec describes Tim posting a note, Justyn seeing it in the Action Queue, and resolving it. But the real-world flow is:

1. Tim posts note: "Company name is wrong"
2. Justyn sees it... 6 hours later
3. Justyn fixes it
4. Tim needs to re-review

There's no notification mechanism. The spec explicitly marks notifications as out-of-scope. For a team of 5, this is probably fine — Tim can check the queue periodically. But the spec should document the expected workflow: "Tim checks the Action Queue daily. Justyn resolves notes within 24 hours. Tim re-reviews on next session."

Without this, Tim will post notes and wonder if anyone saw them.

### R-9. Missing: Company-level grouping in notes

The user mentioned reviewing "prospects and/or companies." The spec has company grouping in the table view but notes are per-prospect only. If Tim notices that a company rebrand affects 4 prospects at the same company, he has to post the same note 4 times.

**Suggestion for v4:** Company-level notes that apply to all prospects at that company. For v3, the "Group by company" view at least lets Tim see them together.

---

## 6. Scope Assessment

### Current spec size
- 18 new/modified files (spec Section 7.1)
- 2 new Supabase tables (sr_review_notes, sr_review_timestamps per C-1 fix)
- 1 new Supabase view (sr_action_queue)
- 1 new RPC function (append_change_log per C-5 fix)
- 20 new columns on sr_engine_output (including 4 tracking columns that should be deferred per D-1)
- 11 new server actions
- 1 new API route

### Existing codebase
1,653 lines across 10 files. The spec estimates adding ~2,700 lines across 18 files. That's nearly tripling the codebase in one build.

### Is this buildable in one sprint?

No. The spec's "7 phases, 1 session each" estimate is optimistic. Phases 1-4 are buildable. Phases 5-7 have upstream dependencies (engine must write `call_prep_brief` and `verification_summary`) that don't exist yet and require changes to the composition pipeline — a completely separate codebase.

### Recommended Phase 1 (ship first, unblock Tim immediately)

Build only what's needed for Tim to review and post notes:

1. **Schema:** `sr_review_notes` table + `sr_review_timestamps` table + `has_unresolved_notes` computed join (not cached boolean)
2. **Notes system:** `NotesPanel.tsx`, `postNote()`, `resolveNote()`, `markReviewed()`, `fetchNotes()`
3. **Table indicators:** Notes dot + changed diamond on `ProspectRow`
4. **Filters:** "Has unresolved notes" checkbox
5. **Tab additions:** Notes tab (tab 4) in `ExpandedView`

This is ~800 lines of new code, 1 new table, 3 new server actions. Deliverable in one session.

### Recommended Phase 2 (ship second, once Phase 1 is validated)

6. **Change tracking:** `change_log` column, `logChange()` RPC, `ChangesPanel.tsx`, changed indicator
7. **Action Queue:** `queue/page.tsx`, `ActionQueue.tsx`, `ActionItem.tsx`, `fetchActionQueue()`

~800 more lines, 1 new view, 3 more server actions.

### Recommended Phase 3 (ship after engine updates)

8. **Email preview:** `EmailPreview.tsx`, `VerificationBadge.tsx` (requires engine to write `verification_summary`)
9. **Call prep brief:** `CallPrepBrief.tsx` (requires engine to write `call_prep_brief`)
10. **HubSpot status:** `HubSpotStatus.tsx`, `checkHubSpotStatus()`, API route

### v4 (defer entirely)

- Engagement tracking (TRACKED state)
- Side-by-side email diff
- In-portal recomposition trigger
- HubSpot conflict detection
- Company-level notes
- Notification system

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-02 14:30 | Claude | Initial red team report. 5 critical, 7 important, 6 deferrals, 9 requirement checks. |
