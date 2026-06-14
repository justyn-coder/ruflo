---
title: Verified Claim Library — Inorsa Positioning Corroboration (Substrate A)
status: ACTIVE
last_updated: 2026-06-09 EST
version: v1
purpose: Cite-ready industry claims the composer can use in cold-email body or P.S. Every entry has source URL + date + sr_company_evidence row id so it can be defended on demand.
---

# Verified Claim Library — Inorsa Positioning Corroboration (Substrate A)

## Material findings before the library

1. The `sr_company_evidence` table contains **756 rows** as of 2026-06-09, not 38K. There is **no `tier` column and no USE_DIRECTLY / USE_TO_SHAPE marker** in the schema. Categories present: `company_fact` (452), `industry_context` (211), `persona_signal` (93). I treated `source_kind = web_research_dated` + `source_citation` containing an http URL as the proxy for USE_DIRECTLY (dated, attributable, citable). Rows without dated URL are treated as USE_TO_SHAPE (background, not for direct quotation).
2. The richest corroboration source for the composer is `data/showrev/industry-intelligence-kb.md` v1 (2026-05-28), which already aggregates 60+ sourced facts. The substrate is **complementary, not redundant** — substrate has named-company specifics (Allo, Lyte, Omni, Frontier deals); the KB has industry-level aggregates (BEAD totals, salary medians, RDOF default rate).

---

## I. Inorsa positioning claims to substantiate

From `data/showrev/inorsa-source-of-truth.md` v9, the Chris one-pager block, and product/solutions pages.

| # | Inorsa claim | SoT location |
|---|---|---|
| 1 | "Your fiber builds are scaling. Your engineering workflows aren't." | SoT §2 (Chris one-pager headline) |
| 2 | "Engineers spend hours manually producing drawings from LLD and GIS inputs." | SoT §2 (Problem block) |
| 3 | "Manual coordination that worked at 50 miles breaks at 250." | SoT §2 |
| 4 | "Hiring adds headcount without fixing the underlying problem." | SoT §2 |
| 5 | "Outsourcing adds handoffs, increases risk." | SoT §2 |
| 6 | "Fiber operators navigate aggressive build schedules, complex permitting requirements." | SoT §4 (solutions/fiber page) |
| 7 | Permit rejection rate is 40-50% on first pass; kickback delays are months. | SoT §7 (Nick McManus 2026-06-03) |
| 8 | Volume floor for fiber-operator ICP: ≥250 miles/year. | SoT §15 |
| 9 | Volume floor for A&E ICP: ≥500 combined drawings/analyses per year. | SoT §15 |
| 10 | "Scales drafting capacity 2-5x with existing headcount." | SoT §7 |
| 11 | AutoCAD is the dominant fiber A&E design platform; integration matters. | SoT §6 |
| 12 | Fiber is more technologically advanced than tower — operators model in real-time GIS (IQGeo, Esri). | Memory `reference_inorsa_sales_playbook` |
| 13 | A&E firms' biggest bottleneck is QA/validation, not drawing generation (offshoring solved that). | Memory `reference_inorsa_sales_playbook` |
| 14 | "Mismatch problem": GIS data ≠ what the drafter puts in CAD ≠ what gets built. | Memory `reference_inorsa_fiber_drawings_product` |
| 15 | PE-backed and acquired operators feel acute deployment-speed pressure. | SoT §2 + memory |

---

## II. Substrate corroboration (USE_DIRECTLY tier — dated URL citation)

Bucket A — BEAD / funding pressure (substantiates claims 1, 6, 7, 15)

| Inorsa claim | Substrate fact | Source | Date | evidence_id |
|---|---|---|---|---|
| 1, 7 | Allo laid off 9% of staff (~70 of 1,600) on 2025-07-02 citing BEAD delays; "Our investors are unable to provide capital to support the previously approved growth plans" | Light Reading | 2025-07-02 | ev_1d87690e, ev_e85f1de6 |
| 1, 15 | Allo raised >$500M in 12 months, completed nearly 200K passings (record), operates ~700K passings across NE/CO/AZ/MO | Light Reading | 2025-06-24 | ev_f894816a |
| 1, 15 | Lyte Fiber closed $175M inaugural credit facility "to scale network, support grant-funded expansion" | Telecompetitor | undated | ev_babfa808, ev_8c4590b5 |
| 1, 6 | Lyte Fiber preliminarily selected for $142M Texas BEAD (3rd-largest TX award), extends to 9,000+ locations across 7 counties, +$40M own capital | Broadband Communities | undated | ev_45a793ac |
| 1, 15 | Omni Fiber raised $200M from Oak Hill / Stonepeak; targets ~340K locations by year-end across OH/PA/MI/TX | Light Reading | 2025-12-01 | ev_b7f38128, ev_673b5ba8, ev_86ae45c0 |
| 15 | Verizon closed $20B+ Frontier acquisition Jan 20 2026; combined ~30M fiber passings | Light Reading | 2026-01-20 | ev_9d0455e6, ev_c1491be4 |
| 1, 15 | GFiber + Astound combination ("strategic opportunity to scale our customer-focused approach") | Light Reading | 2026-03-11 | ev_51a7a490 |
| 15 | Great Plains Communications acquiring Fastwyre's Nebraska operations (~24 communities) | Telecompetitor / bbcmag | undated | ev_1484728e, ev_cb225ca0 |
| 15 | FCC approved Charter's $34.5B merger with Cox | Fierce Network / Light Reading | undated | ev_8d36f7e8 |

Bucket B — Workforce / capacity / "scaling but not engineering" (substantiates claims 1, 2, 3, 4, 5, 13)

| Inorsa claim | Substrate fact | Source | Date | evidence_id |
|---|---|---|---|---|
| 1, 4 | "200,000+ additional workers needed in fiber deployment alone" (FC2026 opener) | Telecompetitor | undated (FC2026 opener) | ev_0a132d40 |
| 1, 3 | 11.8M homes connected in 2025; 1,561 active fiber providers; 42 new entrants in last 6 months; regional/coop/municipal = 40% of fiber deployment | Telecompetitor | undated | ev_0a132d40 |
| 4 | FBA-projected new fiber-workforce demand and aging-out pressure (KB ref: 58K new + 120K replacement 2025-2032) | FBA via industry-intelligence-kb.md §2 | 2025 | KB §2 (substrate gap; not yet in sr_company_evidence) |

Bucket C — Permitting / drawings / GIS (substantiates claims 2, 6, 7, 11, 14)

| Inorsa claim | Substrate fact | Source | Date | evidence_id |
|---|---|---|---|---|
| 6, 11 | Finley Engineering positions itself as broadband consultant for BEAD; published whitepaper "GIS – Smarter Maps / Better Decisions: outgrowing AutoCAD, leveraging GIS" — confirms market pull for GIS→CAD modernization | Finley Engineering site | 2026-01-01 | ev_b2ff1fb1 |
| 11, 14 | VETRO FiberMap "is a fiber management GIS mapping platform used to deploy broadband networks throughout the project lifecycle" — confirms GIS-as-source-of-truth pattern | Community Broadband Bits | undated | sub_d56922b3_0 |
| 6, 7 | "States facing delays: those requiring extended NEPA review, states with unresolved pole attachment disputes" — KB §1 | NTIA / Route Fifty / FBA | 2026 | KB §1 (substrate gap) |
| 7 | "8.4% reduction in unserved BSLs between BDC v6 and v7"; v7 = 116.4M BSLs, 2,142 reporting ISPs | FCC BDC | 2026 | ev_b8ed058a, ev_18467188 + KB §8 |

Bucket D — M&A / scaling stories (substantiates claim 15; gives the composer named-peer hooks)

| Inorsa claim | Substrate fact | Source | Date | evidence_id |
|---|---|---|---|---|
| 15 | Dobson Fiber owns regional fiber network of more than 6,500 miles (relevant for OK/AR persona framing) | Telecompetitor | undated | ev_cf11dfba |
| 15 | Frontier added record 133K fiber subs Q3 2025; 8.8M passings at 31.3% penetration | Light Reading | 2025-10-29 | ev_3 (ev_e5b3e6bf revenue / ev_9d0455e6 deal) |
| 15 | Ripple Fiber entered Washington with $250M build commitment | Light Reading | undated | ev_87e86c27 |
| 15 | Dakota Carrier Network: 70K+ miles fiber across ND, $100M/yr fiber construction past 5 years, 400 communities | DCN site | undated | ev_96295c10 |

Bucket E — Trade-association / FBA priorities (substantiates claim 1 + AI-data-center frame)

| Inorsa claim | Substrate fact | Source | Date | evidence_id |
|---|---|---|---|---|
| 1 | FBA 2026 priority: position fiber as "Fourth Pillar of AI infrastructure" alongside chips, models, energy | FBA Fourth Pillar report | 2026-04-30 | ev_7d6fd7c0 |
| 1 | FBA 2026 board includes Adtran, EPB Chattanooga, altafiber, Nex-Tech, Centranet, Graybar, PLP, GFiber, UTOPIA, KGPCo, Corning — every member at an FC exhibitor / ICP-shape company | FBA election results | 2025-12-18 | ev_23e61b72 |
| 1, 13 | NTCA 2026 board chaired by Twin Valley CEO; board is 12 broadband-provider execs — anchors rural-operator ICP | Light Reading | 2025-11-13 | ev_8e05cf48 |
| 1 | NTCA 2026 policy priorities: USF, permitting reform, BEAD remediation, Farm Bill — confirms permit-pain as named industry agenda item | Telecompetitor | 2026-01-15 | ev_30954fd2 |

---

## III. High-confidence Reserve Bank (composer-ready library)

Each row: claim verbatim or near-verbatim; cite source URL; USE-context = which persona/pain.

| # | Cite-ready claim | Source | Date | USE-context | evidence_id |
|---|---|---|---|---|---|
| 1 | "200,000+ additional workers needed in fiber deployment alone" (FC2026 opener) | Telecompetitor — telecompetitor.com/fiber-connect-2026-opens-with-vision-of-a-thinking-economy | FC2026 keynote | ops_builder, revenue_leader — capacity-without-headcount | ev_0a132d40 |
| 2 | "11.8 million homes connected to fiber in 2025; 1,561 active fiber providers; 42 new entrants in last 6 months" | Telecompetitor (same as #1) | 2026 | technical_designer — industry scale frame | ev_0a132d40 |
| 3 | "Regional, co-op, and municipal providers now make up 40% of US fiber deployment" | Telecompetitor (same as #1) | 2026 | rural/co-op persona | ev_0a132d40 |
| 4 | Verizon closed $20B+ Frontier deal Jan 20 2026; combined ~30M fiber passings | Light Reading — lightreading.com/fttx/verizon-frontier-deal-enters-the-show-me-phase | 2026-01-21 | revenue_leader — consolidation pressure | ev_9d0455e6 |
| 5 | FCC approved Charter's $34.5B merger with Cox | Fierce Network — fierce-network.com/broadband/fcc-gives-green-light-charters-345b-merger-cox | undated 2026 | revenue_leader — cable-vs-fiber consolidation | ev_8d36f7e8 |
| 6 | Allo laid off 9% citing BEAD delays; "Our investors are unable to provide capital to support the previously approved growth plans" | Light Reading — lightreading.com/broadband/allo-lays-off-9-percent-of-staff-after-voluntary-resignation-offer | 2025-07-02 | ops_builder — BEAD execution risk | ev_1d87690e |
| 7 | Allo raised >$500M in 12 months, completed nearly 200K passings (record), 700K passings across NE/CO/AZ/MO | Light Reading | 2025-06-24 | revenue_leader — same operator-class as prospect | ev_f894816a |
| 8 | Lyte Fiber $142M Texas BEAD provisional (3rd-largest TX award), 9K+ locations, 7 counties | Broadband Communities — bbcmag.com/lyte-fiber-named-as-preliminary-recipient-of-bead-funds-in-texas | undated | TX persona — named-peer hook | ev_45a793ac |
| 9 | Lyte Fiber $175M inaugural credit facility | Telecompetitor — telecompetitor.com/lyte-fiber-closes-on-175m-credit-facility | undated | revenue_leader — capital-pressure frame | ev_babfa808 |
| 10 | Omni Fiber $200M raise (Oak Hill + Stonepeak), tracking to ~340K locations EOY across OH/PA/MI/TX | Light Reading — lightreading.com/fttx/omni-fiber-raises-200m | 2025-12-01 | named-peer for OH/PA/MI/TX prospects | ev_b7f38128 |
| 11 | Omni Fiber invested >$400M to date in XGS-PON, serves ~60 small/mid-size communities | Light Reading (same) | undated | technical_designer — XGS-PON peer | ev_86ae45c0 |
| 12 | Ripple Fiber entered Washington with $250M build commitment | Light Reading — lightreading.com/broadband/the-buildout-ripple-fiber-enters-washington-with-250m | undated | WA persona — named-peer | ev_87e86c27 |
| 13 | GFiber + Astound combine ("strategic opportunity to scale our customer-focused approach") | Light Reading — lightreading.com/broadband/a-new-fiber-giant-takes-shape-as-gfiber-and-astound-combine | 2026-03-11 | revenue_leader — scaling-via-acquisition | ev_51a7a490 |
| 14 | Dobson Fiber operates regional fiber network of more than 6,500 miles | Telecompetitor — telecompetitor.com/dobson-fiber-launches-dobson-mobile-in-oklahoma-and-arkansas | undated | OK/AR persona — named-peer | ev_cf11dfba |
| 15 | Dakota Carrier Network: 70K+ miles fiber across ND, $100M/yr fiber construction past 5 years | dakotacarrier.com/about | undated | ND persona / network-scale frame | ev_96295c10 |
| 16 | Great Plains Communications: 200 communities across IN, IA, KY, NE (fiber-driven solutions) | gpcom.com/about-us | undated | Midwest persona — named-peer | ev_bff9aa2e |
| 17 | Frontier Q3 2025: $956M fiber revenue, ARPU $68.59 (+4.9% YoY) | Light Reading — lightreading.com/regulatory-politics/frontier-adds-record-133-000-fiber-subs-in-q3 | 2025-10-29 | revenue_leader — ARPU growth proof point | ev_e5b3e6bf |
| 18 | Frontier added record 133K fiber subs Q3 2025; built 326K new locations | Light Reading (same) | 2025-10-29 | revenue_leader — build-velocity benchmark | ev_3 |
| 19 | Finley Engineering whitepaper "GIS – Smarter Maps / Better Decisions: outgrowing AutoCAD, leveraging GIS to transform legacy data" — third-party validation of the GIS→CAD modernization wedge | finleyusa.com/about | 2026 | technical_designer — the mechanism is industry-recognized pain | ev_b2ff1fb1 |
| 20 | FBA: fiber is "Fourth Pillar of AI infrastructure" alongside chips, models, energy | FBA Fourth Pillar report 2026-04-30 (fiberbroadband.org) | 2026-04-30 | revenue_leader — strategic-infrastructure frame | ev_7d6fd7c0 |
| 21 | NTCA: 2026 policy priorities are USF, permitting reform, BEAD remediation | Telecompetitor — NTCA 2025 highlights | 2026-01-15 | rural/co-op persona — permit pain is the named agenda | ev_30954fd2 |
| 22 | NTCA board chaired by Twin Valley CEO Ben Foster — proxy for rural-operator ICP | Light Reading | 2025-11-13 | rural/co-op persona | ev_8e05cf48 |
| 23 | FBA 2026 board: Adtran (chair), EPB Chattanooga, altafiber, Nex-Tech, Centranet, GFiber, UTOPIA, Corning — high-credibility named-peer ladder | fiberbroadband.org election results 2025-12-18 | 2025-12-18 | technical_designer — third-party authority | ev_23e61b72 |
| 24 | Great Plains Communications acquiring Fastwyre's Nebraska ops (~24 communities) | Telecompetitor / bbcmag | undated | Midwest consolidation frame | ev_cb225ca0 |
| 25 | VETRO FiberMap is a GIS mapping platform used "throughout the project lifecycle" — confirms GIS-as-source-of-truth | Community Broadband Bits Ep. 333 | undated | technical_designer — GIS pipeline canonical | sub_d56922b3_0 |
| 26 | AT&T live-tested 1.6 Tbps fiber between Newark and Philadelphia | pots-and-pans 2025-04-03 | 2025-04-03 | technical_designer — capacity-demand frame | sub_d6e6ea98_0 |
| 27 | FCC BDC v7 identifies 116.4M Broadband Serviceable Locations across 2,142 ISPs | FCC BDC docs | 2026 | analyst persona — TAM frame | ev_b8ed058a, KB §8 |
| 28 | Comcast top BEAD recipient in California — $400M state allocation | brandergroup.net (BEAD Top-10 states) | 2025-11 | revenue_leader — CA persona BEAD anchor | sub_a838e362_0 |
| 29 | AT&T awarded $44.9M in Georgia BEAD provisional awards | Telecompetitor BEAD subgrantees list | undated | GA persona — state-level BEAD anchor | sub_db55f7e5_1 |
| 30 | Conexon Connect awarded $19.9M in Georgia BEAD provisional awards | Telecompetitor BEAD subgrantees list | undated | GA persona — named-peer for co-op | sub_db55f7e5_2 |

---

## IV. What's missing

Inorsa positioning claims **without strong substrate corroboration** at the row-id level. These are real gaps — the composer cannot defend with a substrate cite today.

| Gap | Why it matters | Recommended ingest |
|---|---|---|
| 40-50% permit rejection rate on first pass (Nick McManus 2026-06-03) | Most load-bearing claim in §7. Not yet in `sr_company_evidence`. KB §4 has permit-cycle data but not the 40-50% number. | Web-search ingest of FBA, NTIA, GAO permitting studies; tag as `industry_context` + `claim_type=regulatory` |
| FBA workforce projection: 58K new + 120K replacement fiber workers 2025-2032 | The cleanest "scaling outpaces engineering" cite. Lives only in industry KB §2, not in substrate. | Ingest FBA 2025 workforce report directly into `sr_company_evidence` |
| OSP Design Engineer salary ($98K median); OSP CAD Drafter ($62K) | Substantiates "hiring adds headcount without fixing the problem." In KB §2 only. | Ingest Salary.com / Glassdoor citations into substrate |
| RDOF 37% default rate ($3.3B of $9.2B) | Powerful "BEAD execution risk" frame for risk-averse personas. KB §8 only. | Ingest GAO and pots-and-pans default-tracking posts |
| Specific GIS-to-CAD pipeline failure modes (mismatch problem) | Inorsa's core mechanism. Closest substrate cite is Finley's "outgrowing AutoCAD" whitepaper. | Direct ingest of IQGeo conference content, Katapult Pro case studies, FBA OSP curriculum |
| Make-ready / pole-attachment delay-cost quantification | Strong "kickback = months, production = days" reframe. KB §4 has qualitative data; no $/day figures. | Web-search NTIA OTMR rulings, state pole-replacement programs |
| Tier marker on substrate rows | No USE_DIRECTLY column exists. Composer cannot filter by trust tier without manual review. | Add `evidence_tier` column to `sr_company_evidence` with values `use_directly` / `use_to_shape` / `background`; backfill via judge pass |

### Tier-marker recommendation (architecture note)

The Phase-0 substrate-tiering spec (`docs/specs/substrate-tiering-architecture-spec.md`) defines tiers — but they aren't materialized on `sr_company_evidence` yet. Until they are, downstream consumers (composer, judge) cannot enforce "USE_DIRECTLY only." Recommend: add `evidence_tier text` column + backfill via a single judge pass scoring each row on (source authority, dated, URL-traceable, quantified). This unlocks a real "verified-claim library" view rather than a manually-curated one like this doc.

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 | Claude (researcher subagent) | Initial mining pass against sr_company_evidence (756 rows) + industry-intelligence-kb cross-reference. 30 cite-ready claims in §III. 7 named substrate gaps in §IV. |
