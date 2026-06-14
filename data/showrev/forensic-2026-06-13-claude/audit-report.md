---
title: ShowRev P2 System — Forensic Audit Report + Recommendations
date: 2026-06-13 EDT
status: COMPLETE
authored_by: Claude (Opus 4.7), session pm-build-fix
session_artifacts:
  - data/showrev/forensic-2026-06-13-claude/system-schematic.html (visual)
  - data/showrev/pipeline-backlog.md BL-016 (Inorsa-validates gate filing)
  - sr_company_evidence rows nick_jtbd_01 through nick_jtbd_14 (Nick promotion)
purpose: Single document covering (a) what's actually built, (b) what works, (c) what's broken, (d) what's never been built, (e) what to fix vs rebuild vs re-orchestrate, mapped to the project's greater objective. Successor to forensic-2026-06-12 + COLD-PROSPECTING-FIRST-PRINCIPLES synthesis.
---

# Audit Report — ShowRev P2 system for Inorsa FC2026 cold prospecting

## Executive summary

The system is more built than it looks from the outside and less wired than it should be on the inside. The composer is producing defensible, recipient-recognizable, company-specific emails when substrate is rich (proven: Empower Broadband sample + one second sample on a DNC-protected prospect). The /ops Mission Control portal exists with real filters, bulk actions, and 274 prospects in flight. The tiered judge + composer-constraints + stat-library defenses are real. The schema is sane.

The headline issues are not where I thought they were yesterday. The biggest gap is not substrate contamination — it is **operational observability**. The dedicated audit tables (`sr_pipeline_runs`, `sr_emails`, `sr_prospects.hubspot_contact_id` backfill, `sr_microsites.status='live'`, `sr_prospects.operator_go=true`) are essentially empty in production. We have been shipping output for weeks with almost no audit trail in the audit-trail tables.

The substrate-contamination story is real but narrower than the COLD-PROSPECTING-FIRST-PRINCIPLES synthesis suggested. The composer reads Nick's voice and the canonical Inorsa framing through prompt templates in `personas.ts` and the D5 intent block — not through DB queries. Wiring Nick into the DB (which we did today as Option B) is the right strategic move, but the composer is not currently lying about Inorsa product capabilities on the recent samples. The hallucination risk is regression-shaped, not actively-breaking.

Overall forensic grade: **51/100 build quality, A-minus fixability.** Down two points from yesterday because observability is worse than I credited. The fixability stays high because the gaps are well-defined, the fix paths are short, and most of them require no new strategic decisions.

---

## The greater objective and how we measure success

Stated objective (operator-direct, locked across sessions): better cold prospecting than the top 0.01% of B2B SaaS AEs. Target metrics:
- 15-25% reply rate on T1
- 3-6% meeting-booked rate
- Sustainable over the 800-prospect FC2026 P2 cohort without trust degradation
- Two non-negotiable apexes: **verified data** in every body + **verified email addresses** for every send

Path to winning runs through four binding capabilities:
1. **Measure outcomes** (observability) — we cannot improve what we cannot see
2. **Know what is true** (verified substrate) — every fact in every body defensible from a trusted source
3. **Close the loop** (learning) — bounce + reply data flows back into composer choices
4. **Scale humans** (portal absorbs review load) — Tim's craft bandwidth + operator's review bandwidth are the binding constraints

This report's recommendations are organized against those four capabilities.

---

## What's actually built (corrected from yesterday's schematic)

### The production pipeline (v2 substrate-tier-first)

Located at `src/showrev/m1-email-find/evidence-tiering/run-pipeline-v2.ts`. v1 (`run-pipeline.ts`) is retired-but-on-disk; not the operational path. The 62-gate inventory at `docs/showrev/gates-inventory-2026-06-09.md` documents v2 only.

Twelve phases, ICP gate through HS load:

1. CSV parse — handles quoted commas (caught a 25% mis-parse bug 2026-06-11)
2. ICP gate — regex first, Haiku fallback. Deliberate inclusivity bias ("if uncertain, classify as fiber_operator with low confidence")
3. Email finder waterfall — domain resolver → pattern detector → SMTP probe → MillionVerifier → confidence color
4. Evidence orchestrator (3-phase: pull / gap-fill / tier+emit) — parallel substrate + Apollo + association + FCC BDC fetches, deterministic source-kind → tier mapping
5. Composer — `specific-composer` (≥3 USE_DIRECTLY+USE_TO_SHAPE claims) or `generalized-composer` (industry framing only). composer-constraints.ts gates banned phrases via 5 regex categories, 22 AI-tell patterns, 10 Tim kill-list patterns, DL-199 PNAS/VERMILLION checks, Flesch-Kincaid, citation gate. Best-of-N retry (4 attempts max, accept-with-warn on 4th failure)
6. Tiered judge — T1 mechanical regex, T2 Tim-style edit-pattern, T3 Gemini quality + always-on hallucination check
7. Send-confidence (uncalibrated v1.0) — 3 axes (ICP / Email / Substrate), composite, hard `email_score=0 → CANNOT_SEND` rule
8. Microsite composer (the evidence-tiering one — there are two with the same filename) — finding/bloom content for prospect-facing brief
9. Supabase write to `sr_engine_output` + `sr_dossiers` + `sr_microsites` (all draft)
10. Pre-load verify (12 BLOCKING checks: EXISTING_HS_CONTACT, SPF/DKIM/DMARC, dedup, bounce history)
11. HubSpot loader (legacy upsert by email — 2-call create+associate, single-call optimization queued per GOSPEL)
12. AE manually bulk-enrolls into HS sequence via UI (API enrollment ratified-out in POST-PORTAL v6)

### Side modules

- **Email finder** (12 files in `email-finder/`) — Apollo bulk rescue, peer pattern, SMTP, MV. Solid.
- **Deliverability** (`confidence-gate.ts`, `circuit-breaker.ts`, `bounce-monitor.ts`) — wired into v1; v2 uses Tiered Judge + post-portal v6 Bounce Monitor
- **Watcher** (`watcher.ts` + `watcher/engagement-feed.ts`) — adaptive 30s/60s/5min polling, MIN(sequence_enrolled_at) cutoff
- **Microsite Next.js app** — routes: brief, assess, compare, pipeline, report, ops, insights, booked, debug, [slug], api. Deployed at `showrev-microsites.vercel.app`
- **Stat library** (`stat-library/`) — verified-stat lookup with zod-validated sidecars, hard 24-month staleness cutoff, no silent vendor fallback. Maps 6 PS composition buckets → 6 topic tags
- **Brain** (`brain-agentdb.ts`, `brain-ingest.ts`) — AgentDB integration. Read-side wired; write-side mostly inactive (Brain tables 95% empty)
- **Cross-model judge** (`cross-model-judge.ts`) — Gemini/GPT-5/Grok/DeepSeek panel for medium+ deliverables
- **/ops Mission Control portal** — 3 tabs (Review/Pipeline/Report), filters across pipeline stage / signal / persona / status / AE / company / verdict, bulk Approve All Passing action

### Database — what exists

| Group | Tables (active rows) |
|---|---|
| Core workflow | `sr_prospects` (274), `sr_engine_output` (526 / 182 distinct), `sr_dossiers`, `sr_microsites` (182, all draft), `sr_emails` (**0**), `sr_pipeline_runs` (**0**), `sr_outcomes` |
| Substrate | `sr_brain_substrate` (6,512), `sr_company_evidence` (1,522 — including 14 Nick rows landed today), `sr_company_contacts` (620), `sr_fact_checks` (0), `sr_entity_resolution` |
| Brain (10 tables) | `sr_brain_outreach_patterns` (8), `sr_brain_verify_items` (5), `sr_brain_dossiers` (3), `sr_brain_outcomes` (2), `sr_brain_competitors` (1), the other 5 all 0 |
| Microsite/review | `sr_microsite_events` (332), `sr_review_actions` (0), `sr_review_notes` (12), `sr_review_timestamps` (0), `sr_insight_reviews` (2), `sr_decision_trace` |
| Post-portal v6 | `sr_bounce_events` ✓, `sr_dnc_log` ✓, `sr_email_experiments` ✓, `sr_hs_api_calls` ✓ — exist but write-side wiring unverified |
| Not built | `sr_cohort_status` (spec'd in send-confidence), `sr_source_domains` (forensic-2026-06-12 proposal — dropped) |

24 tables under RLS hardening; anon role can only SELECT `sr_microsites WHERE status='live'` + INSERT `sr_microsite_events`. **Important**: no microsite has `status='live'` today, so prospect-facing pages are not reachable anonymously.

---

## What's working — do not touch

Eleven concrete capabilities, each verified by code-read or DB query this session:

1. **Tiered judge cascade** (851 lines) — T1 mechanical, T2 Tim-style, T3 Gemini quality + always-on hallucination check, decision rule maps to ship/retry/flag/flag-hallucination
2. **Composer constraints** (861 lines) — 5 banned-phrase categories, DL-199 hardening, citation gate, best-of-N retry with retry-hint passing all violations
3. **Evidence orchestrator** (3-phase pull→gap-fill→tier+emit pattern) — parallel substrate + Apollo + association + FCC BDC, second-best query loop for thin categories
4. **Email finder waterfall** (12 modules) — domain resolver, pattern detector, peer pattern, SMTP, MV, Apollo fallback, tactic eval
5. **Stat library** — zod-validated sidecars, hard staleness cutoff, no silent vendor fallback, deterministic byte-stable sort. Phase B integration with PS variants prevents fabricated-stat regression
6. **PS variant rotation** — 6 variants, deterministic hash selection per persona+touch+company, stat-required variants fail to fallback (no fabricated numbers)
7. **CSV column-shift fix** — quoted-comma handling caught a 25% mis-parse bug
8. **RLS hardening** — anon role locked to live microsites + page-view inserts, service role for backend
9. **Send-confidence v1.0** — explicitly labeled uncalibrated, 3-axis composite, hard CANNOT_SEND override on email_score=0, matches spec
10. **The composer is producing good output on rich substrate.** Empower Broadband sample: subject "BEAD mandate, drawings behind schedule", body opens with verified $35M BEAD award + 30,000-home footprint, uses canonical Inorsa pitch verbatim, mechanical_check_passed=true, Tim-reviewed, send_confidence composite 86.7
11. **The /ops portal Mission Control** is a real CRM-style surface — 274 prospects with filters across 7 dimensions, header counts (4 Send / 9 Hold / 1 Reject / 5 DNC / 200 Pending / 18 needing attention), bulk Approve All Passing (209) action

---

## What's broken or partial

### Substrate-tier classification has no URL-domain awareness (the original headline gap)

Where it fails: `sr_company_evidence` rows are tagged by `source_kind` (how harvested) not URL domain. A prohibited-domain URL pulled via dated web search lands as `web_research_dated → USE_DIRECTLY`. Today's count: 21 confirmed PROHIBITED-domain rows plus ~17 marginal rows (personal social posts, secondary finance aggregators). The classifier exists (`verify-facts.ts`) but is stranded from the v2 path.

### Observability has been hollow

| Audit surface | Expected | Actual |
|---|---|---|
| `sr_pipeline_runs` writes | Every pipeline invocation logs start, config, status, summary | **0 rows ever** |
| `sr_emails` persistence | Per-send record with subject/body/judge_verdict/human_edited | **0 rows** — emails live only in `sr_engine_output.email_*_t1/2/3` |
| `sr_prospects.hubspot_contact_id` backfill after HS load | Populated for the 18 Sunday-smoke contacts | **0 prospects with HS id** |
| `sr_microsites.status='live'` | Live after operator approval gate | **0 of 182** |
| `sr_prospects.operator_go=true` | Explicit operator-go before HS load | **0 ever** |
| `sr_company_evidence.source_date` | Populated where the citation has a date | **85% null** — staleness check cannot fire |
| `judge_feedback_loop_attempts` on `sr_engine_output` | >0 when the recompose loop runs | **0 on every row** — the loop is built but not exercising |

The infrastructure is wired into schema, never wired into write-side code. This is the single biggest gap blocking the "measure outcomes" capability.

### Gates that are designed but unspecified or inconsistent

- **Tim-approval reset on email-confidence flip** — Gap C from yesterday. Neither POST-PORTAL v6 nor post-approval v1 addresses it. One historical prospect shipped Tim-approved + red. **No spec to crib from; must be invented.**
- **ICP gate inclusivity bias** — Haiku told "if uncertain, lean fiber_operator with low confidence." 36/36 sampled rows passed. "ICP pass" reads stronger than the column means.
- **Email-verification field write side** — `email_confidence`, `verification_report`, `mv_quality`, `email_verified`, `email_verification_status` null on most rows despite the email-finder computing these. Write side appears to drop them.
- **`sr_prospects` operator_go field** — never used in production. The portal Approve All Passing flow doesn't set it.

### Documentation contradictions affecting compose-time behavior

- `data/showrev/inorsa-source-of-truth.md` line 65 + 70 describe a "Validation Suite" feature that "catches errors before permit submission" — directly contradicts lines 141 + 153 + canon. If the composer reads this doc at compose time, it gets mixed signals.
- `canon/sources/inorsa-product-truth-nick-2026-06-04.md` (status CANON) has a 5-phrase kill-list that does NOT exist in `composer-constraints.ts` ALL_BANNED arrays. Hard gate missing.

### Tim approval is a craft signal, NOT a fact signal — and downstream systems may be reading it wrong

Operator-confirmed 2026-06-13: Tim reviewed all ~180 initial P2-cold emails — including emails that carried known hallucinations and factual errors — and **approved all of them** for quality of composition and tone. Tim's review is craft + voice, by design. He does not see substrate; he does not verify claims. This is documented in the operator-review-roles memory.

The system's `composition_reviewed_by='Tim'` field, when read in isolation, can be misread by an operator or by a downstream gate as "approved for send." It is not — it is "approved for voice." Any send-gating logic that treats Tim approval as a fact-verification signal is structurally wrong. Today's send-confidence formula does not over-read this; the operator-review surface in `/ops` may.

**Implication for the fix plan:** F6 (Tim-approval reset rule) is necessary but not sufficient. The deeper move is to **rename or annotate** the `composition_reviewed_by` column to make the craft-only semantic explicit (e.g., `craft_reviewed_by` + a separate `facts_reviewed_by` field). Add to F6 as F6b in the build plan.

### P1 production data was wiped; restore lives in a separate Supabase project

Operator-confirmed 2026-06-13: a prior agent erased all P1 send-related data from the production Supabase (`slttpknnuthbttjuzrnz`). The state-before-erase was captured in a separate Supabase project called **P1 Restore** (`joxzazwuehhvywanyrze.supabase.co`).

I queried the P1 Restore DB this session:
- 31 prospects total (Attendee: 3, Cold: 26, send_status='send': 2)
- 5 sr_engine_output rows
- 4 sr_microsites — **all status='draft'**

The 4 draft microsites are the highest-urgency item that came out of today: P1 recipients who received an email last week and click the microsite link in their body **right now hit nothing** under anon RLS (which only exposes `status='live'`). This is a live trust-degradation event happening every day until restore-and-flip.

P1 send volume in HubSpot (operator screenshot): 45 contacts across 3 AE static lists (Lucas Spencer Sends 7, Nathan Dunn Sends 14, Mike Rutski Sends 24), all created Jun 2 2026 by the operator. So 45 prospects sat in HS sequences and have engagement data (opens, clicks, bounces, replies, meetings) ready to be pulled.

**MCP access caveat:** my preliminary HubSpot search via `showrev_engagement_slug=HAS_PROPERTY` returned 0 results, suggesting either (a) the property name in production differs from documented, (b) custom properties are not indexed for HAS_PROPERTY filter in our HS plan tier, or (c) the contacts use a different ShowRev tag. Next session should resolve this before attempting performance analysis from HS engagement properties.

### Ghost code

- `verify-facts.ts` (~336 lines) — the stranded fix
- `refutation.ts` — self-confessed "intentionally NOT yet wired into run-pipeline-v2.ts"
- `pipeline.ts → premium-pipeline.ts → run-pipeline.ts` — triple-deprecation cascade still on disk
- Two `microsite-composer.ts` files in sibling directories (one is legacy)

---

## What's never been built (and matters)

1. **No URL-domain trust classifier wired into substrate ingest** — `verify-facts.ts` exists but is stranded
2. **No substrate distillation layer** — the Brain tables `sr_brain_market_signals` (0), `sr_brain_bellwethers` (0), `sr_brain_patterns` (0) were spec'd for synthesized industry truths; never populated
3. **No `getOperatorTruths()` composer hook** — the 14 Nick rows landed today are inert until this code change ships
4. **No send-confidence calibration loop** — operator-ranks-10 → least-squares back-solve required by spec; not built
5. **No microsite status='live' promotion path** — RLS blocks anon access; manual flip needed but no UI for it
6. **No Slack-to-substrate pipe** — Nick clarifications captured manually only (operator-confirmed pattern)
7. **No `sr_cohort_status` table** — spec'd in send-confidence; not deployed
8. **No live `sr_emails` write on send** — sr_emails table empty; per-send records live only in `sr_engine_output`
9. **No Tim-approval-reset rule** — gap C, no spec
10. **No substrate source breadth beyond five ingest streams** — operator's directive named gov/podcasts/consultants/tradeshows/trade-group annual objectives; the KB markdown references 67 domains but only 5 sources are actually ingested

---

## Forensic dimensions — calibrated scoring

| Dimension | Score | Plain English |
|---|---|---|
| Architecture coherence | 7 / 10 | 62-gate inventory + v6 spec + ratified decisions are real architectural discipline. v1 retired-on-disk is housekeeping. |
| Code wiring | 6 / 10 | Better than yesterday — soft enforcement via prompt templates carries Nick's voice. verify-facts.ts strand + refutation unwired remain. |
| Dead-code hygiene | 5 / 10 | v1 retired-but-present; 2 microsite-composer files; deprecated cascade still on disk |
| Gate consistency | 5 / 10 | Tim-approval/email-red reset unspecified anywhere; ICP-pass overclaim |
| Data integrity | 3 / 10 | **Worse than yesterday.** Audit tables empty, dead int column, email-verify null-leak |
| Verification rigor | 7 / 10 | Tiered judge + composer-constraints + stat-library remain strong |
| Source provenance | 4 / 10 | Same diagnosis as yesterday |
| Observability | 3 / 10 | **Much worse than yesterday.** sr_pipeline_runs and sr_emails are empty — we are flying without telemetry |
| Operability | 6 / 10 | Best-of-N retry, idempotent HS load, pre-load verify, Apollo credit tracker |
| Spec ↔ implementation | 5 / 10 | Send-confidence partial; sr_cohort_status not built; HS single-call not adopted; KB-to-DB not done |
| **Total** | **51 / 100** | Slightly lower than yesterday, redistributed: substrate worse, observability much worse, architecture and wiring better than I credited |

---

## Recommendations — fix vs rebuild vs re-orchestrate, mapped to objectives

Three buckets. **FIX** = small, narrow, no strategic-decision reopening, ship within days. **REBUILD** = substantial code work that closes a structural gap. **RE-ORCHESTRATE** = process/workflow change, not code.

### FIX (Week 1 — ship before Sunday-smoke result lands)

| # | Item | Effort | Capability gained |
|---|---|---|---|
| F1 | Add 5 kill-list phrases to `PRODUCT_GUARDS` in `composer-constraints.ts` (BL-016) | 20 min | Verified data — eliminate Inorsa-validates-inputs regression class |
| F2 | Edit `inorsa-source-of-truth.md` lines 65 + 70 to align with canon | 10 min | Verified data — remove contradictory signal at compose time |
| F3 | Wire `verify-facts.ts` URL-domain classifier into `substrate-query.ts` write path; add `domain_tier` column to `sr_company_evidence` + `sr_brain_substrate` | 5-6 hrs | Verified data — prohibited-domain rows blocked at ingest |
| F4 | Backfill `source_date` on the 1,288 null rows in `sr_company_evidence` where citation contains a parseable date | 1 hr script | Verified data — staleness check fires |
| F5 | Backfill `sr_prospects.hubspot_contact_id` for the 18 Sunday-smoke contacts; wire forward into `smoke-load-2026-06-11.ts` so future loads backfill automatically | 30 min | Measure outcomes — DB knows what's in HS |
| F6 | Add Tim-approval reset rule: when `confidence_color` flips to red, clear `composition_reviewed_by` and surface in `/ops` for re-review | 1 hr | Verified data — Gap C closed |
| F7 | Switch `hubspot-loader.ts` from 2-call create-then-PUT to single-call `associations` array (per GOSPEL) | 45 min | Scale humans — 30% fewer HS API calls; faster smoke loads |
| F8 | Wire `sr_pipeline_runs` write on every pipeline invocation (start, config, status, summary) — currently 0 rows | 1 hr | Measure outcomes — pipeline telemetry exists |
| F9 | Wire `sr_emails` write on every composed-then-shipped touch — currently 0 rows | 2 hrs | Measure outcomes — per-send audit trail exists |
| F10 | Microsite status promotion: add an /ops portal action that flips `sr_microsites.status` to 'live' when operator approves the prospect; gate HS sequence enrollment on at least one live microsite per prospect | 2-3 hrs | Verified data + Scale humans — prospect-facing pages are actually reachable |

Total: ~15 hours of focused work. Sunday smoke + the next two cohorts ship safely.

### REBUILD (Week 2-3 — close the structural gaps)

| # | Item | Effort | Capability gained |
|---|---|---|---|
| R1 | **Promote KB §§1-9 + Nick's 14 rows into queryable substrate**. Add `getOperatorTruths(jtbdTags?)` to `substrate-query.ts`. Wire into `phase1Pull` so every dossier carries these claims. Composer reads them in BOTH specific + generalized modes | 8-12 hrs | Verified data — Nick's voice + KB synthesis becomes runtime, not markdown-only |
| R2 | **Send-confidence calibration loop**. Build the operator-ranks-10 → least-squares back-solve workflow. Portal banner flips from "uncalibrated" to "calibrated weights v1.1" | 6-8 hrs | Close the loop — confidence-weighted ranking becomes trustworthy |
| R3 | **Distillation layer for Brain**. Periodic LLM pass that synthesizes raw substrate into `sr_brain_market_signals` (BEAD timelines per state) + `sr_brain_bellwethers` (top 20 named accounts snapshot) + `sr_brain_patterns` (cross-prospect outcome aggregation as the data arrives) | 15-20 hrs | Close the loop + Verified data — the Brain becomes an intelligence engine, not a memory store |
| R4 | **Wire refutation gate into run-pipeline-v2**. Currently built + tested + explicitly unwired. Frame-refutation catches composer claims contradicted by substrate. ~2 hrs to integrate + verify | 2 hrs | Verified data — defense in depth on substrate-versus-claim alignment |
| R5 | **Bounce Monitor + DNC log + Cohort Status persistence**. Tables exist (`sr_bounce_events`, `sr_dnc_log`) — wire the post-portal v6 Bounce Monitor writes. Build `sr_cohort_status` per spec. Operator dashboard at `/ops/cohort/[cohort-id]` per Phase G | 10-15 hrs | Measure outcomes — bounce control + cohort health visible |

Total: ~50 hours over 2-3 weeks. The system becomes self-improving instead of static.

### RE-ORCHESTRATE (workflow/process changes, ongoing)

| # | Item | Cadence | Capability gained |
|---|---|---|---|
| O1 | **Manual capture of Nick / operator DMs** — confirmed today as the operating pattern. Screenshot or paste → I write SQL → row lands in `sr_company_evidence` with `source_kind='manual'` + JTBD tags | As needed | Verified data — the loop between Inorsa source + runtime stays current |
| O2 | **Operator pre-send sign-off** — every cohort goes through `/ops` Review tab → bulk Approve All Passing → flips `operator_go=true` → HS load gated on that | Per cohort | Scale humans — operator scans by exception, not row-by-row |
| O3 | **Per-AE per-day cap enforcement** — GOSPEL specifies 1,000 enrollments/sender inbox/day cap; spec target is 50/AE/day with warns at 80%, red at 95%. Operator pings AE if no enrollment +2 days | Daily | Scale humans + verified emails — sender reputation protected |
| O4 | **Substrate refresh cadence** — monthly ingest of NTCA annual report, FBA Fiber Market Trends, USTelecom Broadband Index, FCC BDC bulk data, public-operator earnings calls. Each adds breadth the current 5-source corpus lacks | Monthly | Verified data — breadth catches up to depth |
| O5 | **Weekly reply retro** — once `sr_emails` write goes live (F9), weekly review of reply rate by source-tier × persona × send-window × PS variant. Brain.outreach_patterns gets updated from this | Weekly | Close the loop — the learning machine actually learns |
| O6 | **Pre-show / per-show cycle** — substrate ingest + ICP pass + dossier build happens before show start; AE notes captured during; post-show is composer-only on top of pre-built substrate | Per show | Scale humans — the AE's work shifts from research to relationship |

### Critically needs to be RE-BUILT vs REFACTORED

For the operator-question framing — what genuinely needs structural rebuild vs polish?

**Rebuild (structural):**
- The substrate-to-composer bridge for operator-truth content (R1) — moves Nick + KB into queryable rows + adds composer pull. This is the substrate-effectiveness fix.
- The observability layer (F8 + F9 + parts of R5) — without this, we cannot learn.

**Re-orchestrate (process):**
- The post-portal workflow (O2) — the spec exists; the wiring is partial. Lots of small connections, not deep code.
- Substrate breadth (O4) — operational not architectural.

**Polish (small fixes):**
- The kill-list regex (F1) + SoT contradiction (F2) — 30-minute consistency work.
- HS loader single-call (F7) + Tim-reset (F6) + HS id backfill (F5) — small wiring touches.

**Does NOT need rebuild:**
- The composer. Producing good output on rich substrate.
- The tiered judge. Doing real work.
- The email-finder waterfall. Solid.
- The /ops portal shape. Right design, just incomplete connections.
- The DB schema. Sane; just needs columns wired.

---

## How recommendations map to the 4 binding capabilities

| Capability | Week 1 (FIX) | Week 2-3 (REBUILD) | Ongoing (RE-ORCH) |
|---|---|---|---|
| Measure outcomes | F5, F8, F9 | R5 | O5 |
| Know what is true (verified data) | F1, F2, F3, F4, F6 | R1, R4 | O1, O4 |
| Close the loop (learning) | F8, F9 | R2, R3, R5 | O5 |
| Scale humans | F7, F10 | (portal completion as part of R5) | O2, O3, O6 |

Every recommendation maps to at least one capability. None is filler.

---

## Risks if we don't act

1. **Without observability (F8 + F9 + R5):** we cannot tell the difference between a good composer pass and a bad one in production. The next 100 sends teach us nothing. The Brain stays empty forever.
2. **Without F3 (URL-domain check):** the 21 confirmed PROHIBITED rows + future ingestion contamination will sit in USE_DIRECTLY tier. The hallucination risk re-opens every time substrate refreshes.
3. **Without R1 (KB-to-DB):** Nick's voice depends on TypeScript string literals in `personas.ts` staying current. The next product change makes that contradict reality, and the composer ships stale framing at scale.
4. **Without F10 (microsite status flip):** every prospect-facing landing page is currently 403-equivalent under anon RLS. Recipients click and get nothing.
5. **Without R2 (calibration):** send-confidence ranking is uniform-weighted forever. The system cannot tell you which prospects to send next.
6. **Without O2 (operator pre-send sign-off):** the operator becomes the bottleneck at 50 prospects/day. The 800-prospect P2 cohort is unreachable.
7. **Without F6 (Tim-reset):** another Tim-approved + red prospect ships. Not a question of if.

---

## What this does NOT recommend

- Do not reopen the API-vs-manual sequence enrollment debate. POST-PORTAL v6 ratified manual. That's locked.
- Do not propose a Slack auto-ingest pipeline. Operator chose manual capture today (Option 3 of 3).
- Do not propose new tables `sr_source_domains` or `sr_pending_domain_classification` or `sr_claim_verifications` or `sr_prohibited_sources`. The narrow fix is two ALTER TABLE column adds (`domain_tier`) + wiring; no new tables needed.
- Do not propose composer rewrites. The composer is fine.
- Do not propose tiered-judge rewrites. The judge is rigorous.
- Do not propose moving away from v2 substrate-tier-first architecture. The 62-gate inventory is the path forward.

---

## Appendix: key file paths and references

**Specs and decisions:**
- `canon/sources/inorsa-product-truth-nick-2026-06-04.md` — Nick canon (status CANON)
- `docs/showrev/POST-PORTAL-SPEC-V6.md` — ratified post-portal architecture
- `data/showrev/post-approval-spec-2026-06-10.md` — DRAFT, partially superseded by v6
- `data/showrev/send-confidence-system-spec-2026-06-10.md` — confidence formula spec
- `docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md` — HS GOSPEL
- `docs/showrev/gates-inventory-2026-06-09.md` — 62-gate exhaustive inventory
- `data/showrev/OVERNIGHT-DECISIONS-2026-06-09-PM.md` — 5 named + 4 architecture decisions
- `data/showrev/V2-COMPOSER-GAP-FIX-PLAN.md` — 10 must-fix triage
- `data/showrev/pipeline-backlog.md` — active backlog with BL-016 at top (filed today)
- `data/showrev/industry-intelligence-kb.md` — 51KB operator-curated KB (10 sections, 67 source domains)
- `canon/sources/inorsa-product-truth-nick-2026-06-04.md` — kill-list at lines 57-61

**Code anchors:**
- `src/showrev/m1-email-find/evidence-tiering/run-pipeline-v2.ts` — production pipeline entry
- `src/showrev/m1-email-find/evidence-tiering/orchestrator.ts` — evidence pull/gap-fill/tier+emit
- `src/showrev/m1-email-find/evidence-tiering/composer-constraints.ts` — 5 banned-phrase categories
- `src/showrev/m1-email-find/evidence-tiering/tiered-judge.ts` — T1/T2/T3 cascade
- `src/showrev/m1-email-find/evidence-tiering/specific-composer.ts` + `generalized-composer.ts`
- `src/showrev/m1-email-find/evidence-tiering/send-confidence.ts` — uncalibrated v1.0
- `src/showrev/m1-email-find/influence.ts` — 8 patterns + 6 PS variants + stat-library integration
- `src/showrev/m1-email-find/personas.ts` — 3-persona STORM research prompts
- `src/showrev/m1-email-find/verify-facts.ts` — **the stranded URL-domain classifier**
- `src/showrev/m1-email-find/evidence-tiering/refutation.ts` — **the unwired refutation gate**
- `src/showrev/microsite/app/` — Next.js prospect-facing + /ops Mission Control

**Today's session artifacts:**
- `data/showrev/forensic-2026-06-13-claude/system-schematic.html` — visual schematic (light-mode, WCAG-accessible)
- `data/showrev/forensic-2026-06-13-claude/audit-report.md` — this document
- `sr_company_evidence` rows `nick_jtbd_01` through `nick_jtbd_14` — Nick's product corrections + Slack clarification in DB
- `data/showrev/pipeline-backlog.md` BL-016 — Inorsa-validates kill-list filing
- `docs/showrev/HANDOFF-2026-06-13-audit-complete.md` — next-session bridge

---

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 EDT | Claude (Opus 4.7) | Initial audit report after 85-minute post-coffee focused review. Supersedes yesterday's forensic schematic on dimensions of observability + composer wiring + spec ratification status. |
