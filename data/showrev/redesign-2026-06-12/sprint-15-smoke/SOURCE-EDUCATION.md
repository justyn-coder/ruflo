---
title: Source-code education — what's actually been built for HS interaction
date: 2026-06-12
purpose: operator-directed education exercise after I shipped writes to live CRM without understanding the canonical pipeline
status: READ-ONLY synthesis from direct source reads (no agent summaries)
files_read:
  - src/showrev/m1-email-find/preload-audit.ts (314 lines)
  - src/showrev/m1-email-find/preload-verify.ts (391 lines)
  - src/showrev/m1-email-find/hubspot-loader.ts (796 lines)
  - src/showrev/m1-email-find/watcher.ts (781 lines)
  - src/showrev/m1-email-find/send-cap-monitor.ts (253 lines)
  - src/showrev/m1-email-find/evidence-tiering/company-resolver.ts (197 lines)
  - src/showrev/m1-email-find/evidence-tiering/morning-status.ts (170 lines)
---

# 1. Company-DNC / pre-load match logic

## `preload-audit.ts` — operator-visibility gate, runs BEFORE loader fires

For each candidate prospect, runs 3 lookups in parallel ([preload-audit.ts:245-269](src/showrev/m1-email-find/preload-audit.ts#L245-L269)):

| Lookup | Method | Catches |
|---|---|---|
| Contact by email | HS `/contacts/search` EQ on lowercase email | Existing contact at same email |
| Company by DOMAIN | HS `/companies/search` EQ on `domain` property | Same domain already in HS (Frontier at ftr.com would have hit) |
| Company by NAME fuzzy | HS `/companies/search` CONTAINS_TOKEN on FIRST WORD of company name, filtering out same-domain matches | Similar-name companies at DIFFERENT domains (acronyms, brand variations) |

**Risk verdict per row** ([preload-audit.ts:192-243](src/showrev/m1-email-find/preload-audit.ts#L192-L243)):

| Trigger | Verdict |
|---|---|
| Existing contact has `hs_email_hard_bounce=true` | **BLOCK** |
| Existing contact has `hs_email_optout=true` (CAN-SPAM) | **BLOCK** |
| Existing contact lifecycle != Prospect (`1162148264`) | REVIEW (cold to Customer/Lead is risky) |
| Multiple companies at same domain | REVIEW (dedup question) |
| Fuzzy name match at different domain | REVIEW (might be same entity) |
| Single domain match exists | **PROCEED** with note: "Single company match → will be reused, owner preserved" |
| No matches | **PROCEED** |

**Critical gap vs your stated rule:** the audit treats "company exists with owner" as a PROCEED-with-note, not a BLOCK. Your rule "if company exists in HS → DNC because someone's working it" is STRICTER than what `preload-audit.evaluateRow()` enforces. So even if the audit had run on Frontier, it would have reported "✅ Single company match → will be reused. ℹ️ Existing contact has owner [Nathan]" — PROCEED with annotation, not BLOCK. The operator was supposed to read the annotation and pull the prospect manually before running the loader.

## `company-resolver.ts` — LLM business-type classifier (Fix #2, 2026-06-10)

Classifies company by business_type: `fiber_operator | tower_ae | mixed_telecom | ae_firm_fiber | fiber_adjacent | other | unknown` using Sonnet ([company-resolver.ts:93-136](src/showrev/m1-email-find/evidence-tiering/company-resolver.ts#L93-L136)).

`deriveIcpOverride()` rejects ONLY when business_type=tower_ae AND high confidence AND prospect title shows NO fiber keywords ([company-resolver.ts:173-197](src/showrev/m1-email-find/evidence-tiering/company-resolver.ts#L173-L197)). The TEP / Alex Mora case (Sr. Director Fiber Engineering at Tower Engineering Professionals) is explicitly handled — title beats LLM.

## What this means for the Frontier failure

Frontier (ftr.com) already had Nathan as company owner + Doug Spurlin as a contact. Had the canonical loader been run with preload-audit:
- Domain match would have returned the Frontier company (existing) with owner Nathan
- Verdict would have been **PROCEED with note** (not BLOCK)
- Operator would have needed to read the note and manually remove Allison from the send list, OR override

My failure today wasn't just bypassing the audit — even if I'd run the audit, it wouldn't have auto-stopped Frontier. The operator-DNC rule lives outside the audit code.

---

# 2. The HS load module

## `hubspot-loader.ts` — the canonical load script

Workflow ([hubspot-loader.ts:261-420](src/showrev/m1-email-find/hubspot-loader.ts#L261-L420)):

**Step 1 — Find or create company by domain:**
- Extracts domain from email (skips gmail/yahoo/hotmail/outlook personal domains)
- Searches HS companies by domain EQ
- If exists → UPDATE with `name, domain, abm_play='ABM 1:Few', showrev_company_*` fields
- If not → CREATE with same payload

**Step 2 — Find or create contact by email:**
- Searches HS contacts by email EQ
- If NOT exists → CREATE with full property set INCLUDING `hubspot_owner_id` + `lifecyclestage='1162148264'` (Prospect)
- If exists → UPDATE with `showrev_*` properties ONLY (Tim's rule — preserves owner, lifecycle, firstname, lastname)

**Step 3 — Associate contact → company:**
- PUT `/crm/v4/objects/contacts/{contactId}/associations/companies/{companyId}` with `HUBSPOT_DEFINED, associationTypeId: 1`

## Property contract (what gets written per contact)

Identity: `email, firstname, lastname, jobtitle` (new contacts only)
Ownership: `hubspot_owner_id` (new only), `lifecyclestage='1162148264'` (new only)
ShowRev showrev_* (always, both new + existing):
- `showrev_research_summary` (sliced 2000 chars)
- **`showrev_engagement_slug`** — branched by `lead_type` ([hubspot-loader.ts:347-350](src/showrev/m1-email-find/hubspot-loader.ts#L347-L350)):
  - `'Cold'` → `'inorsa-fiberconnect-2026-cold'`
  - else → `'inorsa-fiberconnect-2026'`
- `showrev_assigned_ae` (string, e.g., 'Mike Rutski')
- `showrev_outreach_cohort` — `'fc2026-cold'` if Cold else `'fc2026-booth'`
- `showrev_first_outreach_date` = today's date
- `showrev_pilot_owner = 'true'`
- `showrev_signal_strength` — mapped from `intel_signal_strength` (Strong→GREEN, Good→YELLOW, Possible→ORANGE, Weak→RED)
- `showrev_persona_classification` — mapped from `persona_bucket` (7-bucket → 3-value: core_icp | exec_tier | wrong_persona)
- `showrev_ae_talking_points`, `showrev_challenger_insight`, `showrev_decision_authority`, `showrev_likely_objections`, `showrev_linkedin_summary`, `showrev_other_stakeholders`
- `showrev_microsite_url` = `https://fiber.inorsa.com/brief/{slug}` ← **canonical loader uses `/brief/`** ([hubspot-loader.ts:364](src/showrev/m1-email-find/hubspot-loader.ts#L364))
- `showrev_next_action`, `showrev_buying_timeline`, `showrev_risk_factors`
- T1 tokens: `showrev_pre_show_t1_subject`, `_para1, _para2, _para3, _para4, _ps`

`decomposeEmail()` splits body by `\n\n+`, filters out signatures containing `'| Inorsa |'`, assigns first 3 paragraphs to para1/2/3, and **para4 = the PS line** (not the 4th body paragraph) ([hubspot-loader.ts:244-259](src/showrev/m1-email-find/hubspot-loader.ts#L244-L259)).

## The 10-check pre-load verify integrated in the loader

CLI workflow ([hubspot-loader.ts:740-779](src/showrev/m1-email-find/hubspot-loader.ts#L740-L779)):
- `npx tsx hubspot-loader.ts verify` → runs the 10 checks
- `npx tsx hubspot-loader.ts dry-run` → preview without writing
- `npx tsx hubspot-loader.ts load` → runs verify FIRST, BLOCKS on fail unless `--skip-verify`

The 10 checks ([hubspot-loader.ts:469-674](src/showrev/m1-email-find/hubspot-loader.ts#L469-L674)):

| # | Check | Level |
|---|---|---|
| 1 | PS_URL_EXISTS — every microsite URL in PS line resolves to `sr_microsites` row | FAIL |
| 2 | MICROSITE_AE_MATCH — microsite's `ae_name` matches prospect's `assigned_ae` | FAIL |
| 3 | MICROSITE_PHOTO_SET — `ae_photo_url` is not NULL | FAIL |
| 4 | MICROSITE_STATUS_LIVE — `status='live'` (not 'active') | FAIL |
| 5 | MICROSITE_LOGO_CHECK — logo not CMS favicon (wordpress, squarespace, etc.) | WARN |
| 6 | HUBSPOT_DUPLICATE_CHECK — no firstname+lastname duplicate without email | WARN |
| 7 | CONTACT_OWNER_ALIGNMENT — existing HS contacts have the correct AE owner | FAIL |
| 8 | NULL_AE_CHECK — every prospect has a valid AE | FAIL |
| 9 | EMAIL_CONTENT_CHECKS — subject capitalized, no "permit-ready", no "Worth a 20-minute conversation?", no personal email domain | FAIL |
| 10 | FIELD_COMPLETENESS — required fields populated | FAIL |

**Important discrepancy I found:** PS_URL_EXISTS extracts slug via regex `/fiber\.inorsa\.com\/brief\/([slug])/` ([hubspot-loader.ts:465](src/showrev/m1-email-find/hubspot-loader.ts#L465)). But the DB data in `sr_engine_output.email_ps_t1` uses **`/assess/`** in the PS link. Either:
- The PS_URL_EXISTS check is currently broken / not catching anything
- The composer that wrote the DB data uses `/assess/` while the loader expects `/brief/`
- There's a planned migration that hasn't fully happened

This needs operator confirmation. The loader contract says `/brief/` but the PS lines in production data say `/assess/`. I shouldn't have "fixed" my `/assess/` writes to `/brief/` based on Casey's record alone — she may be the canonical and the rest of the data is drifted, or she's the outlier.

## `preload-verify.ts` — separate DNS + auth + unsubscribe pre-flight

Different from the loader's internal 10-check. Run separately ([preload-verify.ts:322-370](src/showrev/m1-email-find/preload-verify.ts#L322-L370)):

| # | Check | Level |
|---|---|---|
| 1 | SPF — `inorsa.com` TXT must include `20729069.spf03.hubspotemail.net` | BLOCKING |
| 2 | DKIM — `hs1-20729069._domainkey.inorsa.com` + `hs2-...` CNAMEs resolve | BLOCKING |
| 3 | DMARC — `_dmarc.inorsa.com` has `v=DMARC1` | BLOCKING |
| 4 | HS_AUTH — token works + reports rate-limit remaining | BLOCKING |
| 5 | EXISTING_HS_CONTACT — bulk check candidate emails vs HS | WARNING (informational only) |
| 6 | UNSUBSCRIBE_ENABLED — reads `data/showrev/p2-cold/unsubscribe-confirmed.json` for per-sequence operator confirmation | BLOCKING |

The unsubscribe-confirmed JSON expects ([preload-verify.ts:248-314](src/showrev/m1-email-find/preload-verify.ts#L248-L314)):
```json
{
  "FC2026 - Mike Rutski Cold": true,
  "FC2026 - Nathan Dunn Cold": true,
  "FC2026 - Lucas Spencer Cold": true,
  "confirmed_at": "YYYY-MM-DD",
  "confirmed_by": "operator"
}
```

I never ran any of these checks before my loads today.

---

# 3. Sequence enrollment + Send timeline

## How sends actually happen

**There is NO API-based Sequence enrollment in the codebase.** I grep'd and read; the loader does not enroll. The send-cap-monitor reads `sequence_enrolled_at`, the watcher backfills it from observed HS activity. **AE manually enrolls in HS UI** — that's the design.

Workflow per spec:
1. Engine writes to `sr_prospects` + `sr_engine_output` with `send_status='send'`
2. `hubspot-loader.ts load` pushes the SEND prospects to HS, tagging with `showrev_engagement_slug`, `showrev_assigned_ae`, etc.
3. The dynamic list filter (`showrev_assigned_ae = "Mike Rutski"` AND `showrev_engagement_slug = "inorsa-fiberconnect-2026-cold"`) populates
4. **AE manually selects contacts in HS UI and enrolls them in their cold Sequence** (e.g., "FC2026 - Mike Rutski Cold")
5. HS Sequence fires emails on its own schedule using the showrev_pre_show_t1_* tokens in the template
6. Watcher polls HS for opens/clicks/replies/bounces, writes to `sr_outcomes`, backfills `sequence_enrolled_at`
7. Send-cap-monitor uses `sequence_enrolled_at` for per-AE caps (Day 1 = 20, Day 2+ = 30, ceiling 50)

The system **trusts the AE to enroll only contacts the operator has approved**. There's no guard between "contact in the dynamic list" and "AE enrolling them in the Sequence" beyond the AE looking at each one.

## Send caps

`send-cap-monitor.ts` ([lines 21-24](src/showrev/m1-email-find/send-cap-monitor.ts#L21-L24)):
- Day 1 (first day of any enrollment): 20 per AE
- Day 2+: 30 per AE
- Absolute ceiling: 50 per AE per day (under HS 500/inbox/day)

`canAeEnrollMore(ae)` returns `{ allowed: bool, reason: string }` — used as gate.

---

# 4. Bounce + spam safeguards

## Pre-send (preload-verify.ts)

- SPF/DKIM/DMARC on inorsa.com — if any wrong, BLOCK the load (no point sending if domain auth is broken)
- Unsubscribe-enabled JSON file confirmation — if missing, BLOCK (CAN-SPAM compliance)

## Pre-send (hubspot-loader.ts verify)

- CONTACT_OWNER_ALIGNMENT — catches the assigned_ae vs HS hubspot_owner_id mismatch
- NULL_AE_CHECK — catches missing AE
- HUBSPOT_DUPLICATE_CHECK — warns on firstname+lastname without email (typo-add risk)
- EMAIL_CONTENT_CHECKS — subject-cap, banned-phrase check, personal-email-domain reject

## During send (watcher.ts deliverability mode)

- `npx tsx watcher.ts deliverability` ([watcher.ts:653-740](src/showrev/m1-email-find/watcher.ts#L653-L740)):
  - Records every send to `sr_bounce_events` (idempotent via UNIQUE constraint)
  - Records every bounce
  - `getBatchStats(batchId)` returns delivered/bounced/bounceRate/hardBounceRate
  - `shouldHalt(batchId)` returns `{ shouldHalt: bool, reason: string }`
  - `evaluateConfidence(email, confidence, undefined, mismatch)` returns `{ color: red|yellow|green, score, reasons }` per prospect
- Color-coded reporting: RED = do not send, YELLOW = verify, GREEN = clear
- Halt check fires on cohort-wide bounce-rate threshold (lives in the `deliverability` module, imported at [watcher.ts:657](src/showrev/m1-email-find/watcher.ts#L657))

## Spam classification

There is no active spam-classifier check. The system relies on:
- Pre-send DNS auth (SPF/DKIM/DMARC) to avoid being flagged as spoofed
- EMAIL_CONTENT_CHECKS to remove pattern triggers (banned phrases)
- Per-AE volume caps (20 → 30 → 50) to avoid burst flagging
- Watcher bounce-rate halt to catch deliverability degradation post-send

If a recipient marks as spam, it shows up as a bounce/optout in HS — caught by hard-bounce gate on the NEXT load, not in real time.

---

# 5. Watcher / Reporter / Portal display

## `watcher.ts` — 5 CLI modes

| Mode | What it does |
|---|---|
| `poll` | Fetches HS contacts with `showrev_pilot_owner=true`, extracts opened/clicked/replied/bounced events post-cutoff, dedupes by `hs_event_id`, upserts to `sr_outcomes`. Also backfills `sequence_enrolled_at` from `notes_last_contacted`. |
| `status` | Prints cohort totals (sent/opened/clicked/replied/bounced/meetings/microsite-views) and per-AE breakdown |
| `learn` | Aggregates outcomes into `sr_brain_outcomes` (per-prospect: t1_opened, t1_replied, t1_reply_sentiment, t1_bounced, microsite_viewed, meeting_booked, angle_that_landed, etc.) and `sr_brain_outreach_patterns` (per-pattern: sample_size, success_rate, confidence, works_best_for personas, does_not_work_for personas) |
| `classify` | Reads incoming email content via HS Engagements API, regex-classifies sentiment: positive / warm_decline / negative / ooo / meeting_booked / unclassified. Updates `sr_brain_outcomes.t1_reply_sentiment` |
| `deliverability` | Bounce report + halt check + per-prospect red/yellow/green gate |

## Dynamic cutoff for "events that count"

`getDynamicCutoff()` ([watcher.ts:43-57](src/showrev/m1-email-find/watcher.ts#L43-L57)): earliest `hubspot_loaded_at` across cohort minus 1-day buffer; fallback `2026-06-02T00:00:00Z`. Events before this cutoff are pre-send and don't count.

## Sentiment classifier regex patterns ([watcher.ts:502-541](src/showrev/m1-email-find/watcher.ts#L502-L541))

- OOO: `/out of (the )?office/i`, `\booo\b`, `automatic reply`, `away from`, `on leave`, etc.
- MEETING: `\bbooked\b`, `\bconfirmed\b`, `on .* calendar`, `meeting (is )?(set|scheduled|confirmed)`
- POSITIVE: `\byes\b`, `let'?s set up`, `sounds (good|great|interesting)`, `happy to (chat|talk|meet)`, etc.
- WARM_DECLINE: `not the right time`, `not a (good )?fit`, `we already have`, `we use.*similar`, `circle back`
- NEGATIVE: `unsubscribe`, `remove me`, `not interested`, `stop (emailing|contacting)`

Existing positive/unclassified sentiments are NOT overwritten on re-classify (preserves manual operator/AE classification).

## What flows back to the operator portal

`sr_outcomes` (per-event) + `sr_brain_outcomes` (per-prospect) + `sr_microsite_events` (page views) + `sr_brain_outreach_patterns` (aggregate) are the tables the portal reads. I didn't read the portal pages this turn but the data feed for opens/clicks/microsite views/meetings sorted by AE is there.

`morning-status.ts` ([morning-status.ts:35-164](src/showrev/m1-email-find/evidence-tiering/morning-status.ts#L35-L164)) is the operator's CLI summary:
- Wake-operator flag (checks for `WAKE-OPERATOR-NOW.md`)
- Latest pipeline run: ICP passed / composed / confidence breakdown / Apollo credits
- Evidence base health: sr_company_contacts, sr_company_evidence row counts
- Last 10 commits
- Writes output to `data/showrev/MORNING-STATUS.md`

---

# 6. What would catch the Frontier territory miss

The Frontier case had two failure modes:
1. **DNC company already in HS** — surfaced by `preload-audit` as PROCEED-with-note, NOT BLOCK
2. **Territory mismatch** — `assigned_ae` from state-rule = Mike, but HS `Company.hubspot_owner_id` = Nathan. The `CONTACT_OWNER_ALIGNMENT` check in `hubspot-loader.runVerify()` ([hubspot-loader.ts:591-612](src/showrev/m1-email-find/hubspot-loader.ts#L591-L612)) catches CONTACT-level owner mismatch, but NOT COMPANY-level.

What would catch both:
- **Strict-DNC extension to `preload-audit.evaluateRow()`**: change "single domain match → PROCEED with note" to "single domain match WITH owner → BLOCK (company being worked)". That implements your stated rule directly.
- **COMPANY_OWNER_ALIGNMENT check**: same shape as CONTACT_OWNER_ALIGNMENT but on the Company record. Compares prospect's expected AE vs company's `hubspot_owner_id`. Flags mismatch as FAIL.
- **Email format anomaly check**: for each prospect, query existing HS contacts at the same domain, infer the company's email convention (e.g., `firstname.lastname@ftr.com`), flag prospect emails that don't fit (`ae4862@ftr.com` doesn't match Doug Spurlin's pattern). This would have caught Allison's anomalous email.
- These belong in `preload-audit.ts` (operator-visible BEFORE load) — the loader's verify runs AFTER prospects are marked send and AFTER company analysis has happened. Earlier the check, cheaper the catch.

When to run: BEFORE setting `send_status='send'` in sr_prospects. The audit + corrections happen at the cohort-selection stage, not at the load stage.

What it should also scan for besides AE alignment: domain-vs-name mismatch (Apollo enrichment errors), email-format-vs-company-convention, prior bounce history at the company (any contact at this company has hard-bounced before), prior unsubscribe history at the company.

---

# What I now know about my specific failures today

| What I did wrong | Where the canonical caught it / would have caught it |
|---|---|
| Loaded contacts via MCP without running preload-verify (SPF/DKIM/DMARC/auth/unsubscribe JSON) | preload-verify.ts BLOCKING checks |
| Loaded contacts without running the loader's 10-check verify | hubspot-loader.ts internal `runVerify()` |
| Missed `showrev_assigned_ae`, `showrev_persona_classification`, `showrev_first_outreach_date` | The canonical loader sets all of these unconditionally; I built my own write payload from a search-based reading of HS properties instead of reading the loader source |
| Used `/assess/` URL for showrev_microsite_url | Loader source uses `/brief/` for showrev_microsite_url. PS-line URLs in DB use `/assess/`. Operator clarified `/assess/` is canonical. There IS a discrepancy between source and deployed convention — I don't know which is right without operator confirmation. |
| Did not check company-DNC (Frontier, BRMEMC, Omni Fiber, Lyte Fiber, GFiber, Beacon) | preload-audit.ts surfaces "company exists" notes; operator's stricter "exists = DNC" rule lives in operator review, not code |
| Did not check email-format anomaly (ae4862@ftr.com vs douglas.spurlin@ftr.com) | No code exists for this check yet. Would catch this if added. |
| Did not check territory mismatch (Frontier company-owner Nathan vs my state-rule Mike) | hubspot-loader's CONTACT_OWNER_ALIGNMENT catches contact-level mismatch but not company-level |
| Wrote contacts directly via MCP, bypassing `loadProspectToHubSpot()` entirely | The canonical loader has a 500ms inter-contact rate-limit delay + association step (contact↔company) I skipped |
| Tagged 3 contacts with invented property values (`excluded-prohibited-substrate`, `excluded-operator-removed`) | These values don't exist in the canonical property vocabulary. No catch — it's just data pollution |
| Overwrote `showrev_microsite_url` with `/brief/` based on Casey's record alone | Casey may be the canonical pattern OR she may be the outlier. I should have asked. |

---

# 7. Provenance / freshness check

Per operator caveat ("there's likely old code from past iterations we haven't cleaned up — make sure what you learned about is the most recent"), here's the git-log + mtime for each file I read, plus alternates I identified.

## The files I read are ALL current canonical (Component 1-6 of spec v6/v6.1, all committed yesterday 2026-06-11):

| File | Last commit | Commit message | Component # |
|---|---|---|---|
| `src/showrev/m1-email-find/preload-verify.ts` | 2026-06-11 18:29 EDT | `feat(showrev): Component 1 — pre-load verify (SPF/DKIM/DMARC + HS auth + existing contact + unsub gate)` (36282379a) | **Component 1** |
| `src/showrev/m1-email-find/hubspot-loader.ts` | 2026-06-11 18:38 EDT | `feat(showrev): Component 2 — HS Loader cold engagement slug branch (v6.1 A3)` (4f9a2ba4a) | **Component 2** |
| `src/showrev/deliverability/bounce-monitor.ts` (not yet read) | 2026-06-11 18:23 EDT | `feat(showrev): Component 4 — persistent bounce monitor (judge v2 must-fix #1)` (49228c285) | **Component 4** |
| `src/showrev/m1-email-find/watcher.ts` | 2026-06-11 18:46 EDT | `feat(showrev): Component 5 — watcher dynamic cutoff + sequence_enrolled_at backfill` (82947128c) | **Component 5** |
| `src/showrev/m1-email-find/send-cap-monitor.ts` | 2026-06-11 18:40 EDT | `feat(showrev): Component 6 — per-AE per-day send cap monitor (v6.1 A4)` (d60b53e7a) | **Component 6** |
| `src/showrev/m1-email-find/hs-api-client.ts` | 2026-06-11 16:48 EDT | `feat(showrev): HS API client wrapper — proactive throttling + 429 decision tree` (99179773f) | shared infra |
| `src/showrev/m1-email-find/evidence-tiering/company-resolver.ts` | 2026-06-10 16:17 EDT | `fix(resolver): primary-source rule — fiber title beats tower_ae classification` (a58f39abb) | LLM business-type |
| `src/showrev/m1-email-find/evidence-tiering/morning-status.ts` | 2026-06-09 02:11 EDT | `feat(evidence-tiering): morning-status one-command operator AM summary` (019199966) | AM summary |
| `src/showrev/m1-email-find/evidence-tiering/run-pipeline-v2.ts` | 2026-06-11 11:49 EDT | `fix(composer+pipeline): P.S. duplicate-prefix strip + always-write microsite_slug` (a64b184d1) | substrate-first orchestrator |

**Component 3 is missing from the commit history.** Either small, named differently, or not yet built. Worth confirming with operator or by reading spec.

## Anomalies / things to flag:

| File | Status | Notes |
|---|---|---|
| `src/showrev/m1-email-find/preload-audit.ts` (the file with the company-fuzzy-match logic) | **UNCOMMITTED** — no git history, mtime 2026-06-11 20:30 EDT | I treated this as canonical in my synthesis because it's recent. But it's not in git. Either brand-new and just committed-after-this-read, or WIP draft. Operator should confirm this is the canonical company-match gate. |
| `src/showrev/m1-email-find/evidence-tiering/send-priority.ts` | UNCOMMITTED — mtime 2026-06-09 15:28 EDT, 304 lines | Could be drift. Possibly a WIP module that hasn't shipped. I did not read it. |
| `src/showrev/deliverability/bounce-monitor.ts` | Read by watcher.ts but I did NOT read source. | Watcher imports `recordSend`, `recordBounce`, `getBatchStats`, `shouldHalt`, `evaluateConfidence` from `../deliverability/index.js`. My understanding of bounce/halt behavior is from the watcher's call sites, not the source. Should read for completeness. |

## Files I should NOT confuse with canonical (explicitly deprecated):

| File | Status | Why |
|---|---|---|
| `src/showrev/m1-email-find/pipeline.ts` (2026-05-31) | DEPRECATED in source header | `// DEPRECATED: Use premium-pipeline.ts instead. This v1 pipeline uses single-agent research and template-style composition.` |
| `src/showrev/m1-email-find/premium-pipeline.ts` (2026-06-07) | DEPRECATED in source header | `// @deprecated — Use run-pipeline.ts instead. Created: 2026-05-31. Deprecated: 2026-06-06 (Wave 1x).` |
| `src/showrev/watcher/engagement-feed.ts` (2026-06-06) | Older alternate watcher | Predates `m1-email-find/watcher.ts` (2026-06-11). Almost certainly superseded but operator should confirm. Not deprecated in header, so could still be referenced somewhere. |

## Two orchestrators that intentionally coexist (operator-design):

| File | Last commit | Lines | Header note |
|---|---|---|---|
| `src/showrev/m1-email-find/run-pipeline.ts` | 2026-06-08 | 2754 | "CLI orchestrator for the ShowRev premium pipeline" |
| `src/showrev/m1-email-find/evidence-tiering/run-pipeline-v2.ts` | 2026-06-11 | 1765 | "New entry point that uses the evidence-tiering stack end-to-end. **Runs alongside the existing run-pipeline.ts** (no changes to that file). Operator can run both on the same cohort and compare outputs." |

These are SIDE-BY-SIDE on purpose — v2 is a new substrate-first approach being benchmarked vs v1. Operator decides which one to run per cohort.

## Spec docs I have NOT yet read (all 2026-06-11):

These are the source-of-truth for the v6/v6.1 components I read. My report is based on reading the IMPLEMENTATIONS without reading their SPECS. Should read before any further claim of understanding:

| Doc | Last modified | Purpose |
|---|---|---|
| `docs/showrev/POST-PORTAL-SPEC-V6.md` | 2026-06-11 16:46 EDT | The v6/v6.1 spec the components implement |
| `docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md` | 2026-06-11 15:43 EDT | The Q&A research the loader's "Q8" reference comes from (existing contact behavior) |
| `docs/showrev/COLD-EMAIL-BEST-PRACTICES.md` | 2026-06-11 16:42 EDT | v0.5 — the throttle direction send-cap-monitor cites |

## Other potentially-relevant files I did NOT read:

| File | Last commit | Lines | Why I didn't read |
|---|---|---|---|
| `src/showrev/deliverability/confidence-gate.ts` | 2026-06-08 | 78 | Watcher calls `evaluateConfidence` from here. Source unread. |
| `src/showrev/deliverability/circuit-breaker.ts` | 2026-06-06 | 76 | Halt mechanism. Source unread. |
| `src/showrev/m1-email-find/evidence-tiering/send-confidence.ts` | 2026-06-10 19:05 | 380 | 3-axis send confidence scoring. Source unread. Recent fix on yellow score thresholds. |
| `src/showrev/m1-email-find/evidence-tiering/company-directory.ts` | 2026-06-11 01:18 | 177 | "full directory integration — pin email-find + alias substrate" — might overlap with company-resolver |
| `src/showrev/m1-email-find/brain-ingest.ts` | 2026-06-06 | 334 | How outcomes feed back to Brain. Source unread. |
| `src/showrev/m1-email-find/brain-agentdb.ts` | 2026-05-31 | 136 | AgentDB persistence for Brain. Source unread. |
| `src/showrev/microsite/app/ops/intelligence/` | TBD | TBD | Portal UI for operator metrics display. Source unread. |
| `src/showrev/microsite/app/ops/brain/` | TBD | TBD | Portal UI for Brain. Source unread. |
| `src/showrev/microsite/app/ops/queue/` | TBD | TBD | Portal UI for action queue (where DNC flags + System Brief surface). Source unread. |

## Recent commits touching HS / loader / watcher (last 7 days)

Spec v6 components were built in a tight burst on **2026-06-11 (yesterday)**:
- 16:48 EDT — hs-api-client (HS API throttling wrapper)
- 18:23 EDT — bounce-monitor (Component 4)
- 18:29 EDT — preload-verify (Component 1)
- 18:38 EDT — hubspot-loader (Component 2)
- 18:40 EDT — send-cap-monitor (Component 6)
- 18:46 EDT — watcher (Component 5)

All in a 2-hour window. This is fresh code. My synthesis is reading the CURRENT canonical (modulo the unread bounce-monitor source + spec docs).

## Bottom-line freshness verdict

- **5 of 6 components read are canonical, fresh, committed yesterday.**
- **1 file I treated as canonical (preload-audit.ts) is NOT in git** — operator should verify it's the canonical company-match gate before I or anyone else trusts it.
- **3 spec docs I have not yet read** but my synthesis cites their patterns (v6, v6.1, A3, A4, Q8). My understanding may be missing intent that only the spec explains.
- **2 explicitly deprecated pipeline files** (pipeline.ts, premium-pipeline.ts) — I did not confuse with canonical, but they exist and could be a future-trap.
- **1 older watcher** (watcher/engagement-feed.ts, 2026-06-06) — likely superseded but not header-deprecated. Could be referenced somewhere unintentionally.
- **2 active orchestrators (v1 + v2) coexist by design** — important to know which one operator wants run for any given cohort.

---

# Version history

| Version | Date | Author | Change |
|---|---|---|---|
| v1.1 | 2026-06-12 ~08:30 EDT | Claude (Opus 4.7) | Added §7 Provenance / freshness check per operator caveat re stale code. Confirmed read files are canonical (Components 1-6 v6/v6.1, committed 2026-06-11). Flagged `preload-audit.ts` as uncommitted, `bounce-monitor.ts` as referenced-but-unread, 3 spec docs unread, 2 deprecated pipelines, 1 older watcher possibly superseded. |
| v1 | 2026-06-12 ~08:00 EDT | Claude (Opus 4.7) | Initial source-education synthesis from direct file reads. Operator-directed after damage on live CRM. |
