---
title: Account Intel Backlog — AE Jump-Start on Lead Conversion
status: BACKLOG
last_updated: 2026-06-11 20:45 EDT
version: v1
purpose: Track work to enrich Company records with deep intel so AEs have a jump-start when a prospect turns into a lead. Deferred until post-MVP-send.
priority: AFTER first live send + first replies. Not blocking P2 cold rollout.
---

# Account Intel Backlog

## Goal

When a prospect replies / books a meeting / converts to a lead, the AE should be able to open the Company record in HubSpot and **immediately have a pitch-ready briefing** — not have to go research from scratch.

We have the substrate (sr_company_evidence, sr_brain_dossiers, ShowRev research summaries). It's not yet flowing into the Company record as a structured, AE-readable briefing.

## Operator framing (2026-06-11)

> "we were supposed to add some of our quality Intel into each company record so the AE's would have a jump start if/when a prospect turned into a lead. we'll just have to backfill this later - priority is getting the best possible emails out without getting flagged for spam right now - then we'll worry about sharing intel."

## What we already populate (loader code as of 2026-06-11)

The HS loader already writes these company properties at create time:

- `showrev_company_summary`
- `showrev_company_size`
- `showrev_fiber_activities`
- `showrev_bead_status`
- `showrev_growth_signals`
- `showrev_competitive_landscape`
- `showrev_key_projects`
- `showrev_recent_news` (from market_moment)
- `showrev_external_deadlines`
- `abm_play = "ABM 1:Few"`

Plus company-side properties that EXIST but the loader doesn't currently write (would be enriched here):

- `showrev_tech_stack`
- `showrev_recent_press`
- `showrev_bead_award_amount`
- `showrev_employee_count`
- `showrev_funding_stage`
- `showrev_icp_track` (fiber_operator / ae_firm)

## What's missing — AE jump-start briefing

The data we write today is **factual one-liners** suitable for email composition. The AE jump-start briefing needs **synthesized pitch-ready context**:

| Field type | What we have today | What AEs need on lead conversion |
|---|---|---|
| Operational pain | One-line growth signal | "Top 3 likely operational pain points based on company size + funding stage + project mix" |
| Stakeholder map | Single contact (the one we emailed) | "Other likely decision-makers + influencers identifiable at this company, with titles + LinkedIn URLs" |
| Competitive context | Generic competitive landscape | "Specific likely competitors mentioned in their public materials + how to position against them" |
| Decision criteria | Generic discovery questions | "Discovery questions specific to this company's stated priorities" |
| Conversation history | None | "All prior touches this contact has had: which sequence step, when, replies, meeting outcomes" |
| Risk / disqualifiers | None | "Known disqualifiers (e.g., A&E firm not fiber operator → wrong product), MEDDPICC red flags" |

## Approach options

### Option A: Auto-generate on lead conversion

When prospect's status changes to lead in HS:
- Trigger workflow that POSTs to our `/api/account-intel-brief` endpoint
- Endpoint pulls sr_company_evidence + sr_brain_dossiers + prior outreach history
- Composes a structured briefing via Sonnet
- Writes to a new `showrev_ae_brief` rich-text property on the company record
- AE sees it on the Company sidebar (gated by existing `showrev_pilot_owner = true` conditional)

### Option B: Pre-compute at load time

When loader creates the company record:
- Generate the briefing immediately (don't wait for conversion)
- Store in `showrev_ae_brief`
- Risk: briefing is stale by time of conversion (could be weeks/months later)
- Mitigation: refresh on conversion via Option A workflow

### Option C: On-demand via AE click

- AE opens Company record, sees "Generate brief" button
- Click triggers our endpoint, briefing generates in 10-30 sec
- Stored in `showrev_ae_brief` for future visits
- Pros: always fresh, no stale data
- Cons: AE has to click; first-impression is empty

**My recommended path:** start with Option B (briefing at load time so it's always present), add Option A (refresh on conversion) when first lead converts. Skip Option C unless A+B prove insufficient.

## Pending decisions (operator to call when prioritized)

- [ ] Which option (A / B / C) or hybrid
- [ ] Rich text or multiple structured fields?
- [ ] Synthesis model — Sonnet 4.6 (current default) or upgrade to Opus 4.8 for higher quality briefings?
- [ ] Per-AE customization — does Mike want different brief format than Nathan?
- [ ] Length target — 1 page? 2 paragraphs? Bullet list?

## Backfill plan (when we run this)

For 200-prospect FC2026 cohort + future 800-prospect target:
- Loop through all existing sr_engine_output records
- For each company, generate brief via chosen option
- Batch via Workflow with 16 parallel agents (per our default-to-workflow rule)
- Total: ~30-45 min for 200 prospects
- Total cost: ~$15-30 Anthropic tokens depending on length + model

## Effort estimate

- Option B initial build: ~3-4 hours (endpoint + synthesis prompt + property write)
- Option A workflow + refresh: ~1-2 hours additional
- Backfill on existing cohort: ~30-45 min wall-clock + $15-30 cost

## Gate before this becomes priority

1. First live send completes successfully
2. First reply / meeting books → confirms AE jump-start matters
3. AE feedback on what they wished was in the Company record at conversion time
4. THEN prioritize this work informed by actual AE need, not assumed need

---

## Pairs with

- `docs/showrev/POST-PORTAL-SPEC-V6.md` — main pipeline spec (this backlog deferred to post-MVP-send)
- `docs/showrev/COLD-EMAIL-BEST-PRACTICES.md` — composition + send strategy (separate concern)
- `docs/showrev/COMPOSER-BACKLOG.md` — composer code enhancements + A/B tests (separate concern)
- Existing properties: see HubSpot Company properties screenshot 2026-06-11 (showrev_* properties + ShowRev Intelligence record-customization card already in place)

---

## Version history

| Version | Date (EST) | Change |
|---|---|---|
| v1 | 2026-06-11 20:45 | Initial backlog. Operator framing captured verbatim. Properties we currently populate vs. what's missing for AE jump-start. 3 architecture options (load-time / conversion-trigger / on-demand) with recommended hybrid path. Pending decisions enumerated. Backfill plan + effort estimate. Gate criteria (don't prioritize until first reply confirms AE need is real). |
