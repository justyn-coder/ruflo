---
title: Watcher + Post-Show Report — Implementation Spec
status: DRAFT
last_updated: 2026-06-02 19:40 EST
version: v1
purpose: Single build spec for the engagement Watcher upgrade and client-facing Post-Show Report page. Designed for one session build with shared data layer.
---

# Watcher + Post-Show Report — Build Spec

## What exists

| Component | Status | Location |
|-----------|--------|----------|
| Watcher V1 (CLI poll + status) | DONE | `src/showrev/m1-email-find/watcher.ts` |
| sr_outcomes table | DONE | Supabase (with hs_event_id dedup + contact_email index) |
| sr_microsite_events table | DONE | Supabase (page views from microsite route handler) |
| Intelligence page | DONE | `app/ops/intelligence/page.tsx` (research depth stats) |
| Operator portal | DONE | `app/ops/page.tsx` (full prospect dashboard) |
| Service role key | DONE | Deployed, RLS hardened |

## What to build

Two things, sharing one data layer:

1. **Poll-on-load server action** — refreshes sr_outcomes when the report page loads (replaces need for scheduled polling)
2. **`/report` page** — client-facing, outside `/ops` tree, read-only engagement dashboard

## Architecture (3 files)

```
lib/
  engagement.ts          ← NEW: shared queries (used by report page + watcher CLI)

app/
  report/
    page.tsx             ← NEW: client-facing report (Server Component)
    actions.ts           ← NEW: poll-on-load server action

m1-email-find/
  watcher.ts             ← EXISTS: CLI stays for batch/scripted use
```

### File 1: `lib/engagement.ts` — shared data layer

One file, four queries. Used by both the portal page and the watcher CLI.

```typescript
// All queries use supabaseServer (service role, bypasses RLS)

export interface EngagementStats {
  totalSent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  deals: number;
  micrositeViews: number;
  micrositeUniqueContacts: number;
  byAe: Map<string, { sent: number; opened: number; clicked: number; replied: number }>;
  bySignal: Map<string, { total: number; opened: number; replied: number }>;
  recentEvents: Array<{ contact: string; company: string; event: string; timestamp: string }>;
}

export async function getEngagementStats(cohort: string): Promise<EngagementStats>
export async function getResearchStats(cohort: string): Promise<ResearchStats>
export async function getRecentActivity(limit: number): Promise<ActivityItem[]>
```

Data sources per query:

| Query | Tables | Notes |
|-------|--------|-------|
| getEngagementStats | sr_outcomes + sr_prospects | Join on prospect_id, group by event_type and assigned_ae |
| getResearchStats | sr_engine_output + sr_prospects | COUNT contacts, companies, non-null fields |
| getRecentActivity | sr_outcomes ORDER BY created_at DESC | Last N events with prospect name/company |

### File 2: `app/report/actions.ts` — poll-on-load

```typescript
'use server';

// Runs watcher poll logic, then returns stats
// Called by the report page on load
// Debounced: skip if sr_outcomes was updated <5 min ago

export async function refreshEngagement(): Promise<void>
```

Flow:
1. Check max(created_at) from sr_outcomes
2. If <5 min ago, skip (data is fresh)
3. Otherwise, run the same HubSpot search logic from watcher.ts
4. Upsert new events to sr_outcomes

This replaces scheduled polling for the report use case. The CLI `watcher.ts poll` still works for scripted/batch use.

### File 3: `app/report/page.tsx` — the report

Server Component. No client-side JS needed (pure SSR).

**Route:** `/report` (NOT under `/ops` — separate access scope)

**Layout — 5 sections, one scroll:**

```
┌─────────────────────────────────────────────────┐
│ INORSA × SHOWREV                                │
│ Fiber Connect 2026 — Post-Show Report           │
├─────────────────────────────────────────────────┤
│                                                 │
│ § A. EXECUTIVE SUMMARY                          │
│ ┌─────────────────────────────────────────────┐ │
│ │ 45 contacts researched across 38 companies  │ │
│ │ 45 personalized emails sent via 3 AEs       │ │
│ │ X opened (Y%) · Z replied (W%) · N meetings │ │
│ │ V microsite page views                      │ │
│ │                                             │ │
│ │ Fully loaded show cost: $___               │ │
│ │ Cost per contact reached: $___             │ │
│ │ Cost per reply: $___                       │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ § B. ENGAGEMENT                                 │
│ ┌──────┬──────┬──────┬──────┬──────┐           │
│ │ SENT │ OPEN │CLICK │REPLY │DEALS │           │
│ │  45  │  X   │  Y   │  Z   │  N   │           │
│ │      │ (X%) │ (Y%) │ (Z%) │      │           │
│ └──────┴──────┴──────┴──────┴──────┘           │
│                                                 │
│ By AE:                                          │
│ ┌─────────────┬──────┬──────┬──────┬──────┐    │
│ │ Mike Rutski  │  25  │  X   │  Y   │  Z   │    │
│ │ Nathan Dunn  │  13  │  X   │  Y   │  Z   │    │
│ │ Lucas Spencer│   7  │  X   │  Y   │  Z   │    │
│ └─────────────┴──────┴──────┴──────┴──────┘    │
│                                                 │
│ By Signal Prediction:                           │
│ ┌─────────────┬──────┬──────┬──────┐           │
│ │ Strong       │  X   │  Y   │  Z%  │           │
│ │ Good         │  X   │  Y   │  Z%  │           │
│ │ Possible     │  X   │  Y   │  Z%  │           │
│ │ Weak         │  X   │  Y   │  Z%  │           │
│ └─────────────┴──────┴──────┴──────┘           │
│ (validates research quality: Strong should      │
│  have higher reply rates than Weak)             │
│                                                 │
│ § C. RESEARCH DEPTH                             │
│ ┌─────────────────────────────────────────────┐ │
│ │ Companies profiled: 38                      │ │
│ │ Contacts researched: 45                     │ │
│ │ Custom microsites: 48                       │ │
│ │ Brain entities: ~27                         │ │
│ │ BEAD states mapped: 15                      │ │
│ │ Sources per contact: avg X                  │ │
│ └─────────────────────────────────────────────┘ │
│ (reuse data from /ops/intelligence queries)     │
│                                                 │
│ § D. MICROSITE ANALYTICS                        │
│ ┌─────────────────────────────────────────────┐ │
│ │ Total page views: X                         │ │
│ │ Unique contacts who viewed: Y               │ │
│ │ Top 5 viewed microsites: ...                │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ § E. RECENT ACTIVITY (last 10 events)           │
│ ┌─────────────────────────────────────────────┐ │
│ │ Jun 2 — Jason Hall (Mohawk) opened T1       │ │
│ │ Jun 2 — Len DeWees (B+T) replied            │ │
│ │ Jun 2 — Troy Hoover (PCCI) clicked          │ │
│ │ ...                                         │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ ─────────────────────────────────────────────── │
│ ShowRev × Inorsa · Confidential                 │
│ Data refreshed: [timestamp]                     │
└─────────────────────────────────────────────────┘
```

### Design

Match the microsite aesthetic (dark navy #0B1120, light text, purple accents #C4B5FD) — NOT the ops portal warm paper. The report is client-facing; it should feel like the same brand as the microsites.

### Cost section

```typescript
const SHOW_CONFIG = {
  name: 'Fiber Connect 2026',
  cohort: 'fc2026-booth',
  totalCost: null as number | null, // Set when Chris provides the number
};
```

When `totalCost` is null, the cost rows show "—" instead of calculated values. When set, the page computes cost-per-contact and cost-per-reply automatically.

---

## Efficiency map

| Concern | Approach | Why |
|---------|----------|-----|
| Polling freshness | Server action with 5-min debounce | No cron needed. Page always fresh. |
| Query reuse | `lib/engagement.ts` shared module | Same queries power CLI `status` and portal page |
| Research stats | Import from intelligence page queries | Don't re-derive; same Supabase queries |
| Influence patterns (V2) | **Deferred** — not in first build | Requires per-touch events from HubSpot Email Events API |
| HubSpot native dashboard | **Deferred** — portal page covers the need | Build later if Chris/Sean prefer HubSpot-native access |
| Access separation | `/report` (client), `/ops` (operator) | No auth code needed; Vercel password protection on /ops when AEs join |
| Client-side JS | **None** — pure Server Component | Fastest load, no hydration, SEO irrelevant (noindex) |

## Build order

1. `lib/engagement.ts` — shared queries (~30 min)
2. `app/report/actions.ts` — poll-on-load (~15 min)
3. `app/report/page.tsx` — the page (~60 min)
4. Refactor `watcher.ts status` to use `lib/engagement.ts` (~15 min)
5. Verify end-to-end: poll → data → page renders (~15 min)

Total: ~2.5 hours. One session.

## What's NOT in this build

| Item | Why deferred |
|------|-------------|
| Influence pattern breakdown (Section D from original spec) | Needs Watcher V2 per-touch events |
| HubSpot native dashboard (6 reports) | Portal page covers the need; build if requested |
| Scheduled polling | Poll-on-load handles report freshness; CLI handles batch |
| AE-facing report view | Same page works; add `?ae=mike` filter later if needed |
| PDF/slide export | Screenshot or browser print; automate later if requested |

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-02 19:40 | Claude | Combined Watcher V2 + Report build spec. 3-file architecture, shared data layer, poll-on-load, 5-section report. Red-team fixes: cost section, access separation, no auto-narrative. |
