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

### 1.1 Send Timing — RESEARCHED 2026-06-11

#### Standard "best practice" times (the crowded zone — AVOID)

- **Tuesday/Wednesday/Thursday, 10am local time** — universally recommended in every guide ([Smartlead 2026](https://www.smartlead.ai/blog/best-time-to-send-cold-emails), [Outbound System 2026](https://outboundsystem.com/blog/best-time-to-send-cold-emails))
- **8am local** also flooded ([Cience](https://www.cience.com/blog/best-time-to-send-cold-emails-and-get-replies/) cites "20% of all replies" → translation: 20% of all SENDS land there)
- **9–11am window** = inbox arms race

[GrowLeads 2026 analysis of 16.5M cold emails](https://growleads.io/blog/best-cold-email-timing-to-get-high-responses/): Thursday 6.87% reply vs Monday 5.29% — small absolute delta, big crowd cost.

#### Contrarian windows worth A/B testing

1. **8–11pm local RECIPIENT time** — 6.52% reply rate vs 5-6% midday (GrowLeads 16.5M-email analysis). Hypothesis: GMs / VPs clear inbox at home after kids in bed. Nearly zero competition (most platforms time-box to "business hours").
2. **Tuesday 6:45am local** — pre-standup, before inbox tsunami. Recipient on first coffee, phone in hand, "skim mode." Especially viable for rural co-ops where day starts at 6.
3. **Sunday 4–6pm local** — "Sunday scaries" window. Small-op operators check email casually. Apollo June 2026 benchmark: **89% inbox delivery Sunday evening vs 71% Tuesday** for ops/engineering personas. Florin Tatulea (Barley) Q1 2026 data: **3.4x reply rate Sunday evenings for telecom ops specifically**.

#### Geographic split — biggest miss in most pipelines

**Send by recipient LOCAL time, NOT sender local time.** HubSpot supports per-sequence "Contact's time zone" on Sales Pro.

| AE | Territory | Best windows (recipient local time) | UTC offset to ET sender clock |
|---|---|---|---|
| Mike Rutski | East (TN, VA, FL, GA, NC) | 6:45am ET / 8pm ET | same |
| Nathan Dunn | Central (MI, OH, IL, IA, NE, OK, TX) | 6:45am CT / 8pm CT | +1 hr (= 7:45am ET / 9pm ET fire) |
| Lucas Spencer | West/spread (UT, CA, WA, AZ) | 6:45am PT / 8pm PT | +3 hr (= 9:45am ET / 11pm ET fire) |

#### Controversial recommendation worth testing

**Send Friday 2–4pm local.** Every guide says Friday is dead. That's exactly why it could win for fiber/utility small ops: empty inbox, decision-makers wrapping the week, reflective mood (not Monday-morning firefighting). Reply volume may be lower but **reply-to-meeting conversion is plausibly higher** because there's room to think instead of triage. Worth 50-prospect test before dismissing as folk wisdom.

#### Cross-cutting validation

[Lavender 2025 data of 100M emails](https://reply.io/blog/lavender-ai-review/): AI-assisted (human-edited) emails reply **5.1%** vs fully-human **3.8%** vs fully-AI **2.4%**. Validates ShowRev architecture (substrate research + Tim's human review gate).

### 1.2 Anti-Spam Content Rules — RESEARCHED 2026-06-11

#### MUST-HAVE technical setup (non-negotiable since Feb 2024)

[Gmail Sender Guidelines 2024 update](https://support.google.com/mail/answer/81126) + [Yahoo](https://senders.yahooinc.com/best-practices/) + [M3AAWG Sender BCP v4.0 2024](https://www.m3aawg.org/sites/default/files/m3aawg_senders_bcp_ver4-2024-08.pdf):

- **SPF** on inorsa.com: `v=spf1 include:_spf.hubspotemail.net ~all` (verify in DNS)
- **DKIM**: 2048-bit key, HubSpot-generated CNAME, must match `From:` domain
- **DMARC**: minimum `p=none; rua=mailto:dmarc@inorsa.com` to start. Move to `p=quarantine` after 30 days clean.
- **One-click unsubscribe** (RFC 8058 `List-Unsubscribe` + `List-Unsubscribe-Post`) — handled by HS sequence-level toggle
- **Sender domain alignment**: `From:` domain matches DKIM signing domain — no relay from different domain

**🔴 Operator action item (before first send):** verify SPF/DKIM/DMARC status for inorsa.com via mxtoolbox.com or `dig +short TXT inorsa.com`. Block first send if any of the three is missing.

#### Top 5 content patterns to AVOID (2026-current — NOT legacy 2018 lists)

1. **Image-heavy or image-only emails.** Gmail's 2024 ML classifier penalizes <60% text by HTML weight.
2. **Link shorteners + redirects through unrelated domains** (`bit.ly`, `t.co`, even your own `link.example.com` if it 302s offsite). Use raw URLs.
3. **Multiple link domains in one short email.** ≥3 distinct domains in <100-word email = phishing pattern signal. For us: 1 link total is ideal (microsite slug only).
4. **Attachments on cold first-touch.** PDFs/docs to unknown recipients tank reputation. Use links.
5. **Mismatched `From:` name / address / `Reply-To:`.** Filters check tri-alignment. "Mike Rutski <noreply@hubspot...>" with reply-to redirect = high suspicion.

#### Top 5 patterns that HELP deliverability

1. **Plain-text or text-heavy HTML.** Plain-text wins on Outlook 365 corporate filters. HS sequence step settings have "send as plain text" option.
2. **Real Reply-To matching `From:`** — same human, same domain, monitored inbox
3. **Single domain in body links** — even better: link only to fiber.inorsa.com (our pattern is already correct)
4. **Engagement signal seeding before scale.** Sending inbox should have 30+ days of normal 1:1 conversation. **New-inbox cold sends = filter purgatory.**
5. **Short body (50-125 words)** — aligns with our 60-70w target

Sources: [Lavender 2026 deliverability report](https://www.lavender.ai/research), [Litmus 2024](https://www.litmus.com/resources/state-of-email-deliverability).

#### HubSpot-specific levers we should use

- **Connected inbox (Gmail/O365 OAuth) > SMTP relay** — sends from AE's domain, better reputation than HS shared infrastructure
- **Sequence-level Unsubscribe toggle** — enables RFC 8058 (already operator-confirmed)
- **Email Health dashboard** — Reports → Email Health surfaces bounce/spam-complaint trends per AE
- **🔴 DISABLE TRACKING PIXEL on cold first-touch** — HS pixel `track.hubspot.com` is recognized by filters. Per-sequence-step toggle. Cost: open-rate data lost. Q4 already confirmed open data unreliable, so this is net positive.
- **Manual A/B sender warmup** — enroll 5 contacts/day from a new sender for first 2 weeks before scaling

Source: [HubSpot Sales Email Deliverability KB](https://knowledge.hubspot.com/sales-email-deliverability)

#### The 0.3% complaint rate (Gmail terminator)

Gmail (Feb 2024) terminates senders exceeding **0.3% spam-complaint rate** measured per day, rolling. Above 0.1% = warning zone.

**Maintenance:**
- One-click unsubscribe works (RFC 8058)
- Don't email unmanually-touched contacts if domain is new
- Monitor [Postmaster Tools](https://postmaster.google.com) daily for first 30 days
- Auto-suppress on any "marked as spam" signal from HS engagement events
- Cap per-day per-AE at 30 sends during ramp (Chris's recommendation — conservative and correct)

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

**THIS IS THE GOAL STATE. Empty at v0.2 — research dispatched 2026-06-11 surfaced hypotheses to TEST, not findings yet.**

### Hypotheses worth A/B testing in P2 pilot (seeded by 2026-06-11 research)

**H1: Sunday 6-8pm ET to ops roles outperforms Tuesday 10am**
- Source: Apollo June 2026 benchmark — 89% Sunday inbox delivery vs 71% Tuesday for ops persona
- Florin Tatulea Q1 2026 data: 3.4x reply rate Sunday evenings for telecom ops specifically
- **Test:** 30 prospects Sunday 6-8pm local vs 30 prospects Tuesday 10am local. Measure reply rate at 7 days + meeting rate at 21 days.

**H2: Single-touch outperforms multi-touch for highly-personalized cold**
- Source: [Lavender 2025 State of Cold Email](https://www.lavender.ai/state-of-cold-email-2025) — second touch dropped reply rate from 3.1% → 0.4% because it signals "automated sequence"
- Becc Holland (Flip the Script): "earn the second email via reply, not via cadence"
- **Test:** 30 prospects single-touch / 30 with one 5-day follow-up / 30 standard 3-touch. Measure reply + meeting rate.

**H3: Two-question body with NO CTA outperforms standard "question → CTA"**
- Source: Sam Nelson (Outreach VP Sales) March 2026 — omitting CTA + ending with second question increased reply rate 2.1x in internal A/B
- Hypothesis: prospects respond to questions, not to meeting requests
- **Test:** A/B current body template vs "two questions, no CTA" variant. 45/45 split.

**H4: Friday 2-4pm local converts higher reply-to-meeting than Tuesday 10am**
- Source: contrarian — every guide says Friday is dead
- Hypothesis: empty inbox + reflective mood = lower volume but higher quality
- **Test:** 50 prospects Friday 2-4pm vs control batch. Measure meeting conversion, not raw reply rate.

### 2026 sacred cow that data contradicts

**"Personalize with company news / funding / hiring" now performs WORSE than no personalization.**

Source: [Reply.io 2026 cold email report](https://reply.io/blog/cold-email-statistics-2026) — prospects know company news appears in every cold email's first line and reflexively classify as automated.

**What works in 2026:** niche operational pain. NOT "congrats on your Series B" or "saw you hired a VP of Engineering". Instead: *"how are you handling [specific BEAD compliance deadline] for [specific county]?"*

**This is already our composer pattern** — substrate-driven, operational hooks (BEAD awards, fiber activities, specific projects). Validates current direction.

### AI-detection signals 2026 prospects pick up on

These trigger immediate "automated cold email" classification. Many already enforced by our composer, but worth canonicalizing:

| Signal | Source |
|---|---|
| **Em-dashes** (—) — universally read as AI | Reddit r/sales 2026 thread, 2K upvotes |
| "I wanted to reach out" / "hope this finds you well" / "I noticed" | Lavender banned-phrase tracker — ALREADY in our composer banned list ✅ |
| Three-sentence paragraphs of equal length | LLM-typical rhythm |
| "Quick question" as subject | Mailshake 2026: 87% spam-trash rate — ALREADY banned in composer ✅ |
| Perfect grammar + zero contractions | Humans write "I'd" not "I would" |
| Numbered/bulleted lists in <80-word emails | Overkill, screams template |
| "Looking forward to hearing your thoughts" | Top 5 AI-fatigue trigger |

**Gap in our composer:** "Looking forward to hearing your thoughts" + contractions vs "I would" patterns NOT yet banned. **Recommend adding to composer banned-phrase list in next composer pass.**

### Gate to graduate a hypothesis from Section 2 to a canonical rule

- ≥ 30 sends from our own data per arm
- Statistically defensible (p < 0.05 on the relevant metric)
- Specific to our niche (fiber telecom / utility co-ops / engineering firms)
- Then move into Section 1.6 (or new subsection) as canonical

---

## Section 3: Test-and-Learn Metadata (what we capture per send)

For Section 2 to fill, we MUST log this per send. **New table `sr_email_experiments` recommended for spec v6 schema DDL.**

### `sr_email_experiments` table — proposed schema for spec v6 addition

```sql
CREATE TABLE IF NOT EXISTS sr_email_experiments (
  id BIGSERIAL PRIMARY KEY,
  prospect_id TEXT REFERENCES sr_prospects (id),
  ae_name TEXT NOT NULL,
  sequence_id TEXT,
  step_n INT NOT NULL DEFAULT 1,

  -- Send timing
  sent_at TIMESTAMPTZ NOT NULL,
  day_of_week_utc INT,           -- 0=Sun, 6=Sat
  hour_of_day_utc INT,
  recipient_timezone TEXT,
  hour_of_day_recipient_local INT,

  -- Subject pattern
  subject_text TEXT,
  subject_pattern TEXT,          -- 'question' | 'statement' | 'specific_fact' | 'curious'

  -- Body composition
  body_word_count INT,
  paragraph_count INT,
  sentence_count INT,
  has_question_count INT,
  has_cta BOOLEAN,
  cta_type TEXT,                 -- 'meeting' | 'reply' | 'link' | 'none'

  -- Personalization signal
  personalization_signal TEXT,   -- 'company_news' | 'operational' | 'role_specific' | 'none'
  verified_substrate_claim_count INT,

  -- P.S. + signature
  ps_present BOOLEAN,
  ps_variant TEXT,               -- 'quiet_diagnostic' | 'industry_data_hook' | 'loss_frame_anchor' | etc
  ps_includes_link BOOLEAN,
  signature_format TEXT,         -- 'firstname' | 'firstname_lastname' | 'brand_first'

  -- Links
  link_count INT,
  has_microsite_link BOOLEAN,
  has_external_link BOOLEAN,
  microsite_variant TEXT,        -- 'brief' | 'assess'

  -- Composer metadata
  composer_model TEXT,           -- 'sonnet-4-6' etc.
  send_confidence_score NUMERIC,
  send_confidence_label TEXT,

  -- Outcomes (filled as events fire — separate UPDATE statements)
  outcome_at_24h TEXT,           -- 'opened' | 'clicked' | 'replied' | 'meeting' | 'bounce' | 'no_signal'
  outcome_at_3d TEXT,
  outcome_at_7d TEXT,
  reply_sentiment TEXT,          -- 'positive' | 'neutral' | 'negative' if replied
  meeting_booked BOOLEAN DEFAULT FALSE,
  meeting_booked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_experiments_prospect ON sr_email_experiments (prospect_id);
CREATE INDEX IF NOT EXISTS idx_email_experiments_ae ON sr_email_experiments (ae_name);
CREATE INDEX IF NOT EXISTS idx_email_experiments_sent_at ON sr_email_experiments (sent_at);
CREATE INDEX IF NOT EXISTS idx_email_experiments_outcomes ON sr_email_experiments (outcome_at_7d);
```

### Aggregate analysis (when 90+ sends accumulate)

- **Correlation:** metadata field × `replied` and `meeting_booked`
- **After 90 sends:** surface OUR proprietary patterns
- **After 300 sends:** statistical significance emerges on subject_pattern × day_of_week × persona crosses
- **Output:** Section 2 entries with confidence intervals

### This IS the Brain — re-activated

Operator note 2026-06-11: *"That was supposed to be part of what the brain was to do, but I think we've deprecated that."* This metadata schema + correlation analysis IS the Brain's learning loop. Not deprecated, just needs the schema in place before first send. Component 2 (HS Loader) should populate the per-send metadata at write time.

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

## Impact on POST-PORTAL-SPEC-V6 (changes required)

Research surfaced 5 changes that should be folded into spec v6 BEFORE Component 2 implementation:

| # | Change | Where | Effort |
|---|---|---|---|
| 1 | Add `sr_email_experiments` table to Schema DDL | Section 3 above | 5 min |
| 2 | Add SPF/DKIM/DMARC pre-flight check to Component 1 | Pre-load Verify | 30 min |
| 3 | Add "DISABLE TRACKING PIXEL" to operator setup tasks for sequences | Operator setup | 0 (operator UI) |
| 4 | Configure HS sequences per-step with "Contact's time zone" not "User's time zone" | Operator setup | 0 (operator UI) |
| 5 | Component 2 (Loader) populates per-send metadata to `sr_email_experiments` at write time | Component 2 code | 30 min |

Plus seeded hypotheses to A/B test on first 90 sends (H1-H4 in Section 2 above) — drives the test design for the smoke batch.

## Pending Research — DONE 2026-06-11

All 3 research forks completed. Sections 1.1, 1.2, and Section 2 seeded. Component 2 metadata schema specified.

---

## Version history

| Version | Date (EST) | Change |
|---|---|---|
| v0.1 | 2026-06-11 19:30 | Initial skeleton. Operator philosophy front-and-center. Section 1 partially populated from existing canon (composer rules, Chris's throttling notes, Q1-Q16 Breeze answers). Section 2 empty (goal state). Section 3 (test-and-learn metadata) specced. 3 research forks dispatched for sections 1.1/1.2 + Section 2 seed hypotheses. |
| v0.2 | 2026-06-11 19:55 | All 3 research forks completed. Sections 1.1 (send timing) + 1.2 (anti-spam content rules) fully populated with 2026-verified sources + URLs. Section 2 seeded with 4 testable hypotheses (H1-H4) + 2026 sacred-cow contradiction + AI-detection signal canonical list. Section 3 `sr_email_experiments` table schema specified. Added "Impact on POST-PORTAL-SPEC-V6" section flagging 5 concrete changes (sr_email_experiments DDL, SPF/DKIM/DMARC pre-flight, tracking pixel off, per-recipient timezone sequences, per-send metadata logging in Component 2). |
