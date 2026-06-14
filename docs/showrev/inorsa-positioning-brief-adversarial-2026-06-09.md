---
title: Adversarial Verification — Inorsa Positioning Brief 2026-06-09
status: ACTIVE
last_updated: 2026-06-09
version: v1
purpose: Independent re-verification of Phase 2B's positioning brief. Re-opened every cited file, confirmed quote accuracy, audited ATTRIBUTED-TO-INORSA labels, validated SKO-vs-SoT disagreement claim.
---

# Adversarial Verification — Inorsa Positioning Brief 2026-06-09

## Verification summary

- Total discrete cited claims (file:line refs with quoted text) inspected: **~60**
- **VERIFIED (quote + line match):** ~45
- **PARAPHRASE (quote close but not verbatim / paraphrased):** 4
- **MISMATCH (line off-by-N or wrong content):** 8
- **MISSING (file or line does not exist):** 1
- **Scope violations (showrev repo reads):** 0
- **Trust score: ~78%** — substance is right, mechanical line citations are sloppy. Brief is usable as a synthesis but every line:line ref should be treated as approximate (±2 lines).

The brief's *content* is largely faithful to source. Its *citation discipline* is loose — multiple off-by-one/off-by-two errors, one numerical mismatch (6,262 vs claimed 6,512 substrate chunks), and one attribution-label drift (Nathan Dunn's own outbound copy framed as "what Inorsa says customers experience"). No scope violations: brief stayed inside /ruflo and explicitly flagged the wiki-459-mirror gap.

---

## Mismatches (priority order)

1. **Substrate chunk count — numerical mismatch.** P2B §4: "6,512-chunk industry substrate" cited to `jtbd-matrix.md:7,277`. Actual `jtbd-matrix.md:7` reads **"sr_brain_substrate (6,262 chunks)"**. Off by 250. Line 277 does not exist (file ends at line 276 — the v1 version-history row, which also says "6,262 chunks"). **MISMATCH + off-by-one line ref.**

2. **"Scales drafting capacity 2-5x" → wrong line.** P2B §3 cites `inorsa-source-of-truth.md:137`. Line 137 actually reads "Produces consistent AutoCAD output to each jurisdiction's standard from one input process." The 2-5x quote lives on **line 138**. Off-by-one. Quote text itself is accurate.

3. **"Ignored at this stage: ACV minimum…" → wrong line.** P2B §2 and §6 both cite `inorsa-source-of-truth.md:354`. Line 354 is the heading "### Ignored at this stage". The actual prose ("ACV minimum, urgency, automation level, decision-maker seniority…") is on **line 356**. Off-by-two. Quote is accurate.

4. **Fiber operator volume — wrong line in sales playbook.** P2B §2 cites `memory/reference_inorsa_sales_playbook.md:42` for "Volume: 250 miles/year." Actual line is **40**. Lines 43 and 44 (sophistication check, "best targets") are actually **41 and 42**. Quotes all verified verbatim; line indexing is off by two throughout the SKO playbook §.

5. **Fiber Drawings mechanism — off-by-one.** P2B §1 cites `memory/reference_inorsa_fiber_drawings_product.md:11` for the "GIS files → CAD file" quote. Actual content is on **line 12**. Line 11 is blank. Quote verified.

6. **"56 hours reduced to under 3 minutes" → cited to wrong line.** P2B §3 cites `data/showrev/product-intelligence-brief.md:32`. Line 32 is the **"3-4 weeks → 2 days"** proof point, already approved. The "56 hours to 3 minutes" reference appears as an **ASK FOR CHRIS** on line 37, not as a proof point on line 32. P2B *did* correctly note it's "may be NDA'd / pending Chris approval" so the substance is honest, but the line ref is wrong. **MISMATCH.**

7. **SoT version drift.** P2B's frontmatter and several citations refer to `inorsa-source-of-truth.md` as "v9, 2026-06-08." The file's own frontmatter still says **v5, 2026-06-07 18:07 EST**. The version-history table at the bottom DOES list v9 as the latest row. So P2B is technically right that the document has been amended through v9, but the frontmatter `version:` field on the SoT itself is stale (a doc-maintenance bug in the SoT, not P2B's error). Worth flagging — operator should bump SoT frontmatter to v9.

8. **Industry-substrate quote attribution drift (Nathan Dunn).** P2B §4 frames Nathan Dunn's first-touch language as "Multi-jurisdiction reformatting (Nathan Dunn → Cyient): 'GIS designs move fast, but converting them to construction-grade AutoCAD remains manual, slow, and different for each client's drawing standard'" under the heading **"Pains Inorsa says customers experience."** Re-reading `product-intelligence-brief.md:48-50`: this is **Nathan Dunn's own outbound marketing copy** ("Nathan Dunn — first-touch language:"). It is *what Inorsa AEs say to customers*, not *what customers say back*. Listing it under customer-experienced pain is attribution-label drift. The ATTRIBUTED-TO-INORSA label is technically defensible (Inorsa did write it), but the section heading misleads. Recommend re-classifying.

9. **PARAPHRASE — Job 1 "Inorsa catches input errors" original wording.** P2B §4 quotes the pre-revision version as "Inorsa catches input errors before submission" cited to `nick-mcmanus-jtbd-review.md:41`. Line 41 reads exactly **"→ Inorsa catches input errors before submission. Fewer returns."** The leading arrow and the trailing "Fewer returns" sentence are dropped. Quote is faithful in substance, lightly cleaned in form. PARAPHRASE, not verbatim.

---

## Spot-check deep dives

1. **Trust line "Every output is deterministic and traceable back to source data. No AI guesswork. No black box."** (P2B §3, cited `inorsa-source-of-truth.md:52`). Re-read lines 48-53: line 52 contains the trust line verbatim, line 48 is the "Why Inorsa" header. **PASS — verbatim.**

2. **40-50% permit rejection rate.** (P2B §4, cited `inorsa-source-of-truth.md:164`). Line 164 reads "40-50% of permit submissions rejected on first pass (NOT 8-12% as previously cited)". Verbatim. Context (Nick correction, 2026-06-03) intact. **PASS.**

3. **MicroStation disqualifier.** (P2B §2, cited `memory/reference_inorsa_sales_playbook.md:64`). Line 64 reads "**MicroStation:** Do NOT sell to MicroStation customers. Files don't convert. Customer churned. Not a fit." P2B's quote drops "**MicroStation:**" lead-in and "Not a fit." Substance retained. **PASS (light paraphrase, acceptable).**

4. **Chris one-pager Problem narrative (line 35).** (P2B §4). Line 35 is the full "Engineers spend hours manually producing drawings from LLD and GIS inputs. Change requests stack up. Manual coordination that worked at 50 miles breaks at 250..." block. P2B's two-sentence excerpt is **verbatim from that line**. **PASS.**

5. **Three Suites mapping (Data/Validation/Engineering).** (P2B §1, cited lines 64/65/66). Re-checked SoT table rows: line 64 = Data Suite + verbatim definition. Line 65 = Validation Suite + verbatim. Line 66 = Engineering Suite + verbatim. **PASS — all three verbatim and correctly indexed.**

---

## ATTRIBUTED-TO-INORSA verification

Sampled 8 ATTRIBUTED-TO-INORSA claims:

- **Tagline "AI Operations Layer for Infrastructure Assets"** (§1) — from inorsa.com/product, SoT §3. **Truly Inorsa-stated.**
- **"10X Your Engineering" headline** (§3) — from Chris Balandran one-pager, SoT §2. **Truly Inorsa-stated.**
- **Three pitch variants A/B/C** (§3) — Nick-validated 2026-06-03 per SoT §1 line 22. **Truly Inorsa-stated** (Nick is Inorsa's product/sales lead).
- **Nora AI assistant** (§1) — from inorsa.com/product, SoT line 73. **Truly Inorsa-stated.**
- **Permit kickback cascade quote** (§4) — Nick McManus 2026-06-03 verbatim in `jtbd-matrix.md:20`. **Truly Inorsa-stated.**
- **40-50% rejection rate** (§4) — Nick confirmed, SoT line 164. **Truly Inorsa-stated.**
- **TEP "too sophisticated" disqualifier** (§2) — from fiber drawings memory line 26. **Truly Inorsa-stated** (sourced from SKO 2026).
- **Multi-jurisdiction reformatting / Nathan Dunn → Cyient** (§4) — **AMBIGUOUS attribution.** This is Nathan Dunn's own outbound *copy* (marketing/sales language), not a Cyient pain statement. ATTRIBUTED-TO-INORSA label is defensible (Nathan IS Inorsa) but P2B's section heading "Pains Inorsa says customers experience" implies it reflects customer voice. Recommend re-label as "Inorsa AE framing of customer pain" or move to §3 value-prop.

DERIVED labels (§2 ICP disagreement, §3 Operator-ratified-vs-proposed) are clearly marked and accurately scoped to ShowRev interpretation.

---

## 2-source disagreement (SKO vs SoT §15) verification

P2B's claim: SKO 2026 playbook lists hard $100K ACV floor + ≤12mo urgency, but SoT §15 (v7, 2026-06-08) explicitly **rejects** both as gates. Verified independently:

- **SKO side:** `memory/reference_inorsa_icp_qualification_guardrails.md:12-13` reads verbatim: "Minimum ACV: $100K target, ideally $500K+" / "Urgency: <=12 months (else nurture)". **Confirmed.**
- **SoT side:** `inorsa-source-of-truth.md:356` reads: "ACV minimum, urgency, automation level, decision-maker seniority. Persona-bucket fit on the contact is sufficient." Section header (line 354) is "### Ignored at this stage". Section §15 framing (line 343): "(inform-only label, not a gate)". Composition runs regardless. **Confirmed.**

The disagreement is **real and accurately surfaced**. P2B's resolution ("SoT supersedes for the outreach gate; SKO criteria likely apply at later sales stage") is the right read — SKO is a sales-qualification framework; SoT §15 is explicitly scoped to "this stage" (outreach composition). Both can coexist. **PASS — disagreement is real, surfaced honestly, and correctly resolved.**

One nit: P2B cites SoT line 354 for the "Ignored at this stage" content. Line 354 is just the header. The prose is line 356. Off-by-two (see Mismatch #3).

---

## Scope check

No reads from `/Users/justynszymczyk/Documents/GitHub/showrev` were attempted or executed during verification. P2B's brief explicitly flagged the wiki-459-mirror dependency at SoT line 208 and did NOT pull from it. **Clean — no scope violations.**

---

## Recommendation

**Yes, operator can trust this brief as the canonical "what Inorsa says about itself" — with three caveats.**

1. **Treat every file:line citation as approximate (±2 lines).** Multiple off-by-one and off-by-two errors. Substance is right, mechanics are sloppy. If precision matters (e.g., generating a HubSpot field from a specific quote), re-verify the line before quoting.

2. **Fix the 6,262 vs 6,512 chunk-count number.** P2B says "6,512-chunk industry substrate." Source file says **6,262**. Either P2B has access to a newer substrate count (unverified) or it's a typo. Flag for correction.

3. **Re-classify the Nathan Dunn / Cyient quote.** It's currently filed under "Pains Inorsa says customers experience" but it's actually Nathan's outbound marketing copy. Move to §3 (value prop) or re-label as "Inorsa AE framing of customer pain."

**Sections worth lightly editing, none worth rewriting:**
- §1: Fix line refs (138 not 137, 12 not 11).
- §2: Fix line refs in SKO playbook block (40/41/42 not 42/43/44). Fix SoT §15 ref (356 not 354).
- §4: Re-classify Nathan Dunn quote. Fix chunk-count number. Note that JTBD line 277 doesn't exist.
- §3: Move "56 hours" cite from line 32 to line 37 (it's an ASK, not a proof point).

**The brief's structural decisions (ATTRIBUTED-TO-INORSA vs DERIVED labels, single-source markers, scope caveats, SKO-vs-SoT disagreement section) are sound and should be preserved.**

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 | Claude (adversarial) | Re-verified ~60 cited claims independently. ~78% trust score. 8 mismatches (mostly off-by-N line refs + one chunk-count number). 1 attribution-label drift. 0 scope violations. Brief substance is sound; mechanical citation discipline is loose. |
