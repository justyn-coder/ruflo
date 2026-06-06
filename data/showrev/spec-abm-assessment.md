---
title: ABM Concept 1 — Fiber Drawing Workflow Assessment
status: BUILD
last_updated: 2026-06-04
version: v1
---

# Fiber Drawing Workflow Assessment

## The experience

Prospect clicks the P.S. link in their email. Instead of a static brief about Inorsa, they land on a 60-second self-assessment. Four questions. Each takes 5 seconds. At the end: a personalized scorecard comparing them to 300+ firms in the industry, with one specific insight about their situation.

They leave knowing something about their own business they didn't know before. Whether they book a demo or not.

## The four questions

### Q1: "How do your construction drawings go from GIS design to CAD?"
- A: Manual export + manual drafting
- B: Some steps automated, some manual
- C: Mostly automated with manual finishing only

*Maps to: automation readiness (Nick's key variable)*

### Q2: "How many different jurisdictions do you regularly submit to?"
- A: 1-3
- B: 4-10
- C: 11+

*Maps to: standardization complexity (JTBD 4)*

### Q3: "What's your typical turnaround from GIS design to submitted drawing package?"
- A: Under a day
- B: 1-5 days
- C: More than a week

*Maps to: speed opportunity (JTBD 1, 5, 6)*

### Q4: "What happens when a permit package comes back?"
- A: Rare — we catch most issues before submission
- B: Happens regularly — adds a few weeks
- C: Major pain — cascades across projects

*Maps to: kickback impact (JTBD 1 — reframed as time, not validation)*

## Scoring

Each answer: A=1, B=2, C=3 (higher = more pain = more opportunity)

| Total | Profile | Insight |
|-------|---------|---------|
| 4-6 | "Ahead of the curve" | "You're faster than 70% of firms your size. The opportunity isn't fixing what's broken — it's scaling what works. At your pace, adding capacity without headcount is the multiplier." |
| 7-9 | "Typical for the industry" | "Most firms at your scale are in this range. The 40-50% first-pass rejection rate industry-wide means teams spend more time on rework than production. Faster drawing production doesn't just save time — it creates time for QC that prevents the rework." |
| 10-12 | "Significant time being left on the table" | "Your workflow has the most room to gain. Firms in your position have compressed drawing production from weeks to minutes by automating the GIS-to-CAD step — freeing their team for the engineering judgment and QC that actually requires human expertise." |

## Personalized output (the scorecard)

After the 4 questions, the page reveals:

```
YOUR WORKFLOW SCORECARD
━━━━━━━━━━━━━━━━━━━━━━

Score: [X] / 12

You vs. industry:
[visual bar showing where they sit]
◄ Ahead ────────── Typical ────────── Behind ►
            ▲ You        ▲ Industry avg (7.2)

WHAT THIS MEANS

[Insight paragraph from table above, personalized to their score]

YOUR BIGGEST OPPORTUNITY
[Based on which question they scored highest on — that's their #1 pain]

Q1 highest → "Your GIS-to-CAD conversion is the bottleneck. Firms automating this step see ~10 min turnaround vs. hours."
Q2 highest → "Multi-jurisdiction standardization is where time compounds. Each jurisdiction means a different format from the same data."
Q3 highest → "Your turnaround time is where revenue hides. Every day a drawing sits in production is a day construction can't start."
Q4 highest → "Permit returns are costing you months, not weeks. With 40-50% rejected on first pass industry-wide, faster production = more time for QC = fewer returns."

WHAT FIRMS LIKE YOURS ARE DOING
[1-2 substrate-sourced quotes from podcast guests in similar roles/scale]

━━━━━━━━━━━━━━━━━━━━━━

See what automation looks like for your specific workflow →
[Book a 30-minute walkthrough — no commitment]

[AE name + photo + booking link]
```

## How it connects to the email

### Email (T1):
Short. Challenger insight. Diagnostic question. P.S. links to the assessment.

"P.S. We built a 60-second workflow assessment for fiber engineering teams. See where you sit: [link]"

### Email (T2):
References the assessment (whether they took it or not).

"P.S. [If clicked but didn't book]: Your workflow scored [X] — the opportunity is in [biggest pain area]. Worth 30 minutes to see what that looks like?"
"P.S. [If didn't click]: 60 seconds — see how your drawing workflow compares to 300+ firms: [link]"

### Email (T3):
Binary close. Short.

"Worth seeing what [their biggest opportunity from Q assessment] looks like automated, or not the right time?"

## Data sources feeding the scorecard

| Element | Source | Dynamic? |
|---------|--------|----------|
| Industry average score (7.2) | Calculated from substrate analysis + 71 researched firms | Static initially, updates as P2 data comes in |
| "Firms like yours" quotes | Substrate semantic search by JTBD + persona | Yes — per prospect |
| Benchmark percentiles | Persona profiles from substrate (role × scale) | Yes — by segment |
| AE name + booking link | sr_prospects.assigned_ae → HubSpot Meetings | Yes — per prospect |
| Prospect name + company | sr_prospects | Yes |

## Tracking

| Event | What we learn |
|-------|-------------|
| Page view | They clicked the email link |
| Assessment started (Q1 answered) | They engaged beyond just viewing |
| Assessment completed (all 4 answered) | Full engagement — high intent signal |
| Specific answers | Their automation readiness, pain profile |
| Booking CTA clicked | Demo conversion |
| Time on results page | How much they studied the scorecard |

Store all events in sr_microsite_events with metadata containing answers.

## What makes this different from generic

1. **They answer questions** — creates psychological investment
2. **They see themselves in the data** — not Inorsa's marketing, their own situation
3. **The insights are substrate-sourced** — real quotes from real leaders, not AI-generated platitudes
4. **The output is useful without Inorsa** — they can screenshot the scorecard and share it internally
5. **The answers inform the AE** — before the demo call, the AE knows their automation readiness, jurisdiction count, turnaround time, and kickback frequency
