---
title: Wave 6 spec Part 1 — Tradeshow-vertical 4-lever reframe (proposed amendment)
date: 2026-06-12 07:45 EDT
status: PROPOSED — operator approves before merging into Wave 6 spec v2
authored_by: Claude (Opus 4.7) Coordinator
inheritance: Wave 6 spec at `wave6-spec/00-redesign-spec-v1.md` Part 1 + Part 2 (vision)
trigger: operator strategic reframe 2026-06-12 04:00 EDT — "we are a highly specialized service focused solely on helping B2B SaaS companies perform better at Tradeshows"
purpose: replace generic "vertical-substrate B2B GTM intelligence" positioning with tradeshow-specific 4-lever framing
---

# What changes

Wave 6 v1 positioned ShowRev as:

> **vertical-substrate B2B GTM intelligence** for industries where (a) buyers value industry literacy more than generic personalization, (b) the seller's substrate is researchable, and (c) the compounding moat outpaces incumbent feature releases.

This is honest but generic. ShowRev's ACTUAL differentiation is **tradeshow-specific GTM intelligence** for B2B SaaS sellers, structured across **4 distinct surfaces** that no incumbent owns end-to-end. The reframe sharpens the moat thesis, the addressable market, and the competitive positioning.

---

# The reframe (proposed Wave 6 Part 1 replacement)

## What we are

**ShowRev is the only B2B SaaS GTM intelligence platform purpose-built around tradeshows.** For B2B sellers whose buyers congregate at vertical-industry events (Fiber Connect, NAB, AWS re:Invent, RSA, etc.), we operate the entire show-driven sales motion across 4 distinct lever surfaces — pre-show, during-show, post-show 72-hour sprint, and long-tail cold. Each lever produces a different signal; the system fuses them. No competitor occupies this category.

## The 4 levers

| Lever | When it fires | Goal | Tool surface |
|---|---|---|---|
| **1. Pre-show push** | 2-6 weeks before show | Book booth-meeting + private-meeting slots with high-priority attendees | Personalized outreach to confirmed-attending prospects with intent-to-meet CTAs; meeting scheduler integration |
| **2. During-show capture** | At the show | Capture booth conversations + attendee scans + free-form notes verbatim | Mobile capture (operator + AE), audio recording, real-time CRM sync, attendee badge scan integration |
| **3. Post-show 72-hour sprint** | 0-72h after show ends | Convert booth conversations + scans into pipeline ASAP while substrate is fresh | Auto-composed follow-ups grounded in conversation context; AE-approved enrollment within 72h |
| **4. Long-tail cold** | 1-12 weeks after show | Reach the 80-95% of attendees who did NOT visit your booth via researched cold outreach | The substrate-grounded composer + audit gates we just built in the Sprint Spec (`wave6-spec/`) |

**Strategic insight:** Inorsa's current P2 work (the Sprint Spec) is **only Lever 4**. The full product surface is 4x larger. Levers 1-3 are documented but not yet system-built.

## Who we are NOT

| Category | Why we are not | Example competitor in that space |
|---|---|---|
| Generic B2B prospecting platform | We are vertical to tradeshows; competitors are vertical to industries OR horizontal across all outbound | Apollo, Outreach, Clay, Lemlist |
| ABM platform | We don't personalize landing pages at scale; we don't sell into 200-person enterprise sales orgs | 6sense, Demandbase, Mutiny |
| AI BDR replacement | Category in crisis (11x.ai March 2025); we position as augmentation for human AEs, not replacement | 11x.ai, Regie.ai, AiSDR |
| Tradeshow lead retrieval service | Those are booth-side hardware/scan-only; we cover the full lifecycle | Cvent, BadgeScan |
| Conference Networking app | We are sales-side; networking apps are attendee-side | Brella, Grip |

## The real competitive moat

The 4-lever fusion is the moat. Specifically:

- Pre-show data informs during-show priorities (who to chase at the booth)
- During-show captures inform post-show composer prompts (real conversation language)
- Post-show conversion data informs long-tail cohort weighting (who's similar to converters)
- Long-tail outcomes inform next year's pre-show targeting

**Each lever's output is another lever's input.** The compounding loop the Wave 6 spec describes runs through all 4 surfaces, not just the long-tail one we're shipping for Inorsa.

## Addressable market (refined)

**B2B SaaS companies for whom tradeshow attendance is a top-3 GTM spend line:**

| Vertical | Top trade shows | Estimated # of B2B SaaS vendors | ShowRev fit |
|---|---|---|---|
| Fiber / Telecom | Fiber Connect, NCTC TIE, NCTA Cable-Tec, IWCE, NAB | 200-300 | **Inorsa (client #1)** |
| Construction / AEC | World of Concrete, AISC NASCC, NECA, AEC FORUM | 400-600 | Adjacent vertical |
| Healthcare IT | HIMSS, ViVE, Epic UGM | 300-500 | Adjacent |
| Cybersecurity | RSA, Black Hat, DEF CON | 500-800 | Adjacent |
| Cloud Infrastructure | AWS re:Invent, KubeCon, Google Cloud Next | 1,000+ | Adjacent |
| Manufacturing / Industrial | IMTS, FABTECH, PACK EXPO | 600-800 | Adjacent |
| Energy / Utility | DistribuTECH, CERAWeek, AWEA | 300-400 | Adjacent |

**Conservative estimate: 3,000-5,000 B2B SaaS vendors globally** for whom tradeshow GTM is a top-3 spend. At $30-60K/yr ACV (Wave 6 Phase 3 pricing), that's $90M-$300M TAM. ShowRev is not yet vertical-locked; the system extends to any of these markets after Inorsa pilot.

## The first-3-clients GTM (updated from Wave 6 Part 10)

| Client | Vertical | Trade show anchor | Status |
|---|---|---|---|
| **#1 Inorsa** | Fiber / Telecom | Fiber Connect 2026 | **Active pilot; Sprint Spec shipping now (Lever 4)** |
| **#2 TBD** | Construction / AEC OR Telecom Equipment | Specific show TBD | Q3 2026 outreach if Inorsa pilot succeeds; Levers 3+4 first; gradual rollout to Levers 1+2 |
| **#3 TBD** | Healthcare IT OR Cybersecurity | Specific show TBD | Q4 2026; full 4-lever rollout test |

**Why this order:** verticals 1 + 2 share buyer behavior (long sales cycle, technical buyer, construction-adjacent). #3 tests true cross-vertical extensibility.

---

# What this means for the Wave 6 spec going forward

| Wave 6 Part | Current v1 framing | Proposed v2 reframe |
|---|---|---|
| Part 1 (Heilmeier 8) | Vertical-substrate B2B GTM intelligence | Tradeshow-vertical 4-lever GTM intelligence |
| Part 2 (Vision + hypothesis) | "vertical-substrate" thesis | "tradeshow-fusion" thesis |
| Part 3 (Architecture) | Add stub modules for Levers 1-3 | Composer + microsite already abstract; add show-attendee ingestion + during-show capture + post-show webhook |
| Part 4 (6 pillars) | Unchanged | Unchanged |
| Part 5 (5 patterns) | Unchanged | Unchanged |
| Part 6 (composer rewrite) | Unchanged | Unchanged |
| Part 7 (multi-channel) | T1 email / T2 LinkedIn / T3 voicemail | Add pre-show meeting-request + post-show 72hr-sprint as channels |
| Part 8 (build vs buy) | Mostly unchanged | Add: badge-scan integration vendor research; during-show audio capture vendor research |
| Part 9 (timeline) | 14-day Phase 1 unchanged | Phase 1 = Lever 4 only; Phase 2 ramp = Levers 3-4; Phase 3 productization = full 4-lever for clients 2-3 |
| Part 10 (productization) | Single-tenant Inorsa → multi-tenant SaaS | Same shape; pricing scaled per lever-coverage tier (Lever 4 only $30-40K; full 4-lever $80-120K) |
| Part 11 (will NOT do) | Unchanged | Add: will not compete with attendee-side networking apps (Brella, Grip) |
| Part 12 (killer question) | Unchanged | Add: have we tested all 4 levers end-to-end (not just Lever 4)? Current answer: NO. Phase 2+3 dependencies. |

---

# Operator decision needed

This is a proposed amendment, not committed. Operator decides:

1. **Accept the reframe + merge into Wave 6 spec v2?** OR keep v1 generic framing?
2. **Pricing thesis revision: tier by lever coverage** (Lever 4 only @ $30-40K; full 4-lever @ $80-120K)?
3. **Phase 2+3 prioritization: build Lever 3 next (post-show 72hr sprint)** OR continue with Lever 4 multi-channel (T2/T3 ramp)?
4. **Client #2 vertical preference**: Construction/AEC, Telecom Equipment, or other?

Defaults if no answer: ACCEPT reframe; revise pricing tier; build Lever 3 next (since Inorsa already proved Lever 4 in production); evaluate client #2 verticals after Phase 3.

---

# Version history

| Version | Date | Author | Change |
|---|---|---|---|
| v1 | 2026-06-12 07:45 EDT | Claude (Opus 4.7) Coordinator | Proposed reframe based on operator strategic input 2026-06-12 04:00 EDT. Wave 6 Part 1 replacement candidate. Identifies 4 levers + competitive whitespace + addressable market sizing + Wave 6 part-by-part patch list. |
