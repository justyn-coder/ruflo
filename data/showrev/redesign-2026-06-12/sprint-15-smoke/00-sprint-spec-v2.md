---
title: Sprint Spec v2 PATCH — addressing judge panel feedback on v1
date: 2026-06-12 05:30 EDT
status: DRAFT v2 — incremental patch to v1, NOT a rewrite
authored_by: Claude (Opus 4.7) Coordinator
inheritance: builds on v1 at `00-sprint-spec-v1.md`; addresses Wave 7 Sprint judge panel feedback at `04-judge-v1-results.md`
purpose: lift v1 from median 7.0 to ≥8.5 by adding 6 missing pieces flagged convergently by 4 cross-family judges
---

# Read first

v1 scored:
- KQ1 (substrate compensating control): **4/4 PASS** — keep as-is
- KQ2 (pre-committed halt + continuation): **3/4 PASS** (DeepSeek FAIL — sharpest read of rubric, must fix)
- Aggregate dimension mean: **~7.0** (target 9.0; bar 7.5 floor)
- Weakest dimensions across all 4 judges: **Deliverability (avg 5.5)** + **Smoke pass/fail gate (avg 6.0)** + **Learning extraction (avg 6.25)** + **Ramp realism (avg 6.25)** + **Operator ergonomics (avg 6.5)**

v2 patches 6 specific gaps, leaving v1 substrate + composition rigor intact. Each patch references the relevant v1 Part being amended.

---

# Patch 1 — KQ2 conditional continuation rules (amends v1 Part 9)

**Why:** DeepSeek FAILED KQ2 because v1 has mandatory halts but no pre-committed "soft fail → continue at reduced rate" rules. Operator should not have to invent continuation logic under production pressure.

## Amended Part 9 — Phase 0 (Smoke) outcome decision matrix

| Outcome | Bounce | Spam | Contamination | Reply rate (over 72h) | Decision | Action |
|---|---|---|---|---|---|---|
| **A — Clean smoke** | <3% | 0 | 0 | ≥6.7% (≥1 of 15) OR ≥1 meeting | **PASS → full Sun ramp at 20/AE** | Operator confirms |
| **B — Reputation clean, signal soft** | <3% | 0 | 0 | <6.7% AND no replies, but no negative signals | **CONDITIONAL CONTINUE → Sun ramp at 10/AE (half-rate)** | Operator confirms; T1 stays; second 50-send cohort informs Mon 20/AE decision |
| **C — Reputation clean, no data** | <3% | 0 | 0 | Reply window incomplete (<24h elapsed) | **WAIT** | Hold Sun decision until 72h post-send; max wait extends prod to Mon morning |
| **D — Marginal bounce** | 3-5% | 0 | 0 | any | **CONDITIONAL CONTINUE → Sun ramp at 10/AE; re-verify all 60 cohort emails with MV; investigate bounce cause** | Operator confirms |
| **E — Reputation hit** | ≥5% OR ≥1 spam | any | any | any | **HALT** | Mandatory; no Sun ramp; root-cause |
| **F — Contamination shipped** | any | any | ≥1 PROHIBITED-citation found post-send | any | **HALT all sends + critical incident** | Mandatory; ship Pillar 4 MV before any future send; audit-backfill substrate |
| **G — Spam complaint** | any | ≥1 | any | any | **HALT all sends** | Mandatory; investigate complaint; only resume after root cause + composition + substrate verified clean |

**Latest smoke decision time:** Sunday 12:00 ET. If no decision reached by then, sprint defers Sun prod ramp to Monday 8am; Mon 30/AE pushed to Tue.

**Definition of "positive reply":** explicit signal of interest in continuing conversation (any of: requests info, asks question, requests meeting, accepts meeting, replies with specific operational pain). EXCLUDES: out-of-office, unsubscribe, "not the right person," "remove me," GDPR removal, hostile.

**Definition of "negative signal":** spam complaint, hostile reply, "remove me," "this is spam," reported to abuse@.

## Amended Part 9 — Phase 1 (Sun prod) outcome matrix

| Outcome | Bounce (60-cohort) | Spam | Contamination | Reply rate (72h) | Decision | Action |
|---|---|---|---|---|---|---|
| **A — Clean prod** | <3% | 0 | 0 | ≥3.3% (≥2 of 60) | **PASS → Mon 30/AE full ramp** | Operator confirms |
| **B — Signal soft** | <3% | 0 | 0 | <3.3% but no negative | **CONDITIONAL CONTINUE → Mon at 15/AE** | Continue at reduced rate; observe Mon cohort |
| **D — Marginal bounce** | 3-5% | 0 | 0 | any | **CONDITIONAL CONTINUE → Mon at 15/AE; re-verify all Mon cohort emails** | |
| **E/F/G — Reputation hit / contamination / spam** | as above | as above | as above | as above | **HALT** | Mandatory |

## Amended Part 9 — Phase 2 (Mon ramp 90) outcome matrix

Same shape as Phase 1, with cohort sizes adjusted:
- Clean: reply ≥2.2% (≥2 of 90) → continue ramp toward 500-800 at 30/AE/day
- Signal soft: <2.2% reply, 0 spam → continue at 20/AE; respec composer system prompt
- Marginal bounce, hard halts: same as Phase 1

---

# Patch 2 — Deliverability + domain reputation plan (new Part 4.6)

**Why:** ALL 4 judges scored Deliverability 5-6. v1 mentioned bounce thresholds but had no domain inventory, no warmup plan, no Postmaster monitoring, no CAN-SPAM verification.

## Sending domain inventory

| AE | Email address | Domain | Workload status | Notes |
|---|---|---|---|---|
| Mike Rutski | mike@inorsa.com | inorsa.com | Existing work email | Owner ID 89105202 |
| Nathan Dunn | nathan@inorsa.com | inorsa.com | Existing work email | Owner ID 89105203 |
| Lucas Spencer | lucas@inorsa.com | inorsa.com | Existing work email | **Owner ID 163468117** (operator-confirmed 2026-06-12) |

**Operator open decision:** confirm whether Inorsa AEs send from `inorsa.com` (their regular work email — shared domain risk: 1 spam complaint affects all 3) OR from a dedicated outbound subdomain (e.g., `mail.inorsa.com` or `outbound.inorsa.com`). **Default if no answer:** use existing `inorsa.com` for smoke + Phase 1 (15 + 60 well under any per-domain cap); evaluate dedicated subdomain before Phase 2 (90/day) if any deliverability signal degrades.

## Domain warmup status

- `inorsa.com` is an established business domain with existing HubSpot Sequence activity (Tom Marciano sends booth invitations; the 45-prospect P1 batch went out from AE addresses). **No additional warmup required for 15-90 send/day volume.**
- If Phase 3 scales above 150/day total across 3 AEs, **operator decision needed:** start dedicated outbound subdomain with formal warmup sequence (50 day-1, 100 day-2, etc. — standard cold-email warmup curve).

## Monitoring tools

| Tool | Purpose | Frequency |
|---|---|---|
| HubSpot Sequence Dashboard | Bounce + open + reply rates per AE per sequence | Every 6 hours during send window |
| HubSpot email-health alerts | Spam complaint events (real-time webhook) | Real-time |
| Google Postmaster Tools (inorsa.com) | Domain reputation, spam rate, IP reputation | Daily check by Coordinator |
| Mail-tester.com | Spamhaus + SpamAssassin score pre-send | Test once on Sat morning before HS load |

**Operator open decision:** is Google Postmaster Tools already set up for `inorsa.com`? If not, configure Saturday morning (5 min).

## CAN-SPAM compliance verification (Saturday morning checklist)

Before HS load, Coordinator + operator verify the HubSpot Sequence template body contains:
1. **Unsubscribe link** — HubSpot auto-inserts via sequence template; visible in test enrollment
2. **Physical mailing address** — Inorsa registered address must be in footer
3. **Truthful subject line** — composer-constraints already enforces
4. **Accurate sender identity** — From = AE name; reply-to = AE email
5. **No deceptive routing** — From-domain matches reply-to-domain

If any missing → fix template before Sat 9am AE enrollment.

---

# Patch 3 — Communication chain on kill switch (amends v1 Part 8.3)

**Why:** Gemini + DeepSeek + GPT-5 flagged v1 has operator-only kill authority but no explicit notification chain or AE self-halt rule.

## Amended Part 8.3 — Rollback authority + comm chain

**Kill switch can be pulled by:**
1. **Operator (Justyn)** — sovereign authority; any reason, any time. No questions asked.
2. **AE self-halt** — if an AE receives a reply that contains spam complaint language, abuse@-style threat, GDPR removal, or hostile escalation, AE can immediately pause their own Sequence in HubSpot without operator pre-approval. AE notifies operator + Coordinator within 30 min via Slack DM. Coordinator escalates as appropriate.
3. **Coordinator** — if Coordinator detects automated metric breach (bounce >5%, spam complaint event, contamination flag in post-send audit), Coordinator pauses sequence + notifies operator + AEs within 5 min.

**Comm chain when kill switch fires (in this order):**

1. **Minute 0:** Whoever pulled the kill posts in `#showrev-ops` Slack channel: "KILL SWITCH FIRED — [reason]. Sequence(s): [list]. All AE sends paused."
2. **Minute 0-5:** Coordinator confirms all AE Sequences are paused in HubSpot. Posts confirmation in Slack.
3. **Minute 5-15:** Operator acknowledges in Slack OR via direct response.
4. **Minute 15-60:** Coordinator + operator identify root cause (bounce? spam? contamination? complaint?). AEs stand by.
5. **Hour 1-4:** Patch identified + applied. AEs informed.
6. **Hour 4-24:** Resume criteria documented before re-enabling. Includes substrate re-audit, composition re-verification, email re-MV-check if relevant.
7. **Resume only after:** operator explicit "go" in Slack + Coordinator confirms patches applied + AEs acknowledge.

## Sprint-end state if kill fires in first 24h

If kill fires within first 24 hours of smoke send AND root cause is substrate contamination → **sprint dead until Pillar 4 MV ships.** No retry on existing pipeline. Wave 6 B-version becomes mandatory dependency.

If kill fires for any other reason → **sprint paused for root-cause window of 72 hours.** If root cause identified + patched → resume with reduced batch (10 prospects, all hand-audited including spot-check of 2 by second operator). If root cause not identified within 72h → escalate to operator decision on sprint vs Wave 6 dependency.

---

# Patch 4 — Cohort-2 conditional learning rule (new Part 10.1)

**Why:** Grok + Gemini + DeepSeek flagged v1's Part 10 lists data points captured but doesn't state what changes in cohort 2 based on cohort 1.

## Pre-committed cohort-2 conditional rule

Based on Phase 0 (smoke) + Phase 1 (first 60 prod) outcomes, the FIRST concrete change in cohort 2 selection logic is:

| Cohort 1 signal | Cohort 2 rule change |
|---|---|
| **High reply from Revenue Leader persona (>10%), low from Ops Builder (<3%)** | Cohort 2 weights Revenue Leader 60% / Ops Builder 30% / Technical Designer 10% (vs cohort 1 ~25/50/25 distribution) |
| **High reply from "scale + bottleneck" hook (e.g., "200K locations, drawings keeping pace?"), low from "challenger insight" hook** | Cohort 2 composer prompt requires scale-bottleneck hook for every Ops Builder prospect |
| **High reply from East territory, low from West/Central** | Cohort 2 weights AE Mike (East) 60% / Nathan (Central) 25% / Lucas (West) 15% if cohort signal differentiates by territory |
| **0 replies across all categories at n=75 sent** | Cohort 2 holds; respec composer system prompt. Surface to operator that hypothesis "current substrate generates top-decile cold reply" needs revision |
| **Specific objections in replies (e.g., "wrong tool", "already have X")** | Cohort 2 substrate query adds an explicit anti-pattern filter for that objection |
| **Microsite conversion >20% but reply <3%** | Cohort 2 emphasizes microsite link earlier in body; shifts CTA from question to microsite invite |
| **Microsite conversion <5% AND reply <3%** | Cohort 2 drops microsite; tests text-only T1 |

These rules are pre-committed — operator approves the FRAME (which observation triggers which change), not each individual change.

## What Brain learns at N=15 vs N=60 vs N=500

| N | Confidence | What we can claim |
|---|---|---|
| **N=15 (smoke)** | Very low (n=4 reply at most) | Pipeline works mechanically. Substrate audit caught what citation gate didn't. AE workflow holds. No reliable signal on reply-rate hypothesis. |
| **N=60 (Sun prod)** | Low (statistical noise dominates) | Bounce rate stable. Spam complaint rate likely 0. Reply rate ±5pp range. Persona signal weak. |
| **N=200 (mid-ramp)** | Medium | Reply rate ±3pp range. Persona signal emerging. Composition pattern lift detectable. |
| **N=500 (target)** | High enough to make composer/cohort decisions | Reply rate ±2pp. Persona × composition × territory triple-axis lift measurable. Cohort 3 design fully informed. |

---

# Patch 5 — Operator audit-capacity math at N=90/day (new Part 10.2)

**Why:** Grok + DeepSeek + GPT-5 flagged ramp realism gap. v1 didn't model operator time at scale.

## Audit time per prospect

Based on tonight's actual hand-audit of 25 candidates:

| Audit step | Time/prospect | Total per 90 |
|---|---|---|
| Substrate citation regex check (automated) | 2 sec | 3 min |
| Body inference-language regex check (automated) | 1 sec | 1.5 min |
| Per-claim substrate trace (semi-auto) | 30 sec | 45 min |
| Manual operator eyeball | 60 sec | 90 min |
| Pass-fail decision + log entry | 15 sec | 22.5 min |
| **Total per 90-prospect batch** | **~108 sec/prospect** | **~162 min ≈ 2.7 hours** |

## Operator-time ceiling

Operator's stated available bandwidth: 30-60 min/day for ShowRev approval.
**At 90/day with full manual audit: 2.7 hours operator time required.**
**Gap: 1.7-2.2 hours/day.**

## Compensating actions (ranked)

1. **Pillar 4 MV ships** → automated substrate gate at write time; operator audit reduced to spot-check (90 sec/prospect for the random 10%) = **15 min/90-prospect batch.** **THIS IS THE PRIMARY MITIGATION.**
2. **Second operator** (Tim or new hire) does first-pass audit; operator does 10% spot-check → 30 min/batch.
3. **Batch-approval UI** — single screen shows all 90 with green/red badges; operator approves batch in <10 min if all green.
4. **Wave-based release** — 30/AE released in 3 micro-batches per day instead of 1 — buys batch-window time for operator review.

**If none of these compensating actions ship by Mon 30/AE phase:** v2 ramp realism reverts to ~50/day max (operator's actual ceiling). Operator decides 2026-06-15 EOD which compensating action to adopt.

---

# Patch 6 — Smoke sender-field verification step (amends v1 Part 7.3)

**Why:** GPT-5 + Grok flagged v1 lacks named verification step that From-field = correct AE before each batch ships.

## Amended Part 7.3 — Sender verification gate

Before any AE enrolls a contact in their Sequence, Coordinator (or operator) verifies:

1. **Open HS contact record** for each of the 5 AE-assigned prospects
2. **Confirm `hubspot_owner_id` = AE's owner ID** (Mike 89105202; Nathan 89105203; Lucas TBD)
3. **Confirm `showrev_engagement_slug` = 'inorsa-fiberconnect-2026-cold'**
4. **Confirm `showrev_outreach_cohort` = 'fc2026-cold'**
5. **Open AE's Sequence template** → verify From-field renders as AE's name + AE's email
6. **Enroll 1 test contact** (Justyn Szymczyk dummy) → verify token rendering (subject + body paragraphs) + line breaks preserved
7. **Only after test pass** → AE enrolls remaining 5

Coordinator owns steps 1-6. AE owns step 7.

**Failure mode:** if any verification fails → halt that AE's enrollment until correct. Operator informed within 5 min.

---

# Patch 7 — Sequence ID + token rendering (amends v1 Part 7.2)

**Why:** Gemini + GPT-5 flagged "ShowRev Cold T1" sequence name generic; no ID, no rendering test.

## Amended Part 7.2 — Sequence inventory + rendering test

**Open operator decision Sat morning:** confirm HubSpot Sequence IDs for cold-T1 per AE. Likely already configured per existing Inorsa engagement. Coordinator queries HS:

```
GET /sequences/v3/sequences?createdBy=[ae_owner_id]
```

Saturday 8am, Coordinator confirms:

| AE | Sequence Name | Sequence ID | Last edited |
|---|---|---|---|
| Mike Rutski | ShowRev Cold T1 (Mike) | TBD-Sat-AM | TBD |
| Nathan Dunn | ShowRev Cold T1 (Nathan) | TBD-Sat-AM | TBD |
| Lucas Spencer | ShowRev Cold T1 (Lucas) | TBD-Sat-AM | TBD |

If any sequence missing → operator + Coordinator create from template before 9am AE enrollment window.

## Token rendering test (mandatory pre-flight)

Saturday 8:30am, Coordinator enrolls Justyn (`justyn@tasteforyourself.com`) in ONE AE's sequence with one of the 15 prospect's full per-paragraph properties populated (substituting Justyn's name/email). Verify:
- Subject renders correctly with `showrev_pre_show_t1_subject` token
- Body paragraphs render in order with line breaks preserved
- Pitch verbatim string present
- Salutation `[FirstName],` renders as `Justyn,` (comma, no greeting)
- Microsite link renders with correct slug
- From-field = AE name + AE email

If rendering test passes → enable all 3 AE Sequences for the smoke. If fails → halt; investigate; fix; re-test.

---

# Patch 8 — Operator click-count + batched review UI (amends v1 Part 11)

**Why:** Gemini + Grok + DeepSeek flagged operator ergonomics — no click count or UI sketch.

## Amended Part 11 — Operator review UX

**Saturday morning review surface:** the existing operator portal at `showrev-microsites.vercel.app/ops?pipeline=p2` already supports batched review. For the 15 smoke:

| Action | Clicks | Time |
|---|---|---|
| Open `MORNING-BRIEFING.md` from terminal/editor | 1 | 30 sec |
| Read briefing executive summary | 0 | 90 sec |
| Open `01-fifteen-final.md` | 1 | 30 sec |
| Skim 15-prospect table | 0 | 60 sec |
| Spot-check 3 random prospects' bodies | 3 | 3 min |
| Spot-check 1 substrate audit trail | 1 | 60 sec |
| Reply to Coordinator: "approve" OR "substitute X with Y" | 1 | 30 sec |
| **Total click count for smoke approval** | **~7 clicks** | **~6.5 min** |

For Sun 60-prospect Phase 1: similar shape, ~12 clicks, ~12 min spot-checking 5 of 60.
For Mon 90 Phase 2: ~15 clicks, ~15 min spot-checking 6 of 90.

**Target ceiling:** operator review time per batch ≤ 15 min for any batch size up to 100. If exceeded, Pillar 4 MV ships immediately + UX redesigned.

## Craft vs operator review separation

| Reviewer | What they check | What they DON'T check |
|---|---|---|
| **Tim (craft reviewer)** | Body sounds human; AI tells absent; persona pain articulated; rhythm + voice | ICP fit; data accuracy; AE assignment |
| **Operator (ICP + data + AE reviewer)** | ICP signal genuine; fact accuracy across substrate citations; AE correctly assigned to territory; persona classification correct | Body craft (already done by Tim) |
| **Coordinator (audit + load)** | Substrate clean; banned patterns absent; word count; sender verification | Quality judgment (Tim/operator own) |

This separation prevents operator from re-doing Tim's 182-prior-composition craft work. Operator's review focus = ICP/data/AE only.

---

# Patch 9 — Warm-contact / prior-touch exclusion gate (amends v1 Part 4.3)

**Why:** GPT-5 flagged v1's "not previously sent/loaded" is insufficient — doesn't exclude prospects with any prior CRM engagement.

## Amended Part 4.3 — Selection criterion 12

Add new criterion before #1:

| # | Criterion | Threshold | Source |
|---|---|---|---|
| **0** | **NOT in any P1 cohort (booth visitor) AND NOT in any prior outreach AND zero HubSpot engagement events (open/click/reply) on ANY prior email** | hard | Query: `sr_prospects.campaign = 'P2' AND p.hubspot_contact_id NOT IN (SELECT contact_id FROM HS engagements WHERE event_type IN ('OPEN', 'CLICK', 'REPLY', 'MEETING'))` |

Verified Saturday morning via direct HubSpot query — Coordinator confirms 0 of 15 have any prior CRM engagement before any HS load.

---

# Patch 10 — Webhook wiring verification + manual logging fallback (amends v1 Part 10)

**Why:** Grok flagged sr_sent_emails / sr_bounce_events / sr_outcomes are empty; webhooks unverified. This breaks the learning loop the spec depends on.

## Amended Part 10 — Pre-flight webhook verification

Saturday morning (by 9am), Coordinator executes:

1. **Test HubSpot webhook** → trigger a manual "email sent" event in HS, verify it lands in `sr_sent_emails` within 60 sec
2. **Test bounce webhook** → simulate bounce on test contact, verify it lands in `sr_bounce_events`
3. **Test reply webhook** → reply to test enrollment, verify it lands in `sr_outcomes`

If ANY webhook test fails:

| Webhook | Fallback |
|---|---|
| send_event | Coordinator manually inserts `sr_sent_emails` rows after each AE enrollment (15 rows for smoke; 60 for Sun; 90 for Mon) |
| bounce_event | Coordinator manually checks HS bounce dashboard every 6 hours + inserts `sr_bounce_events` rows |
| reply_event | Coordinator manually checks HS reply inbox every 12 hours + inserts `sr_outcomes` rows |

Manual fallback acceptable for smoke + Phase 1 (Sun 60). **Webhook MUST work before Phase 2 (Mon 90)** — operator gates this Sun afternoon.

---

# Updated open operator decisions

(Adds to v1 Part 13 list — total now 14 decisions)

| # | Decision | Default if no answer | Priority |
|---|---|---|---|
| 1 | Send time: Mon 9am recipient-local OR Sat afternoon | Mon 9am (v1) | High |
| 2 | Lucas Spencer HubSpot Owner ID | Coordinator queries Sat AM (v1) | High |
| 3 | Pillar 4 MV ship tonight OR defer | Defer (v1) | Medium |
| 4 | API Sequence enrollment build Sun PM? | Yes (v1) | Medium |
| 5 | Anthony Jelniker procurement persona — include or exclude? | EXCLUDE (procurement = wrong persona; replace with alternate Lucas West prospect) | Medium |
| 6 | EU recipients? | Exclude (v1) | Low |
| 7 | 500 vs 800 cap? | Operator per batch (v1) | Low |
| **8** | **Inorsa AEs use `inorsa.com` work email OR dedicated outbound subdomain?** | Use `inorsa.com` for smoke+Phase 1; evaluate before Phase 2 | High |
| **9** | **Google Postmaster Tools configured for `inorsa.com`?** | If not, set up Sat AM (5 min) | High |
| **10** | **Test enrollment dummy (Justyn-as-test-contact) — accepted?** | Yes (mandatory pre-flight) | High |
| **11** | **Manual fallback acceptable for sr_sent_emails / sr_bounce_events / sr_outcomes if webhook test fails Sat AM?** | Yes for smoke + Phase 1; webhook must work by Phase 2 | High |
| **12** | **Second-operator/Tim available for first-pass audit at Sun 60-prospect Phase 1?** | Default: operator does full audit (cost: ~1.8 hours). Operator confirms preferred path Sat AM. | Medium |
| **13** | **Sequence templates verified to contain unsubscribe link + Inorsa physical address?** | Mandatory verification Sat AM before any enrollment | High |
| **14** | **Saturday smoke vs Monday smoke date — operator confirms Sat is right OR shifts to Mon for higher engagement window?** | Saturday per v1 plan, but operator can shift to Mon if Phase 1 timing tolerates 1-day slip | Medium |

---

# Updated killer questions answers (post-patches)

## KQ1 — Compensating control for disabled citation gate

**Answer: PASS** (unchanged from v1; 4/4 judges agreed).

Refinement: the audit trail format is now explicitly named in `03-audit-trail.md` companion file. Two-stage check (raw substrate row regex + final body regex). Per-prospect log with: source rows queried, regex hits, PASS/FAIL verdict, audit timestamp, auditor name. Reproducible by any non-author with the SQL queries documented in Part 4.4 + this v2 patch.

## KQ2 — Pre-committed halt + continuation in both directions

**Answer: PASS** (was 3/4 in v1; patch 1 fixes the DeepSeek FAIL).

The Phase 0 / Phase 1 / Phase 2 outcome matrices in Patch 1 above explicitly pre-commit BOTH:
- Mandatory halts: spam complaint, contamination shipped, bounce ≥5%
- Conditional continuation: marginal bounce 3-5% → reduced rate; signal soft (reply <target but no negative) → continue at half-rate; reputation clean but no data → wait window

Operator approves the frame; operator confirms each decision in real time. No discretionary judgment under production pressure.

---

# Version history

| Version | Date | Author | Change |
|---|---|---|---|
| v2 (this patch) | 2026-06-12 05:30 EDT | Claude (Opus 4.7) Coordinator | 10 patches addressing all 4 judges' must-fix items. KQ2 conditional matrix added (DeepSeek fix). Deliverability + warmup + Postmaster (all 4 judges). Comm chain + AE self-halt (3 judges). Cohort-2 rule (3 judges). Audit-capacity math (3 judges). Sender verification + sequence ID + warm-contact gate + webhook fallback. 7 new operator decisions added. Target: lift mean dimension score from 7.0 to ≥8.5. |
| v1 | 2026-06-12 04:30 EDT | Claude (Opus 4.7) Coordinator | Initial spec. |
