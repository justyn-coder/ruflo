---
title: FBA Claim Verification — Adversarial Re-check of Phase 1A
status: ACTIVE
last_updated: 2026-06-09 EST
version: v1
---

**Method.** Re-fetched both Phase 1A sources directly via WebFetch (PDF binaries saved locally), extracted with `pdftotext -layout`, then grep'd for every keyword Phase 1A relied on. Did not read Phase 1A's quoted text as authoritative. Retrieval timestamp: 2026-06-09 ~15:40 EST.

Sources:
- Cartesian/FBA `Fiber Deployment Cost Annual Report 2025` (CreationDate Jan 15 2026) — `fiberbroadband.org/wp-content/uploads/2026/01/FBA_Cartesian_Fiber-Deployment-Cost-Annual-Report_2025.pdf`
- FBA `Local Permitting for Fiber Network Projects: The Good, the Bad, and the Ugly` (CreationDate Aug 22 2025) — `fiberbroadband.org/wp-content/uploads/2025/08/FBA-Whitepaper_Local-Permitting-for-Fiber-Network-Projects_FINAL-1.pdf`

## Claim 1 re-check ("40–50% first-pass rejection")

**Phase 1A's "NOT VERIFIED" verdict is correct. Independently confirmed.**

Search log on both PDFs (full text, case-insensitive regex):
- `reject|denied|denial` → Cartesian: 0 hits. Whitepaper: 1 hit ("areas where aerial deployment is impractical or denied" — unrelated, refers to physical access denial, not permit rejection).
- `first[- ]pass|first[- ]time|first attempt|resubm|reapply|kick.?back|sent back|fail` → 0 substantive hits in either document.
- `40%|50%` in permit-rejection context → 0 hits. The only "40%" in Cartesian is about underground-vs-conduit cost (line 50); the only "30–50%" in the whitepaper refers to the *speedup from digital permitting systems* (line 528-532), not a rejection rate. Phase 1A read this correctly.

No FBA-published first-pass rejection percentage exists in either flagship document. The P.S. claim "FBA data shows 40-50% of utility permits get rejected first pass" is fabricated or sourced elsewhere (not FBA).

## Claim 2 re-check ("permitting = THE top reason BEAD slips")

**Phase 1A's "PARTIAL — overstated" is fair, with one correction.**

Verbatim from PDF-page 28 of Cartesian (Phase 1A cited as p.27 — page-number error, see below):

> "Permitting, utility locates, and make-ready work were the most cited drivers of delays. Permitting issues were particularly impactful, with respondents reporting timelines extending by approximately 20% compared to previous years—extending projects by two months in many cases, and up to 18 months in the most egregious of cases."

FBA ranks these as a co-equal trio of "most cited drivers." Permitting gets the most detailed quantitative treatment and is listed first. Phase 1A is correct that "a top driver" is defensible while "THE top reason" overstates. Additionally, the Cartesian survey covers fiber deployment delays *broadly*, not BEAD-specific — calling permitting "**the** top reason BEAD timelines slip" stitches together two distinct things. Phase 1A's read is sound.

## Replacement #1 verification — 46% material delays

Verbatim from Cartesian (PDF-page **28**, not 27 as Phase 1A claims):

> "In 2025, nearly half (46%) of the respondents faced material project delays."

And immediately below: "Permitting, utility locates, and make-ready work were the most cited drivers of delays."

- Quote text match: VERIFIED
- Page reference: **MISMATCH** — Phase 1A says p.27, actual printed page is p.28. Page 27 is the labor/materials cost-driver section. Off-by-one error.
- Verdict: **VERIFIED on substance, MISMATCH on page citation.** Fix p.27 → p.28 before using.

## Replacement #2 verification — 62% expect 2026 delays

Verbatim from Cartesian (PDF-page **30**, matches Phase 1A):

> "Nearly two-thirds of respondents (62%) expect deployment delays, including 49% who anticipate 'somewhat longer' timelines next year and 13% who are bracing for 'significant' delays… Respondents noted that permitting timelines and utility locates are expected to be key drivers of delays."

- Quote text match: VERIFIED
- Page reference: VERIFIED (p.30)
- Verdict: **VERIFIED.**

Risk flag: there is a *separate* "62%" stat on the same page that refers to cost increases of <10% ("Nearly two-thirds (62%) expect increases of less than 10%"). If anyone repurposes this stat, be careful which 62% is meant.

## Replacement #3 verification — permit delays ~20% / up to 18 months

Verbatim from Cartesian (PDF-page **28**, not 27):

> "Permitting issues were particularly impactful, with respondents reporting timelines extending by approximately 20% compared to previous years—extending projects by two months in many cases, and up to 18 months in the most egregious of cases."

- Quote text match: VERIFIED
- Page reference: **MISMATCH** — Phase 1A says p.27, actual is p.28.
- Verdict: **VERIFIED on substance, MISMATCH on page citation.**

## Bonus finds

1. **Whitepaper rural case study (Phase 1A's #4 candidate) verified verbatim:** "In one rural deployment, a provider experienced a two-year delay due to ROW disputes... incurred over $1.2 million in additional costs, delaying service to more than 2,500 homes." Strong human-scale stat.
2. **Whitepaper centralized-office stat (Phase 1A's #5) verified verbatim:** "This approach reduced approval timelines by 30% and helped providers save an estimated $2.5 million annually in administrative and legal costs." The $2.5M figure is even more compelling than Phase 1A surfaced.
3. **New angle from Cartesian p.28:** 36% of respondents who saw "significant" cost increases cite permitting as a driver, vs 28% of "slight" increase respondents — permitting cost-impact scales with severity. Useful for a "permits don't just slow you, they cost you" framing.
4. **Cartesian p.28 specific cause attribution:** "Respondents pointed to understaffed/under-resourced permitting offices, changing regulations, and longer approval cycles as causes." This is the *why* the P.S. is missing — could ground a future revision in named causes rather than a fake rejection-rate.

## Trust recommendation

Use **Replacement #3** ("permit delays extended timelines ~20% on average, up to 18 months worst case") with the page correction p.27 → **p.28**. It's specific, quantitative, FBA-published, directly verifiable, and frames permitting as a real cost without overclaiming a ranking FBA doesn't publish.

Replacement #1 is also safe with the same page correction. Replacement #2 is fine as-is (page number right).

Do NOT use Phase 1A as-cited without fixing the p.27 → p.28 error on #1 and #3 — if anyone tries to verify these against page 27 they'll find the wrong section and conclude the citation is wrong.

**Confidence: HIGH.** Both PDFs were directly fetched and grep'd in full. Every replacement quote was located verbatim. The only defect is a 1-page citation drift on two of three replacements, which is mechanical and trivially fixable.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 | Claude (adversarial reviewer) | Independent re-verification of Phase 1A |
