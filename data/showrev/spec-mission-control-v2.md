---
title: Mission Control v2 — Review Queue Redesign
status: ACTIVE
last_updated: 2026-06-02 01:00 EST
version: v1
---

# Mission Control v2 — Review Queue Redesign

## Problem

Agent 5 (Portal UX Auditor) found 17 problems. Core issues: too many fields visible, STATUS/AE REVIEW overlap, no bulk actions, no structured expand, no filtering, no keyboard nav, no signal color-coding, broken mobile.

## Design Decisions

### 1. Single Status Column

Merge `send_status` and `ae_review_status` into one workflow column:

```
pending  -->  verified  -->  GO  -->  (loaded to HubSpot)
   |              |
   +--> hold      +--> rejected
   |
   +--> reject
   |
   +--> dnc
```

Operator clicks to cycle: pending -> send -> hold -> reject -> dnc -> partner -> pending. Separate from AE review which is a sub-workflow.

### 2. Field Tiering (from Agent 6)

**Tier 1 (always visible in table row):**
- prospect_email, company_summary (truncated), intel_signal_strength, persona_bucket, challenger_insight (truncated), intel_next_action (truncated)

**Tier 2 (visible in expanded Intel tab):**
- talking_points, likely_objections, fit_rationale, buying_timeline, decision_authority, risk_factors, fiber_activities, bead_status, growth_signals, key_projects

**Tier 3 (collapsed Deep Intel section in expanded view):**
- competitive_landscape, recent_news, external_deadlines, company_size, MEDDPICC fields

**System (hidden):**
- para1-4, run_id, verification flags, composition_mode, source_class

### 3. Signal Strength Color Coding

| Signal | Color | Dot |
|--------|-------|-----|
| Strong | #22c55e (green) | Filled circle |
| Good | #eab308 (yellow) | Filled circle |
| Possible | #f97316 (orange) | Filled circle |
| Weak | #ef4444 (red) | Filled circle |
| No fit | #6b7280 (gray) | Empty circle |
| Unknown | #6b7280 (gray) | Dash |

### 4. Persona Bucket Labels

Map internal codes to human labels:
- `exec_leader` -> "Executive / Leader"
- `technical_decision_maker` -> "Technical DM"
- `operations_manager` -> "Operations Mgr"
- `project_manager` -> "Project Manager"
- `engineer` -> "Engineer"
- `unknown` -> "Unknown"
- null -> "-"

### 5. Table Row (30-second scan)

```
[ ] | Signal dot | Name, Title | Company (logo) | Persona | Status badge | Verified? | Notes? | AE
```

Compact. One line per contact. Click row to expand inline.

### 6. Expanded View (3 tabs)

**Tab 1: Email Preview** — Subject, body, P.S., signature. Read-only for now.

**Tab 2: Intel (tiered)** — Tier 1 fields as key-value cards. Tier 2 as a grid. Tier 3 collapsed behind "Show Deep Intel" toggle.

**Tab 3: Dossier** — Raw research notes, HubSpot notes, MEDDPICC. For deep-dive only.

### 7. Filters & Search

Top bar with:
- Text search (name, company, email body)
- Signal strength dropdown
- Persona dropdown
- Status dropdown
- Company dropdown (for multi-contact)
- AE dropdown

Stats bar updates to reflect filtered counts.

### 8. Bulk Actions

Checkbox per row. When 1+ selected, bulk bar appears:
- Approve All (set to SEND)
- Reject All
- Hold All
- Assign AE

### 9. Keyboard Shortcuts

- `j` / `k` — move focus up/down
- `Enter` — expand/collapse focused row
- `a` — approve (SEND) focused row
- `r` — reject focused row
- `h` — hold focused row
- `Escape` — collapse expanded row / clear selection
- `?` — show keyboard shortcuts help

### 10. Company Grouping

Toggle between flat list and grouped-by-company view. Grouped view shows company header row with all contacts indented below.

### 11. Dark Theme

Keeping the dark theme to match ops context:
- Background: #0B1120
- Card: #151D2E
- Border: #1E293B
- Text: #E8E4DC
- Accent: #C4B5FD (light purple)
- Muted: #94A3B8

## File Structure

```
app/ops/
  page.tsx              -- Server component (data fetching)
  OpsTable.tsx          -- Main client orchestrator (<500 lines)
  components/
    FilterBar.tsx       -- Search + filters
    StatsBar.tsx        -- Status/signal/persona counts
    ProspectRow.tsx     -- Single table row
    ExpandedView.tsx    -- 3-tab expanded panel
    BulkActions.tsx     -- Bulk action bar
    KeyboardHelp.tsx    -- Keyboard shortcuts modal
  actions.ts            -- Server actions (existing, extended)
```

## Data Flow

1. `page.tsx` fetches from Supabase (sr_prospects + sr_engine_output + sr_brain_dossiers + sr_microsites)
2. Merges into `Row[]` and passes to `OpsTable`
3. `OpsTable` manages local state (filters, selection, expansion, keyboard)
4. Server actions handle mutations (status changes, notes, GO activation)

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-02 01:00 | Claude | Initial redesign spec from Agent 5 audit findings. |
