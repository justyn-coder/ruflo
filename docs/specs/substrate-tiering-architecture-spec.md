---
title: Substrate-Tiering Architecture Spec — P2 Pilot
status: DRAFT
last_updated: 2026-06-08 21:45 EDT
version: v1
purpose: Technical spec for the substrate-tiering layer and the unified evidence pipeline. Implements P2-PILOT-ALIGNMENT.md challenge #3 (information verification tiers). Specifies the data model, retrieval architecture, composer integration, and generalized-fallback mode. Folds BL-001/002/003/004/005/007/012/014/013/015.
---

# Substrate-Tiering Architecture Spec

## 1. Problem statement

The composition layer is approved by Tim. The unsolved problem is upstream: **substrate-tiering**. Today's pipeline conflates verified facts and narrative — research returns prose, the structurer extracts 30 fields, the composer reads them all as ground truth. No tier on any claim. There is no scaffolding for "this claim is verified vs likely vs unverifiable vs missing entirely."

Operator's contract (P2-PILOT-ALIGNMENT.md): **Claude decides what's true, the composer dresses it up.** This spec is how that decision is made and made traceable.

## 2. The four claim tiers (single source of truth)

| Tier | Meaning | Composer usage |
|---|---|---|
| **VERIFIED** | Direct evidence from a citable, datable source (Apollo company description, named press release with date, company's own website with quote, prior dossier with traceable lineage). Claude willing to stake reputation on it. | Use directly in the email. Quote the specific number/fact. Cite implicitly through specificity. |
| **STRONGLY_INFERRED** | Reasoning chain links observable signals to a claim (e.g. "Apollo lists employee count 74 → this is a small ops shop → drawing throughput is likely manual"). Not directly verifiable but rests on stable industry pattern + Brain peer-data. | Use to shape the pitch's POV but **do NOT quote the inferred claim as fact**. Frame implicitly ("for operators at this scale…"). |
| **WEAKLY_INFERRED** | A guess with thin support — single-source web mention, podcast aside, generic industry framing applied loosely. | **Do NOT use as a claim.** May inform the persona-bucket decision or CTA choice but never appears in the email body. |
| **GENERALIZED** | When fewer than N=3 VERIFIED+STRONGLY_INFERRED claims survive: fall back to industry/region/size-class framing pulled from substrate + Brain peer data. Email is informed by industry context but makes no company-specific claims. | Composer renders the email in "generalized mode" using a separate prompt path (see §8). |

The composer never sees WEAKLY_INFERRED claims. They exist only at the tiering layer for transparency.

## 3. The unified evidence layer (architectural fix for BL-001/003/004/005/012)

Today's pipeline runs three retrieval streams independently:
- **Brain (BL-003)**: memory store keyed by company name. No cross-company patterns.
- **Substrate (BL-004)**: raw text chunks. No company/JTBD entity tagging.
- **3-persona research (BL-012)**: live web search, ignorant of what Brain/Substrate already know.

This spec unifies them under one orchestrator. Each retrieval source produces typed evidence records that get merged, deduplicated, source-tagged, and tiered.

### 3.1 Evidence record schema

```ts
type EvidenceRecord = {
  id: string;                       // hash(source + content) for dedup
  claim: string;                    // single atomic claim, ≤30 words
  source: {
    kind: 'apollo' | 'brain' | 'substrate' | 'web_research' | 'csv_input' | 'manual';
    citation: string;               // URL, file path, Apollo endpoint name, date
    fetched_at: string;             // ISO timestamp
    sourceConfidence: 'authoritative' | 'reliable' | 'uncited' | 'inferred';
  };
  tier: 'VERIFIED' | 'STRONGLY_INFERRED' | 'WEAKLY_INFERRED' | 'GENERALIZED';
  tierReason: string;               // single-sentence explanation of why this tier
  category: 'company_volume' | 'company_growth' | 'project' | 'pain' | 'gain' | 'jtbd' | 'persona' | 'industry_context' | 'other';
  prospectScope: 'company' | 'persona' | 'industry' | 'region';
};
```

### 3.2 Tiering rules (BL-007 fix — computed, not vibes)

VERIFIED requires:
- `source.kind in (apollo, csv_input, manual)` AND source.sourceConfidence='authoritative'
- OR ≥2 INDEPENDENT sources agree on the claim
- OR source.kind='web_research' AND source.sourceConfidence='authoritative' AND fetched_at within 12 months

STRONGLY_INFERRED requires:
- Single source with sourceConfidence='reliable' AND claim is a pattern-derived inference from VERIFIED evidence
- OR multiple `sourceConfidence='uncited'` sources agree

WEAKLY_INFERRED is everything else that the LLM extractor produced.

GENERALIZED is a SYNTHETIC tier — not extracted from research at all. Claude constructs it from Brain peer-data + Substrate industry context + SoT when verified evidence runs thin.

## 4. The orchestrator (BL-005 fix)

A single orchestrator drives evidence acquisition. Runs serially for sequencing but per-phase parallel where independent.

```
┌────────────────────────────────────────────────────────┐
│  EVIDENCE ORCHESTRATOR (one call per prospect)         │
│                                                        │
│  Phase A: Pull from Brain (cross-company patterns)     │
│    - searchBrain(company + title + state) → entities   │
│    - retrieve relationship graph if company exists     │
│    - returns: existing dossier hits, peer patterns     │
│                                                        │
│  Phase B: Pull from Substrate (industry context)       │
│    - search-substrate fn(company + title + state)      │
│    - retrieve top-8 industry chunks                    │
│    - retrieve entity-tagged hits if company is named   │
│      in any substrate document (BL-004)                │
│                                                        │
│  Phase C: Pull from Apollo (authoritative facts)       │
│    - apollo_mixed_people_api_search(domain)            │
│    - apollo_organizations_enrich(company)              │
│    - extracts mile counts, customer counts, growth     │
│    - This is BL-014 promoted to mandatory.             │
│                                                        │
│  Phase D: Gap-fill via research (BL-012 fix)           │
│    - Identify GAPS: what categories are not yet        │
│      covered by A+B+C?                                 │
│    - Targeted 3-persona research ONLY on gaps          │
│    - Don't re-research what Brain/Substrate already    │
│      have.                                             │
│                                                        │
│  Phase E: Merge + dedup + tier                         │
│    - Combine all EvidenceRecord[] from A-D             │
│    - Dedup by (claim hash, source.kind)                │
│    - Apply tiering rules (§3.2)                        │
│    - Emit final TieredDossier                          │
└────────────────────────────────────────────────────────┘
```

Total cost per prospect:
- Phase A: 0 LLM, AgentDB local (~0.5s)
- Phase B: 0 LLM, Supabase fn (~1.5s)
- Phase C: 1 Apollo credit (~$0.02), 2-3 API calls (~3s)
- Phase D: targeted 1-2 Sonnet calls instead of 3 unconditional ones (~30s, ~$0.03)
- Phase E: 1 Sonnet call for tier consolidation (~10s, ~$0.015)

Wall-clock per prospect: ~45-50s (down from 65s research + 40s structurer ≈ 105s in current pipeline).

Token cost per prospect: ~$0.07 (down from ~$0.12 — research savings).

## 5. The TieredDossier (replaces today's structuredIntel)

Output of the orchestrator. What the composer receives.

```ts
type TieredDossier = {
  prospect: { firstName, lastName, company, title, state, ... };

  // Tier counts — used for fallback-mode trigger
  tierCounts: {
    verified: number;
    stronglyInferred: number;
    weaklyInferred: number;  // tracked for transparency, not used
  };

  // Claims grouped by category, only VERIFIED + STRONGLY_INFERRED visible
  claims: {
    company_volume: EvidenceRecord[];      // mile counts, customer counts
    company_growth: EvidenceRecord[];      // BEAD awards, expansion
    project: EvidenceRecord[];             // named projects
    pain: EvidenceRecord[];                // articulated frustrations
    gain: EvidenceRecord[];                // desired outcomes
    jtbd: EvidenceRecord[];                // jobs-to-be-done
    persona: EvidenceRecord[];             // decision-authority signals
    industry_context: EvidenceRecord[];    // regional/sector framing
  };

  // ICP volume verdict (uses claims.company_volume)
  icp_volume_verdict: 'fit' | 'leaning_fit' | 'miss';
  icp_volume_reasoning: string;

  // Used for ICP rank composite (P2-PILOT-ALIGNMENT.md "ICP rank")
  research_quality: 'high' | 'medium' | 'low';   // computed: high = ≥3 verified
  composer_mode: 'specific' | 'generalized';     // computed: generalized if verified+stronglyInferred < N=3

  // For composer attribution (BL-002 fix)
  source_index: Record<string, EvidenceRecord>;  // claim_id → record, for citation in composer output
};
```

## 6. Composer integration

### 6.1 Specific mode (verified+stronglyInferred ≥ 3)

The composer prompt receives the TieredDossier and is instructed:
- Use VERIFIED claims verbatim as opening anchor
- Use STRONGLY_INFERRED to shape the POV but frame implicitly ("for operators at this scale…", not "[Company] has 1,700 miles of fiber")
- Each sentence in the body must cite the `claim_id` it draws from (composer output JSON gains a `sources_used: string[]` field — BL-002 fix)
- Generalized fallback claims are NOT injected in specific mode

### 6.2 Generalized mode (verified+stronglyInferred < 3)

Triggered when `composer_mode='generalized'`. Different prompt path:
- No company-specific claims (no name in opener, no quoted numbers)
- Lead with industry/region/persona framing pulled from Substrate + Brain peer data
- The pitch sentence still uses verbatim variant (revenue_leader / ops_builder / technical_designer)
- The P.S. variant is `industry_data_hook` (FBA citation) — neutral, citation-backed
- Microsite uses the generalized template (operator says these exist; if not, draft 3-6 per persona×ICP segment)

This mode is explicitly **safe**. The email is informed by industry context but makes no company-specific claims that could be wrong. Operator approval is still required, but the failure mode is "this email is generic" not "this email has wrong facts."

### 6.3 Composer output schema

```ts
type ComposedEmail = {
  subject: string;
  body: string;       // 3 paragraphs, HubSpot Sequence rule
  ps: string;
  composer_mode: 'specific' | 'generalized';
  sources_used: string[];   // claim_ids from TieredDossier referenced in body
  tier_breakdown: {
    verified_claims_used: number;
    strongly_inferred_used: number;
    generalized_used: number;
  };
};
```

The portal can render which claim each sentence drew from. Operator can click a sentence → see source. This is the BL-002 trace.

## 7. Brain becoming an intelligence engine (BL-003 fix)

Current: Brain stores entities keyed by name; retrieves by name match.

New: Brain operates at three levels:

- **Level 1 — Entity store** (today): per-company entities with facts
- **Level 2 — Pattern store** (new): cross-company patterns by (state, ICP segment, BEAD status, employee size class). Examples: "Missouri rural electric coop subsidiary fiber operators average 1,200-2,000 miles" (peer pattern). "Operators with active ReConnect Round 3 awards typically begin construction within 18 months" (timeline pattern).
- **Level 3 — Inference cache** (new): when the tier orchestrator produces STRONGLY_INFERRED claims, cache the inference chain. Next time we see a similar prospect, the inference is retrievable as a starting point.

Pattern store is populated by:
- Nightly batch over Brain entities aggregating into pattern records
- Tagged Substrate entities (BL-004) feeding pattern records
- Apollo enrichment volume signals seeding pattern records

Pattern retrieval feeds Phase A of the evidence orchestrator: "for a prospect in MO at a fiber-coop-subsidiary, here's what's TYPICAL based on peer data."

## 8. Substrate entity tagging (BL-004 fix)

Substrate today: 4,005 files as raw text chunks. No company/JTBD/speaker tagging.

New: one-time backfill pass + ongoing tagging for new substrate.

Entity types to extract per chunk:
- Companies mentioned
- Speakers (podcasts) / authors (articles)
- Topics (BEAD, ReConnect, drawing throughput, permitting, etc.)
- JTBDs articulated (when speaker is a fiber-operator employee)
- Quoted metrics (mile counts, customer counts, $ amounts)

Storage: extend `substrate_chunks` table with a `metadata` JSON column. Queryable: "find all chunks where companies includes 'United Fiber'" or "find all chunks where topic='permit cycle' AND industry='rural-coop-fiber'."

This transforms substrate from "generic industry color" into targeted 1st-party intelligence: when a prospect's CEO discussed their own JTBDs on a podcast, the tier orchestrator promotes those quotes to VERIFIED for that company.

## 9. Apollo client wrapper (BL-013/014/015 folded)

A single Apollo client abstraction used by the orchestrator AND the email-finder.

```ts
class ApolloClient {
  // BL-013: company name normalization
  private normalizeCompany(raw: string): string;  // strips ", LLC", ", Inc", etc.

  // BL-014: enrichment promoted to mandatory
  async enrichCompany(name: string): Promise<{
    short_description: string;
    keywords: string[];
    parsed_volume_signals: VolumeSignal[];  // mileage, customer counts mined
    employee_count: number;
    growth_rate_24mo: number;
  }>;

  // BL-015: peer-pattern derivation (email-finder use)
  async peersAtCompany(domain: string): Promise<Peer[]>;
  async derivePattern(peers: Peer[]): Promise<{ domain: string; format: string; confidence: number }>;
}
```

Used by:
- Evidence orchestrator Phase C
- Email-finder Path B (separate spec)

## 10. Migration path

Current → new pipeline transition done in incremental commits, NOT a big-bang rewrite:

| Step | Effort | What ships |
|---|---|---|
| 1 | 0.5 day | EvidenceRecord schema + TieredDossier type definitions. No behavior change yet. |
| 2 | 1 day | Apollo client wrapper with BL-013/014. Used by intel-structurer's ICP verdict block. Verifies plumbing. |
| 3 | 1 day | Tier orchestrator skeleton — wraps current Brain + Substrate + research calls, emits TieredDossier. Composer still ignores tiers; we just verify the dossier is well-formed. |
| 4 | 1 day | Tiering rules + computed research_quality + composer_mode. Composer reads composer_mode but uses both branches identically (no behavioral change). |
| 5 | 2 days | Composer specific mode: reads VERIFIED/STRONGLY_INFERRED differently, attributes via sources_used. Run cohort, validate. |
| 6 | 1-2 days | Composer generalized mode: separate prompt path, generalized templates, P.S. neutral variant. Run cohort with one prospect forced to generalized. |
| 7 | 2 days | Substrate entity tagging — backfill pass on 4,005 files. (Can run in background.) |
| 8 | 2 days | Brain pattern-store level 2 — nightly batch populating peer-pattern records. (Background.) |
| 9 | 1 day | Composer attribution surfacing in portal — operator can click sentence → see source. |
| 10 | 1 day | E2E cohort test + engine-qa Test 1 + 2. |

Total: ~11-13 days. Roughly fits the 2-week ship-ready window.

Email-finder service + send queue are separate parallel build streams (separate specs). They don't block this build.

## 11. Test plan

Per-step:
- Step 1-2: TypeScript type checks pass; intel-structurer ICP verdict still emits.
- Step 3-4: Run cohort, log TieredDossier counts (verified/strongly/weakly). Compare to manually-tiered ground-truth for 1-2 prospects.
- Step 5: Run 5-frozen-prospect regression suite. Confirm Tim still approves N≥4/5.
- Step 6: Force one prospect to generalized mode. Confirm email is defensible.
- Step 9: Operator clicks 5 random sentences in portal, confirms each cites a real claim_id.
- Step 10: Engine-qa Test 1 (blind quality) + Test 2 (new prospect E2E) pass.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Tier orchestrator LLM (Phase E) misclassifies VERIFIED vs STRONGLY_INFERRED at scale | Hard rules in §3.2 (computed, not vibed); LLM only synthesizes — doesn't decide tier alone |
| Brain peer-pattern store empty until populated | Step 8 backfill must run before Step 5 cohort tests; or accept that early prospects skip Level 2 |
| Substrate entity-tag backfill is expensive (4,005 files × LLM extraction ≈ $50-100) | One-time cost; run on Haiku for cheap; can resume if interrupted |
| Generalized templates don't exist yet (operator implies they do, unclear) | Step 6 includes drafting 3-6 templates per persona×ICP segment if inventory turns up empty |
| Composer attribution in portal requires UI work | Surface as collapsed expander in System Brief; not a blocker for ship |
| `composer_mode='generalized'` threshold N=3 is arbitrary | Calibrate during Step 5 cohort; can range 2-5 based on observed quality |

## 13. What this spec does NOT cover

- Email-finder service architecture (separate spec)
- Send queue + warming + circuit-breaker (separate spec, but consumes the dossier's ICP rank)
- HubSpot Sequence loader (separate spec)
- Operator portal UI changes beyond surface-area additions (separate)
- Outcome learning loop (cut from scope per alignment doc)

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-08 21:45 | Claude | Initial draft. Folds BL-001/002/003/004/005/007/012/013/014/015. Awaiting multi-agent critique before finalization. |
