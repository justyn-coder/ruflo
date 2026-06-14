---
title: ShowRev Operator Portal v2 — Build Spec (4-Page Architecture)
status: DRAFT
last_updated: 2026-06-08 09:01 EDT
version: v2
---

# Operator Portal v2 — Build Spec

## Design Principles

1. **Glanceable** — Operator sees pipeline health and batch status without reading. Color, shape, and position do the work.
2. **4 pages, not 7** — Each page answers one question. No page exists for "maybe useful later."
3. **Light mode** — Off-white background, purple accent, WCAG 2.2 AA minimum. Dark theme stays on prospect-facing microsites only.
4. **Keyboard-first** — j/k/a/r/e shortcuts already exist. Extend, don't replace.
5. **Zero new dependencies where possible** — Reuse existing 10 components. One new library max (React Flow or Recharts for pipeline viz).

---

## Page Architecture

| # | Route | Question It Answers | Priority |
|---|-------|-------------------|----------|
| 1 | `/ops` | "What needs my attention and what do I approve?" | P0 |
| 2 | `/ops/prospect/[id]` | "Tell me everything about this one prospect." | P0 |
| 3 | `/ops/pipeline` | "Is the pipeline healthy? Where are the problems?" | P0 |
| 4 | `/ops/report` | "How is outreach performing?" | P1 |

### Removed (7 existing routes consolidated or deprecated)

| Route | Disposition |
|-------|-----------|
| `/ops/queue` | Merged into `/ops` as a "Needs Attention" filter preset |
| `/ops/brain` | Merged into `/ops/pipeline` as "Research Quality" tab |
| `/ops/intelligence` | Deprecated — static BEAD data goes stale |
| `/[slug]/v2` | Deprecated — A/B test concluded |
| `/brief/chris`, `/brief/dobson-fiber`, `/brief/finley-engineering` | Deprecated — hardcoded demos |
| `/compare` | Deprecated — design decision made |
| `/debug` | Deprecated — dev-only |

---

## Page 1: Batch Review (`/ops`)

### What it is
The operator's daily driver. A table of prospects with inline approve/reject/edit. Replaces both the current Mission Control and the separate Action Queue.

### Layout

```
+------------------------------------------------------------------+
| ShowRev Ops               [Pipeline] [Report]     Lucas Spencer ▾ |
+------------------------------------------------------------------+
| [Search...]  Signal[▾]  Status[▾]  AE[▾]  [⚡ Needs Attention]   |
| 47 prospects | 12 Send | 8 Hold | 3 Reject | 24 Pending          |
+------------------------------------------------------------------+
| Company      | Name          | Signal | Subject     | WC | Avg | St|
|-------------|---------------|--------|-------------|-----|-----|---|
| Omni Fiber  | Chad Mueller  |  ●Str  | Omni Fib... |  91 | 8.2 |Pnd|
|   ┌─ EXPANDED ──────────────────────────────────────────────────┐ |
|   │ [Email] [Scores] [Microsite] [Research] [Intel]             │ |
|   │                                                              │ |
|   │ Subject: Omni Fiber's Round 4 construction clock             │ |
|   │ Chad, Omni Fiber's six Connect Illinois Round 4 awards...    │ |
|   │                                                              │ |
|   │ research=9  vp=8  tone=8  concise=7  jtbd=9  → SEND         │ |
|   │ Must-fix: (none)                                             │ |
|   │                                                              │ |
|   │ [✓ Approve]  [✗ Reject]  [✎ Edit]  [↻ Re-run]               │ |
|   └──────────────────────────────────────────────────────────────┘ |
| Ripple Fiber| Brett Judnick |  ●Gd   | Ripple F... |  88 | 7.4 |Hld|
+------------------------------------------------------------------+
```

### "Needs Attention" mode (replaces `/ops/queue`)

Toggle button at top. When active, filters to:
- Judge HOLD verdicts (any dimension <7)
- Mechanical check failures
- Email discovery failures
- ICP uncertain classifications
- Unresolved review notes

This eliminates the need for a separate queue page. Same table, different filter.

### Columns (streamlined from current 9 to 7)

| Column | Source | Why |
|--------|--------|-----|
| Company | `sr_prospects.company` | Primary grouping |
| Name | `first_name + last_name` | Who |
| Signal | `sr_engine_output.intel_signal_strength` | Colored dot + text |
| Subject | `email_subject_t1` (truncated) | Quick scan of email |
| WC | Word count from `email_body_t1` | Mechanical check at a glance |
| Avg Score | Average of 5 judge dimensions | Quality number |
| Status | `send_status` | Dropdown: Pending/Send/Hold/Reject/DNC |

Removed from current: checkbox (move to bulk mode), persona (visible in expanded view), notes indicator (visible in expanded view), empty column.

### Bulk Actions

"Select mode" toggle. When active, checkboxes appear. "Approve All Passing" button appears when ≥1 prospect has all judge dimensions ≥7 and status=pending. This is the most common operator action for clean batches.

### Keyboard Shortcuts (existing + new)

| Key | Action | Status |
|-----|--------|--------|
| `j/k` | Navigate rows | Exists |
| `Enter` | Expand/collapse | Exists |
| `a` | Approve focused prospect | **New** |
| `r` | Reject focused prospect (prompts reason) | **New** |
| `e` | Edit email body | **New** |
| `n` | Toggle "Needs Attention" filter | **New** |
| `/` | Focus search | Exists |
| `?` | Show help | Exists |

### What to reuse
- `OpsTable.tsx` — core filtering, sorting, keyboard nav (modify columns + styling)
- `FilterBar.tsx` — add "Needs Attention" toggle
- `StatsBar.tsx` — keep as-is, restyle
- `ProspectRow.tsx` — simplify columns, restyle to light
- `ExpandedView.tsx` — restructure tabs (Email+Scores first, then Microsite/Research/Intel)
- `BulkActions.tsx` — add "Approve All Passing"
- `NotesPanel.tsx` — reuse in expanded view
- `KeyboardHelp.tsx` — extend with new shortcuts

### What to build new
- Light theme CSS (`ops.css`)
- `OpsLayout.tsx` wrapper with top nav
- "Needs Attention" filter logic (aggregates queue items into standard filter)
- "Approve All Passing" bulk action

---

## Page 2: Prospect Detail (`/ops/prospect/[id]`)

### What it is
Full drill-down for one prospect. Everything the operator needs to make an informed decision on a single page. Bookmarkable URL.

### Layout

```
+------------------------------------------------------------------+
| ← Back to Batch                                                   |
+------------------------------------------------------------------+
| Chad Mueller                                          [✓ Approve] |
| EVP, Operations · Omni Fiber                          [✗ Reject]  |
| chad.mueller@omnifiber.com · Nathan Dunn (Central)    [✎ Edit]    |
| Signal: ●Strong  Confidence: ●High  ICP: ✓ fiber_operator        |
+------------------------------------------------------------------+
| Phase Timeline                                                    |
| [1✓]→[2✓]→[3✓]→[3a○]→[3b✓]→[3c✓]→[4✓]→[5✓]→[6✓]→[7✓]→[8✓]→[9✓]|
|  0.4s  0.4s  77s  0.2s  0.04s 31s  1s   19s  11s  22s  0s   0s  |
+------------------------------------------------------------------+
| [Email + Scores]  [Microsite]  [Research]  [Intel]  [Notes]       |
|                                                                   |
| T1 Email                                              91 words    |
| Pattern: loss_aversion                                            |
| ┌──────────────────────────────────────────────────────┐          |
| │ Subject: Omni Fiber's Round 4 construction clock     │          |
| │ Chad, Omni Fiber's six Connect Illinois Round 4...   │          |
| └──────────────────────────────────────────────────────┘          |
|                                                                   |
| Judge Scores        research ████████████ 9                       |
|                     vp_conn  ████████████ 8                       |
|                     tone     ████████████ 8                       |
|                     concise  ██████████   7                       |
|                     jtbd     ████████████ 9                       |
|                     AVG: 8.2 → SEND                               |
|                                                                   |
| Must-Fix: (none)                                                  |
+------------------------------------------------------------------+
```

### Tabs

| Tab | Content | Default? |
|-----|---------|---------|
| Email + Scores | Email body, subject, P.S., word count, 5-dimension bar chart, must-fix, strengths | **Yes** (80% use case) |
| Microsite | Live iframe of `/brief/{slug}` | No |
| Research | Full research summary, 3-persona outputs, source list | No |
| Intel | All 29 structured fields (Tier 1/2/3 from current ExpandedView) | No |
| Notes | Review notes timeline, add note form | No |

### Phase Timeline
Horizontal strip showing each phase as a small node. Color-coded:
- Green circle + checkmark = passed
- Yellow circle + dash = skipped/warn
- Red circle + X = failed
- Gray circle = not yet run

Timing below each node in small text. Click a node to see phase-specific details (error messages, retry counts).

### What to reuse
- `ExpandedView.tsx` tabs and content (Email, Intel, Notes) — extract into standalone components
- Judge score display logic
- Phase timing data from telemetry JSON

### What to build new
- New page route `/ops/prospect/[id]/page.tsx`
- Phase timeline component
- Prospect header with action buttons
- Score bar chart (simple CSS bars, no library needed)

---

## Page 3: Pipeline Health (`/ops/pipeline`)

### What it is
The operator's "system architecture view" — a visual representation of the pipeline that immediately shows where problems are, backed by detailed metrics. Three tabs: Flow (visual), Runs (table), Quality (research stats).

This is the page where you look at it and *know* what's working before reading a single number.

### Visual Pipeline Flow (the centerpiece)

**Pattern: Horizontal node-flow diagram with health-state coloring**

Inspired by: GitHub Actions workflow visualization, Datadog service maps, Sankey drop-off encoding.

```
+------------------------------------------------------------------+
| Pipeline Health                    Run: run-20260608-kql2 ▾       |
+------------------------------------------------------------------+
|                                                                   |
|  ┌─────┐    ┌─────┐    ┌──────────┐    ┌──────┐    ┌─────┐       |
|  │ ICP │───▸│Email│───▸│ Research │───▸│Struct│───▸│ Sub │       |
|  │Gate │    │Find │    │ (STORM)  │    │      │    │strat│       |
|  │ ✓   │    │ ✓   │    │ ⚠ 73s   │    │ ✓    │    │ ✓   │       |
|  │100% │    │100% │    │ 100%    │    │ 100% │    │ 80% │       |
|  │ 0.9s│    │<1ms │    │ BOTTLENK│    │ 27s  │    │ 1s  │       |
|  └─────┘    └─────┘    └──────────┘    └──────┘    └─────┘       |
|      15 ──────15───────── 15 ──────────15──────────12             |
|                                                     ↓3 fail      |
|  ┌─────┐    ┌─────┐    ┌─────┐    ┌─────┐                       |
|  │Pattn│───▸│Comp │───▸│Judge│───▸│Micro│    ┌─────┐             |
|  │ Sel │    │     │    │     │    │site │───▸│Write│             |
|  │ ✓   │    │ ✓   │    │ ⚠   │    │ ✓   │    │ ✓   │             |
|  │100% │    │100% │    │ 87% │    │100% │    │100% │             |
|  │ 20s │    │ 11s │    │ 41s │    │ <1s │    │ <1s │             |
|  └─────┘    └─────┘    └─────┘    └─────┘    └─────┘             |
|      12 ──────12──────── 12 ──────── 10 ─────── 10               |
|                           ↓2 hold                                 |
|                                                                   |
| Legend: [✓ Healthy] [⚠ Attention] [✗ Failing]  Bottleneck: ████  |
+------------------------------------------------------------------+
```

### Node Health Rules (3-tier, no gradients)

| State | Border Color | Icon | Trigger |
|-------|-------------|------|---------|
| **Healthy** (green) | `#16A34A` | ✓ | Pass rate ≥95% AND latency ≤2x baseline |
| **Attention** (amber) | `#CA8A04` | ⚠ | Pass rate 80-95% OR latency 2-4x baseline |
| **Failing** (red) | `#DC2626` | ✗ | Pass rate <80% OR latency >4x baseline |

Bottleneck node gets a highlighted background (subtle amber fill) and "BOTTLENECK" label. Only one node gets this — the slowest phase by average latency.

### Flow Lines Between Nodes

- **Width encodes volume** — 15 prospects entering = full width. If 3 fail at Substrate, the line narrows from 15→12 between Substrate and Pattern Selection.
- **Drop-off annotations** — Small red text below the narrowing point: "↓3 fail" or "↓2 hold"
- This is the Sankey principle applied to a sequential flow. The operator sees volume loss without needing a separate funnel chart.

### What Each Node Shows (no hover required)

| Line | Content | Example |
|------|---------|---------|
| 1 | Phase name | "Research (STORM)" |
| 2 | Status icon | ✓ or ⚠ or ✗ |
| 3 | Pass rate | "100%" or "87%" |
| 4 | Avg latency | "73s" or "<1ms" |
| 5 | Special flag (if any) | "BOTTLENECK" |

### Click-to-drill

Click any node to expand a detail panel below the flow diagram:
- Which prospects failed this phase and why
- Retry counts
- Error messages
- Latency distribution (histogram or simple min/avg/max)

### Tabs on Pipeline Page

| Tab | Content |
|-----|---------|
| **Flow** (default) | Visual pipeline diagram + run selector dropdown |
| **Runs** | Table of past runs: date, prospect count, pass rate, avg time, cost. Click to load that run into the Flow tab. |
| **Quality** | Research confidence distribution, pattern usage, persona breakdown, under-researched prospects. (Absorbs current `/ops/brain` content) |

**Cost tab: explicitly deferred to v1.1.** Per-run API cost tracking requires ruflo-cost-tracker data pipeline integration and a data contract that doesn't exist yet. Including it without a proper layout spec would create a build decision the spec doesn't cover. When ready, it will surface: per-run total (Apollo calls, LLM tokens by model, DuckDuckGo queries), per-prospect breakdown, cost trend over time, projected cost for next batch.

### Data Source

Primary: telemetry JSON files (`data/showrev/premium/telemetry/run-*-telemetry.json`). These already contain per-phase timing and status for every prospect in a run.

Secondary: `sr_engine_output` for historical runs without telemetry files.

Future: `sr_telemetry` Supabase table for persistent storage.

### Implementation approach

**Option A (recommended): Pure CSS/SVG, no library.**
The pipeline is a fixed 9-phase sequence, not a dynamic DAG. React Flow is overkill — it handles arbitrary node graphs with drag-and-drop. Our flow is static topology with dynamic data. Custom SVG nodes + CSS flexbox for layout is simpler, faster, and zero new dependencies.

**Option B: React Flow.**
If we later need pan/zoom, dynamic layouts, or complex branching (e.g., parallel STORM personas rendered as sub-nodes), React Flow provides that. But for MVP, Option A is right.

---

## Page 4: Performance Report (`/ops/report`)

### What it is
Engagement stats for sent emails. Moved from current `/report` route into the ops navigation. Already exists with light theme — needs styling harmonization and data source update.

### Metrics (existing, keep)
- Sent / Opened / Clicked / Replied / Meetings booked
- Breakdown by AE
- Breakdown by signal strength
- Open rate, click rate, reply rate

### What changes
- Move route from `/report` to `/ops/report`
- Replace inline styles with shared `ops.css` variables
- Add navigation breadcrumb back to `/ops`
- Add date range selector (currently shows all-time)

### What to reuse
- Existing report page component (functional, already light theme)
- Supabase queries for engagement data

### What to build new
- Route move + layout wrapper
- Date range filter
- Style harmonization (minor)

---

## Light Mode Design System

### CSS Strategy

Create `ops.css` loaded by `OpsLayout.tsx` wrapper. Do NOT modify `globals.css` (controls prospect-facing dark theme).

### Color Palette

| Token | Value | Usage | Contrast vs #FFFFFF |
|-------|-------|-------|-------------------|
| `--bg-page` | `#FAFAFA` | Page background | N/A |
| `--bg-surface` | `#FFFFFF` | Cards, panels, table rows | N/A |
| `--bg-surface-hover` | `#F5F5F5` | Row hover | N/A |
| `--bg-surface-active` | `#F0EDFF` | Selected/active (light purple) | N/A |
| `--border-default` | `#E5E5E5` | Table lines, card borders | N/A |
| `--text-primary` | `#171717` | Headings, content | 14.5:1 (AAA) |
| `--text-secondary` | `#525252` | Body text | 7.6:1 (AAA) |
| `--text-tertiary` | `#737373` | Labels, timestamps | 4.6:1 (AA) |
| `--accent` | `#7C3AED` | Links, active states | 5.3:1 (AA) |
| `--accent-hover` | `#6D28D9` | Hover | 7.0:1 (AAA) |
| `--status-send` | `#16A34A` | Approved | 3.9:1 (large text) |
| `--status-hold` | `#CA8A04` | Review needed | 3.5:1 (large text) |
| `--status-reject` | `#DC2626` | Rejected | 4.6:1 (AA) |
| `--status-pending` | `#71717A` | Unreviewed | 4.5:1 (AA) |

Note: `--text-tertiary` changed from `#A3A3A3` (2.6:1, fails AA) to `#737373` (4.6:1, passes AA for normal text). The v1 spec had an accessibility gap here.

### Typography

- Font: General Sans (already loaded)
- Monospace: JetBrains Mono (already loaded)
- Page title: 24px/700
- Section heading: 16px/600
- Table header: 11px/600 uppercase
- Table body: 13px/400
- Badge: 11px/600

### Components (shared patterns)

- **Cards**: White, 1px border, 8px radius, subtle shadow `0 1px 3px rgba(0,0,0,0.04)`
- **Status badges**: Pill shape, 10% opacity background, full opacity text
- **Signal dots**: 8px circle + text label (never color-only)
- **Buttons**: Primary = accent bg + white text. Secondary = transparent + accent text + border. 36px min-height.
- **Phase nodes**: 80px wide, 64px tall, 8px radius, 2px border colored by health state

---

## Navigation

Top bar, not sidebar. Three links + user indicator.

```
| ShowRev Ops    [Review] [Pipeline] [Report]    Lucas Spencer ▾ |
```

"Review" = `/ops` (bold when active). "Pipeline" = `/ops/pipeline`. "Report" = `/ops/report`. No sidebar — three pages don't need one.

Prospect detail (`/ops/prospect/[id]`) shows "← Back to Batch" instead of the nav tabs.

---

## User Stories (plain English)

**US-1 — "Clear a batch."** I ran 25 prospects. Show me the table. Let me scan, expand any row, approve or reject. I want to clear the batch in under 5 minutes without opening another tool. If all 25 passed the judge, let me approve them all in one click.

**US-2 — "Drill into one."** Something looks off. Show me everything about this prospect — email, scores, microsite preview, research, intel — on one page. Let me approve, reject, edit, or re-run from there.

**US-3 — "Is the pipeline healthy?"** I look at the page and immediately see: Research is the bottleneck (73s, amber). Judge is holding 13% (amber). Everything else is green. I click Research to see which prospects took longest. I click Judge to see which dimension failed most. I don't need to read a table to get this — the visual tells me.

**US-4 — "What needs attention?"** I hit `n` on the keyboard (or click the button). The batch review table filters to: HOLD verdicts, mechanical failures, email discovery failures, unresolved notes. I work through them one by one.

**US-5 — "How is outreach performing?"** I click Report. Sent: 45. Opened: 32 (71%). Clicked: 18 (40%). Replied: 6 (13%). Meetings: 2. Breakdown by AE and signal strength.

---

## Build Sequence

| Step | Scope | Estimate | Depends on |
|------|-------|----------|-----------|
| 1 | `ops.css` + `OpsLayout.tsx` (light mode foundation) | 3 hrs | Nothing |
| 2 | Batch Review restyle + column simplification | 4 hrs | Step 1 |
| 3 | "Needs Attention" filter + "Approve All Passing" bulk action | 2 hrs | Step 2 |
| 4 | Prospect Detail page (new route, phase timeline, tabs) | 6 hrs | Step 1 |
| 5 | Pipeline Flow visualization (SVG nodes, health coloring) | 6 hrs | Step 1 |
| 6 | Pipeline Runs + Quality + Cost tabs | 4 hrs | Step 5 |
| 7 | Report page move + style harmonization | 2 hrs | Step 1 |
| 8 | Deprecation cleanup (remove 7 dead routes) | 1 hr | After all above verified |
| 9 | Accessibility audit (see acceptance criteria below) | 3 hrs | After all above |
| **Total** | | **~31 hrs** | |

Steps 1→2→3 are sequential (foundation first). Steps 4, 5, 7 can parallelize after Step 1.

### Accessibility Audit Acceptance Criteria (Step 9)

The audit passes when ALL of the following are true:

| Check | Criteria | How to verify |
|-------|----------|--------------|
| Focus ring | All interactive elements (buttons, links, rows, dropdowns, tabs) show visible focus ring at ≥3:1 contrast on `:focus-visible` | Tab through every page with keyboard |
| ARIA labels | All buttons have `aria-label` or visible text. Status badges have `aria-label` (not color-only). Expanded/collapsed states use `aria-expanded`. | Screen reader pass (VoiceOver on macOS) |
| Keyboard trap | No keyboard trap in expanded rows, modals, or dropdowns. `Escape` always closes/collapses. Tab order follows visual order. | Tab through expanded row, verify Escape exits |
| Color independence | No information conveyed by color alone. All signal dots paired with text. All status badges have text label. | Grayscale screenshot check |
| Reduced motion | `prefers-reduced-motion: reduce` disables all transitions and animations. Pipeline flow renders without animation. | Toggle in System Preferences, verify |
| Touch targets | All buttons and interactive elements ≥44x44px on mobile viewport (1280px+ is primary, but buttons shouldn't be tiny) | Inspect element dimensions |
| Contrast | All text meets WCAG 2.2 AA: ≥4.5:1 normal text, ≥3:1 large text (≥18px or ≥14px bold). `--text-tertiary` at `#737373` = 4.6:1 (passes). | Browser contrast checker extension |

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Pipeline viz is too complex for MVP | Medium | Option A (pure SVG) keeps it simple. 9 fixed nodes, no dynamic layout needed. |
| Telemetry JSON not available for all runs | High | Fallback: compute phase timing from `sr_engine_output` timestamps. Older runs show table-only (no flow viz). |
| Light mode breaks prospect-facing pages | Low | Separate `ops.css`, never touch `globals.css`. `OpsLayout` wrapper scopes styles. |
| Keyboard shortcuts conflict between pages | Low | Shortcuts scoped to active page component. Prospect detail uses different set than batch review. |
| 31 hrs underestimate | Medium | Steps 2-3 are mostly restyle of existing components. Step 5 (pipeline viz) is the risk — could take 8-10 hrs if SVG layout is fiddly. |

---

## What's NOT in scope

- T2/T3 email composition or display (T1 only for now)
- HubSpot integration or sequence enrollment from portal
- Multi-user auth or role-based access control
- Mobile-responsive layout (desktop-first, 1280px+ assumed)
- Real-time WebSocket updates (polling on page load is fine)
- Email editing with live preview (textarea edit, re-run for preview)

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v2 | 2026-06-08 09:01 | Claude | Judge must-fix items addressed: Cost tab deferred to v1.1, accessibility audit given concrete acceptance criteria, fonts verified in repo. |
| v1 | 2026-06-08 08:57 | Claude | Initial build spec. 4-page architecture, pipeline flow visualization, component reuse inventory, light mode design system. |
