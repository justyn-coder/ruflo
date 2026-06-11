---
title: Cold Email Best Practices for Inorsa Pilot
status: SKELETON — research in progress
last_updated: 2026-06-11 19:30 EDT
version: v0.1
philosophy: STARTING POINT, NOT ENDPOINT — see Operating Philosophy below
audience: Operator + future Claude sessions + AEs preparing campaigns
---

# Cold Email Best Practices for Inorsa Pilot

## Operating Philosophy (load-bearing — read first)

**Best practices ≠ winning practices. They are the floor, not the ceiling.**

Operator's framing (2026-06-11):

> "Best practices are a good place to start because probably only 10% of the marketing population is using those best practices. But at the same time, that's enough to flood the market. So when best practices say send Tuesday between 10 and 12, that means everybody sends Tuesday between 10 and 12. So while we... it's a place for us to start. Eventually, the goal is for us to create our own best practices, things that are proprietary and work for us. So we're always to be testing and pushing the envelope forward, trying to find new ways to win against the rest of the noise in the market."

What this means architecturally:

1. **Section 1 (Starting Points)** = industry best practices, treated as a baseline. Used because they're statistically defensible, not because they're winning.
2. **Section 2 (Proprietary Findings)** = empty at v0.1, fills over time as our test-and-learn data accumulates. This is the goal state.
3. **Section 3 (Test-and-Learn Metadata)** = what we capture per send so the pattern recognition can happen. Without this metadata, we can never graduate from Section 1 to Section 2.

**Reading this doc = following Section 1 today. Building Section 2 = the real work over the next 6-12 months.**

---

## Inorsa Pilot — Cold-Specific Context

| Factor | Value |
|---|---|
| Send platform | HubSpot Sales Hub Professional (sequences) |
| Volume | ~90 contacts across 3 AEs (30 each) for P2 cold |
| AE senders | Mike Rutski (East), Nathan Dunn (Central), Lucas Spencer (West/spread) |
| P1 history | P1 was WARMER sends (booth-meeting follow-ups). P2 is true cold prospecting — no prior touch. |
| Target persona | Fiber telecom operators, utility cooperatives, engineering firms in US |
| Compliance | Unsubscribe injected by HS at sequence level (CAN-SPAM compliant) |

---

## Section 1: Starting Points (industry best practices, verified 2026-06-11)

### 1.1 Send Timing

**STATUS:** Research in progress (fork dispatched 2026-06-11). Will populate from external research.

**Expected output:**
- Standard windows (so we can AVOID them — they're crowded)
- Contrarian alternatives worth A/B testing
- Geographic considerations per AE territory

### 1.2 Anti-Spam Content Rules

**STATUS:** Research in progress (fork dispatched 2026-06-11). Will populate.

**Expected output:**
- Must-have technical setup (SPF/DKIM/DMARC verification for inorsa.com)
- 2026-current content patterns to avoid (NOT legacy 2018 keyword lists)
- Patterns that help deliverability
- HubSpot-specific mechanisms to leverage
- Gmail's <0.3% complaint rate requirement

### 1.3 Subject Line & Body Composition

**Already captured in code + composer rules:**

- ✅ Word count: target 60-70w body + P.S., hard ceiling 100w (canon in `feedback_word_count_flex_rule.md`)
- ✅ Banned phrases enforced by composer (`specific-composer.ts` Tier 1 mechanical check): no "quick question", "hope this finds you well", "leverage/synergize/solutions", em-dash overuse
- ✅ Salutation: `[FirstName],` only (NO "Hey", "Hi", "Hello", "Dear", "Greetings")
- ✅ Signature: `Mike Rutski | Inorsa | mike@inorsa.com` (one-line pipe-separated, per AE config in `ae-config.ts`)
- ✅ Pitch verbatim: "We turn design data into permit-ready construction drawings. Quality control is built in, so builds keep moving."

### 1.4 Throttling & Volume (Chris's notes — sourced from `docs/showrev/hubspot-loader-spec.md`)

> "Domain warming is a concern. Inorsa doesn't normally do cold prospecting. Chris said HubSpot throttling was 'more severe than expected'. Recommended: send no more than 20-30 emails per day initially. Batch by AE territory: Mike's contacts one day, Nathan's the next, Lucas's the third. Monitor bounce rate after each batch. If bounce > 5%, HALT."

**Translated into our spec v6:**
- Send-cap default: 30/AE/day BLOCKING (per Q10 binding 500/day cap, but Chris's 30 is conservative for cold)
- Pacing: 8-10/AE/day with random spacing recommended (Breeze Q8)
- Bounce halt: 5% hard bounce rolling 20-40 send window (Component 4 in spec v6)
- Stagger by AE territory: Mike day 1, Nathan day 2, Lucas day 3 (Chris's recommendation)

### 1.5 HubSpot Sequence Hygiene (sourced from `HUBSPOT-INTEGRATION-RESEARCH.md`)

- ✅ Unsubscribe enabled at sequence level (Q5 + operator 2026-06-11)
- ✅ Inbox connection verified before enrollment (Q16)
- ✅ First step fires ASAP, subsequent steps follow sequence timing (Q8)
- ✅ Bounce events polled via watcher with `hs_email_hard_bounce_reason` classification (Q5)
- ✅ "Unknown user" / "Mailbox full" bounces → immediate halt for that sender (Q5)
- ✅ Sequence `updatedAt` checked before enrollment batch (Q3)

### 1.6 Domain & Sender Reputation

**STATUS:** Gap — Chris notes mention domain warming concern but no specific protocol.

**To research:**
- Does inorsa.com have warming history? (Existing AE emails @inorsa.com — are they warmed?)
- SPF/DKIM/DMARC current state for inorsa.com
- Reply-to address consistency
- Inbox provider (Google Workspace? Microsoft 365?) — affects best practices

### 1.7 Unsubscribe & CAN-SPAM Compliance

- ✅ Unsubscribe link injected by HS below signature when sequence-level toggle is on (operator-managed)
- ✅ Physical mailing address must appear in email (CAN-SPAM requirement) — HS includes this in default sequence footer
- ✅ Clear sender identification (real person, real company) — handled by AE signature
- ✅ Honest subject lines (no deception) — composer banned phrases enforce this

---

## Section 2: Proprietary Findings (TO FILL via test-and-learn)

**THIS IS THE GOAL STATE. Empty at v0.1.**

As we run P2 sends + observe results, this section captures rules that:
- Diverge from Section 1 industry advice
- Are statistically defensible from OUR data (not generic blog claims)
- Win against the flooded mainstream tactics

Examples of what BELONGS here (placeholders):
- *"P.S. line with verified stat outperforms diagnostic question by N% across our cohort"*
- *"Wednesday afternoon Eastern outperforms Tuesday morning for fiber operators by N%"*
- *"AE-name signature beats company-brand for our specific persona"*
- *etc.*

**Gate to add a rule here:** statistically defensible from ≥ 30 sends in our own data + specific to our niche.

---

## Section 3: Test-and-Learn Metadata (what we capture per send)

For Section 2 to ever fill, we need to log this PER SEND:

### Per-send metadata (capture in `sr_bounce_events` + `sr_outcomes`)

- Subject line (full text)
- Body word count
- P.S. variant used (`quiet_diagnostic` / `industry_data_hook` / `loss_frame_anchor`)
- Substrate use score (how many directly-citable claims used)
- Persona bucket (`ops_builder` / `revenue_leader` / etc.)
- AE sender + AE seat tier
- Send timestamp (day of week + hour + minute, all in US/Eastern)
- Microsite link variant (assess vs brief)
- Composer model (Sonnet vs Opus, version)
- Send Confidence score (composite + per-axis at send time)

### Per-prospect outcome (capture as events fire)

- Delivered / Hard-bounce / Soft-bounce / Spam-flag (per Q5 classification)
- Time-to-open (if open event fires — Q4: eventually consistent)
- Time-to-click (link-specific: which CTA was clicked)
- Time-to-reply
- Reply sentiment (manual classification by AE? automated?)
- Meeting booked / closed-won (if any) — long-tail outcome

### Aggregate analysis (manual or future Brain re-activation)

After 30+ sends per persona/AE/time-bucket, the analysis should answer:

- Which subject line patterns get the highest reply rate?
- Which P.S. variant performs best by persona?
- Which time-of-day works best for our prospects (vs industry "Tuesday 10am" baseline)?
- Which AE has the best send time per their territory's time zone?
- What body length range performs best?
- Are 60-70w bodies actually winning vs 80-90w bodies, or is the ceiling wrong?

---

## Operator Action Items

### Before first send (gating)

- ☐ Verify inorsa.com SPF / DKIM / DMARC posture (use mxtoolbox.com or similar)
- ☐ Confirm each AE's inbox is connected to HS (Q16: required for sequence sends to fire)
- ☐ Confirm 3 sequences have Unsubscribe enabled
- ☐ Decide AE territory stagger: Mike Day 1, Nathan Day 2, Lucas Day 3 (Chris's recommendation)
- ☐ Set Component 6 send-cap default to 30/AE/day (conservative cold start)

### Ongoing (every batch)

- ☐ Watch bounce rate via Component 4 — pause if > 5% rolling 20-40 send window
- ☐ Check Postmaster Tools (postmaster.google.com) weekly for inorsa.com reputation
- ☐ Review reply rate per AE / per persona — feed into Section 2 once statistically defensible

### Quarterly (Section 2 builds)

- ☐ Run analysis on 90+ sends of accumulated data
- ☐ Identify ≥3 statistically defensible patterns that diverge from Section 1
- ☐ Add to Section 2 with the data backing
- ☐ Update composer / send-timing logic to reflect the new winning patterns

---

## Pending Research (forks dispatched 2026-06-11)

1. **Cold email send-timing 2026** — standard windows + contrarian alternatives + geographic split
2. **Anti-spam content rules 2026** — 2026-current rules, not legacy 2018 keyword lists
3. **Contrarian / proprietary opportunities** — what top performers do that industry advice misses

Results will land within the next 5-10 min and populate Sections 1.1, 1.2, and seed Section 2 with starting hypotheses.

---

## Version history

| Version | Date (EST) | Change |
|---|---|---|
| v0.1 | 2026-06-11 19:30 | Initial skeleton. Operator philosophy front-and-center. Section 1 partially populated from existing canon (composer rules, Chris's throttling notes, Q1-Q16 Breeze answers). Section 2 empty (goal state). Section 3 (test-and-learn metadata) specced. 3 research forks dispatched for sections 1.1/1.2 + Section 2 seed hypotheses. |
