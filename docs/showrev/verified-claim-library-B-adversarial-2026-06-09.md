---
title: Verified Claim Library B — Adversarial Re-Verification of P3B
status: ACTIVE
last_updated: 2026-06-09 14:15 EST
version: v1
audience: Justyn (operator), Tim (sales)
purpose: Adversarial re-verification of P3B's contradiction sweep. Independent substrate retrievals; no acceptance of P3B's interpretation without verbatim re-pull.
inputs:
  - /Users/justynszymczyk/Documents/GitHub/ruflo/docs/showrev/verified-claim-library-B-contradictions-2026-06-09.md (P3B output under review)
  - sr_company_evidence (Supabase project slttpknnuthbttjuzrnz), retrieved 2026-06-09 ~14:00 EST
  - /Users/justynszymczyk/Documents/GitHub/ruflo/docs/showrev/inorsa-positioning-brief-2026-06-09.md
---

## Summary

- Total contradictions claimed by P3B: 5 (0 HARD, 5 SOFT — including ALLO and Finley flagged as actionable per-prospect risks)
- VERIFIED (real contradiction, substrate-grounded): 5/5
- FALSE POSITIVE: 0
- NUANCED (real but soft): 3 (uniqueness/AT&T/40-50% — all already tagged SOFT by P3B)
- MISSED contradictions found by adversarial sweep: 0
- **Trust score: ~95%.** P3B's substrate IDs all resolve verbatim, source URLs cite real publications, no fabricated quotes detected. The minor framing critique (P3B labels ALLO as "soft" overall while flagging it "HARD for ALLO specifically") is a categorization preference, not a verification failure.

## Hard contradiction re-verification

### ALLO Communications — VERIFIED REAL
Pulled `ev_1d87690e`, `ev_e85f1de6`, `ev_49cc272d`, `ev_f894816a` directly. All four exist in sr_company_evidence, all dated 2025-06-24 / 2025-07-02, all cite Light Reading URLs that match P3B's citations verbatim. Key substrate quotes (mine, not P3B's paraphrase):

- `ev_1d87690e`: "Allo offered voluntary resignations in late June 2025 then laid off 9% of workforce (~under 70 employees in 40 Nebraska communities) on July 2 2025 as part of cost-cutting amid BEAD delays. About 1,600 employees pre-cut." Source: lightreading.com/broadband/allo-lays-off-9-percent-of-staff-after-voluntary-resignation-offer
- `ev_e85f1de6`: "'Our investors are unable to provide capital to support the previously approved growth plans.' Internal memo cited BEAD delays as a cause of reduced fiber expansion." Source: lightreading.com/broadband/allo-seeks-voluntary-resignations-amid-need-for-more-funding
- `ev_49cc272d` adds: "'Extreme and radical changes at the federal policy level make debt and equity investors cautious about committing to future investments.'"

P3B's "BEAD delays / 9% layoff / investor pullback" claim is grounded in three independently dated rows. Not a paraphrase artifact.

**Action: YES — pull this prospect from the BEAD-as-tailwind framing wave.** Either remove from cohort or swap to operational-efficiency / margin-protection frame. Sending "BEAD is driving demand" here would be a substrate-checkable embarrassment.

### Finley Engineering — VERIFIED REAL
`ev_b2ff1fb1` confirmed at `https://finleyusa.com/about` (2026-01-01 dated). Verbatim claim text from substrate (mine):

> "Published whitepapers: 'Why BEAD signals a critical moment for strategic planning' and 'GIS – Smarter Maps / Better Decisions: outgrowing AutoCAD, leveraging GIS to transform legacy data into business gold'."

This is a real Finley marketing claim. They publicly position themselves as past the manual-CAD pain. Sending Finley a "you're buried in manual production" email would conflict with their own published thought leadership.

**Action: YES — swap Finley's email frame.** Don't lead with manual-drawing-pain. Lead with scale/volume framing ("operators tell us 250 mi/yr breaks the model — what are you seeing across your client portfolio?") or pull. Finley is on the focus-100 (FC2026 speaker `ev_367e97c4`, Ryan Kudera, Manager Client Services).

## Soft contradiction re-verification

### VETRO / Spatial Business Systems / AirWorks competitors — VERIFIED
All three substrate rows pulled cleanly:
- `ev_3c5925fc` VETRO — Pete Pizzutillo + Jeremiah Sloan speaking FC2026
- `ev_eb79c5ef` Spatial Business Systems — Scott Casey, VP Telecom (Littleton CO) speaking FC2026
- `ev_7a0fbbf8` AirWorks Solutions — Adam Kersnowski, Co-Founder & SVP, speaking FC2026

All dated 2026-05-01, all cite "FC2026 speaker page". The "GIS-to-CAD is contested" framing is substrate-grounded. P3B's recommendation (sharpen to "deterministic, source-traceable CAD output") is sensible — Inorsa's per-point metadata + page-splitting mechanism (per `reference_inorsa_fiber_drawings_product.md`) is genuinely more specific than VETRO's "mapping platform" or AirWorks' "aerial-LiDAR for survey."

### 40-50% permit rejection stat absence — VERIFIED
Ran independent search across `permit`, `reject`, `kickback`, `first pass` patterns. Zero rows return any rejection-rate %. P3B's "absence of evidence, not contradiction" framing is correct. Recommendation to attribute ("operators tell us...") rather than assert as published data is sound.

### AT&T "nine months" tension — VERIFIED COSMETIC
`ev_69f559c6` pulled directly: "Developed fiber infrastructure in nine months with streamlined permit aggregation process." Source: community-broadband-bits / Santa Cruz County story. P3B correctly classifies this as LOW severity — AT&T is not ICP (above the 250 mi/yr fiber-operator band; hyperscaler). The framing reminder is good ("biggest problem in the industry" overstates — it's the biggest problem at the operator size Inorsa serves), but no action required for this wave.

## Missed contradictions

I ran 5 independent searches against substrate looking for things P3B might have missed:

1. "outsourcing adds handoffs, increases risk" (Chris one-pager) — zero substrate rows refute or corroborate. Two FC2026 prime contractors surfaced (Dycom `ev_b39f9e33`, Unitek `ev_72c043f6`) but neither speaks to the outsourcing-adds-risk framing. Clean.
2. "Manual coordination that worked at 50 miles breaks at 250" — zero direct refutation. Substrate has 700K passings on one operator, $175M expansion raises, GFiber/Astound combination — all scale signals but none contradict the breaking-point framing. Clean.
3. "BEAD margin / can't capitalize" customer objection (jtbd-matrix.md:81) — zero substrate hits on "EBITDA" or "capitalize." This is Inorsa-internal customer quote, not industry-substrate corroborated. Mild attribution risk; same caveat as P3B's 40-50% point. Not a new contradiction.
4. "Bentley OpenRoads / Katapult Pro / 3GIS / IQGeo" absence — confirmed zero rows. P3B's section IV note is accurate.
5. Other focus-100 with BEAD-distress signal beyond ALLO — confirmed zero. Searched layoff/resignation/cost-cut/pullback/reduced-fiber/workforce patterns. Only the one operator's distress surfaces. P3B's section IV claim "most focus-100 operators have growth-not-contraction signal" holds.

**Net: P3B did not miss anything material that an independent substrate sweep can surface.**

## Recommendation

**Trust P3B's findings.** Substrate IDs resolve. Quotes are verbatim. URLs cite real Light Reading + finleyusa.com + community-broadband-bits pages. Categorization (HARD vs SOFT) is defensible — none of the five contradictions are "the substrate says X, Inorsa says NOT X" verbatim refutations, so HARD = 0 is honest. SOFT = 5 with two actionable is accurate.

**Two concrete changes before cohort fires:**

1. **Pull the ALLO target from any "BEAD as tailwind / demand pressure" email frame.** Either remove from this wave entirely or swap to operational-margin angle ("operators under capital pressure are leaning into efficiency"). Substrate evidence is dated June-July 2025 — recent enough that the operator's Brand Officer + Construction Officer attending FC2026 (`ev_da53966c`) is happening *under* the cost-cutting overhang, not before it.
2. **Pull Finley Engineering from any "buried in manual production" email frame.** Their own website says they've outgrown AutoCAD. Pivot to a scale/volume framing or a peer-AE framing ("how are you handling 250-mile builds across multiple operator clients?").

**One process change:** P3B's recommendation to add a per-prospect substrate pre-flight check is the right call. Before each cold email locks, the composer should query `sr_company_evidence` for the target company and reject any frame that the prospect's own public claim contradicts. This is a generalizable rule, not just a two-prospect patch.

**For the 40-50% permit rejection stat:** Attribute it. "Operators tell us 40-50%..." not "the industry shows 40-50%." Same for the "10X Your Engineering" and "56 hours to 3 minutes" proof points — keep them, but never source them to substrate that doesn't exist.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 14:15 | Claude (adversarial reviewer) | Re-verified all 5 of P3B's contradictions against sr_company_evidence directly. 5/5 verified. Trust score ~95%. Two prospects confirmed as actionable per-prospect risks. |
