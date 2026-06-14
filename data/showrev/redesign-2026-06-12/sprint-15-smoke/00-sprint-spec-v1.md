---
title: Sprint Spec v1 — 15-email smoke test (Sat 2026-06-13) + T1 ramp to 500-800
date: 2026-06-12 04:30 EDT
status: DRAFT v1 — Wave 7 cross-family judge panel will score against Sonnet's independent rubric
authored_by: Claude (Opus 4.7) Coordinator
inheritance: Wave 1-7 forensic + redesign work; engine survey + DB candidate survey overnight
review_window: Operator wakes Friday morning; reviews; we ship Saturday
scope: A-version (current pipeline + sprint workflow). B-version (Wave 6 redesign) runs in parallel.
---

# Read first

The Wave 7 panel surfaced exactly the data we'll generate here: a real cold-cohort send. The 15-email smoke is not theatre — it's the first empirical falsification test for the 8-12% reply hypothesis. Treat the data accordingly.

This Sprint Spec covers:
- **Phase 0 (Sat 2026-06-13):** 15-prospect smoke test
- **Phase 1 (Sun 2026-06-14 evening):** 20/AE = 60 prospects prod start
- **Phase 2 (Mon 2026-06-15):** 30/AE = 90 prospects
- **Phase 3 (Tue-Thu 2026-06-16 → ongoing):** ramp toward 500-800 total qualified ICPs

The spec is the methodology + gates + kill criteria. The 15 final prospects (after audit) live in companion file `01-fifteen-final.md`. The HS load + Sequence enrollment SOP lives in companion file `02-hs-enrollment.md`.

---

# Part 1 — Heilmeier 8 for this sprint

## 1. What are we trying to do?

Send 15 personalized cold emails Saturday — pure cold, no prior contact, distributed across 3 AEs by territory, with ZERO PROHIBITED-domain substrate citations and ZERO inference language — and use the results to decide whether to start Sunday-evening prod ramp (60 prospects) toward a 500-800 total target. Goal: validate the existing pipeline works on the long-tail cold surface (one of ShowRev's 4 product surfaces — the others being pre-show booth push, during-show capture, post-show 72-hour sprint).

## 2. How is it done today, and what are the limits?

| Approach | Limit |
|---|---|
| Existing v2 pipeline ships compositions automatically | Substrate contamination crisis surfaced last week (ZoomInfo cited in 6+ emails) — proved the always-on hallucination check doesn't catch contaminated substrate |
| 62 numbered gates exist | ~25-30 are theatre per forensic; the citation gate is disabled (`0`) in generalized-composer mode |
| Tim manually reviewed 182 compositions for craft | Quality check is craft-only, not accuracy/substrate cleanliness |
| Manual prospect-by-prospect operator review | Doesn't scale past ~50 prospects/day |

**The real limit:** the existing pipeline can produce craft-good emails but cannot guarantee substrate cleanliness. The 15-send must add a manual audit gate that catches what the pipeline misses.

## 3. What's new in this sprint's approach?

1. **Substrate cleanliness manual audit per prospect** — every citation traced to non-PROHIBITED domain BEFORE composition is enrolled. Catches the ZoomInfo problem at gate time.
2. **5-company hard exclusion** — companies the DB survey already flagged as touched by PROHIBITED-source citations are excluded from the 15 (and from Sun/Mon ramp until Pillar 4 ships).
3. **Email re-verification** — MillionVerifier re-runs on the 15 the day before send (verifications older than 7 days are stale).
4. **Operator + Tim co-review before ship** — every body re-read; if ANY body has inference language or banned pattern, halt that prospect.
5. **Pre-staged Sequence config** — AE sequences confirmed before Saturday morning; AEs each enroll 5 contacts in 15 minutes.
6. **Real cold-cohort N=15 dataset** — this becomes the first load-bearing empirical data for the 8-12% reply hypothesis the Wave 6 spec needs.

## 4. Who cares?

| Stakeholder | Why |
|---|---|
| Inorsa | 4 AEs need pipeline; smoke test green-lights prod ramp |
| The 15 recipients | They get a substrate-clean, persona-precise email instead of generic spam |
| Operator | Pilot quality is the apex; the smoke result either earns Sun-evening prod or surfaces a halt |
| Wave 6 redesign (B-version) | Real cold-cohort data feeds the empirical-grounding gap GPT-5 dissented on |
| Future clients | Smoke results become the first ShowRev case study |

## 5. What are the risks?

| Risk | Severity | Mitigation |
|---|---|---|
| One of 15 still has PROHIBITED citation despite audit | Critical | Two-pass audit (automated regex + manual eyeball) before HS load |
| Bounce rate >3% on 15 sends damages domain reputation | High | MV re-verify within 24 hours of send; companies on suppression-list excluded |
| Inference language slips through despite composer constraints | High | Manual eyeball of every body + composer-constraints regex re-run |
| AE doesn't enroll Saturday morning | Medium | Pre-brief Saturday 8am; operator can enroll on AE's behalf via UI if needed |
| Recipient flags spam | Medium | 15 is small N; if 1+ complaint, halt Sun ramp |
| Friday/Saturday low engagement window | Medium | Configure sequence to fire Monday 9am recipient-local OR send Sat afternoon (operator choice) |
| Operator wakes too late to ship Saturday | Low | Briefing + all-staged-ready means 15-min decision turnaround on wake |

## 6. How much will it cost?

| Item | Cost |
|---|---|
| Compose + audit (overnight) | LLM ~$5; Coordinator labor ~5 hours |
| MillionVerifier re-verify for 15 | ~$0.08 (15 × $0.005) |
| HubSpot API enrollment (15) | $0 (within plan) |
| Pillar 4 MV stretch (if shipped) | ~2-3 hours code; $0 additional |
| Phase 1 (Sun 60) + Phase 2 (Mon 90) + Phase 3 ramp | ~$200-400 total to reach 500-800 prospects |

Total sprint operational cost: **<$500 to reach 500-800 sends**.

## 7. How long will it take?

- **Tonight (Fri 4am → Fri morning):** spec + Sonnet rubric + judges + 15 audit + stage everything
- **Friday morning:** operator review + approve
- **Saturday:** AE enrollment + send 15
- **Sunday morning:** review smoke results; green light Sun-evening prod
- **Sunday evening:** 60 prod start
- **Monday:** 90 prod (Phase 2)
- **Tue → ramp:** continue until 500-800 reached, monitoring reply/bounce metrics each batch

Estimated total wall-clock to 500-800: **~2-3 weeks** assuming clean smoke + smooth ramp.

## 8. Mid-term and final exams

**Mid-term (Saturday EOD after 15 sends):**

| Metric | Pass | Fail |
|---|---|---|
| Bounce rate on 15 sends | <3% | >5% |
| Recipient spam complaints | 0 | ≥1 |
| 0 PROHIBITED-domain citations confirmed via post-send audit | YES | ANY |
| 0 inference-language bodies in shipped batch | YES | ANY |
| Operator review time per prospect (Sat morning) | <2 min | >5 min |
| AE enrollment friction | <15 min total across 3 AEs | >30 min |

**Final (Phase 3 ramp completes at 500-800 sends):**

| Metric | Pass | Fail |
|---|---|---|
| Cumulative reply rate (all touches) | >8% (top decile) | <5% |
| Cumulative meeting rate | >1.5% | <0.8% |
| Spam complaints | <0.1% | >0.3% |
| Bounce rate | <3% | >5% |
| Operator decision queue per cohort | <5 prospects flagged | >10 |
| Brain outcome events captured | 100% (auto-webhook) | <80% (manual catchup needed) |

**Kill criteria for each phase:**
- Smoke fail → halt Sun ramp; root-cause; respec
- Sun first 60 has 1+ spam complaint OR bounce >5% → halt Mon ramp
- Mon first 90 has 1+ spam complaint OR reply <2% → respec composer
- Any phase: 1+ contaminated PROHIBITED citation shipped → halt all, ship Pillar 4 minimum-viable, audit-backfill substrate

---

# Part 2 — Strategic reframe (heard from operator 2026-06-12 04:00 EDT)

**ShowRev is tradeshow-vertical B2B SaaS GTM intelligence.** The full product has 4 surfaces:

| Surface | Trigger | Goal | Sprint scope? |
|---|---|---|---|
| **Pre-show push** | Attendee list available | Book booth-meetings + private meetings | Out of scope |
| **During-show capture** | At the show | Listening device + conversation recording | Out of scope |
| **Post-show 72-hour sprint** | Show ends | Convert booth conversations → leads fast | Done for P1 (45 booth scans → 4 meetings) |
| **Long-tail cold** | Show attendees who DIDN'T visit booth | Cold prospect via 1-3 touches | **THIS SPRINT** |

Competitive position: there is NO purpose-built B2B SaaS tradeshow platform integrating all 4 surfaces. Apollo, Outreach, Clay, Lemlist all serve generic cold prospecting. We're defining a new category.

**Implication for this sprint:** the spec must produce data that doesn't just serve Inorsa-fiber but feeds the Wave 6 productization path. Every learning here becomes case-study material for client #2 (telecom equipment vendor) and client #3 (utility software vendor).

---

# Part 3 — Hard constraints (cannot violate)

These are inherited from canon (wiki-459-mirror.md + COMMS-DISCIPLINE-V2 + Tim feedback):

| Constraint | Source | Enforcement |
|---|---|---|
| Pitch verbatim: "We turn design data into permit-ready construction drawings. Quality control is built in, so builds keep moving." | Decisions log #026 | Composer template; CI regex assertion |
| Salutation: `[FirstName],` (comma only, NO greeting word) | wiki-459-mirror | composer-constraints.ts banned-pattern regex |
| Senders: Mike Rutski (East) / Nathan Dunn (Central) / Lucas Spencer (West, default) | Sovereign Operator 2026-05-01 | hubspot-loader.ts owner assignment |
| **Tom Marciano = NEVER a sender** (inert; booth asset only) | Same | hubspot-loader.ts banned owner assertion |
| Scope: drawings-only (Engineering + Data Suite); NO Validation; NO structural; fiber-only | wiki-459-mirror | composer-constraints.ts product-guard regex |
| Zero PROHIBITED-domain citations | Forensic 2026-06-09 + this sprint | Manual audit + (stretch) Pillar 4 DB CHECK |
| Zero inference language ("seems", "likely", "based on the article", etc.) | composer-constraints AI-tells | Banned-phrase check + manual eyeball |
| Word count: target 80w T1, ceiling 88w | Word Count Flex Rule v1.1 | Composer + manual count per body |

---

# Part 4 — Selection methodology (30 → 15)

## 4.1 Source pool

DB survey confirmed:
- **184 P2 cold-campaign prospects** in `sr_prospects` (campaign='P2')
- **175 of them have `composition_review = 'approved'`** in `sr_engine_output`
- **30 distinct-company candidates surfaced** via DB query (composition approved, P2, not previously sent, not loaded to HS, not enrolled, sorted by ICP score + send_confidence)

## 4.2 Hard exclusion (companies touched by PROHIBITED substrate)

DB survey flagged these companies with PROHIBITED-source citations in `sr_company_evidence`:

| Company | PROHIBITED source |
|---|---|
| PC Telcom | rocketreach.co/pc-telcom-profile (2 rows) |
| Buckeye Broadband | leadiq.com/c/buckeye-broadband (2 rows) |
| Ponderosa Telephone | zoominfo.com/c/ponderosa-telephone-co (2 rows) |
| Communication Network Engineering | zoominfo.com + leadiq.com (4 rows combined) |
| Network Connex | zoominfo.com citation (single row) |
| Ripple Fiber | zoominfo.com citation (single row) |
| United Tel Supply | zoominfo.com (2 rows) |
| MaxxSouth Broadband | zoominfo.com (2 rows) |
| Farmers Telecommunications | zoominfo.com (2 rows) |
| Danella, Cumberland Connect | additional PROHIBITED hits |

**Total ~12 companies excluded from smoke + Sun/Mon ramp until Pillar 4 substrate sanitization ships.**

Prospects from these companies in the 30-candidate pool that we exclude:
- Brendan Karchner (Buckeye Broadband) — EXCLUDE
- Jesus Loya (PC Telcom) — EXCLUDE
- Ben Lewis-Ramirez (Communication Network Engineering) — EXCLUDE
- Joel Guthridge (Network Connex) — EXCLUDE
- Brett Judnick (Ripple Fiber) — EXCLUDE

**5 hard exclusions. Remaining pool = 25 candidates.**

## 4.3 Selection criteria (in priority order)

| # | Criterion | Threshold | Source |
|---|---|---|---|
| 1 | NOT in 5-company exclusion list | hard | DB substrate audit |
| 2 | `email_verification_status` = `safe` OR re-verified `safe` this Friday | hard | MillionVerifier |
| 3 | `composition_review` = `approved` | hard | sr_engine_output |
| 4 | Body word count ≤88 (target ≤80) | hard | mechanical_check_passed |
| 5 | Zero banned-phrase matches per current composer-constraints | hard | Re-run check |
| 6 | Zero inference language ("seems", "likely", "based on", "appears", "may", etc.) | hard | Manual eyeball + regex |
| 7 | Persona distribution across 4 personas | soft | Diversity for smoke signal |
| 8 | Territory distribution (5 East / 5 Central / 5 West) | soft | sr_prospects.state |
| 9 | ICP score 100 preferred; minimum 85 | soft | sr_engine_output.icp_score |
| 10 | One prospect per company (already enforced) | hard | DISTINCT |
| 11 | Substrate citations re-audited per prospect (zero PROHIBITED across ALL their cited evidence rows) | hard | Per-prospect manual audit |

## 4.4 Manual audit methodology (the critical gate)

For each of the top 25 remaining candidates, I run this overnight:

1. **Pull substrate citations** for the prospect's company from `sr_company_evidence`
2. **Regex check** each `source_citation` against PROHIBITED domain list:
   - zoominfo, leadiq, rocketreach, signalhire, contactout, lusha, hunter.io, lead411, snov, salesintel
3. **If ANY hit** → exclude prospect
4. **Pull email body** from `sr_engine_output.email_body_t1`
5. **Verify EVERY claim in body** traces back to a non-PROHIBITED `sr_company_evidence` row
6. **Regex check body** against inference-language list:
   - "seems", "likely", "appears", "may have", "based on the article", "according to the source", "it looks like", "presumably", "perhaps"
7. **Regex check body** against composer-constraints ALL_BANNED list (re-run)
8. **Manual eyeball** for: vendor-coding ("I noticed", "I see"), title-case subject, em-dash count (max 2), participial density
9. **PASS** = all checks green AND body passes manual eyeball → eligible for 15
10. **FAIL** = any check red → exclude; document in audit trail

This audit happens overnight for all 25; I select 15 from the PASSED pool.

## 4.5 Final 15 selection logic

From the PASSED pool, pick 15 with:
- 5 East (Mike Rutski)
- 5 Central (Nathan Dunn)
- 5 West/spread (Lucas Spencer) — default for unassigned territory
- Persona distribution: aim for 4-5 Ops Builder + 3-4 Revenue Leader + 2-3 Technical Designer + 0-3 BEAD/Design (per audit availability)
- Within territory: prefer highest ICP score + most substrate-rich (largest evidence row count, all clean)

The final 15 are listed in companion `01-fifteen-final.md` AFTER overnight audit completes.

---

# Part 5 — Email re-verification gate

`email_verification_status` is NULL for all 184 P2 prospects per DB survey. We re-verify the 15 finalists with MillionVerifier before HS load.

- **Tool:** existing engine MV integration OR direct API call
- **Cost:** ~$0.08 for 15
- **Verdict map:** `safe` → ship; `risky` → operator decision; `bad`/`invalid`/`disposable` → exclude + pick alternate
- **Staleness rule:** if any verification timestamp older than 7 days, re-verify regardless of cached status

---

# Part 6 — Composition verification gate

For each of the 15 finalists, run these checks:

1. **composer-constraints `ALL_BANNED`** (verify-facts.ts + composer-constraints.ts):
   - 22 AI-tells ("I'm curious", "leverage", "seamlessly", etc.)
   - Tim kill-list ("worth 20 minutes?", "say the word", etc.)
   - Product guards (structural, Harmoni, tower, cellular)
   - Offshore guards (India, outsource)
   - Geographic guards (ungrounded "{State}'s {noun}")
   - Cold-cohort guards (no booth/show referents for cold prospects)
2. **Numeric anchors** — every number in body traces to substrate citation
3. **Bigram repeat** check (composer-constraints)
4. **Participial density** check (≤1 participial opener per body — VERMILLION marker 2)
5. **Sentence-length variance** check (low variance = AI tell)
6. **Reading age** check (≤grade 12)
7. **Pitch verbatim** — present if the pitch line appears; matches exactly
8. **Salutation lock** — `[FirstName],` comma-only, no greeting word
9. **Word count** ≤88 ceiling, 80 target
10. **Manual operator eyeball** Saturday morning before HS load

ANY fail on items 1-9 → re-compose or substitute prospect.

---

# Part 7 — AE assignment + Sequence enrollment workflow

Per engine survey: **HubSpot Sequence enrollment is AE-manual today** (not API). AEs open the sequence, select 5 contacts each, enroll as sender.

## 7.1 AE → owner ID mapping (from hubspot-loader.ts)

| AE | HubSpot Owner ID | Territory |
|---|---|---|
| Mike Rutski | 89105202 | East (NY, NJ, PA, VA, NC, SC, GA, FL, OH, KY, TN) |
| Nathan Dunn | 89105203 | Central (TX, OK, AR, LA, MS, AL, MO, KS, NE, IA, MN, WI, IL, IN) |
| Lucas Spencer | TBD (need operator confirm) | West (CA, OR, WA, AZ, NV, CO, NM, ID, UT, WY, MT, ND, SD) + default |

**Open operator decision:** Lucas Spencer HubSpot Owner ID is not in code. Operator confirm in `01-fifteen-final.md` review.

## 7.2 Pre-Saturday-morning prep (done overnight)

1. Load 15 finalists to HS via existing `hubspot-loader.ts`:
   - Sets contact owner to assigned AE
   - Populates per-paragraph properties for Sequence token interpolation (line-break preservation pattern from memory)
   - Sets `showrev_engagement_slug = 'inorsa-fiberconnect-2026-cold'`
   - Sets `showrev_outreach_cohort = 'fc2026-cold'`
   - Tags as `showrev_pilot_owner = true`
   - All 15 pre-validated before push

2. AE Sequence config (confirmed by operator overnight):
   - Confirm each AE has a "ShowRev Cold T1" sequence configured in HubSpot
   - Confirm sequence template uses ShowRev token properties (showrev_pre_show_t1_subject, body-paragraph properties)
   - If missing: operator + I configure Saturday morning before 9am

3. AE briefing email (drafted overnight, sent Saturday morning):
   - "Mike, here are your 5 cold smoke prospects for ShowRev T1 sequence. Enroll all 5 before EOD Saturday. Don't edit subject/body — sequence template is operator-approved."

## 7.3 Saturday morning workflow

| Time | Actor | Action |
|---|---|---|
| 7am ET | Coordinator | Sat-morning briefing posted; 15 staged in HS |
| 8am ET | Operator | Reviews briefing + 15 final; approves or substitutes |
| 8:30am ET | Operator | Sends AE briefing email (or has me send) |
| 9am ET | AEs | Receive briefing; ~15-min each to enroll 5 contacts in their sequence |
| 10am ET | All AEs enrolled | Sequence fires per its config (immediate OR Monday 9am — operator decides) |
| Sat-Sun | Coordinator | Monitor bounces every 6 hours |

## 7.4 If API-based enrollment becomes available

HubSpot Sequences API exists per memory (`reference_hubspot_sequences_api.md`). It's available but with constraints (no deferred enrollment, no draft API, line breaks stripped in tokens → why we use per-paragraph properties). For 15 prospects, AE manual enrollment is simpler. **For Sun-Monday ramp at 60-90 prospects, API enrollment becomes worthwhile** — defer that build to Sunday afternoon between smoke and prod ramp.

---

# Part 8 — Send timing + monitoring + rollback

## 8.1 Send time decision

Two options, operator decides Saturday morning:

| Option | When | Pro | Con |
|---|---|---|---|
| A (recommended) | Monday 9am recipient-local | Higher open rate (Wave 4 send-time research) | 2-day delay from enrollment to send |
| B | Saturday afternoon recipient-local | Faster smoke turnaround | Lower open rate; Saturday B2B inbox dead |

Recommendation: **Option A (Monday 9am)** for smoke. Trades 2 days latency for the right send-time + cleaner data signal.

## 8.2 Monitoring during send window

| Signal | Check frequency | Action |
|---|---|---|
| Bounce events (HubSpot Sequence dashboard) | Every 6 hours | If any single batch shows >3% bounce → halt that AE's remaining sends |
| Spam complaint (HubSpot + recipient direct) | Real-time alert if possible | Halt all sends if ≥1 within first 100 prospects |
| Reply intent (positive / neutral / negative) | Daily review | Classify; feed Brain outcome events |
| Open + click rate | Daily | Track for benchmark; doesn't gate halt |
| AE feedback (qualitative) | EOD Monday | Tim + 3 AEs each share 1-2 reactions |

## 8.3 Rollback mechanism

If kill criteria fire, the rollback path:
1. Halt sequence in HubSpot (operator OR Coordinator action)
2. Notify AEs to STOP manual enrollment in their queue
3. Identify root cause (composition? substrate? deliverability?)
4. Patch + re-validate before re-starting
5. Update Brain outcomes with halt-reason metadata

**Rollback authority:** operator only. Coordinator surfaces; operator decides.

---

# Part 9 — Phase gates + kill criteria

## Phase 0: Smoke (Saturday)

| Gate | Pass criteria | Fail action |
|---|---|---|
| Pre-load audit | Every 15 passes substrate + composition gates | Halt; re-pick from pool |
| HS load | All 15 successfully loaded with correct owner | Investigate failures |
| AE enrollment | All 3 AEs enroll their 5 by EOD Saturday | Operator enrolls remainder |
| Bounce window | <3% across 15 | Halt Sun ramp; investigate |
| Spam complaint window | 0 | Halt all sends; investigate |
| Post-send audit | 0 PROHIBITED-domain citation across all 15 shipped bodies | Critical incident; halt + post-mortem |

## Phase 1: Sunday prod start (20/AE = 60)

| Gate | Pass criteria | Fail action |
|---|---|---|
| Smoke green from Phase 0 | All Phase 0 gates passed | Don't start Phase 1 |
| Pillar 4 MV shipped (stretch) | DB CHECK constraint enforced | If not shipped, run manual audit on 60 prospects (cost: ~3 hours operator + Coordinator time) |
| AE bandwidth confirmed | 3 AEs available Sun evening for ~30 min each | Defer to Monday |
| Cohort selected | 60 prospects from 184 P2 pool (after exclusions) | Pull from confirmed 184-pool |
| Pre-load audit (auto + spot-check) | 100% auto-pass; 10% spot-check pass | Halt; respec |

## Phase 2: Monday ramp (30/AE = 90)

| Gate | Pass criteria | Fail action |
|---|---|---|
| Phase 1 first-batch results | Reply ≥2% within Mon AM OR no spam OR bounce <3% | Halt; review |
| AE Sequence template performance | No AE flags template as broken | Pause that AE's queue; investigate |
| Substrate cohort audit | Remaining cohort verified clean per Pillar 4 OR manual | Operator decision |

## Phase 3: Ramp toward 500-800

| Gate | Frequency | Pass criteria | Fail action |
|---|---|---|---|
| Daily bounce review | Daily | <3% rolling 7-day | Throttle batch size |
| Reply rate review | Per 50 sends | >5% (above industry avg) | Continue; below = respec composer |
| Spam complaint | Real-time | 0 per batch | Halt; investigate |
| Brain outcome capture | Weekly | 100% of replies classified | Manual catchup if missed |
| AE feedback | Weekly | Sequence template still loved | Update if needed |

## Kill criteria

| Trigger | Action |
|---|---|
| 1+ PROHIBITED-domain citation shipped | Halt all sends; ship Pillar 4 MV; backfill audit |
| 1+ spam complaint in first 100 sends | Halt; root-cause; only resume after composition + substrate verified |
| Bounce >5% in any 50-send window | Halt; re-verify cohort emails; throttle |
| Reply rate <2% across first 200 sends | Halt; respec composer using real reply data |
| AE feedback that template is hurting their reputation | Halt that AE's queue; respec |

---

# Part 10 — Learning extraction (what data we capture)

Per Wave 6 Brain compounding-loop thesis: every send must produce data that improves the next batch.

| Data point | Captured via | Stored in | Used for |
|---|---|---|---|
| Send event (timestamp, prospect, AE, sequence) | HubSpot Sequence API | sr_sent_emails (currently 0 rows!) | Audit trail |
| Bounce event | HubSpot webhook | sr_bounce_events (currently 0 rows!) | Cohort cleaning + AE notification |
| Open / click | HubSpot tracking | sr_outcomes | Pattern signal |
| Reply (positive / neutral / negative) | HubSpot + manual classification | sr_outcomes + sr_brain_outcomes | Brain pattern update |
| Meeting booked | HubSpot deal association | sr_outcomes + sr_brain_outcomes | Phase 3 success metric |
| AE qualitative feedback | Manual Slack/email collection | sr_review_notes | Composer rule update |
| Operator decisions (halt, substitute, exclude) | sr_review_actions (currently 0 rows!) | Audit + future training | Pattern discovery |

**Note:** sr_sent_emails, sr_bounce_events, sr_review_actions, sr_dnc_log are all empty per DB survey. The pipeline writes some of these via webhook but evidently webhooks aren't wired or not firing. This is a **HARD pre-Phase 1 dependency** — must verify webhook wiring before Sun ramp.

---

# Part 11 — Risks + mitigations

(Beyond Part 1.5 — operational risks specific to ramp.)

| Risk | Severity | Mitigation |
|---|---|---|
| sr_sent_emails empty = no audit trail | Critical | Verify HS webhook wiring Saturday morning before send; if broken, fix or manual logging |
| AE Sequence template doesn't render tokens correctly (line breaks stripped) | High | Test on one prospect Saturday morning before enrolling remaining 14 |
| Lucas Spencer owner ID missing from code | Medium | Operator confirms ID Saturday morning; hardcode in hubspot-loader if missing |
| MV credits exhausted | Low | Verify balance Friday evening; $5 covers 1000 verifies, very low risk |
| HubSpot daily send cap exceeded | Low | 15 well under any cap; ramp respects per-AE cap |
| Brain outcome ingest cron not firing (forensic finding) | High for ramp, not smoke | Verify cron config Sun before ramp; manual ingest if needed |
| AE doesn't follow pitch verbatim (edits before enrollment) | High | Brief AEs: "do not edit subject/body — template is operator-approved" |
| Operator overbooked Saturday morning to review | Medium | Briefing self-contained; <15 min decision time |
| Inference language in body slips through composer-constraints | High | Two-pass manual eyeball + new explicit inference-regex pre-flight |

---

# Part 12 — Killer question

**Has the proposed 15-prospect cohort been audited at the per-citation level for substrate cleanliness, with a complete audit trail naming the specific evidence rows checked and the specific decision rule applied — such that a non-author reviewer could reproduce the audit on the next 60-prospect batch?**

**Answer: YES — provided the overnight audit completes.**

This sprint's killer question is operational, not strategic. The strategic killer (the Wave 6 one) was "has the operator used the system end-to-end on cold." The sprint's killer is "can we ship clean substrate at gate time when the pipeline can't guarantee it structurally."

The audit trail (in `03-audit-trail.md` after overnight work) per prospect documents:
- Source citations queried from sr_company_evidence
- PROHIBITED regex matches (expected: zero)
- Body claims traced to substrate rows
- Inference-language regex matches (expected: zero)
- composer-constraints check (re-run, expected: pass)
- Manual eyeball verdict
- PASS / FAIL with reason

If non-author reviewer (Tim, second operator, future Claude session) can reproduce the audit on Sun's 60-prospect batch → PASS.

If the audit methodology is implicit / undocumented / depends on Coordinator's memory → FAIL.

---

# Part 13 — Open operator decisions (must answer before Saturday ship)

| # | Decision | Default if no answer |
|---|---|---|
| 1 | Send time: Monday 9am recipient-local (Option A) OR Saturday afternoon recipient-local (Option B) | Option A (Monday) |
| 2 | Lucas Spencer HubSpot Owner ID | Coordinator queries HS Saturday morning |
| 3 | Pillar 4 MV — ship tonight (stretch) OR defer to B-version | Defer; manual audit covers Phase 0+1 |
| 4 | API-based Sequence enrollment for Sun/Mon ramp — build Sunday afternoon? | Yes — manual enrollment doesn't scale past 60 |
| 5 | Anthony Jelniker (Sr Director Procurement, Great Plains) — include in smoke or exclude (persona mismatch flagged Wave 1)? | Exclude (persona mismatch; not Ops Builder or Revenue Leader) |
| 6 | EU recipients in smoke or ramp? | Exclude until counsel reviews GDPR consent basis |
| 7 | What does "ramp toward 500-800" actually cap at? | 500 conservative; 800 stretch; operator decides per batch |

---

# Part 14 — What the spec explicitly does NOT cover

- **Wave 6 redesign (B-version):** 14-day Pillar build runs in parallel. Spec covers A-version only.
- **T2/T3 multi-channel:** smoke + ramp = T1 only. T2 LinkedIn / T3 voicemail = Wave 6 Phase 2 work.
- **Multi-tenant architecture:** Inorsa single-tenant for this sprint. Tenant isolation = Wave 6 Phase 3.
- **CAN-SPAM physical address audit:** assume existing Inorsa template includes; spot-check Sat AM before ship.
- **GDPR EU recipient handling:** skip EU prospects until counsel reviews.
- **Reply-intent classification automation:** human classifies for smoke; automate during ramp (Wave 6 work).
- **Federated cross-tenant Brain learning:** out of scope.
- **AE LinkedIn touch workflow:** out of scope until Wave 6 Phase 2.
- **Microsite-as-a-service rebuild:** existing microsite continues; rebuild = Wave 6.

---

# Part 15 — Companion artifacts

| File | Status | Purpose |
|---|---|---|
| `MORNING-BRIEFING.md` | DONE (v1) | Exec summary + decisions for operator wake |
| `00-sprint-spec-v1.md` | THIS FILE | Methodology + gates + kill criteria + killer question |
| `01-fifteen-final.md` | OVERNIGHT | 15 prospects audited + composition preview + AE assignment |
| `02-hs-enrollment.md` | OVERNIGHT | HS load SOP + Sequence enrollment SOP for AEs |
| `03-audit-trail.md` | OVERNIGHT | Per-prospect audit log (substrate + composition + MV + verdict) |
| `04-pillar4-mv.md` | STRETCH | If shipped: DB CHECK constraint + write-time domain filter |
| `05-wave6-part1-tradeshow-reframe.md` | STRETCH | Wave 6 spec Part 1 rewritten for tradeshow-vertical 4-lever |
| `06-judge-results.md` | AFTER WAVE 7 SPRINT | Sonnet rubric scoring summary from 4-judge panel |

---

# Version history

| Version | Date | Author | Change |
|---|---|---|---|
| v1 | 2026-06-12 04:30 EDT | Claude (Opus 4.7) Coordinator | First draft. Methodology + gates + killer question. Companion artifacts queued. Sonnet rubric author dispatched. 4-judge panel runs once spec + rubric in hand. Iterates to 9/10 median. |
