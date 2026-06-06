---
title: ABM Strategy — 3-Touch Microsite + Email System
status: DRAFT
last_updated: 2026-06-03 11:30 EST
version: v1
purpose: Scope, mockup, and judge-ready spec for the ABM microsite strategy across 3 touches. Each concept mocked for Troy Hoover (PCCI Group, 27 CAD drafters, AutoCAD + 3GIS).
---

# ABM Strategy — FC2026 → P2 Cold Prospecting

## Core principle

The email captures 10 seconds of attention. The microsite delivers value the email physically can't. Each touch is self-contained (assume they haven't seen the others) but progressive for those who see all three.

**The prospect should leave the microsite knowing something they didn't know before** — about their own business, not about Inorsa.

---

## Touch Strategy Overview

| Touch | Email goal | Microsite goal | CTA |
|-------|-----------|---------------|-----|
| **T1** | Challenge their assumption | Show them where they sit vs. peers | "Is this something you're running into?" |
| **T2** | Quantify the pain | Give them a number to take to their boss | "Here's what this costs you per quarter" |
| **T3** | Binary close | Make the demo feel low-risk and high-value | "See this on your own data — 30 min, no commitment" |

### Design assumption: most prospects see ONE touch

If they see T1 only, it must work alone. If they see T2 only, it must work alone. If they see all three, the progression builds a case. Repetition of core message across touches is intentional, not a bug.

---

## ABM Concept A: "Where Inorsa Fits" Workflow Map

### What it is
A visual showing the prospect's ACTUAL workflow with Inorsa's step highlighted. Not a generic product diagram — personalized to their tools, their team structure, their pain point.

### What it looks like for Troy Hoover (PCCI/ProDesign)

```
YOUR CURRENT WORKFLOW
━━━━━━━━━━━━━━━━━━━

  ┌─────────┐     ┌──────────┐     ┌──────────────┐     ┌───────────┐
  │  3GIS   │────▶│  Manual  │────▶│  27 drafters │────▶│  Submit   │
  │ (route  │     │  export  │     │  build each  │     │  to       │
  │  design)│     │  to CAD  │     │  drawing set │     │  county   │
  └─────────┘     └──────────┘     └──────────────┘     └───────────┘
                       ▲                                      │
                       │            REWORK LOOP               │
                       └──────────── kickback ────────────────┘
                                  (3-6 weeks)

WITH INORSA
━━━━━━━━━━━

  ┌─────────┐     ┌──────────────────────┐     ┌───────────┐     ┌───────────┐
  │  3GIS   │────▶│  INORSA Drawing Agent │────▶│  Your team│────▶│  Submit   │
  │ (route  │     │  ▸ generates CAD (~10m)│     │  finishes │     │  to       │
  │  design)│     │  ▸ jurisdiction format │     │  QC +     │     │  county   │
  └─────────┘     │  ▸ cross-references    │     │  stamps   │     └───────────┘
                  └──────────────────────┘     └───────────┘
                    FAST production              THOROUGH QC (you have time now)
```

### Personalization per prospect

| Element | Source | Personalized? |
|---------|--------|--------------|
| GIS tool name (3GIS, IQGeo, ArcGIS) | Research / known_tools field | Yes — from research |
| Team size ("27 drafters") | Research | Yes — if found |
| Jurisdictions ("Cobb County, Fulton County") | Research / geography | Yes — if found |
| Pain point ("permit returns back up the queue") | Challenger insight | Yes |
| What stays with their team | Always the same: "finish, judge, stamp" | No |

### What we need to build it

| Requirement | Who provides | Status |
|-------------|-------------|--------|
| Workflow diagram template (SVG/HTML) | Us — Claude Design + code | Build |
| Per-prospect data (tool, team size, jurisdictions) | Engine research output | Already captured in sr_engine_output |
| Dynamic rendering (swap values per prospect) | Our microsite route handler | Build — template + data merge |

### Complexity: MEDIUM (template + data merge, not custom design per prospect)

### Claude Design prompt (for the visual template):

**Goal:** Create a clean, professional workflow comparison diagram for a fiber engineering firm. Two rows: "Your Current Workflow" (top) and "With Inorsa" (bottom). The current workflow shows: GIS tool → manual CAD conversion (SLOW: hours/days) → rushed QC (because deadline) → submit to jurisdiction → 40-50% rejected on first pass → rework loop (3-6 weeks). The Inorsa workflow shows: GIS tool → Inorsa Drawing Agent (FAST: ~10 min) → team finishes + thorough QC (because they have TIME) → submit → higher first-pass rate. The key visual: time allocation shifts from "80% drafting, 20% QC" to "fast drafting, thorough QC." Do NOT show "validates inputs" or "flags conflicts" — Inorsa accelerates production, it does not do QC.

**Layout:** Horizontal flow, dark navy background (#0B1120), white/light text, purple accent for Inorsa elements (#C4B5FD). Clean sans-serif font (DM Sans). The "rework loop" in the current workflow should be visually prominent (red/orange arrow) to emphasize the pain.

**Audience:** A VP of Engineering at a fiber design firm. This will be embedded in a personalized web page (microsite). It needs to be immediately understandable without explanation.

**Content:** Use placeholder text like [GIS TOOL], [TEAM SIZE], [JURISDICTION] where personalization will be inserted. Show time comparison: "Current: [X] hours per drawing set → With Inorsa: ~10 min + your team's finishing work." Do NOT claim error reduction or validation — the value is SPEED creating TIME for QC.

---

## ABM Concept B: ROI Calculator

### What it is
An interactive tool: prospect enters their volume (linear feet/month or drawings/month) and the calculator shows cost savings, time savings, and capacity gain.

### What it looks like for Troy Hoover

```
┌────────────────────────────────────────────────┐
│  YOUR DRAWING ECONOMICS                         │
│                                                 │
│  How many linear feet per month?   [________]   │
│  Average drawings per project?     [________]   │
│  Typical permit turnaround (weeks)? [________]  │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  WITHOUT INORSA          WITH INORSA            │
│  ━━━━━━━━━━━━━━          ━━━━━━━━━━━━           │
│  Drafting time: hours/set Drafting time: ~10 min│
│  Time for QC: rushed      Time for QC: thorough │
│  Drawings/month: 40      Drawings/month: 100-200│
│  Capacity freed: 0%      Capacity freed: ~70%   │
│                                                 │
│  ANNUAL IMPACT                                  │
│  $XXX,XXX in recovered margin                   │
│                                                 │
│  [See this on your data → Book a demo]          │
└────────────────────────────────────────────────┘
```

### What we need to build it

| Requirement | Who provides | Status |
|-------------|-------------|--------|
| The math (hours saved per LF, reduction rates) | Inorsa / Chris approval | Need the approved stats |
| Industry baselines (avg permit return rates, drafting hours per LF) | Our substrate + research | Available from Dawson blog + Cartesian report |
| Interactive form (client-side JS) | Us | Build |
| Pre-filled values per prospect (from research) | Engine output | Partially available (team size, geography) |

### Complexity: MEDIUM-HIGH (needs approved math + interactive JS)

### Risk: If the math is wrong, credibility is destroyed. Need Chris to validate the calculation model.

---

## ABM Concept C: BEAD Timeline Pressure Tool

### What it is
A state-specific timeline showing BEAD construction deadlines vs. the prospect's likely drawing production capacity. Creates urgency by showing the gap.

### What it looks like for Troy Hoover (operates in multiple states)

```
┌────────────────────────────────────────────────┐
│  YOUR BEAD TIMELINE                             │
│  States where PCCI/ProDesign operates           │
│                                                 │
│  Georgia                                        │
│  ▰▰▰▰▰▰▰▰▰▰░░░░░░░░░░  Sub-grants: Jun 2026  │
│  Construction start: Q3 2026                    │
│  4-year completion deadline: Q3 2030            │
│                                                 │
│  Oklahoma                                       │
│  ▰▰▰▰▰▰▰▰▰▰▰▰▰░░░░░░░  Sub-grants: Apr 2026  │
│  Construction start: Q2 2026                    │
│  4-year completion deadline: Q2 2030            │
│                                                 │
│  AT CURRENT DRAWING PACE:                       │
│  ⚠ Gap: ~6 months of drawing backlog by Q1 2027│
│                                                 │
│  WITH INORSA (2-5x capacity):                   │
│  ✓ Drawing production stays ahead of schedule   │
│                                                 │
│  [See the math → Book a demo]                   │
└────────────────────────────────────────────────┘
```

### What we need to build it

| Requirement | Who provides | Status |
|-------------|-------------|--------|
| State BEAD timelines | NTIA dashboard (public) | Available — already in our substrate |
| Per-prospect state mapping | Research (which states they operate in) | In sr_engine_output |
| Drawing pace estimate | Industry baseline or prospect-specific | From substrate (Cartesian report) |
| Gap calculation | Us — timeline math | Build |

### Complexity: MEDIUM (data exists, just needs rendering)

### Best for: Operators and large A&E firms with BEAD exposure. Less relevant for small local firms.

---

## ABM Concept D: Workflow Diagnostic Benchmark

### What it is
A comparison showing where the prospect's workflow sits relative to peers. "You're manual. Here's what firms at your scale are doing." Uses our first-party data (71 researched companies) to build the benchmark.

### What it looks like for Troy Hoover

```
┌────────────────────────────────────────────────┐
│  HOW PCCI/PRODESIGN COMPARES                    │
│  Based on 71 fiber firms we've analyzed         │
│                                                 │
│  YOUR TEAM SIZE: 27 drafters                    │
│  Firms this size (20-50): 18 in our dataset     │
│                                                 │
│  GIS-to-CAD process:                            │
│  ▰ Manual (you)  ▰▰▰ Semi-automated  ░ Fully   │
│  [67% manual]    [28% some automation] [5%]     │
│                                                 │
│  Drawing production speed:                      │
│  Manual: hours to days per set                  │
│  With automation: ~10 min + finishing            │
│                                                 │
│  Staffing model:                                │
│  ▰ All in-house (you)  ▰▰ Hybrid  ░ Outsourced │
│  [45%]                 [35%]       [20%]        │
│                                                 │
│  INSIGHT: Firms at your scale with 2-5x more    │
│  volume are doing it with FEWER drafters by     │
│  automating the GIS-to-CAD step.                │
│                                                 │
│  [See how → Book a demo]                        │
└────────────────────────────────────────────────┘
```

### What we need to build it

| Requirement | Who provides | Status |
|-------------|-------------|--------|
| Peer benchmark data | Our 71 researched firms + substrate | Available (Brain data) |
| Per-prospect positioning in the benchmark | Research output (team size, tools, model) | In sr_engine_output |
| Benchmark visualization | Us | Build |

### Complexity: LOW-MEDIUM (data exists, simple comparison rendering)

### Risk: "Based on 71 firms" is honest but small. By P2 (after 2,300), this becomes "based on 500+ firms" which is much more credible. Consider launching this after P2 batch 1 for larger sample.

---

## 3-Touch Strategy (all concepts combined)

### T1: Challenge + Workflow Map

**Email:** Challenger insight + diagnostic question from slide 8.
**Microsite:** "Where Inorsa Fits" workflow map (Concept A) — personalized with their GIS tool, team size, jurisdictions. Shows the rework loop they're stuck in and where Inorsa eliminates it.
**Goal:** "I didn't know there was a tool that fits exactly here in my workflow."

### T2: Quantify + Benchmark

**Email:** Different angle (from T1), reference the microsite: "We compared your operation to 71 firms at similar scale."
**Microsite:** Either ROI Calculator (Concept B) OR Workflow Benchmark (Concept D), depending on signal strength.
- Strong/Good signal → ROI Calculator (they're ready for numbers)
- Possible/Weak signal → Benchmark (they need to see they're behind)
**Goal:** "I have a number I can take to my boss."

### T3: Urgency + Demo Path

**Email:** Binary close — short, direct. "Worth 30 minutes to see this on your own data, or not the right time?"
**Microsite:** BEAD Timeline (Concept C) if applicable, OR a refreshed version of the Workflow Map with emphasis on the engagement model (Introduction → Demo → Workshop → Proposal).
**Goal:** "Booking a demo feels low-risk."

### What repeats across touches

Every microsite includes:
- The "80% / 20%" framing (consistent positioning)
- "Where Inorsa doesn't play" (builds trust through honesty)
- The booking CTA (always available)
- AE headshot + contact (relationship anchor)
- Company logo (personalization signal)

### What changes across touches

| Element | T1 | T2 | T3 |
|---------|----|----|-----|
| Microsite primary asset | Workflow map | Calculator/benchmark | Timeline/demo path |
| Email CTA | Diagnostic question | "We did the math" | Binary close |
| Email length | 60-80 words | 50-70 words | 30-50 words |
| Influence pattern | challenger_insight or social_proof | loss_aversion or reframe_anchor | commitment_consistency |
| Tone | Peer who noticed something | Analyst with data | Direct, respectful close |

---

## Judge Rubric (per-concept scoring)

Score each concept 1-10 on these dimensions:

| Dimension | What it measures | Weight |
|-----------|-----------------|--------|
| **Prospect value** | Would Troy Hoover (27 drafters, AutoCAD+3GIS) find this genuinely useful? Not "nice" — useful enough to spend 60 seconds on? | 30% |
| **Differentiation** | Can the prospect get this insight/tool from Google, a competitor, or their own analysis? If yes, score low. | 20% |
| **Data feasibility** | Do we actually have the data to produce this for 2,300 prospects? Not for one — for all of them, at scale. | 20% |
| **Email-microsite synergy** | Does the microsite deliver something the email CAN'T? Or is it just the email on a nicer page? | 15% |
| **Demo conversion** | Does this make the prospect MORE likely to book a demo? Or is it informational dead-end? | 15% |

### Scoring guide
- 9-10: "I would bookmark this and share it with my team"
- 7-8: "Useful, I'd spend 60 seconds"
- 5-6: "Fine, but I've seen this before"
- 3-4: "Generic, doesn't tell me anything new"
- 1-2: "Waste of my time"

---

## Questions for Chris Balandran (ABM-specific)

1. Can Inorsa produce a SAMPLE drawing from a prospect's publicly available GIS data? (Even one page — "here's what your data looks like automated." This is the ultimate demo-conversion tool.)
2. What's the typical permit return rate Inorsa customers see? (Need a number for the ROI calculator and benchmark.)
3. The engagement model in the deck shows Introduction → Demo → Workshop → Proposal. Is this the standard path for all prospects, or does it vary by size/segment?

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-03 11:30 | Claude | Initial ABM strategy. 4 concepts scoped with mockups, 3-touch strategy, judge rubric. |
