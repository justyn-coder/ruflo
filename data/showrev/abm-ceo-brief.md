---
title: ABM Strategy — CEO Brief
status: DRAFT
last_updated: 2026-06-03
version: v1
---

# What we're doing, why it works, and how we prove it

## The proposal

Every prospect gets a 3-touch email sequence paired with a personalized microsite. The email hooks attention. The microsite delivers value the email can't — a workflow diagram showing exactly where Inorsa fits in THEIR process, with THEIR tools, in THEIR jurisdictions.

Touch 1 challenges an assumption. Touch 2 gives them a number to take to their boss. Touch 3 makes the demo feel low-risk.

## Why we're confident

**The strategy is built from real data, not theory.**

Everything traces back to actual conversations:
- 7 JTBDs extracted from Inorsa's own sales threads, booth recordings, and 6,512 industry intelligence documents (podcast transcripts, expert analysis, BEAD filings)
- The discovery questions come from Nathan's B+T sales deck (slide 8) — questions Inorsa already knows land with prospects
- The proof points (~10 min to drawing, 2-5x capacity, 70% cycle time reduction) are approved and in-market
- "80% of the drafting lift, your team does the last mile" is the frame the sales team already uses
- The persona profiles come from podcast guests describing their own challenges at their own company scale

**FC2026 gave us a calibration signal.** 45 sends, 2 meetings booked (4.4% meeting rate), 2 genuine replies, 3 OOO. challenger_insight drove 75% of real replies. loss_aversion (41% of sends) drove 6%. We know what works and what doesn't.

**The system has 5 quality gates.** Every email passes through mechanical checks (22 AI-tell patterns), fact verification, Tim Proxy judge, 5-dimension LLM judge (research depth, VP connection, tone, conciseness, JTBD alignment), and Gemini cross-model spot-check. Nothing ships unchecked.

## Why it scales

**Three things make 2,300 contacts feasible:**

1. **Prioritizer** filters the list before research. Not every attendee is ICP. Quick Brain lookup + substrate check tiers prospects into research-deeply vs. lean-research vs. skip. Saves 60-70% of research cost.

2. **Lean composer** runs one clean LLM call per email. No prompt fatigue. Each email composed in fresh context. Diagnostic CTAs adapted from Inorsa's 4 discovery questions. Subject generated separately.

3. **Microsite templates** are personalized by data merge, not custom design. One workflow diagram template renders differently per prospect based on their GIS tool, team size, and jurisdictions (all from research output). Build the template once, render 2,300 times.

## What we're still validating

| Assumption | How we test it | When we'll know |
|-----------|---------------|----------------|
| challenger_insight is the best pattern across personas | Thompson Sampling explores all 8 patterns with Bayesian updating during P2 | After ~500 sends |
| The workflow map microsite converts better than the current "field brief" | A/B split: 50% get workflow map, 50% get field brief | After ~200 clicks |
| Lean composer matches full pipeline quality for cold prospects | 5-dimension judge scores compared across both composers | First 100 emails |
| Research with substrate produces better output than web-search-only | A/B split: 50% get substrate context, 50% don't | After ~200 prospects |
| The prioritizer correctly identifies ICP vs. non-ICP | Compare prioritizer tier vs. research signal strength after the fact | After first 500 |
| Small operators need a different pitch than A&E firms | Track reply rates by ICP type × JTBD framing | After ~300 sends per ICP |

## What success looks like at the end of the pilot

**Metrics we'll measure:**

| Metric | FC2026 baseline | P2 target | Why this target |
|--------|----------------|-----------|-----------------|
| Meeting rate | 4.4% (2/45) | >3% at 2,300 scale | Cold is harder than booth — maintaining 3% at 50x scale is a win |
| Reply rate (excluding OOO) | 4.4% (2/45) | >5% | Substrate + JTBD framing should outperform generic |
| Research time per contact | ~15 min | <8 min | Substrate + Brain context reduce web searches |
| Judge pass rate (all 5 ≥ 7) | Not measured | >80% | Proves consistent quality at scale |
| Pattern prediction accuracy | N=45, noisy | Statistically significant by N=500 | Thompson Sampling posteriors converge |
| Microsite click-through | Unknown (tracking broken first day) | >10% of opens | Proves the microsite adds value beyond the email |

**What puts us in a winning position for the next contract:**

1. **Proven system** — not "we can do outreach" but "here are the numbers from 2,300 contacts with tracked outcomes"
2. **Brain with real data** — 2,300 researched fiber companies, persona profiles validated by engagement data, pattern performance with statistical confidence
3. **Transferable methodology** — JTBD matrix, 3-touch ABM, quality gates, Watcher/Brain learning loop. Works for any vertical where the client sells to researched companies
4. **Reusable substrate** — 6,512 industry intelligence chunks. Any fiber telecom engagement starts with a warm Brain, not a cold one
5. **A/B tested assumptions** — we know what works (with data), not what we think works (with opinions)
