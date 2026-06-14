---
title: Adversarial red-team round 3 — Send Priority spec v2.1
status: DRAFT
author: Claude (skeptic lens, round 3)
date: 2026-06-09
supersedes_check: round-2 killers (WC1 broken URL, WC2 number-mismatch, WC3 contradiction, halluc=split loophole)
---

## Verdict

**SHIP-WITH-GAP.** v2.1 closes round-2 killers in the *steady-state* but leaves a 24-hour fresh-rot window (WC1), a tokenizer ambiguity (WC2), a keyword-coverage gap (WC3), and is fully blind to two new composer-side hallucination patterns (WC4, WC5). Recommend ship v2.1 + immediate v2.2 patch covering WC4/WC5 before high-volume sends.

## WC1 — 24h fresh-rot window

Nightly job sets `url_dead`. URL that 200s at 02:00 UTC and 404s at 02:05 UTC stays `url_dead=false` for ~24h. WC1 partially survives. Mitigation: cite-time HEAD with 1s timeout, 7-day stale-cache. Cheap; closes the window. ~1hr.

## WC2 — tokenizer ambiguity

Spec says "numeric-token diff" but does not define the tokenizer. `"1,700 miles"` vs `"1700 miles"`: naive `\d+` regex yields `[1, 700]` vs `[1700]` → false-positive HOLD cap. Naive `[\d,]+` yields `["1,700"]` vs `["1700"]` → false-positive again unless commas stripped pre-compare. **Required**: normalize numbers (strip `,`, parse to Number, set-compare). Also: `"1.5K"`, `"1,500"`, `"fifteen hundred"` all mean 1500. Defer word-numerals; close the comma/K case now. ~30min.

## WC3 — keyword-coverage gap

7-keyword substring list catches Finley-class only. Any contradiction phrased differently (e.g., "we standardized on Esri ArcGIS for as-builts in 2024" — no listed keyword) escapes. Same risk as round-2: the column exists, the detector under-fires, AE trusts the green light. Mitigation: log every prospect substrate that mentions GIS/CAD/ArcGIS/Esri/automation for operator review even when no flag fires. Build operator-extension UX. Don't claim "contradiction detection" — call it "known-keyword guard."

## WC4 — body-inserted number with no row to diff against (NEW)

Composer writes "Allo serves 1,700 miles across 12 states" citing `ev_4471` (which only says "north of 1500 miles"). The "12 states" number was inserted by composer with no `claim_id` attached to that token. v2.1 diff iterates cited rows; an uncited number in the body is never compared to anything. **v2.1 misses.** Fix: extract ALL numeric tokens from body, require each to appear in AT LEAST ONE row referenced by the surrounding sentence's `claim_ids` set, else flag. ~2hr.

## WC5 — fabricated attributed quote (NEW)

Row says `"north of 1500 miles fiber"`. Composer writes `'"We've crossed 1,500 miles," said CEO Brad Moline.'` Numeric tokens match. v2.1 passes. Quote and attribution are fabricated. **v2.1 fully blind.** Fix: flag any body sentence containing `"…"` or attribution verbs (`said|told|wrote|announced`) unless the row's `claim` text contains the quoted span. Cap at HOLD. ~2hr.

## halluc_pts split

null=0.5, split=0.25, fail=0 + raw≥7 cap at OK adequately closes round-2 finding. Edge: raw=6.99 with halluc=split rounds to priority=7 SEND? Re-check: cap fires on `raw_score>=7` pre-round. raw=6.99 → priority=7 → cap does not fire → SEND. **Bug.** Move cap check to post-round priority or change condition to `priority >= 7`. ~5min.

## Hardening recommendations (priority order)

1. **WC4 uncited-number guard** (HOLD cap) — 2hr — highest blast radius
2. **WC5 quote-attribution guard** (HOLD cap) — 2hr — brand-damage risk
3. **WC2 number normalizer** (strip commas, parse K/M suffixes) — 30min
4. **halluc cap condition fix** (priority>=7 not raw>=7) — 5min
5. **WC1 cite-time HEAD with cache** — 1hr
6. **WC3 logging-without-flag** for operator keyword extension — 1hr

Total: ~7hr. Ship v2.1 now for non-fabrication paths; gate WC4/WC5 fixes before any send volume >50/day.

## Bottom line

v2.1 is the first version where the *catalog* of known-bad patterns is bounded and named. WC4 and WC5 are the next layer: composer can still hallucinate when the substrate is shaped to let it. The pattern is "tighten the cite check, attack moves to the body text the cite check doesn't read." Round 4 should pressure-test body-vs-substrate semantic equivalence, not just numeric tokens.
