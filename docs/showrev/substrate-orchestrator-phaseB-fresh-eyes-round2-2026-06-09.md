---
title: Phase B Stat Library — Fresh-Eyes Audit Round 2
status: ACTIVE
last_updated: 2026-06-09 EST
version: v1
---

## Verdict

**Punch list partially closed. 1 new citation FAIL surfaced (`gis_ai_mapping_2026`), 1 collateral FAIL from prior-removed-stat (`fba_fiber_fourth_pillar_2026` cites the same FBA-software page that doesn't discuss BEAD). The fabricated `bead_42_45b_pool_2026` is gone, count is 29, `kind` field is in, source tiers updated, Glassdoor demoted — those four items closed cleanly. But "URL-verify scaffolding" is not what the original audit asked for: it's a WARN-once at load for 403-prone domains, not a periodic citation-verification script that fetches each URL and greps for `numericValue`. Do not call that gap closed.**

## Round-2 spot-check (3 NEW random stats vs cited URLs)

| ID | Cited claim | URL fetch | Verdict |
|---|---|---|---|
| `bead_workforce_22b_pool_2026` | $22B BEAD non-deployment pool | congress.gov 403 | **UNVERIFIED** — Congress.gov blocks WebFetch. Number matches public NTIA reporting historically. Manual check required. |
| `kuiper_20pct_grants_2026` | Kuiper 20% of BEAD grants by location | lightreading.com 403 | **UNVERIFIED** — Light Reading still 403s. This was unverified in round 1 too; remains unverifiable. |
| `gis_ai_mapping_2026` | "AI-assisted GIS-to-CAD mapping as highest-leverage automation target" | YES (gisuser.com) | **FAIL** — Article does not say this. Article discusses reality capture, route optimization, AI-driven analysis broadly. Closest passage: "AI-powered mapping platforms that convert massive amounts of field data into actionable basemaps up to seven times faster than manual processes" — that's field-data → basemaps, NOT GIS-to-CAD. **Same citation-source mismatch class as the bead_42_45b FAIL from round 1.** |

**Collateral check (FBA software page cited by 2 stats):** `fba_fiber_fourth_pillar_2026` cites the FBA "Building Fiber Networks Through Software" page for the "Fourth Pillar of AI infrastructure" framing. WebFetch confirms the article does NOT mention "Fourth Pillar" OR BEAD location awards. **Second citation-source FAIL on the same URL.** `diagnostic_60_seconds_pattern_2026` cites the same gisuser.com URL — and the "60 seconds" claim is not in that article either.

**Net new failures: at least 2 (gis_ai_mapping, fba_fiber_fourth_pillar). 1 likely (diagnostic_60_seconds, same URL as the failed gis stat). Round 1 found 1 confirmed FAIL → removed. Round 2 finds 2-3 more of the same class still in the library.**

## What closed cleanly

- `bead_42_45b_pool_2026` removed (verified absent via jq).
- Count is 29 stats (verified).
- `kind: 'number' | 'phrase'` discriminator on all 29.
- Source-tier additions present (Cartesian, NTCA, WIA, USTelecom primary; Omdia trade).
- Glassdoor demoted to vendor; `osp_cad_salary_75k_2026.sourceTier` is `"vendor"`.
- Miss-log rotation logic added (1 MiB).
- 82/82 stat-library tests pass per commit message.

## What did NOT close

1. **"URL-verify scaffolding" is the wrong thing.** What's there: a load-time WARN-once that lists fetch-fragile-domain stats. What was asked for in round 1: "build a periodic citation-verification script that WebFetches each URL and greps for `numericValue`. Run quarterly, before each refresh." No such script exists in `scripts/` or anywhere else. The WARN-once helps a human remember, but does not catch citation-source drift like the FAIL I just found.

2. **Citation-source drift is still shipping.** The fix removed the one stat round 1 flagged. It did NOT re-audit the other 30 against their cited URLs. Round 2 found another in 3 spot-checks. Extrapolated: of the ~17 stats whose URLs are programmatically fetchable, probably 2-4 more have similar mismatches.

3. **`fba_fiber_fourth_pillar_2026` and `diagnostic_60_seconds_pattern_2026` need the same treatment as the removed stat** — either fix the URL or remove the stat. They cite pages that don't support their claimText.

## Recommendation

**Do not call Phase B "audit-closed."** The punch-list checkbox-items closed (count, kind, tiers, fragile-warn, miss-log rotation), but the underlying class of bug — citation-source drift — is still present and demonstrable. Before P2 wet run:

1. **Build the actual periodic citation-verification script** (`scripts/verify-stat-citations.mjs`): for each stat where `source.url` is fetchable, WebFetch and case-insensitive-substring-check for `numericValue` in the markdown. Fail-list any miss. Run before every wet-run.
2. **Remove or fix `gis_ai_mapping_2026`, `fba_fiber_fourth_pillar_2026`, `diagnostic_60_seconds_pattern_2026`** (all three depend on URLs that don't contain the cited claims).
3. **Re-run round 3 audit** on a fresh-random 5 stats after fixes.

Architecture is still sound. Content layer needs a real audit pass, not just a fix of the one stat that got flagged.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 | Claude | Round-2 fresh-eyes. 3 spot-checks (1 FAIL, 2 unverified 403). Collateral check found 2nd FAIL. Punch-list partially closed. URL-verify scaffolding is WARN-once at load, not a citation-verification script. |
