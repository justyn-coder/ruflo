---
title: Mission Control v3 — Operator Workflow Spec
status: ACTIVE
last_updated: 2026-06-02 07:23 EST
version: v2
---

# Mission Control v3 — Operator Workflow Spec

## 1. Problem Statement

Mission Control v2 has the table/filter/expand/keyboard UI working. What it lacks: multi-reviewer notes with attribution, change tracking, HubSpot status integration, an action queue for flagged items, AE call prep briefs, actionable verification summaries, and proper email preview rendering. These are the operator workflow features that bridge "AI generated output" to "human-approved, HubSpot-loaded sequence."

This spec covers the full review lifecycle from batch landing to post-load tracking.

---

## 2. Review Lifecycle

### 2.1 State Machine

```
                     ┌─────────┐
                     │ PENDING │ ← Engine writes output
                     └────┬────┘
                          │
                  Operator initial sweep
                          │
             ┌────────────┼────────────┐
             │            │            │
        ┌────▼───┐  ┌─────▼────┐ ┌────▼────┐
        │  SEND  │  │   HOLD   │ │ REJECT  │
        └────┬───┘  └─────┬────┘ └─────────┘
             │            │
        Tim reviews   Tim reviews
             │            │
             │     ┌──────▼──────┐
             │     │ NOTE POSTED │──► Action Queue
             │     └──────┬──────┘
             │            │
             │     Agent/Justyn resolves
             │            │
             │     ┌──────▼──────┐
             │     │  CHANGED    │──► "changed" badge
             │     └──────┬──────┘
             │            │
             │     Tim re-reviews changes
             │            │
             ├────────────┘
             │
        ┌────▼────┐
        │VERIFIED │ ← AE verifies (or re-verifies after changes)
        └────┬────┘
             │
        Operator final GO
             │
        ┌────▼────┐
        │   GO    │ ← Ready for HubSpot load
        └────┬────┘
             │
        ┌────▼────┐
        │ LOADED  │ ← In HubSpot, sequence enrolled
        └────┬────┘
             │
        ┌────▼────┐
        │ TRACKED │ ← Sent/opened/replied/bounced
        └─────────┘
```

### 2.2 End-to-End Flow

| Step | Actor | Action | System Response |
|------|-------|--------|-----------------|
| 1 | Engine | Batch completes | Records land in `sr_engine_output` with status `pending` |
| 2 | Justyn | Opens Mission Control, filters by signal strength "Strong" + "Good" | Sees top prospects, scans emails |
| 3 | Justyn | Bulk-approves obvious "send" candidates (checkbox + "Approve All") | Status → `send` for selected records |
| 4 | Tim | Filters for status = `send`, reads each email | Reviews tone, accuracy, relevance |
| 5 | Tim | Posts note on a prospect: "Company name is wrong — they rebranded in 2025" | Note created, prospect gets "needs attention" flag, item appears in Action Queue |
| 6 | Justyn | Opens Action Queue, sees Tim's note | Reads the issue, decides what to do |
| 7 | Agent/Justyn | Fixes the company name, re-composes the email | Change logged (old value → new value), record gets "changed" badge |
| 8 | Justyn | Marks note as resolved | Flag clears, but note history preserved |
| 9 | Tim | Filters for "changed since my last review" | Sees only the diff, not the full record |
| 10 | Tim | Verifies the fix is good | Posts approval note |
| 11 | AE (Mike) | Reviews his assigned prospects | Posts notes from his perspective, marks "verified" |
| 12 | Justyn | Final GO | Status → `go`, record is ready for HubSpot loader |
| 13 | System | HubSpot loader runs | Status → `loaded`, HubSpot contact ID stored |
| 14 | System | HubSpot sync checks engagement | Tracks: sent, opened, replied, bounced |

---

## 3. User Stories

### 3.1 Justyn (Operator)

```
US-OP-01: As Justyn, I want to see which records have unresolved notes so I can
          prioritize fixing issues before final GO.

US-OP-02: As Justyn, I want to bulk-approve obvious "send" candidates by selecting
          rows and clicking one button.

US-OP-03: As Justyn, I want to see a diff of what changed on a record since its
          last review so I can verify fixes without re-reading everything.

US-OP-04: As Justyn, I want to trigger re-composition for a single prospect from
          within Mission Control.

US-OP-05: As Justyn, I want to see whether a contact already exists in HubSpot
          and if there are ownership conflicts before loading.

US-OP-06: As Justyn, I want an Action Queue that aggregates everything needing
          attention — notes, failures, changes, conflicts — in priority order.

US-OP-07: As Justyn, I want to filter the review queue by "has unresolved notes"
          to quickly find prospects needing attention.

US-OP-08: As Justyn, I want to see a verification summary showing exactly which
          claims are verified vs unverified, not just "Research Confidence: medium".

US-OP-09: As Justyn, I want the email preview to render as it would appear in an
          inbox, with From line, subject, body, P.S., signature, and word count.

US-OP-10: As Justyn, I want to see post-load tracking (sent, opened, replied,
          bounced) for GO'd records.
```

### 3.2 Tim (Human Reviewer)

```
US-TR-01: As Tim, I want to post a note on any prospect with my name attributed,
          so corrections are traceable.

US-TR-02: As Tim, I want to filter for "changed since my last review" so I only
          re-read what's been fixed, not the entire queue.

US-TR-03: As Tim, I want to classify my note as "issue" vs "comment" vs "approval"
          so the operator knows what action is needed.

US-TR-04: As Tim, I want to see the call prep brief so I can validate it alongside
          the email.

US-TR-05: As Tim, I want to see the verification summary to know which claims in
          the email are backed by sources.
```

### 3.3 AEs (Mike, Nathan, Lucas)

```
US-AE-01: As an AE, I want to see only my assigned prospects when I open Mission
          Control.

US-AE-02: As an AE, I want to post notes about prospects I know personally (e.g.,
          "I met this person at ISE, they're interested in permit tracking").

US-AE-03: As an AE, I want to read the call prep brief and the email before my
          team reviews it, so my feedback is informed.

US-AE-04: As an AE, I want to mark a prospect as "verified" from my perspective
          without triggering a final GO.

US-AE-05: As an AE, I want to see HubSpot status for my assigned prospects (is
          the contact already in my pipeline? Do I already have a deal?).
```

### 3.4 System

```
US-SY-01: As the system, I want to create action queue items when mechanical
          checks fail, so operators see failures without polling.

US-SY-02: As the system, I want to log every field change with old/new values,
          who changed it, and when, for audit trail.

US-SY-03: As the system, I want to mark records as "changed" after any update
          so reviewers know to re-review.

US-SY-04: As the system, I want to post automated notes when verification finds
          issues, attributed to "System".
```

---

## 4. Screen-by-Screen Wireframes

### 4.1 Review Queue (existing `/ops`, enhanced)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  SHOWREV MISSION CONTROL                                                     │
│  Fiber Connect 2026 — Review Queue                                           │
│                                                                              │
│  [Review Queue]   [Action Queue (3)]   [Brain]   [Architecture]              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─ Filters ──────────────────────────────────────────────────────────────┐  │
│  │ [Search...........] [Signal ▾] [Persona ▾] [Status ▾] [AE ▾]         │  │
│  │ [Company ▾] [☐ Has unresolved notes] [☐ Changed since last review]    │  │
│  │ [☐ Needs HubSpot check]                                    [Clear]    │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ Stats ────────────────────────────────────────────────────────────────┐  │
│  │  147 total │ ● 42 Send │ ● 12 Hold │ ● 8 Reject │ ● 3 GO │ ● 82 Pnd│  │
│  │  ▲ 5 notes unresolved │ ▲ 3 changed since review                     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  [☐ Group by company]                                    [? shortcuts]       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ ☐ │Sig│ Name, Title          │ Company     │Persona│Status│✓│◆│♦│AE  │  │
│  ├────────────────────────────────────────────────────────────────────────┤  │
│  │ ☐ │ ● │ Matt Rosenberg       │ LHTC        │Ops Mgr│ SEND │✓│ │●│Mike│  │
│  │    │   │ VP of Operations     │   [logo]    │       │      │ │ │ │    │  │
│  │───────────────────────────────────────────────────────────────────────│  │
│  │ ☐ │ ● │ Chris Fort           │ Centillion  │Exec   │ HOLD │ │▲│ │Nath│  │
│  │    │   │ CEO                  │   [logo]    │       │      │ │ │ │    │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Column legend:                                                              │
│    Sig = signal dot    ✓ = AE verified    ◆ = has notes (● = unresolved)     │
│    ♦ = changed since last review    ▲ = unresolved notes count               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**New columns in the table row:**

| Column | Width | Content |
|--------|-------|---------|
| Notes indicator (◆) | 28px | Purple dot if notes exist. Filled = unresolved. Empty outline = all resolved. Count badge if > 1 unresolved. |
| Changed indicator (♦) | 28px | Orange diamond if record changed since reviewer's `last_reviewed_at`. |

### 4.2 Expanded View — Email Tab (enhanced)

```
┌──────────────────────────────────────────────────────────────────────┐
│  [Email]  [Intel]  [Dossier]  [Notes (2)]  [Changes]               │
│                                            [SEND] [HOLD] [REJECT]  │
│                                                                      │
│  ┌─ Email Preview ─────────────────────────────────────────────────┐│
│  │                                                                  ││
│  │  From: Mike Rutski <mike@inorsa.com>                            ││
│  │  Subject: Quick question about your PA Telephone integration     ││
│  │                                                                  ││
│  │  ─────────────────────────────────────────────────────────────   ││
│  │                                                                  ││
│  │  Matt,                                                           ││
│  │                                                                  ││
│  │  Absorbing a new service territory with different permit         ││
│  │  standards isn't easy — especially when you're trying to         ││
│  │  maintain consistency across both regions.                       ││
│  │                                                                  ││
│  │  We've helped carriers like TDS and Lumen standardize their     ││
│  │  QC workflows after acquisitions. Usually cuts rework 40%.       ││
│  │                                                                  ││
│  │  Worth a 15-minute look?                                         ││
│  │                                                                  ││
│  │  P.S. We built a quick brief on LHTC's expansion —              ││
│  │  fiber.inorsa.com/brief/lhtc-rosenberg                           ││
│  │                                                                  ││
│  │  Mike Rutski | Inorsa | mike@inorsa.com                         ││
│  │                                                                  ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  72 words · T1 email · Microsite: lhtc-rosenberg                     │
│                                                                      │
│  ┌─ Verification ──────────────────────────────────────────────────┐│
│  │  5 of 7 claims verified  ·  2 unverified                        ││
│  │                                                                  ││
│  │  ● "PA Telephone acquisition" — VERIFIED (Tier 1: SEC filing)   ││
│  │  ● "different permit standards" — VERIFIED (PA PUC records)     ││
│  │  ● "40% rework reduction" — UNVERIFIED (Inorsa internal claim)  ││
│  │  ● "TDS comparison" — VERIFIED (case study on website)          ││
│  │  ○ "carriers like TDS and Lumen" — REPORTED (press release)     ││
│  │  ...                                                             ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.3 Expanded View — Intel Tab (enhanced with Call Prep Brief)

```
┌──────────────────────────────────────────────────────────────────────┐
│  [Email]  [Intel]  [Dossier]  [Notes (2)]  [Changes]               │
│                                                                      │
│  ┌─ Call Prep Brief ───────────────────────────────────────────────┐│
│  │                                                                  ││
│  │  Matt runs operations at LHTC, a rural CLEC in western PA       ││
│  │  that just acquired Pennsylvania Telephone. His team is          ││
│  │  absorbing a new service territory with different permit         ││
│  │  standards. Lead with the QC consistency angle — same standard   ││
│  │  across both territories. Watch for budget objections — small    ││
│  │  rural carrier, likely tight.                                    ││
│  │                                                                  ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─ HubSpot Status ───────────────────────────────────────────────┐ │
│  │  ● New to HubSpot — contact does not exist                     │ │
│  │  Company "LHTC Broadband" — not found in HubSpot               │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ── Signal & Context ───────────────────────────────────────────    │
│  │  Signal Strength    │  ● Strong                                  │
│  │  Persona            │  Operations Mgr                            │
│  │  Company Summary    │  Rural CLEC in western PA...               │
│  │  Challenger Insight │  Same-standard QC across territories...    │
│  │  Next Action        │  Book demo                                 │
│  │  Buying Timeline    │  Q4 2026 (BEAD construction start)         │
│  │                                                                   │
│  ── High Value Intel ──────────────────────────────────────────     │
│  │  Talking Points     │  Ask about PA integration timeline...      │
│  │  ...                │  ...                                       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.4 Expanded View — Notes Tab (NEW)

```
┌──────────────────────────────────────────────────────────────────────┐
│  [Email]  [Intel]  [Dossier]  [Notes (2)]  [Changes]               │
│                                                                      │
│  ┌─ Post Note ─────────────────────────────────────────────────────┐│
│  │  Author: [Justyn ▾]  Type: [Issue ▾]                            ││
│  │  ┌──────────────────────────────────────────────────────────┐   ││
│  │  │                                                          │   ││
│  │  │  (textarea)                                              │   ││
│  │  │                                                          │   ││
│  │  └──────────────────────────────────────────────────────────┘   ││
│  │                                                     [Post Note] ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ── Note History ──────────────────────────────────────────────────  │
│                                                                      │
│  ┌ UNRESOLVED ─────────────────────────────────────────────────────┐│
│  │  ⚠ ISSUE · Tim · Jun 1 at 2:14 PM                              ││
│  │  "Company rebranded from LHTC to LHTC Broadband in 2025.       ││
│  │   Email uses old name."                                          ││
│  │                                                      [Resolve]  ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌ RESOLVED ───────────────────────────────────────────────────────┐│
│  │  ✓ ISSUE · Tim · May 31 at 10:00 AM                            ││
│  │  "Subject line too long — 78 chars, will truncate in Gmail"     ││
│  │  → Resolved by Justyn · Jun 1 at 11:30 AM                      ││
│  │                                                                  ││
│  │  💬 COMMENT · System · May 31 at 9:45 AM                        ││
│  │  "Mechanical check: word count 84, exceeds 80-word limit"       ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.5 Expanded View — Changes Tab (NEW)

```
┌──────────────────────────────────────────────────────────────────────┐
│  [Email]  [Intel]  [Dossier]  [Notes (2)]  [Changes]               │
│                                                                      │
│  ┌─ Filter ──────────────────────────────────────────────────────┐  │
│  │  Since: [My last review ▾]  [Jun 1 at 2:14 PM]               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ── Changes ───────────────────────────────────────────────────────  │
│                                                                      │
│  Jun 1 at 3:00 PM · Justyn · Batch update (69 records)              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  email_body                                                   │   │
│  │  - "Worth a 15-minute look at how we handle this?"           │   │
│  │  + "Worth a 15-minute look?"                                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Jun 1 at 11:30 AM · Justyn · Manual edit                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  company_name                                                 │   │
│  │  - "LHTC"                                                    │   │
│  │  + "LHTC Broadband"                                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  May 31 at 9:45 AM · System · Initial composition                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  (initial values — no diff, record created)                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.6 Action Queue (`/ops/queue` — replaces `/ops/pipeline`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  SHOWREV MISSION CONTROL                                                     │
│  Action Queue                                                                │
│                                                                              │
│  [Review Queue]   [Action Queue (7)]   [Brain]   [Architecture]              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─ Stats ────────────────────────────────────────────────────────────────┐  │
│  │  7 open items │ ● 2 Verification failures │ ● 3 Notes │ ● 2 Changes  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ Filter ──────────────────────────────────────────────────────────────┐  │
│  │  Type: [All ▾]  Priority: [All ▾]  AE: [All ▾]  Since: [All time ▾] │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ── Priority: High (Verification Failures) ────────────────────────────────  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  🔴 VERIFICATION FAILURE                                             │   │
│  │  Chris Fort · Centillion Networks                                    │   │
│  │  Claim "$250M fiber expansion" unverified — no source found          │   │
│  │  System · Jun 1 at 9:00 AM                                           │   │
│  │                                    [View Record]  [Resolve]          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ── Priority: Medium (Reviewer Notes) ─────────────────────────────────────  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  🟡 ISSUE NOTE                                                       │   │
│  │  Matt Rosenberg · LHTC Broadband                                     │   │
│  │  "Company rebranded from LHTC to LHTC Broadband in 2025"            │   │
│  │  Tim · Jun 1 at 2:14 PM                                              │   │
│  │                                    [View Record]  [Resolve]          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ── Priority: Low (Record Changes) ───────────────────────────────────────  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  🔵 RECORD CHANGED                                                   │   │
│  │  Troy Hoover · PCCI Group                                            │   │
│  │  email_body updated (CTA replacement batch)                          │   │
│  │  Justyn · Jun 1 at 3:00 PM                                           │   │
│  │                                    [View Record]  [Resolve]          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ── Resolved (collapsed, click to expand) ─────────────────────────────────  │
│  ▶ 12 resolved items                                                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Model

### 5.1 Schema Changes to `sr_engine_output`

Add these columns to the existing table:

```sql
ALTER TABLE sr_engine_output
  ADD COLUMN IF NOT EXISTS call_prep_brief       TEXT,
  ADD COLUMN IF NOT EXISTS verification_summary  JSONB,
  -- Review workflow (C-1/C-2 fix: per-reviewer timestamps in separate table, no stale booleans)
  ADD COLUMN IF NOT EXISTS call_prep_brief       TEXT,
  ADD COLUMN IF NOT EXISTS verification_summary  JSONB,
  ADD COLUMN IF NOT EXISTS change_log            JSONB DEFAULT '[]'::jsonb,
  -- HubSpot integration (Phase 3)
  ADD COLUMN IF NOT EXISTS hs_contact_id         TEXT,
  ADD COLUMN IF NOT EXISTS hs_contact_status     TEXT,
  ADD COLUMN IF NOT EXISTS hs_lifecycle_stage    TEXT,
  ADD COLUMN IF NOT EXISTS hs_owner_name         TEXT,
  ADD COLUMN IF NOT EXISTS hs_last_activity      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hs_conflict           TEXT,
  ADD COLUMN IF NOT EXISTS hs_conflict_detected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loaded_to_hs_at       TIMESTAMPTZ,
  -- C-3 fix: separate integration lifecycle from review lifecycle
  ADD COLUMN IF NOT EXISTS hs_load_status        TEXT;
```

**`verification_summary` JSONB shape:**

```typescript
interface VerificationSummary {
  total_claims: number;
  verified_count: number;
  unverified_count: number;
  blocker_count: number;
  claims: Array<{
    claim: string;
    claim_type: string;      // "financial" | "project" | "personnel" | "timeline" | "competitive"
    verified: boolean;
    confidence: string;      // "tier1" | "tier2" | "reported" | "unverified"
    source_url: string;
    source_snippet: string;
    discrepancy: string;     // empty if verified
    tag: string;             // "[VERIFIED — Tier 1: sec.gov]"
    is_blocker: boolean;     // true if claim is in the email body
  }>;
}
```

**`change_log` JSONB array shape:**

```typescript
type ChangeLogEntry = {
  timestamp: string;      // ISO 8601
  author: string;         // "Justyn" | "Tim" | "System" | "Engine"
  change_type: string;    // "manual_edit" | "batch_update" | "recomposition" | "initial"
  batch_id?: string;      // links bulk changes together
  fields: Array<{
    field: string;        // column name
    old_value: string;
    new_value: string;
  }>;
};
```

### 5.2 New Table: `sr_review_notes`

```sql
CREATE TABLE sr_review_notes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id    TEXT NOT NULL REFERENCES sr_engine_output(prospect_id),
  author         TEXT NOT NULL,                    -- "Justyn" | "Tim" | "Mike Rutski" | "Nathan Dunn" | "Lucas Spencer" | "System"
  note_type      TEXT NOT NULL CHECK (note_type IN ('comment', 'issue', 'resolution', 'approval')),
  content        TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved       BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by    TEXT,
  resolved_at    TIMESTAMPTZ,

  -- FK index for fast lookup by prospect
  CONSTRAINT fk_prospect FOREIGN KEY (prospect_id)
    REFERENCES sr_engine_output(prospect_id) ON DELETE CASCADE
);

CREATE INDEX idx_review_notes_prospect ON sr_review_notes(prospect_id);
CREATE INDEX idx_review_notes_unresolved ON sr_review_notes(prospect_id)
  WHERE resolved = FALSE AND note_type = 'issue';
```

### 5.2b New Table: `sr_review_timestamps` (C-1 fix)

Per-reviewer tracking of when each reviewer last looked at each prospect.
"Changed since my last review" is computed at query time, not cached.

```sql
CREATE TABLE sr_review_timestamps (
  prospect_id TEXT NOT NULL,
  reviewer    TEXT NOT NULL,
  last_reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (prospect_id, reviewer)
);
```

### 5.2c RPC Function: `append_change_log` (C-5 fix)

Atomic JSONB append — prevents concurrent write races.

```sql
CREATE OR REPLACE FUNCTION append_change_log(
  p_prospect_id TEXT,
  p_entry JSONB
) RETURNS VOID AS $$
  UPDATE sr_engine_output
  SET change_log = COALESCE(change_log, '[]'::jsonb) || p_entry,
      updated_at = NOW()
  WHERE prospect_id = p_prospect_id;
$$ LANGUAGE SQL;
```

### 5.3 New View: `sr_action_queue`

A view that aggregates items needing attention from multiple sources:

```sql
CREATE OR REPLACE VIEW sr_action_queue AS

-- Unresolved notes
SELECT
  n.id AS item_id,
  n.prospect_id,
  e.first_name || ' ' || e.last_name AS prospect_name,
  e.company AS company_name,
  'note' AS item_type,
  CASE
    WHEN n.note_type = 'issue' THEN 'medium'
    ELSE 'low'
  END AS priority,
  n.content AS description,
  n.author AS triggered_by,
  n.created_at AS triggered_at,
  n.note_type AS detail_type,
  e.assigned_ae
FROM sr_review_notes n
JOIN sr_engine_output e ON e.prospect_id = n.prospect_id
WHERE n.resolved = FALSE AND n.note_type IN ('issue', 'comment')

UNION ALL

-- Verification failures (blocker claims)
SELECT
  e.prospect_id || '-vfail' AS item_id,
  e.prospect_id,
  e.first_name || ' ' || e.last_name AS prospect_name,
  e.company AS company_name,
  'verification_failure' AS item_type,
  'high' AS priority,
  COALESCE(
    (e.verification_summary->>'unverified_count') || ' unverified claims',
    'Verification incomplete'
  ) AS description,
  'System' AS triggered_by,
  e.created_at AS triggered_at,
  'verification' AS detail_type,
  e.assigned_ae
FROM sr_engine_output e
WHERE e.verification_summary IS NOT NULL
  AND (e.verification_summary->>'blocker_count')::int > 0

UNION ALL

-- Changed records not yet re-reviewed
SELECT
  e.prospect_id || '-changed' AS item_id,
  e.prospect_id,
  e.first_name || ' ' || e.last_name AS prospect_name,
  e.company AS company_name,
  'record_changed' AS item_type,
  'low' AS priority,
  'Record modified since last review' AS description,
  COALESCE(
    (e.change_log->-1->>'author'),
    'System'
  ) AS triggered_by,
  COALESCE(
    (e.change_log->-1->>'timestamp')::timestamptz,
    e.updated_at
  ) AS triggered_at,
  'change' AS detail_type,
  e.assigned_ae
FROM sr_engine_output e
WHERE e.change_log IS NOT NULL
  AND jsonb_array_length(e.change_log) > 0
  AND NOT EXISTS (
    SELECT 1 FROM sr_review_timestamps rt
    WHERE rt.prospect_id = e.prospect_id
    AND rt.last_reviewed_at > (e.change_log->-1->>'timestamp')::timestamptz
  )

UNION ALL

-- HubSpot ownership conflicts
SELECT
  e.prospect_id || '-hsconflict' AS item_id,
  e.prospect_id,
  e.first_name || ' ' || e.last_name AS prospect_name,
  e.company AS company_name,
  'hs_conflict' AS item_type,
  'medium' AS priority,
  e.hs_conflict AS description,
  'System' AS triggered_by,
  e.hs_conflict_detected_at AS triggered_at,
  'hubspot' AS detail_type,
  e.assigned_ae
FROM sr_engine_output e
WHERE e.hs_conflict IS NOT NULL AND e.hs_conflict != ''

ORDER BY
  CASE priority
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 3
  END,
  triggered_at DESC;
```

### 5.4 Entity Relationship Diagram

```
┌─────────────────────┐     ┌────────────────────────┐
│   sr_prospects      │     │   sr_engine_output     │
│                     │     │                        │
│   id (PK)          │◄────│   prospect_id (FK)     │
│   email             │     │   ...existing cols...  │
│   send_status       │     │   call_prep_brief      │
│   ae_review_status  │     │   verification_summary │
│   operator_go       │     │   last_reviewed_at     │
│   assigned_ae       │     │   last_reviewed_by     │
│   ...               │     │   change_log           │
│                     │     │   hs_contact_id        │
│                     │     │   hs_contact_status    │
│                     │     │   has_unresolved_notes  │
│                     │     │   changed_since_review  │
│                     │     │   loaded_to_hs_at      │
│                     │     │   hs_send_status       │
│                     │     │   hs_open_count        │
│                     │     │   hs_reply_count       │
│                     │     │   hs_bounce            │
└─────────────────────┘     └────────────┬───────────┘
                                         │
                                         │ 1:N
                                         │
                            ┌────────────▼───────────┐
                            │   sr_review_notes      │
                            │                        │
                            │   id (PK, UUID)        │
                            │   prospect_id (FK)     │
                            │   author               │
                            │   note_type            │
                            │   content              │
                            │   created_at           │
                            │   resolved             │
                            │   resolved_by          │
                            │   resolved_at          │
                            └────────────────────────┘

                            ┌────────────────────────┐
                            │   sr_action_queue      │
                            │   (VIEW — not a table) │
                            │                        │
                            │   Aggregates from:     │
                            │   - sr_review_notes    │
                            │   - sr_engine_output   │
                            │     (verification_     │
                            │      summary, changes, │
                            │      hs_conflict)      │
                            └────────────────────────┘
```

---

## 6. API Routes

### 6.1 Server Actions (extend `actions.ts`)

| Action | Method | Purpose | Auth |
|--------|--------|---------|------|
| `postNote(prospectId, author, noteType, content)` | Server Action | Create a review note. Sets `has_unresolved_notes = true` on the prospect if type is "issue". | All roles |
| `resolveNote(noteId, resolvedBy)` | Server Action | Mark note as resolved. Recalculates `has_unresolved_notes` on the prospect. | Justyn only |
| `markReviewed(prospectId, reviewer)` | Server Action | Sets `last_reviewed_at` = now, `last_reviewed_by` = reviewer, clears `changed_since_review`. | All roles |
| `logChange(prospectId, author, changeType, fields, batchId?)` | Server Action | Appends to `change_log` JSONB array. Sets `changed_since_review = true`. | System/Justyn |
| `updateField(prospectId, field, newValue, author)` | Server Action | Updates a single field on `sr_engine_output`. Calls `logChange` internally. | Justyn only |
| `batchUpdateField(prospectIds, field, newValue, author)` | Server Action | Updates field across multiple records. Creates single batch change event with shared `batch_id`. | Justyn only |
| `checkHubSpotStatus(prospectId, email, domain)` | Server Action | Calls HubSpot API to check contact existence, lifecycle stage, owner, deal status. Writes results to `hs_*` columns. | Justyn only |
| `batchCheckHubSpot(prospectIds)` | Server Action | Runs `checkHubSpotStatus` for multiple records. | Justyn only |
| `triggerRecomposition(prospectId)` | Server Action | Calls engine to re-compose email for a single prospect. | Justyn only |
| `fetchActionQueue(filters?)` | Server Action | Reads `sr_action_queue` view with optional type/priority/AE filters. | All roles |
| `resolveActionItem(itemId, type)` | Server Action | Resolves an action queue item by type: note → resolves the note, verification → clears blocker flag, changed → clears `changed_since_review`. | Justyn only |
| `fetchNotes(prospectId)` | Server Action | Returns all notes for a prospect, ordered by `created_at` desc. | All roles |

### 6.2 API Route (HubSpot Proxy)

Because HubSpot API calls require the private app token (server-side only), add an API route:

**File:** `app/ops/api/hubspot/route.ts`

```
GET /ops/api/hubspot?email=matt@lhtc.com&domain=lhtc.com

Response:
{
  "exists": true,
  "contact_id": "12345",
  "lifecycle_stage": "lead",
  "owner_name": "Mike Rutski",
  "last_activity": "2026-05-20T14:00:00Z",
  "deal_status": null,
  "status_label": "Existing — Active",
  "conflict": null
}
```

Status labels:
- `"New to HS"` — contact not found
- `"Existing — Active"` — contact exists, activity in last 30 days
- `"Existing — Stale"` — contact exists, no activity in 30+ days
- `"Existing — Lost"` — contact exists, deal marked as "closedlost"

Conflict detection: If `hs_owner_name` differs from `assigned_ae` on the ShowRev record, set `hs_conflict` to a human-readable string like "Owned by Mike in HubSpot but assigned to Nathan in ShowRev."

---

## 7. Component Breakdown

### 7.1 File Structure

```
app/ops/
  page.tsx                     -- Server component (existing, extended)
  OpsTable.tsx                 -- Main client orchestrator (existing, extended)
  actions.ts                   -- Server actions (existing, extended with 11 new actions)
  api/
    hubspot/
      route.ts                 -- HubSpot proxy API route (NEW)
  components/
    types.ts                   -- Shared types (existing, extended)
    FilterBar.tsx              -- Search + filters (existing, extended with note/change filters)
    StatsBar.tsx               -- Status counts (existing, extended with note/change counts)
    ProspectRow.tsx            -- Table row (existing, extended with note/change indicators)
    ExpandedView.tsx           -- Tab container (existing, refactored to delegate to tab components)
    BulkActions.tsx            -- Bulk action bar (existing, extend with batch update)
    KeyboardHelp.tsx           -- Keyboard shortcuts (existing, extend)
    EmailPreview.tsx           -- Inbox-style email render (NEW, <300 lines)
    IntelPanel.tsx             -- Intel tab content with call prep brief + HS status (NEW, <400 lines)
    NotesPanel.tsx             -- Notes tab with post form + history (NEW, <350 lines)
    ChangesPanel.tsx           -- Change log diff viewer (NEW, <250 lines)
    VerificationBadge.tsx      -- Verification summary component (NEW, <150 lines)
    HubSpotStatus.tsx          -- HubSpot status indicator (NEW, <120 lines)
    CallPrepBrief.tsx          -- Call prep brief display (NEW, <80 lines)
  queue/
    page.tsx                   -- Action Queue server component (NEW, replaces pipeline/page.tsx)
    ActionQueue.tsx            -- Action Queue client component (NEW, <400 lines)
    ActionItem.tsx             -- Single action queue item (NEW, <150 lines)
```

### 7.2 Component Responsibilities

| Component | Responsibility | Max Lines |
|-----------|---------------|-----------|
| `page.tsx` | Fetches data from Supabase (sr_prospects, sr_engine_output, sr_review_notes). Merges into `Row[]`. Passes to OpsTable. **New:** Also fetches `sr_review_notes` counts per prospect and passes note/change metadata. | 250 |
| `OpsTable.tsx` | Orchestrates filters, sort, selection, keyboard, expansion. **New:** Passes notes data to ExpandedView. Adds "has unresolved notes" and "changed since review" filter toggles. | 400 |
| `actions.ts` | All server actions. **New:** 11 additional actions for notes, changes, HubSpot, recomposition. | 400 |
| `types.ts` | Shared interfaces. **New:** Extends `Row` with `call_prep_brief`, `verification_summary`, `last_reviewed_at`, `last_reviewed_by`, `change_log`, `hs_*` fields, `has_unresolved_notes`, `changed_since_review`, `notes_count`, `unresolved_notes_count`. Adds `NoteType`, `ChangeLogEntry`, `VerificationSummary`, `ActionQueueItem` interfaces. | 200 |
| `FilterBar.tsx` | **New:** Two additional checkbox filters: "Has unresolved notes" and "Changed since last review". | 120 |
| `StatsBar.tsx` | **New:** Shows unresolved note count and changed-since-review count alongside existing status counts. | 80 |
| `ProspectRow.tsx` | **New:** Two additional indicator columns (notes dot, changed diamond). Notes dot is filled purple if unresolved, outline if all resolved. Changed diamond is orange. | 220 |
| `ExpandedView.tsx` | Refactored into thin tab container. Delegates to: `EmailPreview`, `IntelPanel`, dossier content, `NotesPanel`, `ChangesPanel`. **New:** Two new tabs: "Notes (N)" and "Changes". | 150 |
| `EmailPreview.tsx` | Renders email as inbox preview. Shows: From line (AE name + email), Subject, body with paragraph breaks, P.S., signature. Word count. Microsite link. Side-by-side diff option (original vs current). | 300 |
| `IntelPanel.tsx` | Existing intel content + **new:** `CallPrepBrief` at top, `HubSpotStatus` below, then existing signal/persona/company fields. | 400 |
| `NotesPanel.tsx` | Post note form (author dropdown, type dropdown, textarea). Note history sorted by date, grouped by resolved/unresolved. Resolve button per note. | 350 |
| `ChangesPanel.tsx` | Reads `change_log` from row data. Shows diffs with old/new highlighting. Filter: "since my last review" vs "all changes". | 250 |
| `VerificationBadge.tsx` | Parses `verification_summary` JSONB. Shows "X of Y verified" with color code. Expandable claim list. | 150 |
| `HubSpotStatus.tsx` | Shows HS status badge. Color-coded: green (new), blue (active), yellow (stale), red (lost). Conflict warning if ownership mismatch. | 120 |
| `CallPrepBrief.tsx` | Displays `call_prep_brief` text in a highlighted card at the top of the Intel tab. | 80 |
| `queue/page.tsx` | Server component. Fetches `sr_action_queue` view. Counts by type/priority. Passes to `ActionQueue`. | 100 |
| `queue/ActionQueue.tsx` | Client component. Filters, groups by priority. Renders `ActionItem` list. Handles resolve actions. | 400 |
| `queue/ActionItem.tsx` | Single action queue card. Shows type icon, prospect info, description, author, timestamp, action buttons. | 150 |

---

## 8. Reviewer Roles & Permissions

### 8.1 Role Matrix

| Capability | Justyn (Operator) | Tim (Reviewer) | AEs (Mike/Nathan/Lucas) | System |
|------------|:-:|:-:|:-:|:-:|
| View all prospects | Yes | Yes | Own AE only | N/A |
| Change send_status | Yes | No | No | No |
| Post notes | Yes | Yes | Yes (own prospects) | Yes |
| Resolve notes | Yes | No | No | No |
| Mark "verified" (AE review) | Yes | No | Yes (own prospects) | No |
| Final GO | Yes | No | No | No |
| Trigger recomposition | Yes | No | No | No |
| Edit fields | Yes | No | No | Yes |
| Bulk operations | Yes | No | No | Yes |
| View Action Queue | Yes | Yes | Yes (filtered to own AE) | N/A |
| Check HubSpot status | Yes | No | No | Yes |
| View changes | Yes | Yes | Yes (own prospects) | N/A |

### 8.2 Implementation

v3 does NOT require a login system. Role selection is via a URL parameter or localStorage-persisted dropdown:

```
/ops?role=operator        → Justyn (full access)
/ops?role=reviewer        → Tim (read + notes)
/ops?role=ae&name=Mike    → Mike (filtered to assigned_ae)
```

The role selector appears in the header bar. Default is `operator`.

Rationale: The portal is internal, deployed on a private URL, and the team is 5 people. Authentication adds complexity without proportional security value at this stage.

---

## 9. Feature Specifications

### 9.1 Multi-Reviewer Notes with Attribution

**Posting a note:**
1. User selects author from dropdown (defaults to current role's name).
2. User selects note type: `comment`, `issue`, `resolution`, `approval`.
3. User writes content in textarea.
4. On submit: `postNote()` server action inserts into `sr_review_notes`.
5. If note type is `issue`: server action also sets `has_unresolved_notes = true` on `sr_engine_output`.
6. Action Queue gets a new item (via the view).

**Resolving a note:**
1. Justyn clicks "Resolve" on an unresolved note.
2. `resolveNote()` sets `resolved = true`, `resolved_by`, `resolved_at`.
3. Server action recalculates `has_unresolved_notes` by checking if any unresolved issues remain for that prospect.
4. If none remain, clears the flag.

**Filtering for notes:**
- FilterBar checkbox: "Has unresolved notes" → filters rows where `has_unresolved_notes = true`.
- StatsBar shows: "X notes unresolved" count.

### 9.2 Change Management / Diff Tracking

**Logging changes:**
- Every call to `updateField()` or `batchUpdateField()` appends to the `change_log` JSONB array.
- Format: `{ timestamp, author, change_type, batch_id?, fields: [{ field, old_value, new_value }] }`
- Batch operations generate one entry per record, all sharing the same `batch_id`.

**"Changed" badge:**
- When `change_log` is appended, server action sets `changed_since_review = true`.
- When reviewer calls `markReviewed()`, server action sets `changed_since_review = false` and `last_reviewed_at` = now.
- ProspectRow shows orange diamond indicator when `changed_since_review = true`.

**Changes tab:**
- Reads `change_log` from row data (already fetched, no additional query).
- Default filter: "Since my last review" (uses `last_reviewed_at` from the row).
- Shows diffs with red/green highlighting (old value in red, new value in green).
- Batch changes show a "Batch update (N records)" header.

### 9.3 HubSpot Status Integration

**Check flow:**
1. On demand: Justyn clicks "Check HubSpot" in the Intel tab.
2. `checkHubSpotStatus()` calls HubSpot API:
   - `GET /crm/v3/objects/contacts/search` with email filter
   - If found: `GET /crm/v3/objects/contacts/{id}?associations=deals` for deals + owner
3. Results written to `hs_*` columns on `sr_engine_output`.
4. Conflict detection: compares `hs_owner_name` with `assigned_ae`.

**Batch check:**
- Justyn selects multiple rows → "Check HubSpot" bulk action.
- `batchCheckHubSpot()` runs checks with a 200ms delay between calls (rate limit).

**Display:**
- `HubSpotStatus` component shows badge:
  - Green: "New to HS" (contact not found — safe to create)
  - Blue: "Existing — Active" (found, recent activity)
  - Yellow: "Existing — Stale" (found, no recent activity)
  - Red: "Existing — Lost" (found, closed-lost deal)
- If conflict exists: red warning text below the badge.

### 9.4 Action Queue

**Replaces:** `/ops/pipeline` (current run-history dashboard).

**Pipeline run history moves to:** Bottom section of the Action Queue page, collapsed by default, or accessible via "Run History" toggle.

**Item sources (from `sr_action_queue` view):**
1. Unresolved `issue` notes → priority: medium
2. Verification failures (blocker_count > 0) → priority: high
3. Changed records not re-reviewed → priority: low
4. HubSpot ownership conflicts → priority: medium

**Item lifecycle:**
1. Item appears in queue when trigger condition is met.
2. Operator clicks "View Record" → navigates to `/ops` with that prospect expanded.
3. Operator resolves underlying issue.
4. Operator clicks "Resolve" on the queue item.
5. Item moves to "Resolved" section (collapsed, expandable for history).

**Sorting:** High > Medium > Low. Within priority: most recent first.

### 9.5 Call Prep Brief

**Field:** `call_prep_brief` on `sr_engine_output`.

**Generation:** Produced by the composition engine (not by Mission Control). Engine synthesizes from:
- `company_summary` + `challenger_insight` + `fit_rationale` + `talking_points` + `likely_objections` + `risk_factors`

**Format:** 3-4 sentences. Answers:
1. Who is this person and what do they do?
2. Why should the AE care (what's the pain/opportunity)?
3. What's the angle (what to lead with)?
4. What to watch out for (objections, risks)?

**Display:** Prominent card at the top of the Intel tab, above structured fields. Background color slightly different (#1A2436) to draw attention.

**Example:**
> Matt runs operations at LHTC, a rural CLEC in western PA that just acquired Pennsylvania Telephone. His team is absorbing a new service territory with different permit standards. Lead with the QC consistency angle — same standard across both territories. Watch for budget objections — small rural carrier, likely tight.

### 9.6 Verification Summary

**Replaces:** The single-word `research_confidence` field ("high" / "medium" / "low").

**Source:** `verification_summary` JSONB column, populated by the semantic verifier during engine composition.

**Display (VerificationBadge component):**
- Header line: "5 of 7 claims verified" with color indicator.
  - All verified (0 unverified, 0 blockers) → green background
  - Some unverified but no blockers → yellow background
  - Has blockers (unverified claims that appear in the email body) → red background
- Expandable claim list below:
  - Each claim shows: text, verification status (icon), confidence tier, source URL (linked).
  - Blocker claims highlighted in red.

**Placement:** Below the email preview in the Email tab (so reviewer reads the email, then sees which claims check out).

### 9.7 Email Preview

**Replaces:** The existing plain-text email display in ExpandedView.

**Rendering:**
- Shows email as it would appear in an inbox client.
- Sections: From line, Subject (bold), horizontal rule, body (paragraph breaks preserved), P.S. (italic), signature (muted color).
- Font: Georgia/serif for email body (matches current implementation).
- Word count displayed below the email.
- Microsite link (if exists) displayed below word count.

**Side-by-side diff:**
- When `change_log` contains changes to `email_body`, `email_subject`, or `email_ps`:
  - Toggle button: "Show changes"
  - Left: previous version (from change log). Right: current version.
  - Changed text highlighted.

---

## 10. Keyboard Shortcuts (Extended)

All existing shortcuts from v2 are preserved. New additions:

| Key | Action | Context |
|-----|--------|---------|
| `n` | Open Notes tab for focused row | Row focused |
| `c` | Open Changes tab for focused row | Row focused |
| `1` | Switch to Email tab | Row expanded |
| `2` | Switch to Intel tab | Row expanded |
| `3` | Switch to Dossier tab | Row expanded |
| `4` | Switch to Notes tab | Row expanded |
| `5` | Switch to Changes tab | Row expanded |
| `g` | Activate GO (if eligible) | Row focused, status = send, AE verified |
| `m` | Mark as reviewed | Row expanded |

---

## 11. Dark Theme (Unchanged from v2)

| Element | Color |
|---------|-------|
| Background | `#0B1120` |
| Card | `#151D2E` |
| Call Prep Brief card | `#1A2436` |
| Border | `#1E293B` |
| Text | `#E8E4DC` |
| Accent | `#C4B5FD` (light purple) |
| Muted text | `#94A3B8` |
| Diff: old value | `#FCA5A5` (red-200) on `rgba(239,68,68,0.1)` |
| Diff: new value | `#86EFAC` (green-200) on `rgba(34,197,94,0.1)` |
| Unresolved note indicator | `#C4B5FD` (filled) |
| Resolved note indicator | `#C4B5FD` (outline) |
| Changed indicator | `#F97316` (orange) |
| HS: New | `#22c55e` (green) |
| HS: Active | `#3B82F6` (blue) |
| HS: Stale | `#EAB308` (yellow) |
| HS: Lost | `#EF4444` (red) |
| Verification: all verified | `rgba(34,197,94,0.15)` bg |
| Verification: some unverified | `rgba(234,179,8,0.15)` bg |
| Verification: blockers | `rgba(239,68,68,0.15)` bg |

---

## 12. Success Criteria

### 12.1 Functional Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SC-01 | Justyn can complete a full review cycle (pending → GO) in under 60 seconds per prospect for bulk approvals | Timed manual test |
| SC-02 | Tim can post a note and it appears in Justyn's Action Queue within page refresh | Functional test |
| SC-03 | Field changes create change_log entries viewable in the Changes tab | Inspect JSONB after update |
| SC-04 | "Changed since review" filter shows only records modified after reviewer's last_reviewed_at | Filter accuracy test with 3+ records |
| SC-05 | HubSpot status check returns correct result for existing and non-existing contacts | Test with known HS contacts |
| SC-06 | Action Queue shows items from all 4 sources (notes, verification, changes, HS conflicts) sorted by priority | Manual inspection with seeded data |
| SC-07 | Call prep brief displays at top of Intel tab for all prospects that have one | Visual inspection |
| SC-08 | Verification summary shows correct claim counts and individual claim details | Compare with semantic verifier output |
| SC-09 | Email preview renders with From line, subject, body paragraphs, P.S., signature, word count | Visual comparison with Gmail rendering |
| SC-10 | AE role filter restricts view to assigned prospects only | Login as AE, verify no other prospects visible |
| SC-11 | Resolving all notes for a prospect clears has_unresolved_notes flag | Post 2 issues, resolve both, verify flag |
| SC-12 | Bulk status changes fire for all selected records and update change_log for each | Select 10, bulk approve, verify all 10 |

### 12.2 Performance Criteria

| ID | Criterion | Target |
|----|-----------|--------|
| PC-01 | Initial page load (150 prospects + notes + changes) | < 2 seconds |
| PC-02 | Action Queue load | < 1 second |
| PC-03 | Single HubSpot status check | < 3 seconds |
| PC-04 | Post note + refresh note list | < 500ms |
| PC-05 | Batch HubSpot check (20 records) | < 30 seconds (rate-limited) |

---

## 13. Out of Scope

The following are explicitly NOT part of this spec:

| Item | Reason |
|------|--------|
| Authentication / login system | Team of 5 on a private URL. Role selector is sufficient for v3. |
| Real-time collaboration (WebSocket/SSE) | Page refresh is acceptable. Supabase Realtime can be added later. |
| Email editing within Mission Control | Emails are composed by the engine. MC is for review, not authoring. Re-composition is the edit path. |
| Sequence enrollment from MC | HubSpot loader is a separate script. MC marks GO; loader picks it up. |
| Mobile-optimized layout | Ops work happens on desktop. Responsive is nice-to-have, not blocking. |
| Drag-and-drop reordering | Unnecessary complexity. Sort + filter covers the use case. |
| Notification system (email/Slack alerts) | Polling the Action Queue is sufficient for a team of 5. |
| Historical pipeline run dashboard | Moved to collapsed section at bottom of Action Queue page. Not rebuilt. |
| Multi-show support | v3 is Fiber Connect 2026. Multi-show is a v4 concern. |
| Inline field editing (click-to-edit) | All field edits go through server actions, not inline. Prevents accidental changes. |
| Custom report generation | Out of scope. Data is in Supabase; SQL handles ad-hoc reporting. |

---

## 14. Migration Notes

### 14.1 Pipeline Page Redirect

`/ops/pipeline` currently shows pipeline run history. In v3:
- Move the pipeline run history component to the bottom of the Action Queue page (collapsed by default).
- `/ops/pipeline` redirects to `/ops/queue`.
- Keep the `PipelineDashboard.tsx` component as-is for the collapsed section.

### 14.2 Existing Data

- Existing `sr_engine_output` records without `call_prep_brief` or `verification_summary` display gracefully (null checks throughout).
- Existing `ae_review_notes` field on `sr_prospects` is preserved as legacy. New notes go to `sr_review_notes` table. The UI shows both sources in the Notes tab.
- `change_log` starts empty (`[]`) for existing records. First change creates the first entry.

### 14.3 Navigation

Update nav bar across all ops pages:

```
v2: [Review Queue]  [Pipeline]  [Brain]  [Architecture]
v3: [Review Queue]  [Action Queue (N)]  [Brain]  [Architecture]
```

The Action Queue tab shows count of open items in parentheses.

---

## 15. Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Supabase project slttpknnuthbttjuzrnz | Live | Schema migration needed for new columns + table |
| `sr_engine_output` table | Exists | New columns added via ALTER TABLE |
| HubSpot API | Live | `HUBSPOT_PRIVATE_APP_TOKEN` env var required |
| Semantic verifier (`semantic-verifier.ts`) | Exists | Already produces `VerifiedClaim[]` — needs to write `verification_summary` JSONB to `sr_engine_output` |
| Composition engine (`composer.ts` / `lean-composer.ts`) | Exists | Needs to generate `call_prep_brief` during composition |
| HubSpot loader (`hubspot-loader.ts`) | Exists | Needs to update `loaded_to_hs_at` and `hs_contact_id` after load |
| Next.js 14+ App Router | Configured | Existing app structure |
| Vercel deployment | Configured | Existing deployment pipeline |

---

## 16. Implementation Order

| Phase | Scope | Effort |
|-------|-------|--------|
| 1: Schema + Types | Supabase migration (new columns + `sr_review_notes` table + `sr_action_queue` view). Extend `types.ts` with new interfaces. | 1 session |
| 2: Notes System | `NotesPanel.tsx`, `postNote()`, `resolveNote()`, `fetchNotes()` server actions. Update `ProspectRow` with notes indicator. Update `FilterBar` with notes filter. | 1 session |
| 3: Change Tracking | `ChangesPanel.tsx`, `logChange()`, `updateField()`, `batchUpdateField()` server actions. Update `ProspectRow` with changed indicator. `markReviewed()` action. | 1 session |
| 4: Action Queue | `queue/page.tsx`, `ActionQueue.tsx`, `ActionItem.tsx`. `fetchActionQueue()`, `resolveActionItem()` server actions. Nav bar update. Pipeline redirect. | 1 session |
| 5: Email + Verification | `EmailPreview.tsx`, `VerificationBadge.tsx`. Refactor `ExpandedView.tsx` to use new components. | 1 session |
| 6: Intel + HubSpot | `IntelPanel.tsx`, `CallPrepBrief.tsx`, `HubSpotStatus.tsx`. `checkHubSpotStatus()`, `batchCheckHubSpot()` server actions. HubSpot API route. | 1 session |
| 7: Integration + Polish | Wire engine to write `call_prep_brief` + `verification_summary`. Wire loader to update `loaded_to_hs_at`. End-to-end testing. Keyboard shortcuts. Role selector. | 1 session |

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-02 12:00 | Claude | Initial v3 spec. Full review lifecycle, multi-reviewer notes, change tracking, HubSpot integration, action queue, call prep brief, verification summary, email preview. |
