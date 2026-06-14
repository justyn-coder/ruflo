---
title: Claude Design prompts — ShowRev architecture maps (system + database)
status: READY-TO-PASTE
last_updated: 2026-06-13 EDT
version: v1
authored_by: Claude (Opus 4.7) — for operator to paste into claude.ai/design
purpose: Two paste-ready Claude Design prompts (Goal / Layout / Content / Audience format) that generate visually-polished versions of the system architecture map + database architecture map. Reference HTML drafts are at `data/showrev/forensic-2026-06-13-claude/system-architecture-2026-06-13.html` and (TBD) `data/showrev/forensic-2026-06-13-claude/database-architecture-2026-06-13.html` — attach those to Claude Design as reference material so the output preserves technical accuracy.
---

# How to use these

1. Open https://claude.ai/design (Pro / Max / Team / Enterprise only — confirmed in CLAUDE.md tool chain).
2. For each prompt below: paste the four fields (Goal, Layout, Content, Audience) into Design's input form.
3. **Attach the matching HTML draft** from `data/showrev/forensic-2026-06-13-claude/` as a reference file so Design preserves technical accuracy.
4. Generate. Iterate with Design's inline edit tools (May 2026 update — supports comments, direct text edits, chat refinement, adjustment sliders).
5. Save final outputs back to `data/showrev/forensic-2026-06-13-claude/` as `system-architecture-2026-06-13-design.{pdf,png,html}` + `database-architecture-2026-06-13-design.{pdf,png,html}`.

---

# Prompt 1 — System Architecture Map

## Goal

Generate a one-page visual architecture diagram showing the end-to-end data flow of the ShowRev cold-prospecting pipeline for Inorsa Fiber Connect 2026. The diagram should let a non-engineer operator see at a glance how a prospect moves from a CSV row to an email landing in their inbox, with broken or partial parts clearly flagged in red and operator-decision gates clearly flagged in gold. Reads like a system architecture poster, not a spec doc.

## Layout

- Vertical flow, top to bottom, 8 main stages connected by clear arrows.
- Each stage is a wide pill-shaped or rounded-rectangle box, spanning the full content width.
- Three coloring rules, used together with text labels (not color alone):
  1. **Green-tinted background** for substrate-ingest and verified-data stages (capability: "Verified data").
  2. **Blue-tinted background** for telemetry / observability stages (capability: "Measure outcomes").
  3. **Gold-tinted background** for human-in-the-loop / operator-decision stages (capability: "Scale humans").
- A final dark pill at the bottom: "Email lands in recipient inbox."
- Red callout boxes attached to the right side of any stage that's broken or partial, showing the gap in plain English (1-2 sentences).
- Gold callout boxes attached to the right side of any stage that has a gate, showing the gate condition.
- Generous whitespace between stages — this is for tired eyes, not for density.
- Print-friendly at A4 / Letter portrait. No dark mode.
- Light cream background (#fbfaf5 reference), dark ink (#0e0e0e reference), at-least AAA contrast on body text.
- Title bar at top: "ShowRev System Architecture" + subtitle "How a prospect goes from a CSV row to an email in their inbox" + date "2026-06-13".
- Legend block at bottom or side: explains the three capability colors + the red-gap + gold-gate convention.

## Content

The 8 stages, in order:

1. **Substrate ingest** (green / verified data) — Pull verified facts about each prospect company. Two ways in: manual capture (Nick or operator shares a fact, Claude writes it as a row) and web research (Apollo, FCC BDC, trade publications, public filings). A URL-domain trust classifier refuses prohibited sources (ZoomInfo, etc.). Writes to: `sr_company_evidence`, `sr_brain_substrate`. RED GAP: "The domain-trust classifier exists in code but isn't wired up. 21 prohibited-domain rows are sitting in the high-trust tier today. Plan F3 wires it."

2. **Prospect intake** (verified data) — Read the cohort CSV (210 rows for P2), decide ICP fit (fiber operator, A&E firm, adjacent services), find a verified email. Email finder tries 5 methods in order (domain resolver, pattern detector, SMTP probe, MillionVerifier, Apollo fallback). Writes to: `sr_prospects`. GOLD GATE: "If email score is zero, hard-blocked from send."

3. **Compose** (verified data) — Evidence orchestrator pulls every claim we have on this company, tiers it by trust. Specific composer (if ≥3 strong claims) writes a cited body in Nick's voice; otherwise generalized composer uses industry framing. Mechanical constraints block banned phrases, AI tells, kill-list items, hallucinations, low readability. Reads from: `sr_company_evidence`, `sr_brain_substrate`. RED GAP: "Inorsa-validates kill-list canon isn't in the regex array. Soft enforcement only — Plan F1 adds it."

4. **Judge** (verified data) — Three-tier scoring on every body. Tier 1 mechanical regex. Tier 2 Tim-style craft and voice. Tier 3 Gemini quality + always-on hallucination check. Verdict: ship / retry / flag-quality / flag-hallucination. Then send-confidence combines ICP + email + substrate axes into composite color. Writes to: `sr_engine_output.judge_verdict`.

5. **Persist + measure** (blue / observability) — Save one row per prospect per touch (email, dossier, microsite content), all start as draft. Emit telemetry. Writes to: `sr_engine_output`, `sr_dossiers`, `sr_microsites`, `sr_pipeline_runs`, `sr_emails`. RED GAP: "Audit-trail tables empty in production. `sr_pipeline_runs` = 0 rows ever, `sr_emails` = 0 rows ever. Plan F4 + F5 + F8 + F9 + F10 close this."

6. **Operator gate** (gold / scale humans) — Two checks. (a) 11 automated blocking checks: existing-contact lookup, SPF/DKIM/DMARC, DNC lists, dedup, bounce history. (b) Operator clicks "Approve + Go Live" per prospect in /ops portal. Flips microsite to live, sets operator_go=true, writes audit row. Per-prospect approval is the default; bulk option exists. Writes to: `sr_dnc_log`, `sr_microsites.status`, `sr_prospects.operator_go`, `sr_review_actions`. GOLD GATE: "No HubSpot load fires without operator approval AND a live microsite."

7. **HubSpot load and send** (scale humans) — Single-call upsert puts the contact in HubSpot (rate-limit headers logged for early throttle detection). Then two paths: DEFAULT is AE manual bulk-enrollment from a HubSpot active list. PARALLEL TEST this week is AE-proxy API enrollment with senderEmail (operator-opened lane; only fires if test passes by Sunday 3pm and operator green-lights). Writes to: `sr_prospects.hubspot_contact_id`, `sr_hs_api_calls`.

8. **Watch and learn** (blue + close-the-loop) — Watcher polls HubSpot for opens / clicks / replies / bounces, tight cadence first 15 min then 5 min. Bounce monitor halts new enrollments at 5% rolling hard-bounce rate. Stop-hook calibrates judge within Claude Code sessions by reading recent verdicts. Writes to: `sr_outcomes`, `sr_bounce_events`.

Then a final stage box at the bottom: "Email lands in recipient inbox" (dark fill).

Plus 5 red callout boxes summarizing the broken-things list:
1. P1 microsites are draft-only in production. 45 booth-visitor contacts have dead links. Plan W1 restores.
2. Tim's review is being misread as send-approval; Plan F6 renames the column and adds facts-reviewed.
3. Inorsa-validates kill-list canon not in regex array. Plan F1 adds it.
4. URL-domain classifier unwired. 21 prohibited rows in high-trust tier. Plan F3 wires it.
5. Brain distillation tables empty. Plan REBUILD R3 (next sprint, not this one).

## Audience

The operator is a 50-year-old founder with strong product / sales / strategy instincts, light technical depth, and standing accessibility constraints: large readable type (18-20px body minimum equivalent), high contrast, plain English (no insider acronyms unless explained), no dark mode, calm light-mode palette. He's a visual learner — he should be able to look at this diagram for 30 seconds and immediately have a working mental model of the system. Engineers will also use this diagram as orientation when joining the team, so technical accuracy matters, but operator-comprehension is the apex. The diagram pairs with a companion Database Architecture map; this one is the "what flows where" view.

---

# Prompt 2 — Database Architecture Map

## Goal

Generate a one-page visual schema map showing every database table the ShowRev system reads or writes, organized into the 5 functional groups, with each table card showing its purpose, current row count, RLS status, and which system stages touch it. The map should let an operator or engineer trace any system stage back to the tables it depends on, and trace any table back to the stages that read or write it. Pairs with the System Architecture map (prompt 1).

## Layout

- Single page, 5 vertical lanes (one per functional group), arranged left-to-right or top-to-bottom depending on what fits cleanly.
- Each lane has a clear header showing the group name + 1-line purpose + group color.
- Inside each lane, table cards stacked. Each card has:
  - **Top**: table name (large, monospace, bold).
  - **Middle**: 1-2 line plain-English purpose.
  - **Bottom row**: current row count + status badge (Active / Empty / Partial) + RLS state (Service / Anon-read-live-only / Anon-insert-only).
  - **Footer**: small "Touched by stages: 1, 3, 4, 9" pointer back to the System Architecture map's stage numbers.
- Color rules (used with text labels, not color-alone):
  - **Green border**: actively used, healthy row count.
  - **Yellow border**: partial — some write path missing or null-leaking.
  - **Red border**: empty in production (0 rows ever) — sprint priority.
  - **Gray border**: not yet built (spec'd but no schema in DB).
- Generous spacing. Light cream background. Dark ink. Print-friendly portrait.
- Title bar: "ShowRev Database Architecture" + "24 tables across 5 functional groups" + date.
- Legend at bottom: explains the 4 border colors, the RLS abbreviations, and what "Touched by stages: N" means.
- A small cross-reference callout at the top or side: "Pairs with the System Architecture map. Stage numbers in this map (1-8) reference stages in that one."

## Content

The 5 functional groups and the tables in each, with row counts as of 2026-06-13 and the system stage numbers (from prompt 1) that touch each table:

### Group 1 — Core workflow (the spine)

- **sr_prospects** — 274 rows. ACTIVE. Service role only. One row per prospect. Holds ICP class, email fields, HubSpot contact ID (to be backfilled), operator_go flag, sequence_enrolled_at. Touched by stages: 2, 6, 7, 8.
- **sr_engine_output** — 526 rows / 182 distinct prospects. ACTIVE. Service. One row per prospect per touch. Holds composed email, judge_verdict, send_confidence, craft_reviewed_by (post-F6 rename from composition_reviewed_by). Touched by stages: 3, 4, 5, 6, 8.
- **sr_dossiers** — Active row count. ACTIVE. Service. Microsite dossier content per prospect. Touched by stages: 3, 5, 6.
- **sr_microsites** — 182 rows, ALL status='draft'. PARTIAL — 0 of 182 are 'live' today, but spec is for operator to flip per F10. Anon-read-live-only RLS. Touched by stages: 5, 6.
- **sr_emails** — 0 rows ever. EMPTY (sprint priority). Service. Per-send audit trail. Plan F9 wires the write path. Touched by stages: 5.
- **sr_pipeline_runs** — 0 rows ever. EMPTY (sprint priority). Service. Per-invocation pipeline telemetry. Plan F8 wires the write path via OTEL. Touched by stages: 5.
- **sr_outcomes** — Some rows present. ACTIVE. Service. Reply / open / click / meeting events from HubSpot. Touched by stages: 8.

### Group 2 — Substrate (where verified facts live)

- **sr_brain_substrate** — 6,512 rows. ACTIVE. Service. Web research substrate, distilled. Plan F3 adds domain_tier + domain_tier_set_at columns. Touched by stages: 1, 3.
- **sr_company_evidence** — 1,522 rows (incl. 14 Nick rows landed 2026-06-13). ACTIVE. Service. Tagged evidence by source_kind, JTBD. Plan F3 adds domain_tier + domain_tier_set_at; Plan F4 adds source_date_backfilled_at; 21 rows currently PROHIBITED-domain in USE_DIRECTLY tier (to be quarantined, not deleted). Touched by stages: 1, 3.
- **sr_company_contacts** — 620 rows. ACTIVE. Service. Company-side contacts beyond the prospect. Touched by stages: 1.
- **sr_fact_checks** — 0 rows. EMPTY. Service. Spec'd for refutation gate (REBUILD R4, not this sprint).
- **sr_entity_resolution** — Active. Service. Entity dedup across substrate sources.

### Group 3 — Brain (distilled signals layer — 95% empty today)

- **sr_brain_outreach_patterns** — 8 rows. PARTIAL.
- **sr_brain_verify_items** — 5 rows. PARTIAL.
- **sr_brain_dossiers** — 3 rows. PARTIAL.
- **sr_brain_outcomes** — 2 rows. PARTIAL.
- **sr_brain_competitors** — 1 row. PARTIAL.
- **sr_brain_market_signals** — 0 rows. EMPTY. REBUILD R3 fills this.
- **sr_brain_bellwethers** — 0 rows. EMPTY. REBUILD R3 fills this.
- **sr_brain_patterns** — 0 rows. EMPTY. REBUILD R3 fills this.
- **sr_brain_*** (2 more, all 0 rows). EMPTY.
- All Touched by stage 1.

### Group 4 — Microsite + review

- **sr_microsite_events** — 332 rows. ACTIVE. Anon-insert-only RLS. Page-view events from recipient-facing landing pages. Touched by stages: 5.
- **sr_review_actions** — 0 rows. EMPTY (sprint priority). Service. Operator action audit trail. Plan F10 wires the write. Touched by stages: 6.
- **sr_review_notes** — 12 rows. PARTIAL. Service. Free-text operator notes per prospect.
- **sr_review_timestamps** — 0 rows. EMPTY. Service.
- **sr_insight_reviews** — 2 rows. PARTIAL. Service.
- **sr_decision_trace** — Service. Decision-trace log.

### Group 5 — Post-portal v6 (newer, write-side verification pending)

- **sr_bounce_events** — Schema exists. PARTIAL — write-side verification pending. Service. Per-bounce event log with batch_id + sequence_step + bounce_reason. Touched by stage 8.
- **sr_dnc_log** — Schema exists. PARTIAL. Service. Do-not-contact audit trail with evidence JSONB. Touched by stage 6.
- **sr_email_experiments** — Schema exists. Service. A/B experiment tracking.
- **sr_hs_api_calls** — Schema exists. PARTIAL. Service. Per-API-call telemetry with rate-limit headers (Q15). Touched by stages: 7.

### Not yet built (mention in a separate "Spec'd but not deployed" callout)

- **sr_cohort_status** — spec'd in send-confidence; not deployed.
- **sr_source_domains** — proposed in forensic-2026-06-12, dropped.

## Audience

Same operator as prompt 1: 50-year-old founder, visual learner, accessibility constraints (large type, high contrast, plain English, no dark mode). He should be able to scan this map and answer: "if I want to know whether we have audit trail X, what table do I look at, and is it populated yet?" Engineers joining the team should be able to use this map alongside the System Architecture map to understand the schema-vs-flow trace in under five minutes. Operator-comprehension is the apex.

---

# Sanity-check questions for the operator before paste

1. Are the 5 functional groups the right cuts, or do you want a different organization (e.g., by capability M/K/L/S, or by write-status active/empty)?
2. Should table cards show the SQL column list, or stay at the 1-2 line purpose level? My default is purpose-level for operator-readability; engineers can read the schema DDL separately.
3. Should the System map include the AE-proxy parallel-test path explicitly as Stage 7b, or fold it into Stage 7 with a callout? My default is fold-with-callout for visual simplicity.

Answer inline before pasting if any differ.

---

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 EDT | Claude (Opus 4.7) | Initial — two paste-ready Claude Design prompts in Goal/Layout/Content/Audience format. Attach the matching HTML drafts from `data/showrev/forensic-2026-06-13-claude/` as reference material when pasting. |
