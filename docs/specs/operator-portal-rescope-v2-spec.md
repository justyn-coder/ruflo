---
title: ShowRev Operator Portal v2 — Re-Scope Spec
status: DRAFT
last_updated: 2026-06-08 00:32 EST
version: v1
---

# ShowRev Operator Portal v2 — Re-Scope Spec

## 1. Current State Inventory

Source repo: `~/Documents/GitHub/showrev-microsites/` (Vercel-deployed Next.js 15 app)

### Page-by-Page Audit

| Route | Page | What It Does | Verdict | Rationale |
|-------|------|-------------|---------|-----------|
| `/` | Root | Redirects to `inorsa.com` | **KEEP** | Landing page redirect for prospect-facing URLs |
| `/[slug]` | Microsite v1 | Prospect-facing ABM brief page. Pulls from `sr_microsites` + `sr_prospects`. Tracks views. Shows insight, AE contact, booking widget | **KEEP** | Core deliverable. Prospect-facing. |
| `/[slug]/v2` | Microsite v2 | Identical to v1 but different layout variant | **DEPRECATE** | Only used for Len DeWees A/B test. Confusing to maintain two microsite renderers. |
| `/brief/[slug]` | Field Brief | Dynamic route serving HTML template for field briefs from `sr_microsites`. Uses `field-brief-template.html`. | **KEEP** | Active prospect-facing route linked from P.S. lines |
| `/brief/chris` | Hardcoded brief | Static HTML brief for Chris (Inorsa internal demo) | **DEPRECATE** | One-off demo. Not part of pipeline. |
| `/brief/dobson-fiber` | Hardcoded brief | Static HTML for Dobson Fiber | **DEPRECATE** | Early test artifact. Not pipeline-generated. |
| `/brief/finley-engineering` | Hardcoded brief | Static HTML for Finley Engineering | **DEPRECATE** | Early test artifact. Not pipeline-generated. |
| `/insights/[slug]` | Industry Insights | Dynamic route rendering industry insights variant. Tracks `insights_view`. | **EVALUATE** | May be valuable as a microsite variant but unclear if used in current pipeline. Check if any P1/P2 emails link to `/insights/` URLs. |
| `/assess/[slug]` | Assessment | Dynamic route rendering assessment template from `assessment-template.html`. | **EVALUATE** | Same question — is this linked from any live emails? |
| `/pipeline/[slug]` | Workflow Schematic | Dynamic route rendering workflow schematic from `schematic-template.html`. Tracks `pipeline_view`. | **EVALUATE** | Same question — is this linked from any live emails? |
| `/compare` | Variant Compare | Side-by-side iframe comparison of v1 vs v2 microsites. Hardcoded for B+T GRP / Len DeWees. | **DEPRECATE** | One-time design decision artifact. Decision was made (v1 won). |
| `/booked` | Booking Confirmation | Post-booking page. Reads slug from cookie, shows confirmation with AE-specific content. Has A&E firm detection. | **KEEP** | Active booking flow endpoint |
| `/debug` | Debug Route | Returns Supabase connection diagnostics as JSON | **DEPRECATE** | Dev-only. Should not be deployed to prod. |
| `/report` | Performance Report | FC2026 engagement stats: sent, opened, clicked, replied, meetings. Breakdowns by AE and signal strength. Light background (#F7F8F3). | **REDESIGN** | Core ops page but needs integration into unified ops portal. Currently standalone. Already uses light theme. |
| `/ops` | Mission Control | Main operator table: prospect list with sort, filter, expand, status cycling, keyboard shortcuts, bulk actions. P1/P2 toggle. Dark theme (#081E3F background). | **REDESIGN** | Core ops surface. Needs light mode, streamlined columns, integrated review workflow. |
| `/ops/brain` | Brain Activity | Shows pattern/persona distribution, research stats. Light theme (#F7F8F3). | **REDESIGN** | Useful analytics but disconnected from ops workflow. Integrate into pipeline dashboard. |
| `/ops/intelligence` | Market Intelligence | Static BEAD state data, signal/persona breakdowns, competitive landscape. | **REDESIGN** | Valuable context but static data is stale-prone. Should be auto-updated from research or removed. |
| `/ops/pipeline` | Pipeline Dashboard | Run history from `sr_engine_output`. Shows runs, pass rates, AE assignments. | **REDESIGN** | This is the telemetry surface. Needs phase-level telemetry integration. |
| `/ops/queue` | Action Queue | Reviewer-specific action items: unresolved notes, verification failures, reviewer timestamps. Role-based filtering (Justyn/Tim/AE). | **REDESIGN** | Strong concept. Needs expansion to be the primary review workflow surface. |
| `/api/review-feedback` | API Route | POST endpoint for review note submission | **KEEP** | Backend for notes system |

### Theme Inventory

| Surface | Current Theme | Notes |
|---------|--------------|-------|
| Microsites (`/[slug]`) | Dark navy (#0A1628) | Prospect-facing. Keep dark — it's a deliberate brand choice. |
| `/ops/*` (Mission Control) | Dark slate (#081E3F equivalent, inline styles) | Operator's daily driver. **Switch to light.** |
| `/report` | Light cream (#F7F8F3) | Already light. Harmonize with new palette. |
| `/ops/brain` | Light cream (#F7F8F3) | Already light. Harmonize. |
| `/ops/intelligence` | Mixed (light header, dark data sections) | Inconsistent. Unify. |
| `globals.css` | Dark navy vars | Prospect-facing root. Ops pages override inline. |

---

## 2. Proposed Page Architecture (v2)

### Prospect-Facing (unchanged, dark theme)

| Route | Purpose |
|-------|---------|
| `/` | Redirect to inorsa.com |
| `/[slug]` | ABM microsite (single renderer, v2 variant removed) |
| `/brief/[slug]` | Field brief (dynamic) |
| `/booked` | Booking confirmation |

### Operator Portal (new light theme, `/ops/*`)

| Route | Purpose | Priority |
|-------|---------|----------|
| `/ops` | **Batch Review** — The primary surface. Table of prospects with inline approve/reject/edit. Replaces current mission control with streamlined columns focused on review workflow. | P0 |
| `/ops/prospect/[id]` | **Prospect Detail** — Full drill-down: all phases, scores, email body preview, microsite preview (iframe), research summary, intel, approve/reject/edit controls. | P0 |
| `/ops/pipeline` | **Pipeline Runs** — Run history with per-phase telemetry. Click a run to see its prospects and pass/fail breakdown. | P1 |
| `/ops/queue` | **Action Queue** — Role-filtered action items. "What needs my attention right now?" | P1 |
| `/ops/report` | **Performance** — Engagement stats (moved from `/report`). | P1 |
| `/ops/cost` | **Cost Tracker** — Per-run, per-prospect API costs. Apollo credits, LLM tokens, total. | P2 |
| `/ops/brain` | **Research Quality** — Pattern distribution, persona breakdown, research confidence trends. | P2 |

### Removed Pages

| Route | Reason |
|-------|--------|
| `/[slug]/v2` | A/B test concluded |
| `/brief/chris`, `/brief/dobson-fiber`, `/brief/finley-engineering` | Hardcoded demos |
| `/compare` | Design decision made |
| `/debug` | Dev-only |
| `/ops/intelligence` | Static BEAD data goes stale. Replace with live research quality metrics in `/ops/brain`. |
| `/insights/[slug]` | Evaluate first — if no live emails link here, deprecate. If linked, keep as secondary microsite variant. |
| `/assess/[slug]` | Same — evaluate link usage before removing. |
| `/pipeline/[slug]` | Same — evaluate link usage before removing. |

---

## 3. User Stories

### US-1: Batch Review in Under 5 Minutes (P0)
**As** the operator, **I want to** review a pipeline batch and approve/reject/edit each prospect **so that** I can clear a 15-25 prospect batch without context-switching between pages.

**Acceptance Criteria:**
- Table shows: Company, Name, Title, Signal, Email Subject (truncated), Word Count, Judge Score, Status, Actions
- One-click expand shows: full email body, microsite preview (iframe), judge must-fix notes, research confidence
- Approve = sets status to `send`, records timestamp
- Reject = sets status to `reject`, prompts for reason (stored as review note)
- Edit = opens email body in editable textarea, saves to `sr_engine_output`
- Keyboard shortcuts: `j/k` navigate, `a` approve, `r` reject, `e` edit, `space` expand
- Batch select + bulk approve for prospects that passed judge with no must-fix items
- Filter by: run ID, status (pending/approved/rejected), signal strength, AE

### US-2: Prospect Detail Deep Dive (P0)
**As** the operator, **I want to** see everything about one prospect on a single page **so that** I can make informed approve/reject decisions without querying Supabase.

**Acceptance Criteria:**
- Header: Name, Title, Company, Email, AE assignment, Signal badge, Confidence badge
- Phase timeline: visual indicator of each phase (1-9) with pass/fail/skip icons and timing
- Email tab: full T1 body, subject, P.S., word count, judge scores per dimension, must-fix items
- Microsite tab: live iframe preview of `/brief/{slug}`
- Research tab: full research summary, structured intel (all 29 fields), fit rationale
- Brain tab: entity graph for this company, brain context at time of composition
- History tab: all pipeline runs for this prospect, with diff between versions
- Actions: Approve, Reject (with reason), Edit email, Re-run prospect (triggers pipeline for this one prospect)

### US-3: Pipeline Telemetry Dashboard (P1)
**As** the operator, **I want to** see per-phase metrics across pipeline runs **so that** I can identify which phase is the bottleneck and track improvement over time.

**Acceptance Criteria:**
- Run selector (dropdown or timeline)
- Per-phase row: pass rate, fail rate, avg latency, max latency, count
- Bottleneck highlight (highest avg latency)
- Trend chart: judge pass rate over time (runs on x-axis)
- Drill-down: click a phase to see which prospects failed and why

### US-4: Cost Visibility (P2)
**As** the operator, **I want to** see per-run and per-prospect API costs **so that** I can optimize spending and forecast batch costs.

**Acceptance Criteria:**
- Per-run total: Apollo calls, LLM tokens (input/output by model), DuckDuckGo queries
- Per-prospect breakdown within a run
- Cost trend over time
- Projected cost for next batch (based on average per-prospect)

### US-5: Research Quality Monitor (P2)
**As** the operator, **I want to** see research quality trends **so that** I can identify under-researched prospects and pattern effectiveness.

**Acceptance Criteria:**
- Research confidence distribution (high/medium/low) per run
- Pattern usage and judge pass rate per pattern
- Persona bucket distribution
- Prospects with "low" confidence flagged for manual research supplementation

### US-6: Action Queue (P1)
**As** the operator (or reviewer), **I want to** see my pending action items in one place **so that** I know exactly what needs my attention.

**Acceptance Criteria:**
- Pending approvals (prospects that passed judge, awaiting operator review)
- Flagged items (judge HOLD verdicts, must-fix items)
- Unresolved review notes
- Email discovery failures (prospects that need manual email resolution)
- ICP uncertain (prospects where LLM classified with low confidence)
- Role filter: Justyn (approvals, strategy), Tim (email quality), AE (territory review)

---

## 4. Light Mode Design Spec

### Design Philosophy

Clean, professional, high-contrast light interface. References: Linear (task management), Vercel Dashboard (deployment ops), Notion (content review). The goal is an interface that feels like a premium B2B SaaS tool, not a developer dashboard.

### Color Palette

| Token | Value | Usage | WCAG Contrast vs White |
|-------|-------|-------|----------------------|
| `--bg-page` | `#FAFAFA` | Page background | N/A (background) |
| `--bg-surface` | `#FFFFFF` | Cards, panels, table rows | N/A (background) |
| `--bg-surface-hover` | `#F5F5F5` | Row/card hover state | N/A (background) |
| `--bg-surface-active` | `#F0EDFF` | Selected/active state (light purple tint) | N/A (background) |
| `--border-default` | `#E5E5E5` | Default borders, table lines | N/A (decorative) |
| `--border-subtle` | `#F0F0F0` | Subtle separators | N/A (decorative) |
| `--text-primary` | `#171717` | Headings, primary content | 14.5:1 (AAA) |
| `--text-secondary` | `#525252` | Body text, descriptions | 7.6:1 (AAA) |
| `--text-tertiary` | `#A3A3A3` | Muted labels, timestamps | 2.6:1 (AA large text only) |
| `--text-on-accent` | `#FFFFFF` | Text on accent backgrounds | Depends on accent bg |
| `--accent-primary` | `#7C3AED` | Primary actions, links, active states | 5.3:1 vs white (AA) |
| `--accent-primary-hover` | `#6D28D9` | Hover state for primary accent | 7.0:1 vs white (AAA) |
| `--accent-subtle` | `#F0EDFF` | Light accent background (selected rows, badges) | N/A (background) |
| `--status-send` | `#16A34A` | Approved/send status | 3.9:1 (use with bold or large text) |
| `--status-hold` | `#CA8A04` | Hold/review status | 3.5:1 (use with bold or large text) |
| `--status-reject` | `#DC2626` | Rejected/blocked status | 4.6:1 (AA) |
| `--status-dnc` | `#991B1B` | Do Not Contact | 7.7:1 (AAA) |
| `--status-pending` | `#71717A` | Pending/unreviewed | 4.5:1 (AA) |
| `--signal-strong` | `#16A34A` | Strong signal dot | N/A (decorative) |
| `--signal-good` | `#CA8A04` | Good signal dot | N/A (decorative) |
| `--signal-possible` | `#EA580C` | Possible signal dot | N/A (decorative) |
| `--signal-weak` | `#DC2626` | Weak signal dot | N/A (decorative) |

### Accessibility Targets

| Standard | Target | Notes |
|----------|--------|-------|
| WCAG 2.2 Level | **AA minimum, AAA where possible** | All text on backgrounds meets 4.5:1 (normal) or 3:1 (large/bold) |
| Color-only indicators | **Never** | All status indicators use color + text label. Signal dots paired with text. |
| Keyboard navigation | **Full** | Already partially implemented (j/k/a/r/e). Extend to all interactive elements. |
| Focus indicators | **Visible** | 2px solid accent outline on `:focus-visible`. Already in globals.css. |
| Reduced motion | **Respected** | `prefers-reduced-motion: reduce` disables transitions/animations |
| Screen reader | **ARIA labels** | Table headers, status badges, expand/collapse states all labeled |
| Minimum touch target | **44x44px** | Mobile-friendly tap targets on buttons and interactive rows |

### Typography

| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Page title | General Sans | 24px | 700 | `--text-primary` |
| Section heading | General Sans | 16px | 600 | `--text-primary` |
| Table header | General Sans | 11px | 600 | `--text-tertiary`, uppercase, letter-spacing 0.08em |
| Table body | General Sans | 13px | 400 | `--text-primary` |
| Badge text | General Sans | 11px | 600 | On-color |
| Monospace (scores, IDs) | JetBrains Mono | 12px | 400 | `--text-secondary` |

### Component Patterns

**Cards:** White background, 1px `--border-default` border, 8px border-radius, 16px padding. Subtle shadow: `0 1px 3px rgba(0,0,0,0.04)`.

**Table rows:** No background (transparent over `--bg-page`). Hover: `--bg-surface-hover`. Selected: `--bg-surface-active`. 1px `--border-subtle` between rows. Company group separator: 2px `--border-default`.

**Status badges:** Pill shape (4px vertical padding, 10px horizontal, 999px border-radius). Background: status color at 10% opacity. Text: status color at full opacity. Bold text.

**Signal dots:** 8px circle, inline with text label. Never color-only — always accompanied by text ("Strong", "Good", etc.).

**Buttons:**
- Primary: `--accent-primary` background, white text, 8px radius, 600 weight
- Secondary: transparent background, `--accent-primary` text, 1px `--border-default` border
- Danger: `--status-reject` background, white text
- All buttons: 36px min-height, 12px horizontal padding minimum

**Expand/collapse:** Chevron icon rotates 90 degrees. Expanded panel slides down with 200ms ease transition. Background: `--bg-surface` with top border.

---

## 5. Wireframe Descriptions

### 5a. Batch Review (`/ops`)

```
+------------------------------------------------------------------+
| ShowRev Ops                          [Pipeline ▾] [Queue] [Report]|
+------------------------------------------------------------------+
| [Search...]  Signal[▾]  Status[▾]  AE[▾]  [Bulk: Approve Selected]|
| 47 prospects | 12 Send | 8 Hold | 3 Reject | 24 Pending          |
+------------------------------------------------------------------+
| ☐ | Company      | Name          | Signal | Subject...  | WC | Score | Status  |
|---|-------------|---------------|--------|-------------|-----|-------|---------|
| ☐ | Omni Fiber  | Chad Mueller  |  ●Str  | Omni Fib... |  91 |  8.2  | [Pend▾] |
|   |             |               |        |             |     |       |         |
|   | ┌─ EXPANDED ──────────────────────────────────────────────────┐ |
|   | │ [Email] [Microsite] [Research] [Intel]                     │ |
|   | │                                                            │ |
|   | │ Subject: Omni Fiber's Round 4 construction clock...        │ |
|   | │                                                            │ |
|   | │ Chad, Omni Fiber's six Connect Illinois Round 4 awards...  │ |
|   | │ ...                                                        │ |
|   | │                                                            │ |
|   | │ Judge: research=9 vp=8 tone=8 concise=7 jtbd=9 (avg 8.2)  │ |
|   | │ Must-fix: Word count sits at ~105w. Cut...                 │ |
|   | │                                                            │ |
|   | │ [✓ Approve]  [✗ Reject]  [✎ Edit]  [↻ Re-run]             │ |
|   | └────────────────────────────────────────────────────────────┘ |
|---|-------------|---------------|--------|-------------|-----|-------|---------|
| ☐ | Ripple Fiber| Brett Judnick |  ●Gd   | Ripple F... |  88 |  7.4  | [Hold▾] |
|---|-------------|---------------|--------|-------------|-----|-------|---------|
```

### 5b. Prospect Detail (`/ops/prospect/[id]`)

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
| [Email] [Microsite] [Research] [Intel] [Brain] [History]          |
|                                                                   |
| T1 Email                                              91 words    |
| Pattern: loss_aversion                                            |
| ┌──────────────────────────────────────────────────────┐          |
| │ Subject: Omni Fiber's Round 4 construction clock...  │          |
| │                                                      │          |
| │ Chad, Omni Fiber's six Connect Illinois Round 4...   │          |
| │ ...                                                  │          |
| │ P.S. Put together a brief on Omni Fiber's...        │          |
| └──────────────────────────────────────────────────────┘          |
|                                                                   |
| Judge Scores                                                      |
| research=9 ████████████████████ vp=8 ████████████████             |
| tone=8 ████████████████  concise=7 ██████████████                 |
| jtbd=9 ████████████████████  AVG: 8.2 → SEND                     |
|                                                                   |
| Must-Fix Notes                                                    |
| ⚠ Word count sits at ~105w. Cut 'without adding headcount'...    |
| ⚠ Verify $32.3M and 6,985-location figures...                    |
+------------------------------------------------------------------+
```

### 5c. Pipeline Telemetry (`/ops/pipeline`)

```
+------------------------------------------------------------------+
| Pipeline Runs                              [Run: run-20260608-m6qa ▾]|
+------------------------------------------------------------------+
| Summary: 15 prospects | 13 pass (87%) | 2 fail | 162s avg         |
+------------------------------------------------------------------+
| Phase           | Pass% | Fail% | Avg    | Max    | Count         |
|-----------------|-------|-------|--------|--------|---------------|
| 1-icp-gate      | 100%  |  0%   |  425ms | 1218ms |  15           |
| 2-email-find    |  93%  |  7%   |  418ms |  497ms |  15           |
| 3-research      | 100%  |  0%   | 77398ms|105411ms|  15           |
| 3c-intel-struct | 100%  |  0%   | 31097ms| 37363ms|  15           |
| 4-substrate     |  80%  | 20%   |  980ms | 1037ms |  15           |
| 5-pattern       | 100%  |  0%   | 18868ms| 22569ms|  15           |
| 6-composition   | 100%  |  0%   | 11060ms| 18919ms|  15  ← click  |
| 7-judge         |  87%  | 13%   | 21899ms| 25974ms|  15           |
+------------------------------------------------------------------+
| Bottleneck: 3-research (avg 77s)                                  |
+------------------------------------------------------------------+
| Trend (last 5 runs)                                               |
| Judge pass:  67% → 73% → 80% → 85% → 87%  ↑                     |
+------------------------------------------------------------------+
```

---

## 6. Effort Estimates

| Item | Scope | Estimate | Priority |
|------|-------|----------|----------|
| Light mode CSS variables + globals rewrite | New `ops.css` with light palette. Replace inline styles in all `/ops/*` components with CSS custom properties. | 4-6 hours | P0 |
| Batch Review redesign (`/ops` page) | Streamline OpsTable columns, integrate approve/reject/edit actions, simplify expanded view, remove unused fields | 6-8 hours | P0 |
| Prospect Detail page (`/ops/prospect/[id]`) | New page. Phase timeline component, tabbed content (email/microsite/research/intel/brain/history), action buttons | 8-10 hours | P0 |
| Pipeline Telemetry integration | Read from telemetry JSON files or new Supabase table. Phase-level metrics display. Trend chart. | 4-6 hours | P1 |
| Action Queue redesign | Expand current queue with pending approvals, judge flags, email failures, ICP uncertain | 3-4 hours | P1 |
| Report integration | Move `/report` under `/ops/report`, harmonize styling with new palette | 2-3 hours | P1 |
| Cost Tracker page | New page. Requires cost data collection (ruflo-cost-tracker plugin integration) | 4-6 hours | P2 |
| Brain/Research Quality | Redesign existing `/ops/brain` page with new palette, add confidence trends | 3-4 hours | P2 |
| Deprecation cleanup | Remove v2 microsite, hardcoded briefs, compare, debug routes. Verify no live links. | 1-2 hours | P0 |
| Accessibility audit + fixes | ARIA labels, focus management, reduced motion, touch targets, screen reader testing | 3-4 hours | P1 |
| Navigation + layout | Top nav bar, sidebar or tab navigation for ops sections. Consistent header/breadcrumbs. | 2-3 hours | P0 |
| **TOTAL** | | **~40-56 hours** | |

### Phased Delivery

**Phase A (P0 — "Justyn can review a batch in 5 min"):** ~20-25 hours
- Light mode CSS foundation
- Batch Review redesign
- Prospect Detail page
- Deprecation cleanup
- Navigation

**Phase B (P1 — "Justyn can see what's happening"):** ~12-17 hours
- Pipeline Telemetry
- Action Queue redesign
- Report integration
- Accessibility audit

**Phase C (P2 — "Justyn can see cost and quality"):** ~7-10 hours
- Cost Tracker
- Brain/Research Quality

---

## 7. Implementation Notes

### CSS Strategy

Do NOT modify `globals.css` — it controls the prospect-facing dark theme for microsites. Instead:

1. Create `ops.css` with the light palette CSS custom properties
2. Create an `OpsLayout` component that wraps all `/ops/*` pages and imports `ops.css`
3. Replace all inline `style={{}}` objects in ops components with utility classes or CSS modules
4. The prospect-facing pages (`/[slug]`, `/brief/[slug]`, `/booked`) keep the existing dark `globals.css`

### Data Sources for New Features

| Feature | Data Source | Exists? |
|---------|-----------|---------|
| Batch Review | `sr_engine_output` + `sr_prospects` | Yes |
| Phase Telemetry | Telemetry JSON files in `data/showrev/premium/telemetry/` or new `sr_telemetry` table | Partial (JSON files exist, no Supabase table) |
| Cost Tracking | ruflo-cost-tracker `cost-tracking` AgentDB namespace | Yes (scripts exist) |
| Research Quality | `sr_engine_output` (research_confidence, persona_bucket, influence_pattern) | Yes |
| Action Queue | `sr_review_notes`, `sr_engine_output` (mechanical_check_passed), `sr_prospects` | Yes |

### Migration Path

The redesign can be done incrementally:
1. Add `ops.css` and `OpsLayout` — zero disruption to existing pages
2. Modify `/ops` page and components one at a time — each commit is deployable
3. Add new pages (`/ops/prospect/[id]`) without removing old ones
4. Deprecate old pages only after new equivalents are live

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-08 00:32 | Claude | Initial spec from portal audit. 19 pages inventoried, 7 proposed ops pages, 6 user stories, light mode palette, wireframes, effort estimates. |
