---
title: Composer + Send-Strategy Backlog
status: BACKLOG
last_updated: 2026-06-11 20:20 EDT
version: v1
purpose: Track composer enhancements + send-strategy A/B tests surfaced by COLD-EMAIL-BEST-PRACTICES research. Test in dev env first, ship only after data justifies.
pairs_with: docs/showrev/COLD-EMAIL-BEST-PRACTICES.md
---

# Composer + Send-Strategy Backlog

**Architectural note:** This backlog is INTENTIONALLY separate from POST-PORTAL-SPEC-V6.md. Post-portal pipeline = load prospects → AE enrolls → watcher tracks. This doc = HOW we compose emails + WHEN we send them. Different concerns, different release cycles.

**Test-and-learn philosophy:** every item here is HYPOTHETICAL until data justifies it. We don't ship composer changes based on industry blog claims. We test in dev env, run A/B in pilot batches, measure against `sr_email_experiments` outcomes, then promote winners to production composer logic.

---

## Composer enhancements (TypeScript code changes — defer until prioritized)

### CB-1: Burstiness Tier-1 mechanical check

**Source:** [Stanford Liang et al. 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10382961/), [Pangram Labs](https://www.pangram.com/blog/why-perplexity-and-burstiness-fail-to-detect-ai), [ProofreaderPro 2026](https://proofreaderpro.ai/blog/what-is-burstiness-ai-writing)

**Theory:** AI text scores low burstiness (uniform sentence length). Humans cluster short punchy sentences with long winding ones. Target: 0.65-0.85 (human range). Reject below 0.55 (AI-typical).

**Implementation:**
```ts
// src/showrev/m1-email-find/evidence-tiering/burstiness-check.ts (new)
function burstiness(text: string): number {
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const lengths = sentences.map(s => s.split(/\s+/).length);
  const mean = lengths.reduce((a,b) => a+b, 0) / lengths.length;
  const variance = lengths.reduce((sum, len) => sum + (len - mean) ** 2, 0) / lengths.length;
  return Math.sqrt(variance) / mean;
}

// Add to specific-composer.ts mechanical checks before judge tier
const score = burstiness(cleanBody);
if (score < 0.55) {
  return { mechanical_check_failures: [`burstiness ${score.toFixed(2)} < 0.55 (AI-typical pattern)`] };
}
```

**Dev test plan:**
1. Score 50 existing cohort bodies → see distribution histogram
2. Score Tim-edited versions → see if his edits push toward 0.65+
3. Set threshold based on actual data (may be 0.50, may be 0.60 — depends on our composer's current distribution)
4. Run on next composer rerun → measure regenerate rate
5. If regenerate rate < 20% → ship to production composer
6. If > 20% → tune composer prompt to encourage burstiness first

**Effort:** ~30 LOC for check + ~1 hr for dev test against existing data.

---

### CB-2: Banned phrase additions

**Source:** Lavender 2025-2026 banned-phrase tracker + 2026 Reddit r/sales threads + the contrarian research fork 2026-06-11

**Add to existing banned-phrase list in specific-composer.ts:**

- "Looking forward to hearing your thoughts" — top 5 AI-fatigue trigger
- "I would" (not "I'd") — perfect grammar signal
- "I will" (not "I'll") — same
- "Do not" (not "don't") — same
- "Cannot" (not "can't") — same
- "I am writing to" — instant cold-template tell
- "Reaching out about" — generic opener pattern

**Dev test plan:**
1. Add to banned list with `cleanup` flag (rejects body if found)
2. Rerun composer on 10 prospects
3. Verify the new bans don't trip the composer's contraction-aware mode (composer already tries to use contractions — bans just enforce it)
4. If composer can't satisfy all bans → adjust prompt to emphasize contractions

**Effort:** ~10 LOC + dev test.

---

### CB-3: Sentence-fragment-as-emphasis pattern

**Source:** Stanford burstiness research — LMs avoid sentence fragments, humans use them for emphasis.

**Hypothesis:** Composer should occasionally emit a 1-3 word sentence fragment per email (1 in 3 emails).

**Example human pattern:**
> "Three counties. 30,000 homes passing. Drawing throughput is the constraint."

**Test approach:** Add to composer prompt as a soft instruction: *"Occasionally use a 1-3 word sentence fragment for emphasis, in the style of human writers."* Measure fragment frequency in output. If composer ignores → add as Tier-1 check (must have ≥ 1 fragment per 3 bodies).

**Effort:** ~5 LOC prompt change + ~1 hr to measure compliance.

---

## Send-strategy A/B tests (operator-runnable — not composer code)

These get tested by configuring HubSpot sequence settings + tracking in `sr_email_experiments`. No composer changes needed.

### SS-1: Sunday 6-8pm to ops roles vs Tuesday 10am control (H1)

**Theory:** [Apollo June 2026 benchmark](https://www.apollo.io/blog/cold-email-benchmarks-2026): 89% inbox delivery Sunday evening vs 71% Tuesday for ops persona. [Florin Tatulea Q1 2026 data](https://www.linkedin.com/in/florintatulea/): 3.4x reply rate Sunday evenings for telecom ops.

**Test design:**
- Group A: 30 prospects enrolled for Sunday 6-8pm RECIPIENT local time
- Group B: 30 prospects enrolled for Tuesday 10am RECIPIENT local time
- Metric: reply rate at 7 days, meeting rate at 21 days
- Stratify by AE so all 3 AEs send to both groups

**Operator setup:**
- Clone existing AE sequence → "FC2026 — {AE} T1 — Sunday Test"
- Configure send schedule: Sunday 18:00-20:00 in contact's time zone
- Use sr_email_experiments `sent_at_timestamp` + `day_of_week_utc` columns to track

### SS-2: Single-touch vs multi-touch (H2)

**Theory:** [Lavender 2025 State of Cold Email](https://www.lavender.ai/state-of-cold-email-2025): second touch dropped reply rate 3.1% → 0.4% for highly-personalized cold. "Earn the second email via reply, not via cadence."

**Test design:**
- Group A: 30 prospects single-touch sequence (1 email, no follow-up)
- Group B: 30 prospects one 5-day follow-up sequence (2 emails)
- Group C: 30 prospects standard 3-touch sequence (3 emails, current pattern)

**Operator setup:** create 3 sequence variants per AE. Track in `sr_email_experiments.step_n`.

### SS-3: Friday 2-4pm vs Tuesday 10am (H4)

**Theory:** Every guide says Friday dead. Hypothesis: empty inbox + reflective mood = higher quality replies.

**Test design:** 50 prospects Friday 2-4pm vs 50 prospects Tuesday 10am control. **Measure meeting CONVERSION not raw reply rate** (Friday may have lower volume but higher quality).

### SS-4: AE-name vs brand-first signature

**Theory:** Stronger AE identity vs brand-forward identity — which wins for trust-building cold outreach.

**Test design:**
- Group A: `Mike Rutski | Inorsa | mike@inorsa.com` (current pattern)
- Group B: `Inorsa | Mike Rutski | mike@inorsa.com` (brand-first)
- Tracked via `sr_email_experiments.signature_format` column.

### SS-5: HubSpot tracking pixel ON vs OFF on cold first-touch

**Theory:** Tracking pixel = `track.hubspot.com` recognized by filters → deliverability hit. Q4 already confirmed opens unreliable, so pixel ON costs us deliverability without giving us useful open data.

**Test design:**
- Group A: pixel ON (current default)
- Group B: pixel OFF
- Metric: hard bounce rate, spam-complaint rate, reply rate
- All via Component 4 bounce monitor

**Operator setup:** in sequence step settings, toggle "Track email opens" OFF for Group B.

---

## Subject line + body structure A/B tests (composer + sequence variants)

### CB-4: Subject line pattern A/B

**Hypothesis (from contrarian fork 2026-06-11):** subject_pattern correlates with reply rate. Test 4 variants.

**Patterns:**
- `question` — "BEAD drawings keeping pace, Chad?" (current default)
- `statement` — "Empower Broadband's BEAD throughput"
- `specific_fact` — "Empower Broadband + 30,000 homes" (uses substrate stat verbatim)
- `curious` — "drawings backlog?" (incomplete, prompts open)

**Test design:** Composer variant selector picks one of 4 patterns per prospect (round-robin or random). Track in `sr_email_experiments.subject_pattern`. After 90 sends, correlate with reply rate.

### CB-5: Body structure A/B — "two-question no CTA" vs standard (H3)

**Source:** [Sam Nelson Outreach March 2026](https://www.outreach.io/blog/sam-nelson-no-cta): omitting CTA + ending with second question increased reply rate 2.1x in internal A/B.

**Test design:**
- Group A: current "question → CTA → signature" template
- Group B: "two-question body, no CTA" template
- Composer variant generates B-style body when prospect is in group B
- Tracked via `sr_email_experiments.has_cta` + `has_question_count`

---

## Composer enhancement order (when prioritized)

1. **CB-2 (banned phrase additions)** — ~10 LOC, zero risk, immediate quality lift
2. **CB-1 (burstiness check)** — ~30 LOC, needs dev test against existing data first
3. **CB-3 (sentence fragments)** — ~5 LOC prompt change, may not need code
4. **CB-4 (subject pattern A/B)** — needs sr_email_experiments + composer variant logic
5. **CB-5 (body structure A/B)** — same as CB-4
6. **CB-6 (any future patterns)** — TBD by data

## Send-strategy A/B priority order (when ready for first dev test)

1. **SS-5 (pixel ON/OFF)** — easiest to set up, biggest deliverability impact
2. **SS-2 (single vs multi-touch)** — simplest sequence variant, biggest hypothesis
3. **SS-1 (Sunday vs Tuesday)** — needs recipient-timezone HS config + sequence schedule
4. **SS-4 (signature variants)** — simple AE config change
5. **SS-3 (Friday vs Tuesday)** — same setup as SS-1

---

## Gate before any A/B promotes to production composer/sequence config

1. ≥ 30 sends per arm collected in sr_email_experiments
2. Reply or meeting rate difference passes p < 0.05
3. Effect specific to our niche (fiber telecom / utility co-ops / engineering firms)
4. Tim's craft-review verdict on the variant matches the data (composer A/B doesn't break voice quality)
5. Then move winner into production composer logic; archive losers in this doc as "tested, didn't beat baseline"

---

## Version history

| Version | Date (EST) | Change |
|---|---|---|
| v1 | 2026-06-11 20:20 | Initial backlog. 3 composer code changes (CB-1 burstiness, CB-2 banned phrases, CB-3 fragments) + 5 send-strategy A/B tests (SS-1 Sunday, SS-2 single-touch, SS-3 Friday, SS-4 signature, SS-5 pixel) + 2 composer A/B tests (CB-4 subject pattern, CB-5 body structure no-CTA). All sourced from cold-email-best-practices research dispatched 2026-06-11. Priority orders specified for both code changes and A/B tests. Gate criteria for promoting winners to production specified. |
