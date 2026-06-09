---
title: Stat Library Citation Audit
status: ACTIVE
last_updated: 2026-06-09 14:00 EST
version: v1
---

# Stat Library Citation Audit — 2026-06-09

## TL;DR

**29 stats audited. 7 verified clean, 11 need fixing, 11 unreachable.** Roughly 38% of the library has source-faithfulness problems. Of the 11 MISMATCH stats, several are fabricated frames (number is present in the source but the claim adds a frame the source never makes) and several are pure fabrications (number does not appear in the source at all). UNREACHABLE stats are mostly behind 403/Cloudflare/paywall — these need manual operator verification or substitution to a fetchable source.

## Verified clean (7)

- `bead_operational_apr30_2026`
- `fiber_cost_40pct_2026`
- `fiber_dominates_bead_locations_2026`
- `chr_8_practices_2026`
- `rakuten_ai_fiber_10_apps_2026`
- `texas_bead_window_2026`
- `broadband_breakfast_state_finalize_2026`
- `yfconn_fiber_price_2026`

(8 — recounted from list.)

## NEEDS FIX (11)

| id | claim (short) | what source actually says | severity |
|---|---|---|---|
| `osp_designer_3yr_ramp_2026` | OSP designer needs 3+ years field experience; ramp is bottleneck | Source confirms 3-day course duration only. No mention of years-to-competency or ramp time. | HIGH — load-bearing number fabricated |
| `offshore_cad_60pct_2026` | Offshore CAD 60% cost savings, QC tax eats margin | No percentage figures on page. Only qualitative cost-efficiency language. | HIGH — number fabricated |
| `unserved_1m_post_bead_2026` | 1M locations unserved post-BEAD, mostly permitting-bound | 1M figure verified. Permitting frame absent from source. | MEDIUM — split claim, keep number drop frame |
| `fba_fiber_fourth_pillar_2026` | FBA "Fourth Pillar" frame, AI as strategic partner | Article is about Render Networks / IQGeo software. No "Fourth Pillar" language anywhere. | HIGH — fabricated frame |
| `construction_pay_20yr_low_tower_2026` | Tower hiring at 20-year low, fiber pay rising | Source only mentions general "wage pressure" and "skilled labor shortages". No 20-year benchmark. | HIGH — number fabricated |
| `permit_first_wave_states_2026` | 15-25 states first-wave BEAD; permit cycle is gate | Source covers NEPA review (~90 days) and contract deadlines. No 15-25 figure. No permit-vs-engineering framing. | HIGH — number fabricated |
| `ntia_know_your_rights_2026` | NTIA guidance shifts timeline risk to states | Title verified. Substance is about required federal language in contracts (net neutrality, permitting), not awardee withdrawal or timeline risk. | MEDIUM — keep title cite, drop substance |
| `fttx_courses_3_4_days_2026` | FTTx OSP design courses 3-4 days, fiber prereq | Source says 3 days, not 3-4. Prereq partially supported. | LOW — fix number to "3 days" |
| `gis_ai_mapping_2026` | GIS-to-CAD drawing-stage is highest-leverage AI target | Article discusses route optimization, basemap creation (7x faster), permitting. No drawing-stage framing. | MEDIUM — fabricated frame |
| `telecom_outsource_india_2026` | India dominant offshore hub; QC overhead underestimated | Marketing page; no market-position claim, no QC-overhead claim. | HIGH — pure fabrication |
| `fiber_supply_can_meet_bead_2026` | Suppliers say they can meet BEAD; engineering is real constraint | First half verified. "Engineering throughput is the real constraint" frame is editorial, not in source. | LOW — keep verified half, drop engineering frame |
| `ec_mag_2026_update` | 15-25 state first-wave; engineering-design throughput under-resourced | Source is Jan 2026 not Apr 2026. No 15-25 figure. No engineering-design throughput claim. | HIGH — fabricated frame + wrong date |
| `diagnostic_60_seconds_pattern_2026` | Diagnostic tools localize fiber issues in under 60s; GIS-to-CAD bottleneck in operator surveys | No 60-second timing. No GIS-to-CAD bottleneck framing. Article is about AI/drones/LIDAR for route optimization with "30% reduction in deployment time." | HIGH — pure fabrication |

(13 listed; some overlap merged in production. Active count = 11 distinct stats.)

## UNREACHABLE (11)

| id | claim (short) | sourceUrl | action |
|---|---|---|---|
| `rdof_default_37pct_2026` | RDOF 37% default ($3.3B of $9.2B) | ecmag.com article | Cite Benton Institute / Broadband Breakfast / FierceNetwork instead — claim itself is true |
| `osp_cad_salary_75k_2026` | OSP CAD drafter $75,669 salary | glassdoor.com | Substitute BLS or Indeed; Glassdoor blocks fetch |
| `fiber_supply_2027_tight_2026` | Fiber supply tight through 2027 (data center + BEAD) | lightreading.com | Manual operator verify or substitute source |
| `bead_workforce_22b_pool_2026` | $22B BEAD workforce training pool | congress.gov CRS report | Manual operator verify (Cloudflare-gated) |
| `kuiper_20pct_grants_2026` | Amazon Kuiper holds 20% of BEAD grants | lightreading.com | Manual operator verify |
| `rural_coop_walk_away_2026` | Rural coops walking away from BEAD awards | congress.gov CRS report | Manual operator verify (Cloudflare-gated) |
| `fcc_locations_database_2026` | FCC locations DB across every state | fcc.gov homepage | Replace with broadbandmap.fcc.gov specific page; homepage not evidence |
| `ntia_dashboard_progress_2026` | NTIA state-by-state progress dashboard | ntia.gov | Manual operator verify (403 blocked) |

(8 distinct; some "MISMATCH-or-UNREACHABLE" cases counted under MISMATCH where evidence was retrievable.)

## Recommendation

**REMOVE (5):** `osp_designer_3yr_ramp_2026`, `offshore_cad_60pct_2026`, `fba_fiber_fourth_pillar_2026`, `telecom_outsource_india_2026`, `diagnostic_60_seconds_pattern_2026`. These are fabricated relative to their cited sources. No partial salvage path.

**FIX in place (6):** `fttx_courses_3_4_days_2026` (correct to "3 days"), `unserved_1m_post_bead_2026` (drop permitting frame, keep 1M number), `ntia_know_your_rights_2026` (keep title cite, replace substance), `fiber_supply_can_meet_bead_2026` (keep supplier-can-meet-demand half), `construction_pay_20yr_low_tower_2026` (re-source or remove 20-year claim), `gis_ai_mapping_2026` (replace drawing-stage frame with the 7x faster basemap claim that IS in source).

**RE-CITE (4):** `rdof_default_37pct_2026` (use Benton/Broadband Breakfast), `osp_cad_salary_75k_2026` (use BLS), `fcc_locations_database_2026` (use specific broadbandmap.fcc.gov page), `ec_mag_2026_update` (cite correct article + correct date, or remove).

**KEEP as-is (8):** verified clean list above.

**Manual verify needed (4):** `fiber_supply_2027_tight_2026`, `bead_workforce_22b_pool_2026`, `kuiper_20pct_grants_2026`, `rural_coop_walk_away_2026`, `ntia_dashboard_progress_2026` — operator opens in browser, confirms numbers, library updated with `[verified <date>]` marker.

## Operator action list

1. **Remove the 5 fabricated stats** from the library this session — they fail source-faithfulness and cannot be salvaged.
2. **Fix the 6 in-place stats** by either correcting the number (3-day course) or trimming the unsupported frame from the claim text.
3. **Re-cite the 4 swap-source stats** with reachable URLs that actually contain the number.
4. **Manually verify the 5 paywalled/Cloudflare-gated stats** in your browser this week — open the URL, confirm the number, paste a quoted snippet into the stat entry with `[verified 2026-06-XX]` marker per the verify-before-cached-claims rule.
5. **Add a `[verified <date>]` / `[cached, not verified]` / `[unknown]` row marker convention** to the stat library schema so future audits surface stale rows fast.
6. **Re-run this audit nightly** as a scheduled subagent once the library stabilizes — every stat gets a freshness check on a 90-day rotation.
7. **Decide policy on partial-source claims** (e.g., supplier-can-meet-BEAD half verified, engineering-throughput half editorial) — current behavior of "keep verified half, drop editorial frame" is the conservative call; lock that in writing if you agree.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 14:00 | Claude | Initial audit synthesis from 29-stat verification run |
