---
title: Heilmeier Catechism — Existing System (ShowRev P2 Cold Prospecting for Inorsa)
date: 2026-06-12
status: DRAFT v1 (will iterate after Wave 1 forensic reports land)
purpose: Force jargon-free clarity on what the existing system actually is, what it's actually trying to do, and what's actually at risk
authored_by: Claude (Opus 4.7) as Coordinator
---

# What this doc is

The Heilmeier Catechism is 8 questions George Heilmeier (former DARPA director) made every R&D proposal answer. **No jargon. Plain English. Force the team to articulate what would otherwise hide behind acronyms.**

This first pass answers them for the EXISTING system. After Wave 1 forensic reports land, I'll annotate the gaps between what we WANT it to be (these answers) and what it ACTUALLY is.

A second Heilmeier 8 — for the REDESIGNED system — comes in Wave 6.

---

## 1. What are you trying to do? (No jargon.)

We're trying to send 800-2,300 cold emails to people in the US fiber broadband industry who attended a recent trade show, on behalf of Inorsa (a vendor that automates a slow, painful part of fiber construction — turning raw mapping data into the construction drawings you need to get permits and break ground).

Goal: 3-6% of those people agree to a 15-30 minute conversation with one of Inorsa's three sales reps. That's 24-150 conversations. Industry-average cold email gets 1-3%. We're aiming for 5-10x better.

We do this by composing each email individually from research about the prospect's company, attaching a personalized one-page web link that shows them where Inorsa fits in their specific workflow, sequencing 2-3 follow-ups, and routing replies to the right Inorsa salesperson.

This is the proof-of-concept for a bigger ambition: turn this system into "ShowRev," a product other B2B sellers can use to outperform their best salespeople by 5-10x.

## 2. How is it done today, and what are the limits of current practice?

**How sellers do cold email today:**
- Tools: Outreach.io, SalesLoft, Lemlist, Apollo, ZoomInfo, MillionVerifier, HubSpot Sequences
- Pattern: templated emails with merge tags ({firstname}, {company}), basic A/B on subject lines, send-then-pray
- Contact data: Apollo or ZoomInfo (which is exactly where our quality crisis came from — those sources are wrong 20-40% of the time on titles, employer, and contact details)
- Outcomes: 1-3% reply rates (about half of those are OOO autoresponders or "remove me"). Meeting rates of 0.1-0.5%.

**What's better than that:**
- Lavender (writing coach): improves individual reps' craft
- 11x.ai, Regie.ai, Clay (AI BDRs): generate personalized emails from data lookups but rely on the same contaminated data sources
- Top human AEs at PE-backed sales orgs (Gong / Lavender data): 5-8% reply, 0.5-1.5% meeting
- The top 0.01% (a handful of named SDRs at firms like Apollo, Outreach, Lavender — people who've personally calibrated through 10,000+ sends): 15-25% reply, 3-6% meeting

**The limits of current practice:**
- Templates max out at ~3% reply because they sound like templates
- Personalization tokens ({firstname}, {company}) are status-misaligned vendor talk
- AI-generated emails (11x.ai etc.) sound AI-generated to anyone who reads B2B emails daily — they get filtered, archived, or replied to with hostility
- The contact data layer is contaminated (ZoomInfo / LeadIQ / Apollo sell scraped data that's 20-40% wrong on titles and tenure)
- Per-prospect learning doesn't compound — every reply is a one-off
- Microsites don't exist for most cold sequences; when they do, they're vendor-branded landing pages that scream "I'm being sold to"

## 3. What is new in your approach, and why do you think it will be successful?

**What's new (our claim, NOT yet proven):**

1. **Substrate-grounded composition.** Every factual claim in an email is supposed to come from a verified primary source — Inorsa booth recordings, podcast transcripts (Doug Dawson, Community Broadband Bits), press releases, FCC filings. Not from ZoomInfo. Not from the LLM's training data. **Status: partly real, partly broken — ZoomInfo did leak through. The substrate exists (6,512 chunks) but the gate that's supposed to stop bad sources is unwired.**

2. **Multi-tier quality gates with always-on hallucination check.** Three layers of LLM judging — mechanical regex blocks AI tells, a "Tim Proxy" judge mimics our craft expert's edit patterns, a Gemini 2.5 Pro hallucination check fires on every prospect and asks "is every claim in this email supported by the substrate?" **Status: actually wired. Ran on 120 prospects. Did its job correctly on its scope, but its scope checked faithfulness to substrate, not validity of substrate — so the contaminated substrate passed through.**

3. **Per-prospect microsite ("assess page").** Instead of sending the recipient to inorsa.com, they get a 4-question diagnostic at fiber.inorsa.com/assess/{prospect-slug} that's personalized with their name, company, logo, and AE photo. **Status: shipped and rendering — 15/15 verified live earlier tonight. Currently a standard questionnaire, not "alive" with prospect-specific data.**

4. **Three-touch sequence with explicit psychological framing per touch.** Touch 1 challenges an assumption (challenger sale). Touch 2 gives them a number they can take to their boss (proof). Touch 3 makes a demo feel low-risk (loss aversion). **Status: wired in Touch 1 only currently. Touch 2 + Touch 3 not yet sent.**

5. **AE-controlled enrollment with operator review.** Each Inorsa sales rep (Mike, Nathan, Lucas) gets a per-AE cold list. Operator (Justyn) reviews every email's confidence axes (ICP fit, email deliverability, substrate richness) before approving for HubSpot enrollment. **Status: wired. Operator portal at showrev-microsites.vercel.app/ops?pipeline=p2.**

6. **Brain function compounds learning.** Every send → reply → meeting outcome is supposed to feed back into the Brain (AgentDB-backed memory store) so future cohorts get tuned by data, not opinion. **Status: data tables exist but are empty. The learning loop is not wired — this is the single biggest gap between what we want to be and what we are.**

**Why we think it will be successful:**
- Substrate research is real (6,512 chunks, validated by booth recordings and SME interviews)
- The quality gates we have wired DO catch many failure modes (regex blocks 22 AI tells; Tim-pattern judge catches register issues; hallucination check binds composer to substrate)
- The per-prospect microsite is something competitors don't have — defensible
- FC2026 baseline (45 sends, 2 meetings, 4.4% meeting rate) suggests the approach works directionally even with rough execution
- Operator + AE review gate provides human-in-the-loop quality control

**Why this might NOT work (honest):**
- The substrate quality gate isn't wired right (proven — ZoomInfo leaked)
- The Brain learning loop isn't wired (the compounding advantage we claim doesn't actually compound yet)
- The microsite isn't actually personalized with prospect-specific data (it's a standard questionnaire with name+logo)
- 23 of 30 portal intel fields are null on every row — operator review surface is thinner than designed
- The system has never been measured at the 800-2,300 scale we're targeting

## 4. Who cares? If you are successful, what difference will it make?

**Direct stakeholders:**
- **Inorsa** — the pilot client. They have 3 AEs and a pipeline that needs to be 5-10x larger to justify their growth plan. A successful ShowRev pilot = a real pipeline. A failed one = back to manual outbound, slower growth, potentially missed runway.
- **The 800-2,300 fiber prospects on the FC2026 list** — Directors of Broadband at small electric coops, COOs at regional ISPs, VPs of Engineering at A&E firms. These are real humans drowning in 30+ vendor cold emails a day, most of which are templated junk that wastes their time. A respectful, substrate-grounded cold email about a real problem (drawing throughput) is a gift, not a tax — IF we get the substrate right.
- **Justyn (Operator)** — building ShowRev as a future product business. The Inorsa pilot is the proof point. Productization thesis lives or dies on this.

**Wider stakeholders if this works:**
- **The B2B cold outbound market** — currently dominated by Apollo, ZoomInfo, Outreach.io, all of whom build on the same contaminated data layer. A category-defining alternative would matter.
- **The next 5 clients after Inorsa** — A&E firms, telecom equipment vendors, utility software, anyone who sells to researched companies. Each becomes a case study.
- **The fiber broadband industry** — if we can demonstrate that AI cold prospecting can be trustworthy (not predatory), it changes the norms of vendor communication in a small but real way.

**What's the actual difference:**
- Inorsa pipeline grows 3-5x without adding salespeople
- The 800-2,300 fiber prospects get more respectful, more useful, more relevant cold outreach
- ShowRev becomes a real product business

## 5. What are the risks?

In rough order of severity:

1. **Substrate quality at scale** — already failed once. The system shipped emails containing ZoomInfo/LeadIQ claims because the gate that's supposed to block them was never wired. **If we ship 800-2,300 emails with bad facts, we burn trust with the entire FC2026 attendee list — and those people talk to each other.**

2. **The "we have gates but the gates are theatre" risk** — tonight's deeper second-pass surfaced that 23 of 30 intel fields are null on every row, the renderer references columns that don't exist, "Decision Criteria" is persona boilerplate. Some of what looks like a working system is actually surface-level. Until forensic is complete we don't know the true extent.

3. **Brain learning loop is empty** — the compounding-advantage claim is currently theoretical. sr_email_experiments and sr_brain_outcomes tables are empty. If the loop isn't wired by the time we have meaningful send volume, we lose the compounding window.

4. **The composer is over-engineered for defensibility, under-engineered for resonance.** The system optimizes "every numeric claim has a claim_id" but a top AE's email has ~2 specifics and 5 sentences of "I see your world." We're measuring what's measurable, not what wins replies. Behavioral risk.

5. **Personalized microsite is currently just name+logo, not actually personalized with prospect data.** Promised value is bigger than delivered value. Click-through risks under-performing because the microsite doesn't actually deliver on the promise the email implied.

6. **Reputation at scale** — Inorsa is a real company with real customer relationships. Bad cold emails sent under their AEs' names damage Inorsa's brand, not just ShowRev's reputation. Recovery cost is high.

7. **AE adoption / discipline** — the system depends on AEs choosing the right time zone in HubSpot enrollment dialog, picking the right sender inbox, watching for replies. AE drift = system failure independent of code quality.

8. **The "stranded code" pattern** — verify-facts.ts is dead. semantic-verifier.ts may be dead. composer.ts is deprecated. The codebase has multiple "we built this, never wired it" patterns. Future engineers could re-wire the wrong one.

9. **Operator-hours cost** — if the operator has to review 800 prospects manually, the system isn't a system, it's a manual workflow with extra steps. The portal must surface confidence + intel well enough that operator can review at 30 seconds/prospect, not 5 minutes.

10. **Inorsa pilot termination** — if Inorsa concludes "ShowRev isn't producing pipeline," the pilot ends. The productization thesis stalls. The operator's runway compresses.

11. **Competitive risk** — 11x.ai, Regie.ai, Clay, AiSDR are well-funded and shipping fast. If we take 6 months on the redesign while they ship "good enough" AI cold outbound, the category window closes.

## 6. How much will it cost?

**Direct ongoing costs (estimated):**
- Apollo subscription: ~$200-500/month at current scale
- MillionVerifier: ~$50-150/month
- LLM API costs: ~$2-5 per 300-prospect cohort run; ~$20-50/month at current cadence
- Supabase, Vercel, HubSpot: ~$100-300/month combined
- **Roughly $400-1,000/month in direct costs at current scale**

**Opportunity cost (the bigger number):**
- Operator (Justyn) spends an estimated 20-40 hrs/week on ShowRev
- AE time on review + AE alignment meetings
- Claude/Fable API costs during build sessions: a few hundred dollars per major build week
- **Roughly $20-40K of operator opportunity cost per month**

**Forward cost to fix the substrate crisis (Plan A FINAL — the narrow fix):**
- ~5-6 hours of code work
- Re-substrate the contaminated 5 + 167 cohort
- Audit
- Approximately a half-day operator + a few dollars in LLM tokens

**Forward cost for a real redesign (Plan B / ABM++):**
- 4-12 weeks of focused work to ship MVP of a categorically better system
- LLM compute during multi-judge iteration: a few hundred to ~$1K
- Possibly new tools / data sources if build-vs-buy points to buy
- The opportunity cost: continuing on the current system in parallel while redesign happens

**What we DON'T know yet (gaps Wave 1 will surface):**
- True cost per send at 2,300 scale (Apollo enrichment cost per prospect, MV cost per check, LLM cost per composition + judge)
- Cost of running the Brain function at scale (vector DB ops, embedding refresh)
- Cost of the per-prospect microsite if it becomes "alive" with data

## 7. How long will it take?

**Already invested:** roughly 7-8 months of operator work (Inorsa pilot started ~Oct/Nov 2025 with substantive build accelerating through Q1 and Q2 2026).

**Where we are right now (June 12, 2026):**
- P1 baseline complete (45 booth-visitor emails, 4.4% meeting rate, ~Apr-May 2026)
- P2 cohort prepped (210 prospects in canonical list, 87 loaded to HS, ~120 compositions in sr_engine_output)
- Smoke test was supposed to fire tomorrow morning (Plan A FINAL would unblock this)
- Quality crisis discovered late Jun 11, halted the smoke

**Path forward — three scenarios:**

| Scenario | Timeline | What it gets us |
|---|---|---|
| Plan A FINAL only (narrow fix tonight) | 6-12 hrs to ready, ship tomorrow AM | Clean smoke baseline. Tells us if narrow fix is enough |
| Plan A FINAL + portal/MV-persistence fixes | 2-3 days | Operator review surface trustworthy, baseline more reliable |
| Full ABM++ redesign (current Wave 1-7 project) | 4-12 weeks for v1 MVP | Categorically better system, compounding-learning wired, microsite-that-lives, multi-touch sequence intelligence |

**Inorsa pilot timeline window:** The fiber industry's BEAD-driven construction cycles mean Q3 + Q4 2026 are peak buying windows. Inorsa needs pipeline NOW for those windows. **Practical implication: the redesign must produce something shippable within 4-6 weeks to meet the buying window. Anything past 8 weeks risks the pilot.**

## 8. What are the mid-term and final "exams" to check for success?

**Mid-term exam (P2 first 500 sends, target completion ~July 5-15, 2026):**

| Metric | Pass | Fail |
|---|---|---|
| Hard bounce rate | < 3% | > 5% (sender reputation damage) |
| Spam complaint rate | < 0.1% | > 0.3% (deliverability cratering) |
| Reply rate (excluding OOO) | > 5% | < 3% (below industry average — strategy isn't working) |
| Meeting booking rate | > 3% | < 1.5% (below FC2026 baseline) |
| PROHIBITED-source citations in any shipped email | 0 | > 0 (trust burn) |
| Inference language modifiers in shipped emails | < 5% | > 10% (composer regression) |
| Operator review time per prospect | < 90 sec | > 5 min (system requires too much manual work) |

**Final exam (full 800-2,300 prospect cohort + Inorsa pilot conclusion, ~late July to Aug 2026):**

| Metric | Pass | Fail |
|---|---|---|
| Reply rate (all touches) | > 12% | < 8% |
| Meeting booking rate | > 3% | < 2% |
| Meetings → opportunities | Inorsa-internal conversion data | n/a |
| Opportunities → pipeline value | Inorsa-internal | n/a |
| Inorsa pilot decision | Renewal / expansion | Termination |
| Recipient feedback | "this was useful" / no complaints | flagged complaints, blacklist requests, AE relationship damage |
| Brain learning loop | populated with N=500+ outcomes, pattern significance, statistically tuned recommendations | empty / unused |

**Decision rules at the end of the pilot:**
- All-pass → renewal + expand to Touches 2-3 + start client #2
- Mid-term pass but final fail → diagnose: was it craft, substrate, or strategy? Revise.
- Mid-term fail → pause sends, root cause, fix or pivot
- Reputational damage → pause, recover relationships, redesign before resuming

---

# What I'll add after Wave 1 forensic reports land

This first Heilmeier draft is my honest current understanding. After 15 agents return:
- I'll mark every claim above with green ✓ (confirmed by code/data), yellow ⚠ (partly true), or red ✗ (not actually the case)
- I'll add a "what we WANT vs what we ARE" matrix showing every gap
- This becomes the foundation of the forensic narrative report (Wave 2)

# Version history

| Version | Date | Author | Change |
|---|---|---|---|
| v1 | 2026-06-12 | Claude (Opus 4.7) Coordinator | Initial draft from current context, while 15 Wave 1 agents run in parallel |
