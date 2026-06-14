---
title: Sprint Spec v3 PATCH — Send timing + cadence (final patch addressing v2 panel weakest dimension)
date: 2026-06-12 06:30 EDT
status: DRAFT v3 — single targeted patch
authored_by: Claude (Opus 4.7) Coordinator
inheritance: builds on v1 + v2; addresses v2 panel results at `04-judge-v2-results.md`
purpose: lift Send timing + cadence dimension from avg 6.3 (DeepSeek 5, Gemini 6, GPT 6, Grok 7) toward 9 so all 4 judges ship-ready
---

# Read first

v2 panel results:
- KQ1: 4/4 PASS ✓
- KQ2: 4/4 PASS ✓ (fixed in v2)
- Mean: **8.37** (was 7.0 in v1; +1.37 lift)
- Median: **8.27** (Gemini 9.0, GPT-5 7.82, Grok 8.18, DeepSeek 8.27)
- Ship-ready: 3/4 YES (DeepSeek blocked only by `NO_DIMENSION_BELOW_6` due to Send timing = 5)
- Operator-set bar: median ≥9.0 — close, not yet there

The 4 judges convergently identified Send timing + cadence as the remaining weak link. v3 ships one targeted patch.

---

# Patch 11 — Send timing + cadence completion (amends v1 Part 8.1 + v2 Patch 2)

## 11.1 Mixed-timezone rule for Lucas West/spread

Lucas Spencer's territory includes WA, OR, CA, NV, AZ, UT, CO, ID, NM, MT, WY, ND, SD (3 timezones: PT, MT, plus any spread to others).

**Per-prospect timezone determination (in priority order):**

1. **Primary:** `sr_prospects.state` → mapped to canonical state TZ:
   - PT: CA, OR, WA, NV
   - MT: AZ, CO, ID, MT, NM, UT, WY
   - CT: ND, SD (border-state default)
2. **If state missing:** infer from company HQ via `sr_company_contacts.company_hq_state` → same map
3. **If neither available:** default to ET (recipient gets the email a bit early but not catastrophically)
4. **If recipient explicitly multi-state (e.g., "GFiber Director of OSP" serves multiple regions):** default to company HQ TZ
5. **Recipient explicitly cross-border (e.g., TEP Canada employee):** hold; operator decides Saturday morning

## 11.2 Batch stagger rule

To avoid simultaneous spike that triggers ESP rate limits + flags as bulk-blast:

| AE | Batch release time (East/recipient-local 9am converted to ET) | Stagger from prior |
|---|---|---|
| Mike Rutski (East cohort, 9am ET = recipient 9am ET) | 9:00am ET Monday | — |
| Nathan Dunn (Central cohort, 9am CT = recipient 10am ET) | 10:00am ET Monday | +60 min |
| Lucas Spencer (West cohort, 9am PT = recipient 12:00pm ET) | 12:00pm ET Monday | +120 min |

Within each AE's batch: HubSpot Sequence enrollment is configured for "send all at once" since each batch is only 5 prospects. No internal stagger needed at smoke scale.

At Phase 2 (Mon 90 = 30/AE): each AE batch of 30 staggers internally — HubSpot Sequence can be configured to send 1 every 30 sec → 15 min per AE batch. Operator confirms config Sun afternoon.

## 11.3 Saturday vs Monday smoke decision (final rationale)

v1 Part 8.1 offered Option A (Mon 9am) or Option B (Sat afternoon). v3 commits to:

**Recommendation: Saturday 9am ET HS load + AE enrollment + Sequence configured for Monday 9am recipient-local send.**

Rationale:
- Sat load = operator + AE review buffer time (no production pressure)
- Mon 9am send = highest B2B open rate window per Hunter / Belkins / Gong research
- Sat-to-Mon gap = 2 days for any AE feedback or operator override before send fires
- Aligns smoke send + Sun prod start: smoke fires Mon AM; results in by Mon EOD; Sun prod start would actually be Sun-evening-load-for-Mon-fire (rolling Sunday timing into the same sequence pattern)

**Why NOT Saturday afternoon send:** B2B inbox engagement on Saturday is 60-70% lower vs Tuesday (Gong/Belkins benchmark). Sat send = noisy data on the smoke. Mon send = clean data signal at modest 2-day delay.

**Operator override:** if operator wants faster signal (acceptance of noisier data), commit to Sat 11am ET / 8am PT recipient-local — covers all 3 timezones in a reasonable window. Operator decides Sat morning.

## 11.4 Day-of-week ramp distribution

| Day | Send volume | Day-of-week confidence |
|---|---|---|
| Mon | 100% of planned daily | High — solid B2B open rate; not flooded post-weekend |
| Tue | 100% | Highest — peak B2B engagement day |
| Wed | 100% | High — sustained engagement |
| Thu | 100% | High — engagement stays high |
| Fri | 50% | Medium — engagement drops; reserve for catchup batches |
| Sat | 0% | Low — B2B inbox dead |
| Sun | 0% | Low — same |

Ramp daily ceilings (Mike 30 / Nathan 30 / Lucas 30 = 90 starting Phase 2) apply Mon-Thu. Friday capped at 45 (15 per AE). Weekends never.

Total weekly throughput at Phase 2 steady state: 4 × 90 + 1 × 45 = **405 sends/week** = 4-6 weeks to reach 500-800 target. Faster ramp possible if engagement signal supports it.

## 11.5 Reply window definition

**21-day reply window starts at:** the timestamp the T1 Sequence step fires for each individual recipient (recipient-local 9am of their TZ on the scheduled send day).

For smoke: window opens Monday 9am recipient-local across 3 timezones; closes 21 days later. Smoke decisions can be made earlier:
- 72-hour PASS signal: ≥1 positive reply OR meeting booked within 72h → PASS sufficient for full Sun ramp (waiting full 21 days is unnecessary).
- 7-day PASS signal: cumulative ≥6.7% reply rate (≥1 of 15) → PASS for full Sun ramp.
- 21-day final tally: full reply + meeting rate logged for cohort retrospective.

## 11.6 Cross-territory edge cases

**Joe Kunz (GFiber, CA) — assigned Lucas (West):** GFiber is multi-state. Joe's title "Head of OSP Strategy & Systems" suggests national scope. **Verify Sat AM:** is Joe primarily west-coast based? If yes → Lucas/PT. If no → reassign to Mike East if HQ is Atlanta/national.

**Ashley Church (GFiber, UT) — same company:** GFiber dup. v3 already replaced Ashley Church with Joe Kunz (see 01-fifteen-final.md). Ashley Church REMOVED from cohort.

**Anthony Jelniker (Great Plains, CO) — procurement title:** v2 Patch 5 said EXCLUDE. v3 confirms: replaced with Joe Kunz (West) + maintains 5/5/5. Anthony Jelniker not in final 15.

---

# v3 cumulative state

| Killer Q | v1 | v2 | v3 |
|---|---|---|---|
| KQ1 (compensating control) | 4/4 PASS | 4/4 PASS | 4/4 PASS (unchanged) |
| KQ2 (halt + continuation) | 3/4 PASS | 4/4 PASS | 4/4 PASS (unchanged) |

| Dimension expected v3 score | v1 avg | v2 avg | v3 target |
|---|---|---|---|
| Prospect selection | 7.25 | 7.5+ | 8.5+ |
| Substrate cleanliness gate | 9.0 | 9.0 | 9.0 |
| Composition quality gate | 8.5 | 8.5 | 8.5+ |
| AE workflow + enrollment | 7.0 | 8.0+ | 8.5+ |
| Deliverability + reputation | 5.5 | 8.0+ | 8.5+ |
| **Send timing + cadence** | **5.5** | **6.3** | **8.5+** ← v3 target |
| Smoke pass/fail gate | 6.0 | 8.5+ | 8.5+ |
| Monitoring + kill switch | 6.5 | 8.0+ | 8.0+ |
| Learning extraction | 6.25 | 8.0+ | 8.0+ |
| Ramp realism | 6.25 | 8.0+ | 8.0+ |
| Operator ergonomics | 6.5 | 8.0+ | 8.0+ |

Expected v3 mean: **8.5-9.0** target. Median ≥9.0 plausible if Send timing lifts from 6.3 → 8.5+.

---

# Version history

| Version | Date | Author | Change |
|---|---|---|---|
| v3 (this patch) | 2026-06-12 06:30 EDT | Claude (Opus 4.7) Coordinator | Patch 11 only — Send timing + cadence completion. Mixed-TZ rule, batch stagger, Sat-vs-Mon rationale, day-of-week distribution, 21-day reply window definition, cross-territory edge cases. Targets median 9.0 bar. |
| v2 | 2026-06-12 05:30 EDT | Claude | 10 patches addressing v1 panel feedback. KQ2 fix + deliverability + comm chain + cohort-2 rule + audit-capacity + sender verification + sequence ID + warm-contact gate + webhook fallback + operator UX. |
| v1 | 2026-06-12 04:30 EDT | Claude | Initial spec. |
