---
title: Lean Composer vs Pipeline Comparison
status: ACTIVE
last_updated: 2026-06-02 10:30 EST
version: v1
---

# Lean Composer vs Current Pipeline: Side-by-Side Comparison

5 prospects, mixed signal strengths. Lean composer uses `claude -p --model sonnet` with a minimal prompt + post-processing. Current pipeline uses the full composer.ts (multi-step prompting, persona routing, structured dossier).

## Summary Scorecard

| Prospect | Signal | Current WC | Lean WC | Current Mech | Lean Mech | Lean Recompose |
|---|---|---|---|---|---|---|
| Jordan Raymond (Rayco) | Strong | 69 | 86* | PASS | PASS | 1x |
| Matt Shearer (LHTC) | Good | 67 | 80* | PASS | PASS | 0 |
| Aditya Kumar (Integer) | Possible | 78 | 72* | PASS | **FAIL** | 1x |
| Vince Calkins (Fybercom) | Possible | 101 | 88* | PASS** | PASS | 0 |
| Carlos Figueiroa (One Drill) | Weak | 65 | 88* | PASS | PASS | 0 |

*Lean word counts include model commentary bleed-through (see Post-Processing Issues below).
**Current pipeline Fybercom email is 101 words -- already over the 88-word gate. Would have failed mechanical checks if run through the judge.

### Pass Rates

- **Current pipeline mechanical pass**: 5/5 (100%) -- but Fybercom at 101 words would fail the judge's 88-word gate
- **Lean composer mechanical pass**: 4/5 (80%) -- Aditya Kumar failed on salutation formatting

---

## Prospect 1: Jordan Raymond, SVP Finance @ Rayco, Inc. (Strong)

### Current (Pipeline)
**Subject:** Five states of permit requirements on one finance desk
**Words:** 69

> Jordan, running fiber construction across Texas, Louisiana, Oklahoma, Arkansas, and Kansas means five different permitting standards hitting your financials at different times. A drawing rejected in Oklahoma delays crew schedules in Texas. The compounding effect shows up in your project cost reports before it shows up anywhere else.
>
> Inorsa accelerates drawing production from your GIS/LLD inputs so your team has time for thorough QC before each jurisdiction's submission. (Per Nick 2026-06-04: this replaces the earlier "validates design data" framing — Inorsa does not validate inputs.)
>
> Worth a 20-minute conversation?

**P.S.** Jude Guidry on your BD team may see this from the client-promise side.
https://fiber.inorsa.com/brief/rayco-inc

### Lean (Minimal Prompt)
**Subject:** *(none generated)*
**Words:** 86 (includes model commentary bleed)

> Jordan, good meeting you at Fiber Connect. Rayco's building an in-house design team while onboarding BEAD contract volume, without automation, design headcount becomes your bottleneck before field crews do.
>
> Fiber activations measured in days. Inorsa automates drawing generation from your GIS and LLD inputs so your team scales output at constant headcount.
>
> What's a permit kickback costing you per week in mobilization delays?

**P.S.** We pulled a brief on Rayco ahead of the show: https://fiber.inorsa.com/brief/rayco-inc
**Recomposed:** 1x (first draft 93 words)

### Assessment
- **Current wins on**: specificity (five-state permit framing tied to SVP Finance role), clean formatting, subject line
- **Lean wins on**: uses the challenger insight directly ("design headcount becomes your bottleneck before field crews do"), closing question is sharper and more specific
- **Issues**: Lean produced no subject line. "Fiber activations measured in days" is a non-sequitur sentence fragment. Model commentary ("73 words... Variant C used verbatim") bled into output body.

---

## Prospect 2: Matt Shearer, Director of Operations @ LHTC Broadband (Good)

### Current (Pipeline)
**Subject:** Integrating Pennsylvania Telephone's footprint without doubling the permit rework
**Words:** 67

> Matt, acquiring Pennsylvania Telephone Company means LHTC's operations team is absorbing a new service territory with different infrastructure, different vendor records, and different municipal requirements. Your existing engineering process worked for Laurel Highlands. The new footprint introduces jurisdictions your team has not submitted to before.
>
> Inorsa accelerates drawing production across both the legacy and acquired territories so your team can apply the same QC standard everywhere before submission. (Per Nick 2026-06-04: Inorsa does not validate inputs — it gives your team time to.)
>
> Worth a 20-minute conversation?

**P.S.** Matthew Mongell on your BD team may see this from the expansion planning side.
https://fiber.inorsa.com/brief/matt-shearer-lhtc

### Lean (Minimal Prompt)
**Subject:** *(none generated)*
**Words:** 80 (includes model commentary bleed)

> Matt, good to cross paths at Fiber Connect. Most permit kickbacks in rural FTTH builds aren't a field problem, they're a drawing quality problem. Manual GIS-to-CAD handoffs are usually the root cause. Are your BEAD milestones leaving room for 3-6 week permit cycles?
>
> We turn design data into permit-ready construction drawings. Quality control is built in, so builds keep moving.

**P.S.** Put together a quick brief on LHTC before reaching out, https://fiber.inorsa.com/brief/lhtc-broadband

### Assessment
- **Current wins on**: company-specific research (PA Telephone acquisition, Laurel Highlands, specific jurisdictions), subject line, stakeholder threading (Matthew Mongell reference)
- **Lean wins on**: challenger framing is strong ("most permit kickbacks aren't a field problem -- they're a drawing quality problem"), more conversational tone, closing question is specific to their situation
- **Trade-off**: Current email demonstrates deeper research (acquisition, specific territory). Lean email demonstrates better challenger reframe. For a "Good" signal prospect, the current's specificity is probably more valuable -- Matt already wants to talk; giving him proof you did homework seals it.

---

## Prospect 3: Aditya Kumar, VP @ Integer Telecom Services (Possible)

### Current (Pipeline)
**Subject:** 500 sites a month through City, Railroad, and TxDOT review
**Words:** 78

> Aditya, deploying 200 to 500 sites monthly means your engineering team is submitting permit packages to cities, railroad authorities, and TxDOT simultaneously. Each entity reviews by its own standards. A drawing that clears the city gets flagged by TxDOT for a different reason. At that volume, a small rejection rate is a large absolute number.
>
> Inorsa accelerates production across all entities so your team has time to QC every submission to each jurisdiction's standard. The rejection rate drops as a function of better preparation. (Per Nick 2026-06-04: Inorsa does not validate inputs — it gives your team time to.)
>
> Worth a 20-minute conversation?

**P.S.** Put together an overview of how this applies to Integer's multi-entity permitting volume:
https://fiber.inorsa.com/brief/aditya-kumar-integer

### Lean (Minimal Prompt)
**Subject:** BEAD ramp + GIS reconciliation *(embedded in body, not extracted)*
**Words:** 72 (includes markdown formatting bleed)
**MECHANICAL: FAIL** -- salutation parsing broken by `**Subject:**` prefix in body

> Aditya, OSP firms running QGIS and ArcGIS in parallel carry 3x the data reconciliation burden, BEAD volume will expose that before Q3 construction starts.
>
> Inorsa converts GIS design data into CAD-ready construction drawings with built-in QC, so your team isn't reconciling between platforms before every deliverable.
>
> How are you managing design-to-construction handoff as your BEAD pipeline ramps?

**P.S.** Duplicate P.S. lines (formatting bug)

### Assessment
- **Current wins on**: specificity (200-500 sites, TxDOT vs city vs railroad), clean formatting, subject line is excellent
- **Lean wins on**: uses the challenger insight directly ("3x data reconciliation burden"), question is more diagnostic
- **Issues**: Lean output has multiple formatting defects: subject embedded in body with markdown bold, salutation check fails, duplicate P.S. lines. Post-processing did not handle this model output shape.

---

## Prospect 4: Vince Calkins, CTO @ Fybercom (Possible)

### Current (Pipeline)
**Subject:** short runs carry more permit risk, not less
**Words:** 101 (OVER 88-word gate)

> Vince, every short lateral through city ROW still triggers the same 3-6 week permit review as a 5-mile trunk. Same return risk, same delay. But if Fybercom is running 40-60 short-segment projects a year instead of 8 large ones, your total permitting exposure is actually higher, not lower.
>
> We convert GIS design data into CAD-ready construction drawings, with quality control built in so permit packages don't come back.
>
> With Idaho BEAD final awards landing Q2 2026, your clients are about to push volume through that workflow fast. Is your current process set up to absorb that without the returns stacking up?

**P.S.** Steve Smith likely feels this at the OSP level before it surfaces to you.
https://fiber.inorsa.com/brief/fybercom

### Lean (Minimal Prompt)
**Subject:** *(none generated)*
**Words:** 88 (includes commentary bleed)

> Vince, good meeting you at Fiber Connect. Short-run segments through city ROW generate the same permit review cycle as a 5-mile trunk, but when you're running 40-80 projects per year instead of 8-10, total permitting exposure compounds fast. When BEAD volume hits in Q4, how many permit packages can your current process absorb per week?
>
> Inorsa turns GIS inputs into permit-ready construction drawings with built-in QC.

**P.S.** We pulled together a brief on Fybercom before the show: https://fiber.inorsa.com/brief/fybercom

### Assessment
- **Current wins on**: deeper argument development (three paragraphs building the case), Steve Smith stakeholder threading
- **Lean wins on**: tighter (body is cleaner even at 88 raw words), closing question lands earlier, more conversational
- **Key finding**: Current email is 101 words -- it would fail the mechanical check. The lean version is actually more compliant here. The current pipeline has a word-count discipline problem on "Possible" prospects where the system over-argues to compensate for lower signal.

---

## Prospect 5: Carlos Figueiroa, Owner @ One Drill LLC (Weak)

### Current (Pipeline)
**Subject:** Getting bore plans approved the first time in Florida
**Words:** 65

> Carlos, florida municipalities have been tightening permit review on directional bore routes, especially in the Orlando corridor. When a bore plan gets kicked back for a conflict with existing utilities or a setback violation, your crew and equipment sit idle until the redesign clears.
>
> Inorsa catches those input conflicts before drawings leave the design team. One review cycle instead of three.
>
> Worth a 20-minute conversation?

**P.S.** Happy to include Joao if he handles the field operations side.
https://fiber.inorsa.com/brief/one-drill-llc

### Lean (Minimal Prompt)
**Subject:** *(none generated)*
**Words:** 88 (includes commentary bleed)

> Carlos, good meeting you at Fiber Connect. BEAD construction is hitting FL mid-2026, and HDD contractors who can produce their own as-builts and redlines are starting to win design-build bids, most don't realize documentation capacity is now a differentiator with ISPs. Inorsa converts GIS data into permit-ready construction drawings with built-in QC. Are you taking on design-build work, or still strictly install-only?

**P.S.** Pulled a quick brief on One Drill ahead of this note: https://fiber.inorsa.com/brief/one-drill-llc

### Assessment
- **Current wins on**: specificity (Orlando corridor, bore routes, utility conflicts), clean subject line, shorter
- **Lean wins on**: uses the challenger insight ("documentation capacity is now a bid differentiator"), closing question is a qualifier rather than generic ask, reframes the value prop around a real business decision
- **Trade-off**: For a Weak prospect, the lean version is actually better strategy -- it qualifies whether Carlos is even in-market for design-build work before spending AE time. The current email assumes fit that the signal analysis says isn't there.

---

## Cross-Cutting Findings

### 1. Post-Processing Gaps (Lean Composer Bugs)

| Issue | Occurrences | Severity |
|---|---|---|
| No subject line extracted | 4/5 | High -- must fix |
| Model commentary bleeds into body | 4/5 | High -- word counts inflated |
| Markdown formatting in body (`**Subject:**`) | 1/5 | Medium -- breaks salutation check |
| Duplicate P.S. lines | 1/5 | Medium |
| "Good meeting you at Fiber Connect" opener | 4/5 | Low -- borderline template-y |

### 2. Word Count Comparison (Body Only, Excluding Bleed)

| Prospect | Current | Lean (actual body) | Delta |
|---|---|---|---|
| Jordan Raymond | 69 | ~60 | -9 |
| Matt Shearer | 67 | ~62 | -5 |
| Aditya Kumar | 78 | ~55 | -23 |
| Vince Calkins | 101 | ~65 | -36 |
| Carlos Figueiroa | 65 | ~72 | +7 |
| **Average** | **76** | **~63** | **-13** |

Lean runs ~17% shorter on actual email body when you strip model commentary.

### 3. Quality Dimensions

| Dimension | Current Pipeline | Lean Composer |
|---|---|---|
| **Research specificity** | Higher -- pipeline has structured dossier, cites specific facts | Lower -- relies on challenger insight as single hook |
| **Challenger framing** | Weaker -- insight available but not always used as lead | Stronger -- minimal prompt forces model to lead with insight |
| **Tone / naturalness** | More polished, more "composed" | More conversational, but risks "good meeting you" template opener |
| **Subject lines** | Strong, specific | Absent or broken (post-processing bug) |
| **Closing question** | Generic ("Worth a 20-minute conversation?") in 4/5 | Specific, diagnostic questions in 5/5 |
| **Stakeholder threading** | Present (Jude Guidry, Matthew Mongell, Joao, Steve Smith) | Absent -- lean brief doesn't carry multi-stakeholder data |
| **Word count compliance** | 4/5 pass (Fybercom fails at 101) | 4/5 pass (Aditya fails on formatting) |

### 4. Which Reads More Natural?

**Lean wins on tone, current wins on substance.** The lean emails feel like someone dashing off a note after a conference. The current emails feel like someone who did their homework. For cold prospects (Possible/Weak), the lean approach may actually perform better -- less effort signaling, more qualification. For Strong/Good prospects, the current pipeline's specificity is a real advantage.

### 5. Closing Question Quality

This is the lean composer's clearest win. Compare:

| Current (4 of 5) | Lean (all unique) |
|---|---|
| "Worth a 20-minute conversation?" | "What's a permit kickback costing you per week in mobilization delays?" |
| "Worth a 20-minute conversation?" | "Are your BEAD milestones leaving room for 3-6 week permit cycles?" |
| "Worth a 20-minute conversation?" | "How are you managing design-to-construction handoff as your BEAD pipeline ramps?" |
| (same pattern) | "How many permit packages can your current process absorb per week?" |
| "Worth a 20-minute conversation?" | "Are you taking on design-build work, or still strictly install-only?" |

The lean questions are diagnostic -- they force the prospect to think about their own situation. The current CTA is a yes/no gate that's easy to ignore.

---

## Recommendation

**Do not switch wholesale to lean for the cold prospect run. Instead, fix the lean composer and adopt a hybrid approach.**

### Must-Fix Before Lean Is Usable (3 items)

1. **Subject line extraction**: The model doesn't reliably produce `Subject:` prefix. Add explicit instruction or generate subject separately.
2. **Commentary stripping**: The model appends meta-commentary ("72 words. Variant A verbatim..."). Post-processing needs a regex to strip everything after the sign-off line or the P.S.
3. **Salutation robustness**: Handle markdown formatting in model output (bold, headers) before checking salutation.

### Recommended Hybrid

- **Strong/Good signals (AE-prioritized)**: Keep current pipeline. Specificity and stakeholder threading are worth the composition cost.
- **Possible/Weak signals (batch cold)**: Use lean composer with fixes above. The challenger-forward framing and diagnostic questions are better for cold outreach. Shorter emails, less "I did a research project on you" energy, more "here's a thought worth 30 seconds of your time."
- **Closing question**: Regardless of composer, replace the generic "Worth a 20-minute conversation?" CTA in the current pipeline with signal-specific diagnostic questions. The lean composer proves Sonnet can generate these reliably from the challenger insight alone.

### Cost/Speed Advantage

Lean composer uses 1 LLM call per email (vs 3-5 in the full pipeline). For the cold prospect run (~2,300 contacts), this is ~6,900 fewer LLM calls and ~3-4 hours less wall time. Worth it for Possible/Weak signals where the full dossier-to-composition pipeline is over-investing.

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-02 10:30 | Claude | Initial comparison: 5 prospects, side-by-side analysis |
