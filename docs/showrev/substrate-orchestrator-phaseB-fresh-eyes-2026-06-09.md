---
title: Phase B Stat Library — Fresh-Eyes Audit
status: ACTIVE
last_updated: 2026-06-09 EST
version: v1
---

## Verdict

**Architecture is sound. Content layer has 1 confirmed citation failure, 1 likely failure, and material coverage gaps that need composer-side null handling before P2 wet run.** The verbatim-paste rule is enforced at the type/freeze layer (good). Determinism is clean. The 30-stat library is undersized for 5×6=30 persona-bucket cells (only ~17 cells have ≥1 candidate). Ship-able with documented gap if composer handles `NoVerifiedStatError` by omitting the P.S. silently — verify that wiring before send.

## Stat content integrity (5 spot-checked stats — verified vs not)

| ID | Cited number | URL accessible | Verdict |
|---|---|---|---|
| `bead_42_45b_pool_2026` | $42.45B + 15-25 states + 6-12mo | YES (fiberbroadband.org) | **FAIL** — article says "65% of BEAD locations use fiber" and Q1 2026 funding/H2 2026 construction. **No $42.45B figure, no "15-25 states", no "6-12 months" timeline in source.** Numbers appear correct from other public sources but **not in cited URL**. Citation-source mismatch = fabrication-class risk. |
| `unserved_1m_post_bead_2026` | 1 million unserved | YES (broadbandexpanded.com) | **PASS** — article explicitly says "ACLP estimates that upwards of 1 million locations could remain unserved post-BEAD." Cleanly cited. |
| `rdof_default_37pct_2026` | 37% / $3.3B of $9.2B | 403 blocked | **UNVERIFIED** — ecmag.com returns 403 to WebFetch. Cannot confirm or refute. Numbers match public RDOF reporting historically but URL not independently checkable from this session. Operator should manually verify. |
| `osp_cad_salary_75k_2026` | $75,669 high-end | 403 blocked | **UNVERIFIED** — Glassdoor blocks WebFetch. Salary figure is hyper-specific (`$75,669` to the dollar) — high tamper-risk if Glassdoor's number drifts. Recommend periodic check. |
| `kuiper_20pct_grants_2026` | Kuiper 20% of BEAD grants by location | 403 blocked | **UNVERIFIED** — Light Reading 403. Kuiper-20% is a strong, recent claim; spot-check before wet run. |

**Net: 1 PASS, 1 confirmed FAIL, 3 unverifiable from this session.** The FAIL is significant — `bead_42_45b_pool_2026` cites a URL that does not contain the cited numbers. If composer pastes that claimText, the email asserts $42.45B sourced to an FBA page that says nothing of the kind. Recipient can call the link and catch us. **Fix this stat or remove it before P2.**

## Coverage gap analysis (persona × bucket × topic — what's missing)

Bucket → Topic map is exhaustive (6→6). Persona × Bucket = 30 cells. Walking the 30 stats:

**Zero-stat cells (composer will throw `NoVerifiedStatError`):**
- **PM** persona: only present on `gis-cad` + `diagnostic`. PM has ZERO stats for bead, permit, peer-pattern, capacity, ops-cost. **5 of 6 buckets dead for PM.**
- **VP_Ops × peer-pattern**: zero. (peer-pattern stats list CEO/COO/VP_Eng only.)
- **VP_Eng × ops-cost × bead-funded**: 3 candidates exist but none tag both `private-clec` AND `bead-funded` for VP_Eng cleanly — narrow.
- **VP_Eng × permit**: only 1 candidate (`fcc_locations_database_2026`) — single point of failure if it goes stale.

**Critical:** does the composer silently omit the P.S. on miss, or does it fail-loud? Spec §8 test 9 simulates the `psClaimId===null requires email.ps===null` invariant — that's the right contract. **Verify the run-pipeline wiring catches `NoVerifiedStatError` and sets both to null** rather than crashing the email.

The smoke coverage test passes at 70%+ on a 10-prospect synthetic cohort. P2 cohort is 28 cold prospects with skewed personas — real-world miss rate likely higher. Recommend running the actual coverage script against the P2 list before wet run.

## Source-tier completeness (what's there, what to add)

**Present (21 domains):** primary covers NTIA, FCC, Congress, BroadbandUSA, Texas Comptroller. Trade includes FBA, Light Reading, Broadband Breakfast, EC Mag, Route Fifty, GIS User, Broadstaff, CHR, Light Brigade, Glassdoor. Vendor includes Rakuten Symphony, commmesh, YFC, ASE, Outsource2India.

**Missing / worth adding for v1.2:**
- **Cartesian** (cartesian.com) — analyst, primary-tier-equivalent for fiber economics
- **Omdia** / **Dell'Oro** — fiber market sizing
- **NTCA** (ntca.org) — Rural broadband association, trade-tier
- **WIA** (wia.org) — Wireless industry, useful for tower-co cross-coverage
- **USTelecom** (ustelecom.org) — Trade-tier corroboration
- **Vantage Point Solutions** (vantagepnt.com) — RUS/BEAD engineering consultant, vendor-tier
- **Broadband Breakfast podcast transcripts** — already on allowlist but worth a separate canonical list

**Glassdoor at trade tier** is debatable — it's user-reported salary data with no editorial standard. Argue it should be `vendor` tier (weight 0.4), not `trade` (0.7). The `$75,669` figure is precise enough to look authoritative but the source is not.

## Risks not in internal critiques

1. **Citation-source drift (the big one).** The `bead_42_45b_pool_2026` failure proves the numericValue-substring check is necessary but not sufficient. The library validates that the number appears in `claimText` — it does NOT validate that the number appears in the cited URL. A hand-curation slip (right number, wrong URL) ships unblocked. **Recommend: build a periodic citation-verification script that WebFetches each URL and greps for `numericValue`. Run quarterly, before each refresh.**

2. **Glassdoor / Light Reading / EC Mag block WebFetch.** 3 of 21 allowlisted domains can't be programmatically re-verified. That kills the refresh story for ~10 stats. Either accept manual quarterly checks or proxy through a fetch service that handles UA spoofing.

3. **Hard 24mo cutoff with no refresh process.** Stats published 2026-01-15 expire 2028-01-15 silently. If no one re-curates, the library bleeds stats and miss rate climbs. **Recommend: add an `expiresAt` warning field at 18mo and a CI check that flags stats within 90 days of cutoff.**

4. **`numericValue` is sometimes not a number.** Entries like `"Fourth Pillar"`, `"walk away"`, `"Know Your Rights"`, `"NEPA"`, `"publicly state"`, `"dominant"`, `"this year"`, `"majority"`, `"every state"`, `"state-by-state"`, `"May 2026"`, `"2027"`, `"2026"` are used as `numericValue`. The substring check still works mechanically, but these aren't statistics — they're phrases. The library calls them stats, but they're really anchors. This dilutes the "anti-fabrication" framing. **Consider: a `claimType: 'number' | 'phrase' | 'date'` field so composer can prefer numeric claims when both are available.**

5. **Miss-log path is shared global state.** `data/showrev/stat-library/miss-log.jsonl` — concurrent pipeline runs will interleave writes. `appendFileSync` is atomic per-call on POSIX but the file grows unbounded with no rotation. Operations problem in 60 days.

6. **No rate-limiting on miss-log.** A pipeline run that misses on every prospect appends N lines. Not a security risk, but tied to #5.

7. **Determinism integrity: clean.** Sort key is `(rankScore desc, id asc)`. No `Date.now()` in scoring (uses `nowOverride`). No `Math.random()`. No Set iteration order dependence. **Determinism is solid.** One minor: `recencyDecay` floors at the month, so two stats published 3 days apart in the same month score identically — tiebreak by id is the right call.

## Recommendation for operator

**Block P2 wet run until:**
1. Fix or remove `bead_42_45b_pool_2026` — cited URL does not support the numbers.
2. Manually verify the 3 unverifiable stats (rdof, glassdoor, kuiper).
3. Confirm run-pipeline-v2 catches `NoVerifiedStatError` and sets `email.ps = null` (don't crash).
4. Run actual coverage script against the 28-prospect P2 list, not synthetic cohort.

**Defer to v1.2 (post-wet-run):**
- Periodic citation-verification script.
- `claimType` field (number/phrase/date).
- Miss-log rotation.
- Add Cartesian / Omdia / NTCA / WIA / USTelecom to source-tiers.
- Demote Glassdoor to vendor tier.
- Add expiresAt warning at 18mo.

**Ship architecture as-is.** The code is good. The content layer needs a citation-pass before wet run.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 | Claude | Fresh-eyes audit. 1 spot-checked stat (PASS), 1 FAIL, 3 unverified. Coverage gaps in PM persona + peer-pattern × VP_Ops. Risks not in internal critiques: citation drift, refresh process, numericValue-as-phrase. |
