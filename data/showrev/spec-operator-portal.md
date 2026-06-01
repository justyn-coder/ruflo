---
title: Operator Portal Spec — ShowRev Control Surface
status: DRAFT
last_updated: 2026-05-31 21:33 EST
version: v1
purpose: Single control surface for the operator. Review queue + pipeline dashboard + Brain activity + outcome tracking. Replaces the current /ops page.
---

# Operator Portal Spec

## What exists

`src/showrev/microsite/app/ops/` — a Next.js page deployed on Vercel. Reads from Supabase (`sr_prospects`, `sr_brain_dossiers`, `sr_microsites`). Already has:

- Full prospect table with sortable columns (tier, status, company, AE, urgency, name)
- Status cycling: send / hold / reject / dnc / partner / pending
- AE review workflow: verified / flagged / rejected + notes
- Two-step GO activation: AE verified → Operator GO
- Expandable dossier view per prospect (MEDDPICC fields, company intel, talking points)
- Email preview (subject, body, P.S., AE signature)
- Microsite slug links
- Company logos via Google Favicons
- Multi-contact company grouping
- Stats bar: total, send, hold, reject, dnc, pending, emails, dossiers, microsites

**What it does NOT have (and needs):**

## 4 Missing Sections

### Section 1: Pipeline Dashboard

**Problem:** The operator cannot see what the Engine is doing. No visibility into which prospects have been processed, which are queued, which failed. No run history.

**Solution:** A pipeline tab showing:

```
┌──────────────────────────────────────────────────────────┐
│  Pipeline Dashboard                                       │
│                                                           │
│  Current Run: run-20260531-dgiq          [Pause] [Stop]  │
│  Progress: ████████░░░░░░░░░░░ 7 / 11 (64%)              │
│  Elapsed: 1h 42m  |  Est remaining: 48m                   │
│  Brain entities: 27  |  Emails composed: 21               │
│                                                           │
│  Recent Runs                                              │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ run-20260531-dgiq  │ 11 prospects │ running │ 64%   │  │
│  │ run-20260531-273u  │  1 prospect  │ done    │ 100%  │  │
│  │ run-20260531-0d0n  │  1 prospect  │ done    │ 100%  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  Per-Prospect Status                                      │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ✓ Chris Fort      │ Centillion  │ 3 emails │ 12m    │ │
│  │ ✓ Troy Hoover     │ PCCI Group  │ 3 emails │ 15m    │ │
│  │ ⏳ Vince Calkins  │ Fybercom    │ Phase 4  │ 8m     │ │
│  │ ○ Patrik Lowenborg│ NetPMD      │ queued   │ -      │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

Data source: checkpoint JSON files (`{runId}-checkpoint.json`) + manifest JSON.

Actions:
- Click a prospect → jump to their review card in the Review Queue
- Click a run → show all prospects from that run
- [Re-run] button on failed prospects → re-queue with same run_id

### Section 2: Review Queue (enhanced /ops)

**Problem:** The current table shows raw data. The operator needs an efficient review workflow — not just data display, but a decision-making interface.

**Solution:** Redesign the prospect cards as a review workflow:

```
┌──────────────────────────────────────────────────────────┐
│  Review Queue                     Filters: [ICP ▼] [AE ▼]│
│                                   [Status ▼] [Run ▼]     │
│                                                           │
│  ┌────────────────────────────────────────────────────┐   │
│  │ 🏢 Mohawk Networks, LLC                           │   │
│  │ Jason Hall — Tribal Broadband PM     [Mike R]      │   │
│  │ ICP: hold → PASS (research resolved)    Signal: Good│  │
│  │                                                     │  │
│  │ ┌─ T1 ────────────────────────────────────────────┐│  │
│  │ │ Subject: something in the Aecon JV scope        ││  │
│  │ │ Jason,                                          ││  │
│  │ │ Something in the Aecon JV build model caught... ││  │
│  │ │ 68 words | curiosity_gap | ✓ mechanical         ││  │
│  │ │                              [Edit] [Approve]   ││  │
│  │ └─────────────────────────────────────────────────┘│  │
│  │                                                     │  │
│  │ ┌─ Intel ─────────────────────────────────────────┐│  │
│  │ │ Signal: Good | Timeline: Q3 2026 | Risk: tribal ││  │
│  │ │ Next: Send Jason email, path to Allyson Doctor  ││  │
│  │ │ Talking points: [expand]                        ││  │
│  │ └─────────────────────────────────────────────────┘│  │
│  │                                                     │  │
│  │ ┌─ Microsite ─────────────────────────────────────┐│  │
│  │ │ "Aecon-Mohawk JV built to serve tribal..."      ││  │
│  │ │ [Preview] [Edit headline]                       ││  │
│  │ └─────────────────────────────────────────────────┘│  │
│  │                                                     │  │
│  │ [SEND ✓]  [HOLD]  [REJECT]  [RE-RESEARCH]  [DNC]  │  │
│  │                                                     │  │
│  │ AE Review: [Pending]  Operator: [—]                │  │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**New capabilities vs current /ops:**

| Feature | Current | New |
|---------|---------|-----|
| Email editing | View only | Inline edit with word count + anti-tell live checks |
| Email approval | Status cycle only | Per-touch approve/edit/reject |
| Microsite preview | Slug link only | Inline preview + headline edit |
| Intel report | Raw dossier expand | Structured card (signal, timeline, risk, talking points) |
| Batch operations | None | Select multiple → batch approve / batch re-research |
| Filters | Sort by column | Filter by ICP, AE, status, run, company, pattern |
| Search | None | Full-text search across prospect name, company, email body |
| Multi-contact | Grouped by company | Collapsible company cards with all contacts + angle differentiation check |
| Re-research | None | [RE-RESEARCH] button sends prospect back to pipeline |

**Inline email editing:**

When operator clicks [Edit] on a touch:
- Email body becomes editable textarea
- Live word count updates
- Anti-AI-tell checker runs on keystroke (highlights violations in red)
- [Save] writes back to `sr_brain_dossiers`
- [Revert] restores Engine-generated version
- Edit history tracked: `operator_edit_count`, `last_edited_at`, `original_body` preserved

Every operator edit is a training signal. When the operator changes a word, fixes a tone issue, or rewrites an opener — that's data the Brain should learn from (future: Brain learns from operator overrides to improve composition).

### Section 3: Brain Activity

**Problem:** The operator cannot see what the Brain knows, what it's learning, or how research quality changes over the course of a run.

**Solution:** A Brain tab showing the knowledge state:

```
┌──────────────────────────────────────────────────────────┐
│  Brain Activity                                           │
│                                                           │
│  Knowledge State                                          │
│  Entities: 27 companies │ 8 funding │ 12 relationships    │
│  Sources: 142 URLs cited │ 89% Tier 1-2                   │
│  Last digest: 2 min ago │ Next refresh: after prospect #30│
│                                                           │
│  ┌─ Entity Graph (top 10 by connection count) ──────────┐│
│  │ Mohawk Networks ──JV── Aecon Utilities               ││
│  │ ├── uses: Calix                                      ││
│  │ ├── funded: TBCP $500K, NY Broadband $6.4M           ││
│  │ └── territory: NY BEAD ($664M)                       ││
│  │                                                       ││
│  │ B+T GRP ──competitor── NetPMD                        ││
│  │ ├── multi-state: 50 states                           ││
│  │ └── funded: multiple BEAD sub-grants                 ││
│  │ ...                                                   ││
│  └───────────────────────────────────────────────────────┘│
│                                                           │
│  Research Quality Over Time                               │
│  ┌───────────────────────────────────────────────────────┐│
│  │ Prospect #  1  5  10  15  20  25  30                 ││
│  │ Avg sources ██ ██ ███ ███ ████ ████ █████            ││
│  │ Brain hits   0  1   3   5    8   12   15             ││
│  │ Cost/prospect $1.50  $1.20  $0.90  $0.60             ││
│  └───────────────────────────────────────────────────────┘│
│                                                           │
│  Recent Discoveries (last 5 ingests)                      │
│  • Fybercom uses Calix for subscriber mgmt (prospect #3)  │
│  • BEAD OK allocation: $797M (prospect #4)                │
│  • NetPMD is prior Inorsa customer (prospect #5)          │
└──────────────────────────────────────────────────────────┘
```

Data source: `entity-graph.jsonl` + `brain-context-digest.md` + pipeline checkpoint metadata.

This tab makes the Brain's value visible. By prospect 30, the operator can see the cost curve dropping and the Brain-hit rate climbing. That's the proof that the learning loop works.

### Section 4: Outcome Tracking (Reporter)

**Problem:** After emails are sent via HubSpot, there's no feedback loop. We don't know which influence patterns got replies, which research angles converted, which AE territories performed better.

**Solution:** An outcomes tab that reads HubSpot engagement data:

```
┌──────────────────────────────────────────────────────────┐
│  Outcomes                                                 │
│                                                           │
│  Engagement Summary (last 30 days)                        │
│  Sent: 45 │ Opened: 32 (71%) │ Clicked: 12 (27%)         │
│  Replied: 8 (18%) │ Meetings: 3 │ Bounced: 2             │
│                                                           │
│  By Influence Pattern                                     │
│  ┌─────────────────────────────────────────────┐          │
│  │ challenger_insight  │ 12 sent │ 4 replied │ 33%  │    │
│  │ commitment_consistency │ 8 sent │ 2 replied │ 25% │   │
│  │ curiosity_gap       │ 6 sent │ 1 replied │ 17%  │    │
│  │ loss_aversion       │ 5 sent │ 1 replied │ 20%  │    │
│  └─────────────────────────────────────────────┘          │
│                                                           │
│  By AE                                                    │
│  Mike R: 15 sent, 3 replied, 1 meeting                    │
│  Nathan D: 18 sent, 4 replied, 2 meetings                 │
│  Lucas S: 12 sent, 1 replied, 0 meetings                  │
│                                                           │
│  Recent Activity                                          │
│  • Jason Hall opened T1 (2h ago) — clicked microsite      │
│  • Len DeWees replied to T2 — "let's set up a call"      │
│  • Troy Hoover bounced — email invalid                    │
└──────────────────────────────────────────────────────────┘
```

Data source: HubSpot engagement events → Supabase `sr_outcomes` table (planned).

Implementation dependency: requires the HubSpot Loader (planned) and a webhook or polling mechanism to pull engagement data back from HubSpot into Supabase. This is the last module to build — but the UI should be spec'd now so the data model is ready.

---

## Navigation

Four tabs, persistent stats bar:

```
┌──────────────────────────────────────────────────────────┐
│  ShowRev │ FC2026          [Pipeline] [Review] [Brain] [Outcomes]│
│  ────────────────────────────────────────────────────────│
│  88 total │ 23 SEND │ 13 HOLD │ 22 REJECT │ 27 entities │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  [Active tab content]                                     │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

URL structure:
- `/ops` — Review Queue (default, current behavior enhanced)
- `/ops/pipeline` — Pipeline Dashboard
- `/ops/brain` — Brain Activity
- `/ops/outcomes` — Outcome Tracking

## Multi-user

Phase 1 (now): Single operator (Justyn). No auth needed — protected by URL obscurity + Vercel deployment.

Phase 2 (when AEs need access): Add a simple role selector at the top. AEs see only their assigned contacts. Operator sees everything. No login system — use Vercel password protection or a query param (`?ae=mike`).

Phase 3 (multi-client): Each client gets their own portal instance. Brain data separated by the 5-layer hierarchy. Portal URL becomes `/ops/{client}/{event}`.

## Data model changes needed

The current `sr_prospects` table needs these columns added:

```sql
ALTER TABLE sr_prospects ADD COLUMN IF NOT EXISTS run_id TEXT;
ALTER TABLE sr_prospects ADD COLUMN IF NOT EXISTS operator_edit_count INTEGER DEFAULT 0;
ALTER TABLE sr_prospects ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;
ALTER TABLE sr_prospects ADD COLUMN IF NOT EXISTS original_email_body TEXT;
```

New table for outcomes:

```sql
CREATE TABLE sr_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id TEXT REFERENCES sr_prospects(id),
  run_id TEXT,
  event_type TEXT NOT NULL, -- opened, clicked, replied, bounced, meeting_booked, deal_created
  touch_number INTEGER,
  influence_pattern TEXT,
  persona_bucket TEXT,
  event_data JSONB,
  hs_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Build order

1. **Pipeline Dashboard** — reads from checkpoint/manifest files already being written. Lowest effort, highest immediate visibility.
2. **Review Queue enhancements** — inline editing, filters, batch ops, search. Builds on existing OpsTable.tsx.
3. **Brain Activity** — reads from entity-graph.jsonl. Needs a small API route to serve the JSONL as JSON.
4. **Outcome Tracking** — depends on HubSpot Loader and engagement webhook. Last to build.

Estimated: 2-3 sessions for Pipeline + Review Queue. 1 session for Brain. Outcomes blocked on HubSpot integration.

## Design

Match the existing `/ops` aesthetic: warm paper background (#f5f1eb), dark text (#1a1510), purple accents (#6d28d9). The architecture diagram uses dark navy (#0B1120) — the portal should NOT match that; it's a different tool for a different context. The warm palette says "workspace for humans making decisions," not "system schematic."

---

## Open questions

1. **Email editing persistence:** When operator edits an email, should it write back to `sr_brain_dossiers` immediately, or stage as a draft until [Save]? Immediate is simpler; staging prevents accidental overwrites.

2. **Re-research scope:** When operator clicks [RE-RESEARCH], does it re-run the full 10-phase pipeline, or just the research phases (1-2b) with existing composition? Full re-run is simpler; partial re-run is faster but needs phase-level checkpointing.

3. **Outcome tracking polling:** Pull from HubSpot on page load (simplest), or set up a HubSpot webhook that pushes to Supabase in real-time? Webhook is better but requires HubSpot Private App configuration.

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-05-31 21:33 | Claude | Initial spec. 4 sections: Pipeline Dashboard, Review Queue, Brain Activity, Outcome Tracking. Build order + data model + multi-user phasing. |
