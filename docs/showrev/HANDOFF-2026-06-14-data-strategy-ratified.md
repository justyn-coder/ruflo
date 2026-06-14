---
title: Data strategy synthesis ratified by cross-family judge panel — handoff for implementation + Sunday smoke decision
date: 2026-06-14 EDT
session_name: data-strategy-forensic-and-judge-panel
status: in-flight — synthesis v2 ratified at 98.6/100; implementation queued; smoke-fire timing decision pending
git_commit_ruflo: 84b757b46  # tip of ruflo main (unchanged this session — no commits)
git_commit_showrev_microsites: 98c6418  # tip of showrev-microsites main (unchanged this session)
tool_calls_at_handoff: ~155 (past 120 'strongly consider'; under 180 'primary task')
authored_by: Claude (Opus 4.7) at end of Sunday data-strategy forensic + judge panel session
operator_state: Operator authorized "Apply 5 refinements + implement strategy (Recommended)" at 03:55 EDT. Mid-implementation, architectural finding (no Tier A/B in DB) surfaced. Handoff written before broad code changes land, so next session can resume with operator-pre-approved implementation specifics.
next_session_must_read:
  - docs/showrev/HANDOFF-2026-06-14-data-strategy-ratified.md  # THIS handoff
  - data/showrev/forensic-2026-06-13-claude/data-strategy-synthesis-2026-06-14.md  # synthesis v2 (ratified)
  - data/showrev/forensic-2026-06-13-claude/data-strategy-rubric-2026-06-14.md  # the 10-dim rubric
  - data/showrev/forensic-2026-06-13-claude/judge-panel-data-strategy-round-1.md  # judge panel verdict + dissent
  - data/showrev/forensic-2026-06-13-claude/w1-p1-microsite-state-2026-06-14.md  # W1 forensic v2 (logged, deferred)
  - data/showrev/inorsa-source-of-truth.md  # v10 — Inorsa product canon
  - data/showrev/jtbd-matrix.md  # JTBD framework (Nick-validated)
  - canon/sources/inorsa-product-truth-nick-2026-06-04.md  # Nick canon
  - docs/showrev/HANDOFF-2026-06-13-fix-sprint-W2-observability-shipped.md  # prior-session handoff (W2 ship)
  - SESSION-RULES.md
---

# Handoff: Data strategy ratified (98.6/100, 4-of-4 judges SHIP); implementation queued

## TL;DR for next reader

This session did NOT execute W4/W3/W1/GATE per the original prompt. Operator surfaced Nick McManus feedback on the brief/chris insights-review page (20 quote-level verdicts: 9 reject + 8 approve-but-doesn't-help + 1 conditional + 2 clean approve). My initial reaction was too hasty (proposed composer-constraints kill-list extension). Operator pushed back, asked for proper red-team + forensic audit + judge panel.

Did the forensic. Wrote synthesis v2 at `data/showrev/forensic-2026-06-13-claude/data-strategy-synthesis-2026-06-14.md`. Cross-family judge panel (Gemini 2.5 Pro + GPT-5 + Grok 4.3 + DeepSeek v4 Flash) ratified SHIP at **98.6/100** with 5 substantive dissent items, all incorporated into v2. Operator authorized implementation.

Implementation NOT executed this session. Critical architectural finding: all 6,512 sr_brain_substrate rows are EXTERNAL industry research (community-broadband-bits 4741 + dawson 1521 + fiber-for-breakfast 203 + cartesian 27 + ntia 20). Internal Inorsa-AE substrate (Tier A/B) lives in canonical FILES, not in DB. That reshapes the implementation plan — surfaced for operator decision.

Also: W1 forensic (P1 microsite recovery) completed + deferred per operator. P1 sends used `/brief/{slug}` paths backed by sr_microsites — all 66 P1 microsite slugs absent from production. Deep inspection of P1 Restore DB found 156 pipeline_states rows with original email body content + m_inorsa_dossiers substrate, but microsite-level content (headline/insight/case_study) not preserved. Documented + deferred per operator.

**Smoke-fire decision pending.** Current time Sunday 11:47 AM EDT. GATE 3pm checkpoint ~3hr away. Smoke window 6-9pm. Data strategy implementation is ~4-5 hr scoped — likely doesn't fit before smoke. Three paths surfaced in §"Decisions needed" below.

## Completed this session

- [x] Read all 6 session-start must-reads + acknowledged
- [x] Confirmed git state, pushed ruflo main (8 commits) + showrev-microsites main (1 commit) to remotes
- [x] W1 P1 microsite forensic v1 written (then operator pushback → re-inspected P1 Restore DB)
- [x] W1 P1 microsite forensic v2: P1 Restore DB has 165 tables (not just 5 sr_*). pipeline_states (281 rows, 156 with email body) + m_inorsa_dossiers (146) + research_runs (308) + sr_brain_substrate (6,512) recovered. ALL 44 P1 personas found in pipeline_states with original email body + subject. Microsite content NOT preserved. **OPERATOR DEFERRED — not blocking P2.**
- [x] HS performance audit of 44 P1 sequence-enrolled contacts: Mike 23 sent / 3 opens, Nathan 14 sent / 5 opens / 2 clicks, Lucas 7 sent / 0 engagement. 0 replies, 0 bounces across all 44.
- [x] Ingested Nick's /brief/chris insights-review feedback (20 quotes, persisted to sr_insight_reviews table by reviewer="chris" label = Nick per operator).
- [x] Initial Nick-feedback reaction (kill-list extension proposal) — RED-TEAMED per operator request.
- [x] Forensic audit complete: read inorsa-knowledge-base skill, highlevelae skill, Nick canon 2026-06-04, jtbd-matrix v1, P1-SOURCE-OF-TRUTH, inorsa-source-of-truth v10, composer-constraints.ts current state.
- [x] Synthesis v1 written: market+product audit + 4-tier substrate model (A/B/C/D) + 5 connection-point bridges + recommended data strategy + 10-dim rubric for judge panel.
- [x] Operator authorized judge panel launch + 4-tier model.
- [x] Operator added fiber-only safety default: "when in doubt about a claim, assume tower." Saved as memory `feedback_fiber_only_when_in_doubt_assume_tower`. Synthesis updated.
- [x] Extracted §7 rubric to standalone file `data-strategy-rubric-2026-06-14.md`. Wrote new judge panel script `scripts/judge-panel-data-strategy-2026-06-14.mjs` (cross-family non-Anthropic, equal-weights 10 dims summing to 100).
- [x] Dry-run validated (4 env keys present, 39K char prompt, weights sum 100).
- [x] Judge panel LIVE: 4/4 judges returned valid scores in 7.9-38.5s. **Aggregate 98.6/100, weakest dim 9.5, all 4 SHIP.**
- [x] 5 substantive dissents incorporated into synthesis v2: fiber-rescue rule (all 4 judges), §4.1 "crew-idle" fix to "extra drafting" (GPT-5), backfill QA sampling gate (Gemini + GPT-5), persona-pattern weights as N=17 default not gospel (all 4 judges), narrative-utility judge dim as Phase 2 trigger (Gemini). Bonus: Tier C lead-by-exception for program_leverage × JTBD 7 (Grok).
- [x] Operator authorized implementation.

## Implementation NOT YET executed (queued for next session)

### Architectural finding (must address before implementation)

`sr_brain_substrate` schema has columns: id, source, title, url, published_date, chunk_index, content, char_count, search_vector, created_at, embedding, metadata (jsonb), domain_tier, domain_tier_set_at. **No source_class field.** Distinct sources in production:

| source | n |
|---|---|
| community-broadband-bits | 4,741 |
| dawson-pots-and-pans | 1,521 |
| fiber-for-breakfast | 203 |
| cartesian-cost-report | 27 |
| ntia-bead-subgrantees | 20 |
| **TOTAL** | **6,512** |

**All 5 sources are EXTERNAL industry research** (podcasts, blogs, reports, NTIA scrape). Zero internal Inorsa-AE substrate in this table. Internal substrate (Tier A/B) lives in canonical FILES:

| Source | Location | Tier |
|---|---|---|
| Mike Rutski / Lucas Spencer / Nathan Dunn AE emails | `jtbd-matrix.md` Pain (in their words) sections | A |
| Chris Balandran one-pager | `inorsa-source-of-truth.md` §2 | A |
| Nick canon | `canon/sources/inorsa-product-truth-nick-2026-06-04.md` | A |
| Deck proof points | `inorsa-source-of-truth.md` §3-§7 | A |
| Booth observations (Spencer Kariniemi, Jackie, Indus CAD) | `jtbd-matrix.md` Pain + brain-synthesis | B |
| Customer email threads | scattered in repo + HS | B |
| AE call recaps | scattered in repo + HS | B |

**This means the implementation has 2 phases:**

**Phase A — Classify existing 6,512 substrate rows (all C or D):**
- Apply scope-tier classifier to the 6,512 sr_brain_substrate rows
- Use rule-based classifier on (source × content keywords) + LLM fallback for ambiguous
- Most likely outcome: ~30-40% Tier C (Inorsa-scope-aligned context), ~60-70% Tier D (off-target or ambiguous)

**Phase B — Ingest internal Inorsa-AE substrate as Tier A/B:**
- Parse jtbd-matrix.md, inorsa-source-of-truth.md, nick canon, etc.
- Insert as rows in sr_brain_substrate with source="internal-inorsa-ae" / "chris-onepager" / "nick-canon" / "booth-obs" etc.
- Tag with inorsa_scope_tier='A' or 'B' at insert
- This is the NEW work that wasn't in synthesis v1/v2 estimates

**Revised implementation effort:**
- Schema migration (ALTER TABLE add column + index): 15 min
- Phase A classifier + run + QA sample: 2-3 hr
- Phase B internal substrate ingestion: 2-3 hr (was hidden from estimate)
- Composer prompt change: 1 hr
- Mechanical check at compose-time: 30 min
- E2E test on 3 prospects: 1 hr
- **Total: 7-9 hr** (revised from 4-5 hr in synthesis v2)

### Decisions needed from operator before implementation

1. **Smoke-fire timing.** 7-9 hr implementation doesn't fit before 6-9pm Sunday smoke. Three paths:
   - **(a) Punt smoke fire to next session.** Gain proper data strategy implementation time. Recipient timing impact: P2 smoke moves to Mon-Wed (next weekday window).
   - **(b) Run smoke fire tonight with CURRENT system** (no data strategy applied). Accept that the 15 smoke roster emails may carry Tier C/D contamination. Mitigate via manual review of all 15.
   - **(c) Hybrid: MINIMAL data strategy tonight, full strategy next session.** Tonight: ingest Tier A internal substrate (Phase B subset — ~2 hr) + composer prompt change to prefer internal-source quotes for lead claim. Skip Phase A 6,512-row backfill. Run smoke fire 6-9pm with internal-source-led composer.

2. **Phase A classifier approach:**
   - **(a) Rule-based:** source name + content keyword match against canonical kill-list. Fast, deterministic, no LLM cost. Misses nuance.
   - **(b) LLM-based:** Gemini/GPT-5 classifier on each row. Slower (6,512 rows × ~2s = ~3.5 hr at high concurrency). Catches nuance.
   - **(c) Hybrid:** rule-based first pass + LLM only on rows that fall in ambiguous middle. Most efficient. ~1 hr.

3. **Phase B internal substrate ingestion — which files to parse?**
   - jtbd-matrix.md "Pain (in their words)" sections (extract quoted email language)
   - inorsa-source-of-truth.md §3-§7 (deck proof points)
   - canon/sources/inorsa-product-truth-nick-2026-06-04.md (Nick canon)
   - Booth observations (where? brain-synthesis.md? or scattered?)
   - AE call recaps (where? need to find)

4. **Composer prompt change wording.** Operator should review the actual prompt text before it lands. Proposed: "When selecting the lead claim, prefer substrate rows tagged inorsa_scope_tier='A' or 'B'. Allow Tier C only as bridge/context, never as headline. Tier D never appears."

5. **Mechanical check threshold:** at compose-time, if headline-claim source row has inorsa_scope_tier in {C, D} → recompose. If recompose fails 3x → escalate to operator for manual review. Threshold reasonable?

## Substrate state at handoff

- **HS portal:** Unchanged this session (no HS writes). Still dirty per W4 scope (5 wrong Mike + 2 retag pending — DEFERRED per operator).
- **Production DB (slttpknnuthbttjuzrnz):** Unchanged this session.
- **sr_insight_reviews:** 20 rows for /brief/chris (q1-q20) — Nick feedback persisted via portal action prior session.
- **P1 Restore DB (joxzazwuehhvywanyrze):** Unchanged this session. 165 tables inventoried.
- **Files written this session:**
  - `data/showrev/forensic-2026-06-13-claude/w1-p1-microsite-state-2026-06-14.md` v1+v2 (W1 forensic, deferred)
  - `data/showrev/forensic-2026-06-13-claude/data-strategy-synthesis-2026-06-14.md` v1+v2 (synthesis, ratified)
  - `data/showrev/forensic-2026-06-13-claude/data-strategy-rubric-2026-06-14.md` (10-dim rubric)
  - `data/showrev/forensic-2026-06-13-claude/judge-panel-data-strategy-round-1.md` + sibling .json (judge verdict)
  - `scripts/judge-panel-data-strategy-2026-06-14.mjs` (new judge panel script for synthesis eval)
  - `~/.claude/projects/.../memory/feedback_fiber_only_when_in_doubt_assume_tower.md` (memory)
- **External state:**
  - HubSpot MCP: 2 search_crm_objects + 2 query_crm_data calls (read-only, no writes)
  - Supabase MCP: ~15 execute_sql + 1 list_projects (all read-only)
  - Cross-family API calls: 4 (1 judge panel round × 4 judges) = ~$2 spend
  - 0 emails sent / sequences enrolled
- **Background processes at handoff:** none.

## Operator decisions captured this session (do NOT re-ask)

- [x] W1 P1 microsite recovery — DEFERRED (not blocking P2)
- [x] Skip restore of 8 missing prospects (different cohort, no microsites)
- [x] Push ruflo + showrev-microsites to origin/main — DONE
- [x] Fiber-only safety default: when in doubt about claim, assume tower → exclude
- [x] 4-tier substrate model (A/B/C/D) — LANDS, send to judge panel
- [x] Judge panel — LAUNCH AS PROPOSED with 10-dim rubric
- [x] Apply 5 refinements (judge dissent) + implement strategy — AUTHORIZED 03:55 EDT
- [x] W4 HS mistakes remediation — DEFERRED ("come back to it later")
- [x] W3 AE proxy enrollment test — DEFERRED ("definitely need to come back to it")

## What NOT to do (next session)

- **DO NOT skip the architectural finding** about Phase B (internal substrate ingestion). The 4-5 hr v2 estimate is WRONG — revised to 7-9 hr because Tier A/B substrate isn't currently in DB.
- **DO NOT re-litigate Nick's feedback interpretation** — synthesis v2 is ratified by 4-judge panel at 98.6/100.
- **DO NOT touch the 4-tier model or fiber-rescue rule** — operator-locked and judge-ratified.
- **DO NOT modify the judge-panel script** — keep `scripts/judge-panel-data-strategy-2026-06-14.mjs` stable for future rounds.
- **DO NOT use a Claude model for cross-family judging** — script enforces non-Anthropic models.
- **DO NOT commit synthesis or rubric changes without operator review** — these are canonical-rank documents per inorsa-SoT §18 Lock Index.
- **DO NOT implement composer prompt change without operator review of the actual text** — composer behavior touches every email going out.
- **DO NOT auto-backfill 6,512 rows without QA sampling gate** — judge dissent flagged this as load-bearing safety check.

## Next 3 actions (sequential, for next session)

1. **Read this handoff + the 9 supporting files.** Acknowledge.

2. **Operator picks Path (a), (b), or (c) from §"Decisions needed" #1.** Path (a) = punt smoke, implement full strategy next session. Path (b) = run smoke with current system. Path (c) = hybrid (Tier A ingestion + composer change tonight, full strategy next session).

3. **Operator answers #2-#5** (classifier approach, Phase B file list, composer prompt wording, mechanical check threshold). With those answers, implementation proceeds.

## Paste-in prompt for fresh session

```
You are picking up an in-progress project. Your one job in this session is to
implement the data strategy ratified by cross-family judge panel (98.6/100,
4-of-4 SHIP) in synthesis v2 at data/showrev/forensic-2026-06-13-claude/
data-strategy-synthesis-2026-06-14.md. The strategy adds substrate-source
tiering (A/B/C/D) by relevance-to-Inorsa-scope.

CRITICAL ARCHITECTURAL FINDING (must read first): sr_brain_substrate has 6,512
rows, ALL external industry research (community-broadband-bits 4741, dawson
1521, fiber-for-breakfast 203, cartesian 27, ntia 20). Internal Inorsa-AE
substrate (Tier A/B) lives in canonical FILES, not in DB. Implementation has
2 phases: A) classify existing 6,512 external rows (C or D), B) ingest
internal substrate as new Tier A/B rows. Revised effort: 7-9 hr (was 4-5).

READ THESE FIRST, IN THIS ORDER, BEFORE ANY OTHER ACTION:

1. docs/showrev/HANDOFF-2026-06-14-data-strategy-ratified.md (THIS handoff)
2. data/showrev/forensic-2026-06-13-claude/data-strategy-synthesis-2026-06-14.md (synthesis v2, ratified)
3. data/showrev/forensic-2026-06-13-claude/data-strategy-rubric-2026-06-14.md (10-dim rubric)
4. data/showrev/forensic-2026-06-13-claude/judge-panel-data-strategy-round-1.md (verdict + dissent)
5. data/showrev/inorsa-source-of-truth.md (v10 — Inorsa product canon)
6. data/showrev/jtbd-matrix.md (JTBD framework + Tier A AE-quote sources)
7. canon/sources/inorsa-product-truth-nick-2026-06-04.md (Nick canon)
8. SESSION-RULES.md

Acknowledge all 8 reads.

THE PROJECT OBJECTIVE (locked):
Better cold prospecting than the top 0.01% of B2B SaaS AEs on the 800-prospect
Inorsa FC2026 cohort. Target: 15-25% reply T1, 3-6% meeting. Verified data in
every body. Verified email for every send. Humans respond to craft.

WHERE WE ARE:
Data strategy synthesis v2 ratified by cross-family judge panel at 98.6/100.
4-tier substrate model approved. Fiber-only safety default + fiber-rescue
rule operator-locked. 5 judge-dissent refinements applied. Implementation
queued, 5 implementation decisions surfaced for operator (smoke-timing,
classifier approach, Phase B file list, composer prompt wording, mechanical
check threshold).

YOUR DELIVERABLE THIS SESSION:

1. Read the 8 must-reads. Acknowledge.

2. Get operator answers to the 5 decisions in §"Decisions needed" of the
   handoff. Do NOT begin implementation until all 5 are answered.

3. Execute implementation in scoped phases:
   - Schema: ALTER TABLE add inorsa_scope_tier + index (~15 min)
   - Phase A classifier (per operator decision #2): classify 6,512 existing
     external substrate rows. QA sample gate: manual 25-per-tier spot check.
     If misclassification >10% → halt + refine.
   - Phase B internal substrate ingestion (per operator decision #3): parse
     canonical files, insert as Tier A/B rows.
   - Composer prompt change (per operator decision #4) + mechanical check
     (per operator decision #5).
   - E2E test on 3 prospects (operator's mainline ask): ICP qualify → rich
     data → top 1% AE email → email lookup.
   - Commit per-phase for revertability.

4. If operator chooses Path (c) hybrid for tonight: do MINIMAL Tier A
   ingestion + composer prompt change ONLY, defer Phase A backfill to a
   later session. Run smoke fire 6-9pm Sun with internal-source-led
   composer.

5. After implementation: GATE Sunday 3pm checkpoint (re-judge + adversarial
   replay), operator F10 approvals via /ops portal, preload-verify, smoke
   fire 6-9pm Sun recipient LOCAL.

DO NOT REOPEN SETTLED DECISIONS:
- Data strategy synthesis v2 RATIFIED at 98.6/100. No re-litigation.
- 4-tier model: A/B/C/D with fiber-only safety default + fiber-rescue rule.
- JTBDs are sound (Nick-validated 6 of 7). Don't restructure.
- Composer-constraints.ts existing kill-lists STAY. Don't extend.
- POST-PORTAL v6 manual default. W3 proxy DEFERRED per operator.
- W4 HS mistakes DEFERRED per operator.
- W1 P1 microsite recovery DEFERRED (logged in forensic, not blocking P2).
- Stay-inside-ruflo-repo (one exception: showrev-microsites for portal).
- NO Claude model for cross-family judging. Use scripts/judge-panel-data-
  strategy-2026-06-14.mjs for any next-round judges.
- Fiber-only safety default: when in doubt, assume tower → exclude.

OPERATOR DECISIONS ALREADY CAPTURED (do NOT re-ask):
- Data strategy v2 ratified + implementation authorized
- 4-tier model + fiber-rescue + fiber-only default
- W1, W3, W4 all deferred
- Smoke roster = 15 real + 3 dummies (per prior handoff)
- Sunday smoke window = 6-9pm recipient LOCAL
- Operator owns all loop decisions (no direct Tim/Nick contact)

Begin.
```

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-14 11:47 EDT | Claude (Opus 4.7) | Initial handoff at ~155 tool calls. Data strategy synthesis v2 ratified by 4-judge cross-family panel at 98.6/100 with 5 substantive dissents incorporated. Implementation queued with architectural finding (Tier A/B not in DB) + 5 operator decisions needed. W1 P1 microsite recovery forensic complete + deferred per operator. W3/W4 deferred per operator. Sunday smoke fire timing decision pending. |
