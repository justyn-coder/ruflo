---
title: Red Team Report -- Dobson Fiber + Finley Engineering Email Drafts
status: ACTIVE
last_updated: 2026-06-04 12:00 EST
version: v1
---

# Red Team Report: Dobson Fiber + Finley Engineering

## Executive Summary

**4 of 6 emails need fixes before production.** The T1 emails (both companies) are the strongest. The T2 and T3 emails share structural problems: template reuse across companies, a Tim kill-list violation (Dobson T2), em-dash violations (3 of 6 emails), and word count overruns. Cross-model judging confirms the pattern: GPT-4o failed 5 of 6; Gemini passed all 6. The truth is in the middle. Nick correction compliance is clean. No forbidden product claims detected.

---

## 1. Per-Email Scorecards

### Dobson Fiber -- Dan Gillan, CRO

#### T1: "38 communities, 246 people"

| Dimension | Score | Notes |
|-----------|-------|-------|
| research_depth | 8 | $700M, 38 communities, 246 employees, OSP design postings, 3:1 labor ratio, BEAD deadline -- all verifiable. Strong. |
| vp_connection | 8 | "Turn design data into permit-ready construction drawings" maps directly to their OSP bottleneck. "~10 minutes instead of hours" is specific. |
| tone | 7 | Peer-level. Opens with their numbers, not with flattery. CTA is a diagnostic question. |
| conciseness | 6 | **86 words (body only) -- exceeds 80-word target.** Subject is tight (4 words). One CTA. But the P.S. adds weight. |
| jtbd_alignment | 8 | JTBD 2 (scale without hiring) + JTBD 1 (permit bottleneck) -- both directly addressed. CTA asks about design-to-construction pacing. |
| **Average** | **7.4** | |

**Mechanical failures:**
- 2 em-dashes ("months --" and "jobs-to-candidates, those seats"). The judge.ts em-dash check fires on these. SOT section 11 bans em-dashes in prospect-facing copy.

**Verdict: HOLD.** Fix em-dashes, trim 6 words from body. Then send-ready.

---

#### T2: "Re: 38 communities, 246 people"

| Dimension | Score | Notes |
|-----------|-------|-------|
| research_depth | 7 | FBA workforce data, Broken Arrow 100K+ residents, Tulsa/OKC/rural BEAD -- specific to Dobson. |
| vp_connection | 5 | **No Inorsa capability mentioned.** T2 drops the pitch sentence entirely. Links to microsite schematic but doesn't connect it to a specific problem-solution pair. Reader has no reason to click. |
| tone | 6 | "Every operator I talk to" is borderline -- it's a sales person broadcasting frequency, not a peer sharing insight. |
| conciseness | 5 | **94 words body-only -- exceeds 80-word gate by 18%.** Also: "Worth 15 minutes to compare against what you're seeing internally?" is a Tim kill-list phrase. Judge.ts catches "worth a 15 minutes" pattern. |
| jtbd_alignment | 7 | Still maps to design throughput bottleneck. |
| **Average** | **6.0** | |

**Mechanical failures:**
- 2 em-dashes
- "Worth 15 minutes" -- Tim kill-list violation (judge.ts line 97)
- 94 words exceeds 88-word gate (judge.ts line 33)

**Verdict: HOLD.** Needs three fixes: (1) kill the "Worth 15 minutes" CTA and replace with diagnostic question, (2) cut 14+ words, (3) remove em-dashes. VP connection is weak -- should restate the Inorsa capability in one sentence.

---

#### T3: "quick question on Dobson timing"

| Dimension | Score | Notes |
|-----------|-------|-------|
| research_depth | 7 | BEAD Q2 deadline, Broken Arrow, six Q1 towns -- all verifiable and Dobson-specific. |
| vp_connection | 5 | "Whether we can help or not" -- what does "help" mean? No reminder of what Inorsa does. A CRO receiving T3 cold (if T1/T2 missed) has zero context. |
| tone | 7 | Tight, direct, no filler. "Here or here" is clean. |
| conciseness | 8 | 46 words body-only. Under 60 target for T3. Good. |
| jtbd_alignment | 6 | "Design throughput" is the right topic but the email doesn't name the specific job. Generic constraint-language. |
| **Average** | **6.6** | |

**Mechanical failures:** None detected.

**Verdict: HOLD.** VP connection too weak for a close email. Add one sentence reminding what Inorsa does (the pitch verbatim works). "Whether we can help or not" is vague -- replace with specific framing.

---

### Finley Engineering -- David Wojcik, CCO

#### T1: "Finley's hiring bottleneck isn't recruiting"

| Dimension | Score | Notes |
|-----------|-------|-------|
| research_depth | 8 | PE-licensed OSP engineers, 10+ years requirement, 3:1 ratio, BEAD construction windows -- all verifiable from Finley job postings and BEAD timeline. |
| vp_connection | 8 | Pitch verbatim present. "~10 minutes instead of hours." "How many client engagements your current team can run simultaneously" -- maps to A&E throughput. |
| tone | 7 | Peer-level. Subject line is a genuine challenge ("isn't recruiting" -- it's capacity). No flattery. |
| conciseness | 7 | 78 words body-only. Under 80. Tight. |
| jtbd_alignment | 8 | JTBD 2 (scale without hiring) + JTBD 6 (deliver faster). CTA asks "How many RFPs is Finley passing on" -- diagnostic, specific to A&E. |
| **Average** | **7.6** | |

**Mechanical failures:** None detected.

**Verdict: SEND.** Strongest email of the batch. Clean mechanics, specific research, correct VP connection, right CTA for a CCO.

---

#### T2: "Re: Finley's hiring bottleneck isn't recruiting"

| Dimension | Score | Notes |
|-----------|-------|-------|
| research_depth | 6 | Cartesian 2025 survey (92%/88%) -- **Gemini flagged this as potentially fabricated.** "Most U.S. states," GIS data quality, drawing standards -- accurate to Finley's profile. But the lead stat needs source verification. |
| vp_connection | 5 | **No Inorsa capability mentioned.** Same structural problem as Dobson T2 -- drops the pitch entirely. Links to schematic without context. |
| tone | 7 | "That context-switching is where throughput dies" -- sharp observation, peer-level. |
| conciseness | 5 | **92 words body-only -- exceeds 80-word gate by 15%.** |
| jtbd_alignment | 7 | Maps to JTBD 4 (standardize across markets) and JTBD 2 (scale). Correct for Finley. |
| **Average** | **6.0** | |

**Mechanical failures:**
- 2 em-dashes ("softening -- it's" and "dies -- not in")
- 92 words exceeds 88-word gate

**Fabrication flag:** "Cartesian's 2025 survey: 92% of broadband firms reported cost increases, 88% expect more in 2026." Gemini flagged this. The dossier cites it without a source URL. If Cartesian did publish this, include the URL. If not, replace with a verifiable stat.

**Verdict: HOLD.** Three fixes: (1) verify or replace the Cartesian stat, (2) add one sentence of Inorsa capability, (3) cut to under 80 words, (4) remove em-dashes.

---

#### T3: "quick question on Finley timing"

| Dimension | Score | Notes |
|-----------|-------|-------|
| research_depth | 6 | "BEAD construction is ramping. Your clients are entering build windows. You hired a CCO." -- factual but thin. |
| vp_connection | 5 | Same problem as Dobson T3 -- "whether we can help or not" with no reminder of what "help" means. |
| tone | 7 | Direct, clean, no filler. |
| conciseness | 8 | 53 words body-only. Under 60 target for T3. |
| jtbd_alignment | 6 | "Drawing throughput" names the right topic but doesn't connect to David's specific mandate (growing the book of business via capacity). |
| **Average** | **6.4** | |

**Mechanical failures:** None detected.

**Verdict: HOLD.** Same fix as Dobson T3 -- add one sentence of VP connection. "You hired a CCO to grow the book of business" is a strong opener; the close should connect that to Inorsa's specific capability.

---

## 2. AI-Tell Findings

**Good news: zero hits on the 22-pattern AI-tell scanner.** No "notably," "delve," "landscape," "I wanted to reach out," hedging language, or corporate buzzwords detected in any email.

**Structural AI-tell check:**
- **Sentence-length variance**: ACCEPTABLE. Dobson T3 shows strong variance (4-19 words). Finley T2 has good short-long alternation (5-20 words). No monotone rhythm detected.
- **Participial clause density**: 0 across all 6 emails. Clean.
- **Echoed sentence structures**: Minor concern. Dobson T1 and Finley T1 share identical copy: "We turn design data into permit-ready construction drawings. One step takes ~10 minutes instead of hours." This is the pitch verbatim -- acceptable to reuse -- but the sentence FOLLOWING it is also structurally identical: "That changes how many [X] your current team can [Y] per [Z]." A sharp recipient who sees both emails (unlikely but possible at conferences) would spot the template.

## 3. Nick Correction Compliance

**All 6 emails pass.** No violations found:
- No "validate inputs" or "catch errors" claims
- No "built-in QC" or "quality control" language
- No "pass review first time" promises
- No specific automation percentage claims
- No CAPEX framing
- No tower/cellular/Harmoni references
- No 8-12% rejection rate claims
- Pitch verbatim used correctly: "turn design data into permit-ready construction drawings"
- Speed framing, not quality framing: "~10 minutes instead of hours"

## 4. Cross-Model Scores

### GPT-4o Results

| Email | research | vp_conn | tone | concise | jtbd | avg | pass |
|-------|----------|---------|------|---------|------|-----|------|
| Dobson T1 | 7 | 8 | 6 | 8 | 7 | 7.2 | PASS |
| Dobson T2 | 7 | 6 | 6 | 8 | 7 | 6.8 | FAIL |
| Dobson T3 | 6 | 5 | 6 | 8 | 5 | 6.0 | FAIL |
| Finley T1 | 6 | 7 | 6 | 8 | 7 | 6.8 | FAIL |
| Finley T2 | 6 | 5 | 6 | 7 | 5 | 5.8 | FAIL |
| Finley T3 | 5 | 4 | 6 | 7 | 5 | 5.4 | FAIL |

GPT-4o was harshest on tone (6 across the board) and VP connection on T2/T3 emails. Flagged zero AI-tells or fabrications. 1 of 6 passed.

### Gemini 2.5 Pro Results

| Email | research | vp_conn | tone | concise | jtbd | avg | pass |
|-------|----------|---------|------|---------|------|-----|------|
| Dobson T1 | 9 | 9 | 9 | 10 | 10 | 9.4 | PASS |
| Dobson T2 | 10 | 9 | 10 | 10 | 10 | 9.8 | PASS |
| Dobson T3 | 8 | 9 | 10 | 10 | 9 | 9.2 | PASS |
| Finley T1 | 9 | 10 | 9 | 10 | 10 | 9.6 | PASS |
| Finley T2 | 5 | 8 | 9 | 10 | 9 | 8.2 | PASS |
| Finley T3 | 7 | 9 | 9 | 10 | 10 | 9.0 | PASS |

Gemini was lenient overall but caught the Cartesian stat fabrication concern on Finley T2 (research_depth: 5, fabrication flag raised). 6 of 6 passed.

### Cross-Model Divergence Analysis

The models disagree substantially (3+ points on multiple dimensions). Key observations:
- **Gemini grades inflated**: 9s and 10s across the board, even for emails with mechanical failures. Gemini did not penalize em-dashes, word count overruns, or missing VP connection on T2/T3 emails. Its only useful signal was the Cartesian fabrication flag.
- **GPT-4o grades conservative but uniform**: Gave every email tone=6, which suggests it's pattern-matching "this looks like a sales email" rather than evaluating peer-vs-vendor voice granularly.
- **Neither model caught the Tim kill-list violation** on Dobson T2 ("Worth 15 minutes").
- **Neither model caught the em-dash violations** that judge.ts would flag.

**Conclusion:** Cross-model scores are directionally useful but not calibrated to ShowRev's specific quality gates. The manual scoring (section 1 above) is the authority.

## 5. Systemic Issues

### Issue 1: T2 emails drop the value proposition entirely

Both T2 emails (Dobson and Finley) reference industry data and link to the microsite schematic, but neither restates what Inorsa does. If the prospect missed T1, they click a link from a stranger with zero context. SOT section 11 says "One Inorsa sentence per email." T2 violates this by omission.

**Fix:** Add one sentence of Inorsa capability to each T2 body. Use the pitch verbatim or a structural variation.

### Issue 2: T3 emails are template clones

Dobson T3 and Finley T3 share nearly identical structure:
- `[Name], [3 short facts]. [If throughput is the constraint], a 15-minute call would clarify whether we can help or not. Here or here: [link]`
- "Whether we can help or not" is the same vague CTA in both. It doesn't reference anything specific about either company.

**Fix:** T3 should reference a specific signal from the dossier that makes this moment urgent. For Dobson: BEAD Q2 2026 deadline is weeks away. For Finley: the CCO was hired to grow revenue but can only sell what engineers deliver.

### Issue 3: Em-dashes in 3 of 6 emails

SOT section 11 explicitly bans em-dashes in prospect-facing copy. The judge.ts mechanical check (line 38) fails on em-dash or en-dash. Three emails (Dobson T1, Dobson T2, Finley T2) contain em-dashes.

**Fix:** Replace all em-dashes with commas or periods. This is a one-line find-and-replace.

### Issue 4: Word count overruns on T2 emails

Dobson T2: 94 words (17.5% over 80-word target, 6.8% over 88-word gate).
Finley T2: 92 words (15% over target, 4.5% over gate).

**Fix:** Cut the weakest sentences. In Dobson T2, "Every operator I talk to is running the same math" is generic filler. In Finley T2, the opening stat (Cartesian) can be tightened.

### Issue 5: Cartesian stat may be fabricated

Finley T2 opens with "Cartesian's 2025 survey: 92% of broadband firms reported cost increases, 88% expect more in 2026." Gemini flagged this as potentially fabricated. The dossier does not provide a source URL.

**Fix:** Verify the stat exists. If it does, it's strong. If it doesn't, replace with a verifiable FBA or ISE stat.

## 6. Pass/Fail Summary

| Email | Manual Avg | GPT-4o | Gemini | Mechanical | Verdict |
|-------|-----------|--------|--------|------------|---------|
| Dobson T1 | 7.4 | 7.2 PASS | 9.4 PASS | FAIL (em-dashes) | **HOLD** -- fix em-dashes |
| Dobson T2 | 6.0 | 6.8 FAIL | 9.8 PASS | FAIL (em-dashes, word count, Tim kill) | **HOLD** -- needs rewrite |
| Dobson T3 | 6.6 | 6.0 FAIL | 9.2 PASS | PASS | **HOLD** -- VP connection too weak |
| Finley T1 | 7.6 | 6.8 FAIL | 9.6 PASS | PASS | **SEND** |
| Finley T2 | 6.0 | 5.8 FAIL | 8.2 PASS | FAIL (em-dashes, word count) | **HOLD** -- needs rewrite |
| Finley T3 | 6.4 | 5.4 FAIL | 9.0 PASS | PASS | **HOLD** -- VP connection too weak |

**Production-ready: 1 of 6 (Finley T1 only).**
**Fixable with minor edits: 2 of 6 (Dobson T1, Dobson T3).**
**Needs substantive rewrite: 3 of 6 (Dobson T2, Finley T2, Finley T3).**

## 7. Specific Improvement Recommendations

### Quick fixes (do first)

1. **All em-dash emails**: Find-replace all em-dashes with commas or periods.
2. **Dobson T1**: After em-dash fix, trim ~6 words to hit 80 target. Suggest cutting "and in a market where" to just a comma splice.
3. **Dobson T2**: Delete "Worth 15 minutes to compare against what you're seeing internally?" and replace with a diagnostic question about their specific situation (e.g., "How far ahead is design running versus your construction schedule in Broken Arrow?").

### Substantive rewrites

4. **Both T2 emails**: Add one Inorsa capability sentence. Use: "We turn design data into permit-ready construction drawings -- what takes hours, we do in ~10 minutes." (Then fix the em-dash in that sentence too.)
5. **Both T3 emails**: Replace "whether we can help or not" with a company-specific reason this call matters NOW. Dobson: "Your BEAD projects close Q2 -- that's weeks, not quarters." Finley: "Every RFP your bench can't take is revenue David Wojcik was hired to capture."
6. **Finley T2**: Verify the Cartesian 2025 stat or replace it with a cited FBA number.

### Structural recommendation

7. **De-template the T3 emails.** Right now Dobson T3 and Finley T3 are structurally identical (3 short facts + "if [throughput] is the constraint" + booking link). A CCO at a nationwide A&E firm and a CRO at a regional fiber operator should not receive emails with the same skeleton. The T3 for Finley should reference A&E-specific language (client engagements, RFPs, bench depth). The T3 for Dobson should reference operator-specific language (communities dark, capital deployed, crews idle).

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-04 12:00 | Claude | Initial red-team report -- 5-dimension scoring, mechanical checks, AI-tell scan, Nick compliance, cross-model judging (Gemini 2.5 Pro + GPT-4o), 7 improvement recommendations |
