---
title: P2 List Audit — canonical source of truth + archive plan
status: ACTIVE
last_updated: 2026-06-10 17:00 EDT
version: v1
---

# P2 List Audit (2026-06-10)

**One-sentence purpose:** decide the canonical P2 cold-prospect list and archive every file that could be confused with it.

> NOTE on DNC names: compliance hook prevents naming §10 DNC companies in this doc. Where one appears, it's referenced as `[DNC#N — see wiki-459-mirror §10]`. Operator can cross-reference.

## TL;DR

| Question | Answer |
|---|---|
| What IS the canonical P2 cold-prospect list? | `data/showrev/p2-cold/tier-a-pipeline-input.csv` (210 rows) |
| Has it been corrected for today's findings? | **NO** — corrections live in the DB (sr_prospects), not the CSV |
| Cleaned + relabeled version proposed? | `data/showrev/p2-cold/P2-CANONICAL-2026-06-10.csv` (CREATE PENDING — needs operator GO) |
| Files in p2-cold/ that could cause confusion? | 4 (see archive plan below) |
| Test/wet-run CSVs that should NOT be confused with P2 input? | 13 in test/ + 6 in premium/ + 2 in showrev/ root |
| DNC companies currently in DB / CSV that should be removed? | 2 confirmed (see Section F) |

## A. What's in the canonical CSV right now

| Property | Value |
|---|---|
| Path | `data/showrev/p2-cold/tier-a-pipeline-input.csv` |
| Rows | 210 (211 lines − 1 header) |
| Schema | `first_name, last_name, company, title, state, email, company_url` |
| `email` column | empty in all rows (pipeline finds via Apollo + MV) |
| `company_url` column | empty in all rows |
| Origin | June 4 2026 — derived from `fc2026-attendees-usa.csv` (full attendee pool) by operator-curated priority |

## B. What's in the DB right now (sr_prospects, lead_type=Cold)

| Metric | Count |
|---|---|
| Total P2 Cold prospects loaded | 87 |
| In canonical CSV AND in DB | 67 (intersection) |
| In canonical CSV but NOT in DB | 143 (untouched — never run through pipeline) |
| In DB but NOT in canonical CSV | 20 (mostly slug-normalization differences; some loaded via test CSVs) |
| Operator-locked emails (`email_corrected=true`) | **11** |
| Slug/company mismatches | 5 |
| Send status: pending | 49 |
| Send status: flag | 31 |
| Send status: hold | 7 |

## C. Today's operator corrections — in DB only, NOT yet in CSV

These were patched manually during the session. If the pipeline reruns from the canonical CSV, it would overwrite some of them (BUT operator-locked fields like `email_corrected=true` are protected by the precheck).

| Prospect ID | CSV says | Operator confirmed | Status |
|---|---|---|---|
| `mark-evans-fidium-fiber` | Mark / Evans / Fidium Fiber / Director of Business Development | Real title: "Director of Sales - Vertical Markets". Email verified `mark.evans@fidium.com` | email_corrected=true, pending |
| `jason-dandridge-palmetto-rural-telephone-cooperative` | Jason / Dandridge / PRTC | Dual CEO (also CDG). Email `jason.dandridge@cdg.us` is his CDG inbox | email_corrected=true, flag (hallucination) |
| `darin-jackson-allo-communications` | (NOT in canonical CSV) | At ALLO Fiber. Email pattern `firstname.lastname@allofiber.com` (NOT `@allocommunications.com`) | email_corrected=true, pending |
| `ron-llamas-azimuth-engineering` | Ron / Llamas / Azimuth Engineering / Director / NJ | Real employer: inRange Solutions, Director Business Development, FL. Co-rep relationship with Azimuth at FC26 | company UPDATED in DB, pattern-guess (hold) |
| `joe-buccieri-blue-ridge-communications` | Joe / Buccieri / Blue Ridge Communications / Engineering Manager / PA | Legit. Canonical domain `brctv.com` (NOT `blueridge.tech`) | company_website corrected (hold) |
| `mark-davis-highline-internet` | Mark / Davis / Highline Internet / SVP / GA | Legit. Canonical domain `highlinefast.com` (NOT `highlineinternet.com`) | company_website corrected (hold) |
| `alex-mora-tep` | Alex / Mora / TEP / Sr. Director - Fiber Engineering / NC | TEP = Tower Engineering Professionals (tower-primary with fiber sub-vertical). Mora runs fiber. IS in scope per attendee-list primary-source rule. | icp_status=pass, hold |

## D. All 11 operator-locked emails (full list)

These are protected by `email_corrected=true`. Pipeline reruns will NOT overwrite them.

| Prospect ID | Locked email | Company in DB |
|---|---|---|
| heath-sellenriek-gateway-fiber | heath.sellenriek@gf.com | **Sellenriek Construction, Inc** (note: slug/company mismatch — see Section E) |
| jason-dandridge-palmetto-rural-telephone-cooperative | jason.dandridge@cdg.us | Palmetto Rural Telephone Cooperative |
| joe-kunz-gfiber | joekunz@google.com | GFiber |
| darin-jackson-allo-communications | darin.jackson@allofiber.com | ALLO Communications |
| stephanie-lobdell-cumberland-connect | slobdell@cemc.org | Cumberland Connect |
| doug-guthrie-iq-fiber | doug@iqfiber.com | IQ Fiber |
| ryan-kudera-finley-engineering | r.kudera@finleyusa.com | Finley Engineering |
| david-wojcik-finley-engineering | d.wojcik@finleyusa.com | Finley Engineering |
| wesley-kudera-finley-engineering | w.kudera@finleyusa.com | Finley Engineering |
| katie-espeseth-epb-fiber-optics | katie.espeseth@efoinc.com | EPB Fiber Optics |
| mark-evans-fidium-fiber | mark.evans@fidium.com | Fidium Fiber |

## E. Data integrity anomalies you need to know about

### 5 slug/company mismatches in DB

| ID slug suggests | Actual company in DB | Likely cause |
|---|---|---|
| heath-sellenriek-gateway-fiber | Sellenriek Construction, Inc | Multi-affiliation. Sellenriek is his firm; Gateway Fiber Board Director per yesterday's research. **Decision needed.** |
| dan-tully-network-building-consulting | `[DNC#1 — see wiki-459-mirror §10]` | Punctuation difference + **company is on DNC list**. Should REMOVE from any P2 work. |
| joanne-hovis-ctc-technology-energy | `[DNC#2 — see wiki-459-mirror §10]` | `&` vs `-` normalization + **company is on DNC list**. Should REMOVE. |
| leigh-anne-self-b-t-group | `[DNC#3 — see wiki-459-mirror §10]` | `+` normalization + **company is on DNC list**. Should REMOVE. |
| ron-llamas-azimuth-engineering | inRange Solutions | Today's correction. Slug stable, company corrected. OK. |

### Heath Sellenriek (the most ambiguous case)

- ID slug: `heath-sellenriek-gateway-fiber`
- Company: `Sellenriek Construction, Inc`
- Title: `President & COO`
- Email: `heath.sellenriek@gf.com` (gf = Gateway Fiber?)
- email_corrected: TRUE (you marked it)
- company_website: `https://gatewayfiber.com`
- send_status: flag

**Question for you:** is Heath an outreach target as Sellenriek Construction, Inc., or as Gateway Fiber Board Director? Both are real, both are fiber-relevant. Affects email body framing.

## F. Files in `data/showrev/p2-cold/` — keep / archive / clean

| File | Action | Why |
|---|---|---|
| `tier-a-pipeline-input.csv` (210 rows) | **KEEP as input source** | The canonical P2 cohort |
| `cohort-batches/cohort-batch-*.csv` (9 files, ~2,569 rows total) | **ARCHIVE** to `_deprecated/` | Deeper backlog. Not active P2. Confusable name. |
| `fc2026-attendees-usa.csv` (large file, 2,500+ rows) | **KEEP, mark read-only** | Full attendee pool; tier-a was derived from this. Reference only. |
| `p2-processed.csv` (June 4) | **ARCHIVE** to `_deprecated/` | Stale processing output, not input. |
| `n90-pipeline-input.csv` | **ARCHIVE** to `_deprecated/` | Old N=90 batch from June 6. Superseded by tier-a. |
| `rerun-finley-dobson.csv` (June 7) | **ARCHIVE** to `_deprecated/` | One-off rerun list. |
| `p2-summary.md` | **ARCHIVE** to `_deprecated/` | Stale summary. |
| `.DS_Store` | DELETE | Mac artifact |
| `_deprecated/` (already exists) | **KEEP** | Already-deprecated bucket |

### Files OUTSIDE p2-cold/ that could be confused

| File | Action | Why |
|---|---|---|
| `data/showrev/wet-run-p2-hard5.csv` | ARCHIVE to `_deprecated/` or `test/` | Old June 8 wet-run |
| `data/showrev/canary-p2-batch.csv` | ARCHIVE to `_deprecated/` or `test/` | Old canary |
| `data/showrev/test/*.csv` (13 files) | KEEP in test/, ADD README.md | Test inputs, already isolated, just confirm naming |
| `data/showrev/premium/*.csv` (6 files) | ARCHIVE to `_deprecated/` | Old calibration runs, not P2 |

## G. Proposed clean CSV — `P2-CANONICAL-2026-06-10.csv`

If you say GO, I produce one file at `data/showrev/p2-cold/P2-CANONICAL-2026-06-10.csv` with:

1. **Source:** copy of `tier-a-pipeline-input.csv` (210 rows)
2. **Corrections applied:**
   - Ron Llamas → company = "inRange Solutions" (state still NJ per CSV; LinkedIn says FL — flag for manual verify)
3. **Removals:**
   - Any row whose company appears in §10 DNC list. Operator should confirm count after the audit.
4. **Header comment row** (Excel-friendly): "# Canonical P2 cohort 2026-06-10. DO NOT EDIT IN PLACE. Operator-curated. See data/showrev/audits/P2-LIST-AUDIT-2026-06-10.md for context."
5. **Frozen filename** so no other CSV gets confused with it

## H. Recommendation

1. Read this audit. Confirm canonical CSV is correct (or push back).
2. Decide Heath Sellenriek's affiliation: Sellenriek Construction Inc. OR Gateway Fiber Board Director?
3. GO/NOGO on the `P2-CANONICAL-2026-06-10.csv` creation.
4. GO/NOGO on the archive moves in Section F.
5. THEN — and only then — we proceed to Deliverable B (DB field audit) and the clean-slate re-run.

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-10 17:00 | Claude | Initial audit of P2 list state, operator corrections, anomalies |
