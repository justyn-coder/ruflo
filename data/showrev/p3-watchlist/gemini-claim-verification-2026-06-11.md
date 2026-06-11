---
title: Gemini Deep Research — Claim Verification for 17 FLAG/HOLD Prospects
date: 2026-06-11
source: Gemini Deep Research (operator-supplied)
prompt: See `docs/showrev/COLD-EMAIL-BEST-PRACTICES.md` v0.5 + chat history 2026-06-11
status: VERIFIED — anti-hallucination guards held (5 TRUE / 2 FALSE / 10 UNKNOWN)
purpose: Substrate updates + recompose targets for FLAG/HOLD prospects whose issue is unsupported factual claims (not email)
---

# Gemini Deep Research — Claim Verification 2026-06-11

## Methodology

17 prospects in FLAG/HOLD status with judge-flagged unsupported claims were submitted to Gemini Deep Research with strict anti-hallucination rules:

1. URL + access date + 1-2 sentence quote required for any TRUE verdict
2. No inference, extrapolation, or estimation — UNKNOWN is correct when source absent
3. No email-pattern guessers (LeadIQ / RocketReach / Hunter / Apollo / Salezshark / Prospeo / Cleanlist / ContactOut / Mailmo)
4. No synthetic personas (prior research had Sarah Jenkins / Elena Rostova / David Chen / Marcus Vance UX-persona contamination)
5. Distinguish "announced" from "closed" for M&A claims
6. No statistical pattern claims (97.6% etc.)
7. UNKNOWN is a respectable answer; fabrication is worse

## Results summary

- **TRUE: 5** (with primary source URL + access date + quote)
- **FALSE: 2** (substrate had wrong number; Gemini found correct one)
- **UNKNOWN: 10** (no primary source found; honest non-finding)

Net: anti-hallucination framework held. Compare with earlier Gemini PDF (Acme/Novatech/Quantum Leap fabrications) — this run produced no fictional companies, no fake stats, no extrapolation.

---

## ✅ TRUE — substrate update + recompose

### Row 1 — Ashley Church / GFiber

**Claim verified:** GFiber #1 J.D. Power Residential Wired Internet Customer Satisfaction, 3 consecutive years (2023, 2024, 2025)

- **Source:** https://fiber.googleblog.com/2026/05/gfiber-is-most-awarded-internet.html
- **Date accessed:** 2026-06-11
- **Quote:** "#1 in Customer Satisfaction for Residential Wired Internet Service, 3 consecutive years (2025, 2024, 2023) and ranked #1 consistently delivering high-quality service."

### Row 3 — Jeff Manning / Shentel (GloFiber)

**Claim verified:** Shentel multi-state footprint (8 contiguous states)

- **Source:** https://investor.shentel.com/node/25271/pdf
- **Date accessed:** 2026-06-11
- **Quote:** "Shenandoah Telecommunications Company (Shentel) provides broadband services through its high speed, state-of-the-art fiber optic and cable networks to residential and commercial customers in eight contiguous states in the eastern United States."

### Row 6 — Matt Hague / Danella Communication Services

**Claim verified:** ENR #10 + Danella Wireless launch + new offices (all 2025)

- **Source:** https://danella.com/danella-continues-to-rank-as-one-of-top-20-utility-contractors-for-enr/
- **Date accessed:** 2026-06-11
- **Quote:** "In 2025, Danella officially added Danella Wireless, Inc... While also adding new locations for our storm services, power, and Florida teams... We continue to rank strongly in the Top 20 Firms in the Utility category, holding the 10th position since 2023."

### Row 8 — Joseph Junck / Long Lines Broadband

**Claim verified:** 500 new Flight Fiber miles across SD/IA/NE + Junck appointed President

- **Source:** https://www.longlines.com/news
- **Date accessed:** 2026-06-11
- **Quote:** "With a $25M investment over the past five years, Long Lines is providing nearly 500 new miles of fiber for communities including: South Dakota... Iowa... Nebraska.... 'I'm honored to step into this role and build on the strong foundation that Paul built,' said Junck [appointed President and General Manager]."

### Row 13 — Adam Willoughby / Farmers Telecommunications Cooperative

**Claim verified:** Farmers expanding fiber footprint beyond legacy cooperative territory

- **Source:** https://farmerstel.com/about-us/
- **Date accessed:** 2026-06-11
- **Quote:** "In 2017, we began offering these advanced services in Marshall county for portions of Albertville, Boaz, and Guntersville. This not only extends critical services to these neighboring communities but also provides revenue to support the functions of the cooperative..."

---

## ❌ FALSE — substrate has wrong numbers; correct values found

### Row 7 — Joe Kunz / GFiber

**Composer claimed:** "across parts of 17 states"
**Verified correct:** **15 states** (pre-Astound merger footprint, per New Street Research surrounding the merger)
**Action:** Update substrate to 15 + recompose

### Row 12 — Christopher Camarena / Ponderosa Telephone

**Composer claimed:** "approximately 1,650 square miles of granite"
**Verified correct:** **~4,000 square miles** (per Ponderosa's USDA ReConnect award release)
**Action:** Update substrate to 4,000 + recompose. Composer pulled the 1,650 number from a secondary media review of a local documentary, not the official corporate release.

---

## 🟡 UNKNOWN — no primary source found, recompose with industry framing

### Row 2 — Alan Gauvreau / Edge Broadband

- Composer claimed "three concrete telecom huts set in a single year" + "crews working through winter into Jefferson and Walworth counties"
- Verified: Edge operates in Jefferson and Walworth (WI), but no source confirms the hut count or winter-work claim

### Row 4 — Lisa Rosema / Gateway Fiber

- Composer claimed "active simultaneous builds in Bismarck, Moorhead, and Fargo"
- Verified: Press releases confirm expansion INTO Bismarck and Moorhead to build on Fargo footprint, but no source confirms "simultaneous parallel construction windows" in all three

### Row 5 — John Hogie / GFiber

- Composer claimed "around 20 states" combined post-Astound merger + Q4 2026 close
- Verified: GFiber press releases confirm Q4 2026 close, but no GFiber/Astound press release literally states "20 states" — secondary analysis firms estimate this number

### Row 9 — Matthew Mongell / LHTC Broadband

- Composer claimed LHTC upgrading BOTH PTC AND Patriot Cable networks
- Verified: LHTC acquired Patriot Cable + PTC in 2025, but no source confirms a Patriot Cable upgrade plan (PTC plan is confirmed in substrate)

### Row 10 — Scott Craig / Citizens Fiber

- Composer claimed Omni Fiber's acquisition of Citizens Fiber CLOSED June 1, 2026
- Verified: announcement confirmed, but no source confirms specific closing date

### Row 11 — Josh Roach / Ringgold Telephone Company

- Composer claimed "rural fiber builds at your scale"
- Verified: Ringgold confirms rural fiber builds, but no source quantifies scale (mileage, passings, subscribers)

### Row 14 — Shane Auten / Direct Services Group

- Composer claimed "scale where permit drawings rarely keep pace with GIS field updates"
- Verified: DSG website mentions "500MW+ installations" but no source confirms the specific permit/GIS claim

### Row 15 — Seth Arndorfer / Dakota Carrier Network

- Composer claimed "touches nearly every exchange in North Dakota"
- Verified: DCN literally states they serve "more than 85 percent of all the exchanges in the state." Characterizing 85% as "nearly every" is extrapolation. **Worth recomposing with "85 percent of exchanges" — a verified specific.**

### Row 16 — Kevin Gallagher / Cedar Hill Consulting

- Composer claimed fixed-project-fee billing model
- Verified: no public documentation of their billing structure

### Row 17 — Denys Pihur / Axon Fiber

- Composer claimed "Axon Fiber's pace"
- Verified: Axon Fiber website provides only basic services info, no public footprint or growth data

---

## Three actionable next steps

When operator authorizes (deferred per spec v6 implementation focus):

1. **Add 5 TRUE claims with sources to `sr_company_evidence` table** — enables targeted re-compose for 5 prospects
2. **Update 2 FALSE entries in substrate with correct numbers** (15 states for GFiber, 4,000 sq mi for Ponderosa) — also re-compose
3. **Mark 10 UNKNOWN claims for `excludeClaimIds` re-compose** — composer falls back to industry framing instead of unverified specifics
4. **Special case Row 15 (Seth Arndorfer):** swap "nearly every exchange" → "85 percent of exchanges" (Gemini surfaced the verifiable specific)

Expected lift after batch fix: +7 to +12 prospects from FLAG/HOLD → PENDING.

---

## Value of this verification template

This file is a template for future Gemini Deep Research verification runs. The prompt structure (anti-hallucination rules + structured row format + summary tally) produced 5 TRUE + 2 FALSE + 10 UNKNOWN — exactly the honest mix we want. Compare against earlier Gemini PDF (Acme/Novatech fabrications) where the same model produced zero verified TRUEs and many fictional sources.

**Reusable for future verification batches:** see the prompt structure in chat history 2026-06-11.

## Pairs with

- `docs/showrev/COLD-EMAIL-BEST-PRACTICES.md` v0.5 (research methodology)
- `docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md` (deliverability/MV approach)
- `data/showrev/p3-watchlist/michigan-ilec-clec-2026-04-24.csv` (intel watchlist sibling)
