---
title: Post-Show Report Spec — FC2026 Inorsa
status: DRAFT
last_updated: 2026-06-02 17:50 EST
version: v1
purpose: Spec for the client-facing post-show report. Two surfaces -- HubSpot native dashboard (engagement) + ShowRev portal pages (intelligence + outcomes). Audience is Inorsa CEO (Sean) and Head of Marketing (Chris).
---

# Post-Show Report — FC2026

## Audience and what they care about

| Who | Role | Cares about | Does NOT care about |
|-----|------|-------------|---------------------|
| Sean | CEO | Pipeline created, meetings booked, cost-per-meeting, is ShowRev worth paying for | Research methodology, influence patterns, per-AE breakdowns |
| Chris | Head of Marketing | Research depth, BEAD intelligence, engagement rates, what's working | Implementation details, Supabase tables, scoring models |
| AEs | Senders | Which of my contacts are hot, who replied, who bounced | System architecture, Brain learning |

Sean needs a one-page executive summary. Chris needs proof the intelligence is deep and the outreach is landing. AEs need actionable next-steps per contact.

---

## Two surfaces

The report lives in two places because HubSpot Pro can't show our proprietary data (research depth, Brain entities, influence patterns, microsite analytics). Neither surface is complete alone.

| Surface | What it shows | Who accesses | How |
|---------|---------------|--------------|-----|
| **HubSpot Dashboard** | Engagement metrics, pipeline, AE activity | Chris, Sean, AEs | HubSpot UI (they already have access) |
| **ShowRev Portal** | Research depth, intelligence showcase, outcome tracking, microsites | Chris, Sean, Justyn | fiber.inorsa.com/ops/report (new route, or shared link to /ops/intelligence) |

---

## Surface 1: HubSpot Dashboard

**Dashboard name:** "FC2026 Post-Show — ShowRev"

Create in HubSpot: Reports → Dashboards → Create dashboard. Up to 10 reports.

### Report 1: Engagement Funnel (single number cards)

Four cards in a row:

| Card | Metric | Filter |
|------|--------|--------|
| Sent | Count of contacts | `showrev_outreach_cohort = fc2026-booth` |
| Opened | Count where opened | Sequence step status = opened |
| Replied | Count where replied | Sequence step status = replied |
| Meetings | Count of meeting engagements | Associated with cohort contacts |

HubSpot native: Contacts report → count → filter by `showrev_outreach_cohort`.
Sequence metrics available in the Sequences UI per step.

### Report 2: Engagement by AE (bar chart)

| AE | Sent | Opened | Replied | Meetings |
|----|------|--------|---------|----------|
| Mike Rutski | 25 | ? | ? | ? |
| Nathan Dunn | 13 | ? | ? | ? |
| Lucas Spencer | 7 | ? | ? | ? |

HubSpot native: Contact report grouped by `showrev_assigned_ae`, count by lifecycle stage or engagement status.

### Report 3: Signal Strength vs. Engagement (table)

Shows whether our research-based signal predictions correlate with actual engagement.

| Signal | Contacts | Opened | Replied | Reply Rate |
|--------|----------|--------|---------|------------|
| GREEN (Strong) | ? | ? | ? | ? |
| YELLOW (Good) | ? | ? | ? | ? |
| ORANGE (Possible) | ? | ? | ? | ? |
| RED (Weak) | ? | ? | ? | ? |

HubSpot native: Contact report grouped by `showrev_signal_strength`, with engagement metrics.

### Report 4: Contact Activity Timeline (list)

Recent activity feed — most recent opens, clicks, replies. Chris and Sean can see which prospects are engaging NOW.

HubSpot native: Activity feed report filtered by `showrev_outreach_cohort = fc2026-booth`.

### Report 5: Deal Pipeline (if any deals created)

Deals associated with FC2026 contacts, by stage. Only relevant once AEs convert replies to deals.

HubSpot native: Deal report filtered by associated contact `showrev_outreach_cohort = fc2026-booth`.

### Report 6: Bounce/Unsubscribe Tracking

| Metric | Count |
|--------|-------|
| Bounced | ? |
| Unsubscribed | ? |
| Invalid email | ? |

HubSpot native: Contact report where email status = bounced, filtered by cohort.

### Build steps (manual in HubSpot UI)

1. Create dashboard "FC2026 Post-Show — ShowRev"
2. Add 6 reports using HubSpot Report Builder
3. Filter all reports by `showrev_outreach_cohort = fc2026-booth`
4. Share dashboard with Chris and Sean (their HubSpot user accounts)
5. Set dashboard as default view for the FC2026 team

**Time estimate:** 30-45 min in HubSpot UI. No code.

---

## Surface 2: ShowRev Portal — Post-Show Report Page

**Route:** `/ops/report` (new page, or extend `/ops/intelligence`)

This page shows what HubSpot can't: the intelligence depth, influence pattern performance, microsite analytics, and the executive summary Sean needs.

### Section A: Executive Summary (for Sean)

One-paragraph narrative auto-generated from data:

> ShowRev researched 45 companies attending Fiber Connect 2026, producing custom intelligence briefs and personalized outreach for each. Of 45 contacts reached, [X] opened (Y%), [Z] replied (W%), and [N] meetings were booked. Microsite pages received [V] views. The average research depth was [D] sources per contact across [E] Brain entities.

Data sources: sr_prospects (count), sr_outcomes (engagement), sr_microsite_events (views), entity-graph.jsonl (Brain entities).

### Section B: Research Depth (for Chris)

Already exists at `/ops/intelligence`. Key metrics:

| Metric | Value | Source |
|--------|-------|--------|
| Companies researched | COUNT(DISTINCT company) from sr_prospects | Supabase |
| Contacts profiled | COUNT from sr_prospects WHERE send_status = 'send' | Supabase |
| Brain entities | line count from entity-graph.jsonl | Filesystem |
| Sources cited | COUNT from brain-context-digest sources | Filesystem |
| Research queries | COUNT from engine run logs | Filesystem |
| BEAD programs mapped | COUNT DISTINCT state from BEAD data | Supabase |
| Verified claims | COUNT from cross-model judge results | Supabase/filesystem |

### Section C: Engagement Dashboard (mirrors HubSpot + adds our data)

| Metric | Value | Source |
|--------|-------|--------|
| Sent | sr_prospects WHERE send_status = 'send' | Supabase |
| Opened | sr_outcomes WHERE event_type = 'opened' | Supabase |
| Clicked | sr_outcomes WHERE event_type = 'clicked' | Supabase |
| Replied | sr_outcomes WHERE event_type = 'replied' | Supabase |
| Bounced | sr_outcomes WHERE event_type = 'bounced' | Supabase |
| Meetings | sr_outcomes WHERE event_type = 'meeting_booked' | Supabase |
| Microsite views | sr_microsite_events WHERE event_type = 'page_view' | Supabase |
| Unique microsite visitors | COUNT DISTINCT prospect_id from above | Supabase |

### Section D: Influence Pattern Performance (for the learning loop)

Shows which composition patterns drove engagement. Requires V2 Watcher (per-touch event tracking) to be fully accurate. V1 approximation: join sr_outcomes with sr_engine_output on prospect_id to get the influence_pattern used.

| Pattern | Contacts | Opens | Replies | Reply Rate |
|---------|----------|-------|---------|------------|
| challenger_insight | ? | ? | ? | ? |
| commitment_consistency | ? | ? | ? | ? |
| curiosity_gap | ? | ? | ? | ? |
| loss_aversion | ? | ? | ? | ? |
| social_proof | ? | ? | ? | ? |

### Section E: Per-AE Breakdown

Same as HubSpot Report 2 but with microsite data added.

### Build approach

Option A: New Next.js page at `/ops/report` — server-side queries Supabase, renders charts.
Option B: Extend existing `/ops/intelligence` page with engagement tabs.
Option C: Static export (PDF/slide deck) generated from data.

**Recommendation:** Option A. Dedicated report page, clean URL to share with Chris. Server component reads sr_outcomes + sr_prospects + sr_microsite_events. No auth needed (URL obscurity, same as /ops). Can be built in one session.

---

## Data flow: what needs to happen before the report is useful

| Step | Status | Needed for |
|------|--------|------------|
| Contacts loaded to HubSpot | DONE (45 contacts) | All reports |
| Sequences sent | DONE (45 emails, 3 AEs) | Engagement metrics |
| Watcher V1 (poll HubSpot → sr_outcomes) | DONE | Sections C, D, E |
| HubSpot Dashboard created (6 reports) | TODO | Surface 1 |
| Portal report page built | TODO | Surface 2 |
| Watcher V2 (per-touch events) | TODO | Accurate pattern breakdown |

---

## Open questions

1. **Frequency:** How often does the report update? Real-time (page load queries live data) or daily snapshot?
   Recommendation: Real-time for portal. HubSpot dashboard is always live.

2. **Access:** Does Chris get a direct link to the portal report page, or does Justyn share screenshots?
   Recommendation: Direct link. Same URL obscurity model as /ops.

3. **Deliverable format:** Does Sean want a slide deck / PDF in addition to the live dashboard?
   Recommendation: Build live first. Can screenshot/export later if needed.

4. **Marketing Hub tier:** Knowing if it's Starter/Pro/Enterprise affects available report builder features. Confirm with Inorsa.

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-02 17:50 | Claude | Initial spec. Two surfaces (HubSpot dashboard + portal page), 6 HS reports, 5 portal sections, data flow dependencies. |
