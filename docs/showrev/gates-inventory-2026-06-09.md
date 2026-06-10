---
title: Pipeline Gates Inventory — every check, decision, fail destination
status: ACTIVE
last_updated: 2026-06-09 14:00 EST
version: v1
---

# Pipeline Gates Inventory (v2 substrate-first)

Source files audited: `run-pipeline-v2.ts`, `specific-composer.ts`, `generalized-composer.ts`, `composer-constraints.ts`, `tiered-judge.ts`, `microsite-composer.ts`, `icp-gate.ts`, `email-finder/orchestrator.ts`.

## Master Gate Table

| # | Gate name | Location (file:line) | What it checks | Pass action | Fail action | Fail destination | Operator visibility |
|---|---|---|---|---|---|---|---|
| 1 | ICP regex classify | `icp-gate.ts:58-92` | Company name vs NON_ICP / AE / OPERATOR / TOWER_AE regex lists; tower-without-fiber-override → reject | Returns verdict pass/reject + icpType + confidence | Returns null → falls to LLM | n/a (delegates) | stdout `icp: ...` |
| 2 | ICP LLM classify | `icp-gate.ts:94-146` | Haiku JSON: icpType ∈ {fiber_operator, ae_firm, non_icp}, reason, confidence | Returns verdict | LLM error → defaults `pass`+`fiber_operator`, confidence 0 (false-negative-averse) | n/a | stdout |
| 3 | ICP verdict short-circuit | `run-pipeline-v2.ts:172-180` | `icp.verdict !== 'pass'` | Continues to email-find | Returns ProspectResult early; nothing persisted | Silently dropped (no Supabase write) | stdout only |
| 4 | Apollo-primary credit cap (Step 0) | `email-finder/orchestrator.ts:174-227`, tracker `apollo-client.ts:572` | `apolloPrimary` flag + `apolloPeopleMatchFn` available; MV credit budget | Returns email with confidence high/medium/guessed → green/yellow/amber | No match → falls through; MV='bad' → falls through | Continues to Step 1 | stdout `Step 0:` |
| 5 | Pipeline timeout (60s default) | `orchestrator.ts:163, 234-240, 507-513, 647-656` | `Date.now() > pipelineDeadline` before each major step | Continues | Returns `not-found` (Step 1) or partial result with verificationStatus='skipped' (Steps 2/6) | EmailFinderResult `confidence='not-found'` or `'amber'` (best candidate, unverified) | stdout `Pipeline timeout` |
| 6 | Domain hints exact + suffix match | `orchestrator.ts:247-269` | Company key in `domainHints` map (exact or stripped suffix) | Skip web resolution, mark `source:'domain-hint'` confidence='high' | Falls to `resolveDomain` | n/a | stdout |
| 7 | Domain resolution | `orchestrator.ts:276-294` | `resolveDomain()` returns DomainResult | Continues to MX validation | `null` → tries Apollo Step 1b; if Apollo empty → returns `confidence='not-found', verificationStatus='skipped'` | Returns early; downstream phases skipped (no dossier, no compose) | stdout `no domain found` |
| 8 | MX validation (alt domains) | `orchestrator.ts:386-425` | Resolves MX records; if MX root differs from web-domain root and not in SHARED_MX list → alternative domains | Adds alt domains to `domainResult.alternativeDomains` for Step 6 | Skipped silently if MX lookup throws | n/a (non-fatal) | stdout |
| 9 | Peer-pattern gate (Step 1d) | `orchestrator.ts:438-497`, `peer-pattern.ts` | `queryCompanyPeers()` returns ≥1 peer; `inferPatternFromPeers` returns pattern + confidence high/medium/low | confidence='high' (≥2 peers agree): short-circuits to GREEN `mailProvider='peer-derived' verificationStatus='unverified'`; medium/low seeds Step 2 pattern | No peers / no pattern → falls to web pattern detection | n/a | stdout `Step 1d:` |
| 10 | Web pattern detection | `orchestrator.ts:515-559` | `detectPatternFromWeb` or `inferPattern` on found emails | Sets `patternResult` for candidate generation | Null → candidate generation uses generic pattern fallback | n/a | stdout |
| 11 | Candidate generation | `orchestrator.ts:564-584` | `generateCandidates` returns ≥1 candidate | Continues to Step 4 | Empty array → still proceeds; Step 6 will return `red`/`not-found` | n/a | stdout |
| 12 | Mail provider skip-list | `orchestrator.ts:782-793` | `attemptProvider` ∈ `skipProviders` list | Skips this domain attempt | Caches first as `bestCatchAll` fallback | EmailFinderResult `confidence='yellow' verificationStatus='catch-all'` if no better attempt | stdout |
| 13 | SMTP RCPT TO valid (self-hosted) | `orchestrator.ts:826-842` | `result.status === 'valid'` AND provider not autodiscover | Short-circuits to GREEN `verificationStatus='valid'` | Falls through (invalid → eliminated; catch-all/other → survivor or skipped) | n/a | stdout |
| 14 | SMTP RCPT TO invalid | `orchestrator.ts:853-855` | `result.status === 'invalid'` | Eliminated from survivors; sets `domainHasInvalids=true` | n/a | n/a | stdout |
| 15 | Autodiscover elimination early-exit | `orchestrator.ts:884-900` | `usesAutodiscover && domainHasInvalids && domainSurvivors.length === 1` | Returns GREEN immediately, skips remaining domains | n/a | n/a | stdout `Step 6 early-exit` |
| 16 | Survivor ranking + elimination winner | `orchestrator.ts:906-960` | After all domains: ≥1 survivor; if `anyEliminationsOccurred && survivors ≤ 3` | 1 survivor → GREEN; 2-3 → YELLOW `verificationStatus='catch-all'` | Falls to MV final-gate | n/a | stdout |
| 17 | Path A MV final-gate (catch-all) | `orchestrator.ts:963-997` | MV tracker budget allows; MV result `good/valid` → GREEN, `catch_all` → AMBER, `bad/invalid/disposable` → RED, else stays YELLOW | Returns mapped confidence | Budget hit → `tacticsAttempted: 'mv-final-gate (path-a-catch-all, budget-skipped)'`, keeps YELLOW; MV throw → keeps YELLOW | EmailFinderResult `confidence` per mapping | stdout `MV final-gate:` |
| 18 | Apollo red-fallback (Step 7) | `orchestrator.ts:1030-1082` | All self-hosted exhausted, no `bestCatchAll`, `apolloPeopleMatchFn` available, not already tried | Returns mapped confidence (high→green, medium→yellow, guessed→amber); MV='bad' → red | No match / Apollo error → continues to Path A red final-gate | n/a | stdout `Step 7:` |
| 19 | Path A MV red final-gate | `orchestrator.ts:1084-1137` | Best candidate exists; budget allows | `good/valid` → GREEN, `catch_all` → AMBER; `unknown/bad` → keep red | Budget hit → `mv-final-gate (path-a-red, budget-skipped)`; throw → keep red | EmailFinderResult `confidence='red' verificationStatus='invalid'` | stdout |
| 20 | Pipeline Path B trigger | `run-pipeline-v2.ts:216-260` | `!email \|\| confidence ∈ {red, amber, not-found}` AND not skipApollo AND `!creditTracker.shouldStop(maxApolloCredits)` | Calls `findEmailForProspect`; promotes Apollo result if confidence ∈ {high, medium, guessed} | Apollo cap hit → logs `Path B SKIPPED`; result unchanged | EmailFinderResult unchanged (Path A stands) | stdout `email path-b:` |
| 21 | Flag-status detector (Phase 2.5) | `run-pipeline-v2.ts:278-315` | `icp='pass' AND (!email_found \|\| confidence ∈ {red, not-found})` | Sets `flag_status=true`, builds `flag_reason_short`+`flag_reason_brief` | n/a | `sr_engine_output.ae_flag` + `.company_summary`; later coalesced to `send_status='flag'` | stdout `flag: ...` |
| 22 | Evidence orchestrate guard | `run-pipeline-v2.ts:318` | `result.icp_type` truthy | Calls `orchestrateEvidence` | Skipped silently | dossier undefined → composer skipped → `mechanical_check_passed=false` | stdout error if throws |
| 23 | Compose mode threshold | `specific-composer.ts:288-301` | `(useDirectly + useToShape) < SPECIFIC_MODE_THRESHOLD` (types.ts) | Specific compose | Falls back to `composeGeneralized` | ComposedEmail with `composer_mode='generalized'` | stdout |
| 24 | Compose retry: total word count | `specific-composer.ts:342-343`, `generalized-composer.ts:363-364` | `countWordsTotal(body, ps)` (URL stripped) > 100 | No violation | Adds to `violations[]`; retries up to 4 attempts | Best-of-N winner persisted with `system_brief` mention if score<100 | stdout `Compose attempt N:` |
| 25 | Compose retry: paragraph count | `specific:344-345`, `generalized:365-366` | `countParagraphs(body) !== 3` | No violation | Adds violation, retry | Best-of-N winner | stdout |
| 26 | Compose retry: banned phrases | `specific:348-356`, `generalized:369-377`; lists `composer-constraints.ts:16-91` | AI_TELLS (22 patterns), TIM_KILL_LIST (10), PRODUCT_GUARDS (7 incl MicroStation, Drawing QC), OFFSHORE_GUARDS (3) | No hits | Violation per hit; checked against both subject + subject_alt | Best-of-N winner | stdout |
| 27 | Compose retry: company-name lock | `specific:357-358`, `generalized:378-379`; logic `composer-constraints.ts:206-234` | If body cites a Capitalized "at/from/of/with X" phrase that doesn't share a token with expected company → violation (Andrew/UECI bug class) | No violation | Adds violation, retry; -40 score | Best-of-N winner; post-process re-verify swaps to next-best attempt if winner still violates | stdout `Post-compose company-name verify:` |
| 28 | Compose retry: numeric-anchor repeat | `specific:359-360`, `generalized:380-381`; logic `composer-constraints.ts:255-270` | Same `{number}:{unit}` fingerprint (e.g. `1700:mile`) appears twice in body | No violation | Adds violation, retry | Best-of-N winner | stdout |
| 29 | Compose retry: 3-word bigram repeat | `specific:361-362`, `generalized:382-383`; logic `composer-constraints.ts:281-304` | Any non-stopword bigram appears in ≥3 sentences | No violation | Adds violation, retry | Best-of-N winner | stdout |
| 30 | Compose retry: participial density | `specific:364-365`, `generalized:385-386`; logic `composer-constraints.ts:332-360` | More than 1 sentence opens with `-ing` participle (PNAS 2025 AI-tell) | No violation | Adds violation, retry | Best-of-N winner | stdout |
| 31 | Compose retry: sentence-length variance | `specific:366-367`, `generalized:387-388`; logic `composer-constraints.ts:379-396` | ≥3 sentences AND std-dev < 5 words (Stanford 2023 AI tell) | No violation | Adds violation, retry | Best-of-N winner | stdout |
| 32 | Compose retry: echoed structures | `specific:368-369`, `generalized:389-390`; logic `composer-constraints.ts:414-440` | Adjacent ≥4-word sentences share same first 2 words (VERMILLION marker 2) | No violation | Adds violation, retry | Best-of-N winner | stdout |
| 33 | Compose retry: Flesch-Kincaid grade | `specific:370-372`, `generalized:391-393`; logic `composer-constraints.ts:457-535` | FK grade > 12 (ceiling) | No violation | Adds violation, retry | Best-of-N winner | stdout |
| 34 | Compose retry: em-dash in subject_alt | `specific:354`, `generalized:374` | `/[—–]/.test(subjectAlt)` | No violation | Adds violation, retry | Best-of-N winner | stdout |
| 35 | Em-dash strip (body+subject+ps) | `specific:386-392`, `generalized:404-415` | Always-on post-processor: replaces `—–` with `,` | n/a | n/a | Persisted body has commas | n/a |
| 36 | Post-compose company-name re-verify | `specific:401-432`, `generalized:425-459` | After post-process, re-checks `cleanBody` + `cleanPs` against company | Winner accepted | Walks `orderedAttempts` next-best; if all violate → `⚠ Post-compose company-name verify FAILED ... flagged for review` | Winner persisted anyway; warning to stdout | stdout warn |
| 37 | A/B subject pick | `specific:437-442`, `generalized:465-470`; logic `composer-constraints.ts:626-683` | Scores both subjects (5 base, -1 banned, -2 em-dash, -1 if >6w, -1 if <2w); higher wins | Winner → `subject`, loser → `subject_alt` | If subject_alt empty → undefined loser | ComposedEmail | stdout `Subject A/B:` |
| 38 | Tiered Judge T1 mechanical | `tiered-judge.ts:153-182` | Re-runs banned-phrases, em-dash in body/subject/ps, `countWordsTotal>100`, paragraph count ∈ [3,4], company-name lock | `pass=true` → continue T2 | `pass=false` → `action='retry'`, skips T2/T3 | `send_status='flag'` (retry collapses to flag in run-pipeline-v2:417) | stdout `judge: T1=fail` |
| 39 | Tiered Judge T2 Tim patterns | `tiered-judge.ts:246-257` | 25 TIM_TIER2_PATTERNS; score starts 5, -1 per hit, floor 0 | T1 pass + T2 ≥3 + halluc pass → `action='ship'` | T2 <3 → goes to T3 quality call | `send_status='flag'` if T3 fail/split | stdout `T2=N/5` |
| 40 | Tiered Judge T3 hallucination (always-on) | `tiered-judge.ts:489-540, 594-603` | Gemini judges substrate-supported vs unsupported factual claims; verdict pass/fail/split | pass/split (errored or inconclusive) → no override | `verdict='fail' AND unsupportedClaims.length>0` → `action='flag-hallucination'` overrides any ship | `send_status='flag'`; `system_brief` lists ≤3 unsupported claims via `generateFlagSystemBrief` (case 'hallucination') | stdout `H=fail`; flag in portal |
| 41 | Tiered Judge T3 quality (borderline) | `tiered-judge.ts:306-365, 638` | Runs only when T2<3 or forceTier3; Gemini 0-10 score, verdict pass if score≥7 | `verdict='pass'` → `action='ship'` | `verdict='fail'` → `action='flag'`; `verdict='split'` (errored or unclear) → `action='flag'` | `send_status='flag'`; rationale in `judge_result` | stdout `T3=verdict` |
| 42 | Judge rolling-rate monitor | `tiered-judge.ts:736-783` | Every 10 prospects: T1-fail >50%, T2-fail >50%, T3-dissent >30% | No alert | Writes `JUDGE-ALERT.md` at repo root | File visible in `git status`; non-fatal | git status surfaces |
| 43 | Microsite retry: headline word ceiling | `microsite-composer.ts:165-166` | `countWords(headline) > 20` | No violation | Adds violation, retry (max 3) | On attempt 3 even with violations → accepted ("accept-with-flag") | stdout `Microsite attempt N:` |
| 44 | Microsite retry: bloom_text word ceiling | `microsite-composer.ts:167-168` | `countWords(bloom_text) > 30` | No violation | Adds violation, retry | Accept-with-flag on attempt 3 | stdout |
| 45 | Microsite retry: banned phrases | `microsite-composer.ts:169-170` | `checkBannedPhrases(headline + bloom_text, '')` | No violation | Adds violation, retry | Accept-with-flag | stdout |
| 46 | Microsite retry: company-name lock (bloom) | `microsite-composer.ts:171-172` | `checkCompanyNameLock(bloom_text, company)` | No violation | Adds violation, retry | Accept-with-flag | stdout |
| 47 | Microsite retry: headline must NOT name company | `microsite-composer.ts:173-176` | First-8-char company substring in headline (lowercased) | No violation | Adds violation, retry | Accept-with-flag | stdout |
| 48 | Microsite composer fallback to templated | `run-pipeline-v2.ts:889-909` | `composeMicrosite` throws | n/a | Falls back to `MICROSITE_HEADLINE_BY_PERSONA` + `buildMicrositeInsight` | `sr_microsites` row written with templated content; `status='draft'` | stdout `⚠ microsite-composer fallback` |
| 49 | Logo resolver | `run-pipeline-v2.ts:921-931` | `resolveCompanyLogo(domain)` on email domain | Sets `companyLogoUrl` | Throw or null → microsite renders text fallback | `sr_microsites.company_logo_url = null` | stdout warn |
| 50 | Microsite ICP-pass gate for sr_prospects upsert | `run-pipeline-v2.ts:765` | `result.icp_verdict !== 'pass'` | Writes sr_engine_output AND sr_prospects | Writes sr_engine_output only, skips sr_prospects | Prospect not in portal P2-Cold tab | n/a |
| 51 | Unified send_status resolver | `run-pipeline-v2.ts:679-685` | Cascading priority: tiered judge action 'flag' → flag; else `flag_status` → flag; else `shouldFlag()` true → flag; else 'pending' | Writes `send_status` to BOTH sr_engine_output + sr_prospects | n/a | Portal shows flag with `system_brief` populated | n/a |
| 52 | Apollo credit cap (pipeline-level) | `run-pipeline-v2.ts:222, 332`; `apollo-client.ts:572` | `creditTracker.shouldStop(maxApolloCredits)` | Allow next Apollo call | Skip Path B + skipApollo in orchestrateEvidence | `email_path_b_attempted=false`; flag-status if no email | stdout `SKIPPED (Apollo credit cap)` |
| 53 | MV credit cap | `million-verifier.ts:168`; checked at `orchestrator.ts:189,315,968,1046,1094` | `mvCount >= maxCredits` (default 200, 0 = uncapped) | Allow next MV call | Skip MV call; preserve raw SMTP confidence | `tacticsAttempted` lists `'mv-final-gate (... budget-skipped)'`; confidence color unchanged | stdout `MV SKIPPED (budget ...)` |
| 54 | Per-call SMTP verify timeout | `orchestrator.ts:817-822` | `Promise.race` against `perCallTimeout = min(remainingMs, 15000)` | Result used | `status='timeout'` → treated as `other`, candidate skipped | n/a | stdout |
| 55 | Step 6 hard verification deadline (30s) | `orchestrator.ts:703-704, 808-813` | `verifyDeadline = Date.now() + 30000` | Continue verification | Breaks loop early; survivors so far ranked | EmailFinderResult based on partial survivor pool or `red/not-found` | stdout `TIMEOUT after 30000ms` |
| 56 | Flagged-prospect skip (run-level) | `run-pipeline-v2.ts:1094-1109, 1021-1050` | `!includeFlagged` AND prospect id in `fetchFlaggedProspectIds()` (`sr_prospects.send_status='flag'`) | Process normally | Filter out of input rows | Silently dropped (not processed, not re-persisted) | stdout `flag-skip: N prospect(s) skipped` |
| 57 | Persist: Supabase key present | `run-pipeline-v2.ts:628-631, 877-878` | `SUPABASE_SERVICE_ROLE_KEY` or anon key in env | Continues write | Adds `persist: no Supabase key` to errors; skip write | Prospect NOT persisted; silently dropped at DB level | stdout error |
| 58 | Persist: sr_engine_output HTTP ok | `run-pipeline-v2.ts:757-760` | `res.ok` after POST upsert | n/a | Throws `Error('sr_engine_output upsert ...')` | Caught in `processOne` → `result.errors.push('persist: ...')`; sr_prospects + microsite skipped | stdout error |
| 59 | Persist: sr_prospects HTTP ok | `run-pipeline-v2.ts:807-811` | `presRes.ok` | n/a | `console.warn` only — NON-FATAL; microsite still attempted | sr_engine_output has data; sr_prospects desynced | stdout warn |
| 60 | Persist: sr_microsites HTTP ok | `run-pipeline-v2.ts:963-966` | `res.ok` | n/a | `console.warn` only — NON-FATAL | Microsite missing; portal shows no /assess/{slug} | stdout warn |
| 61 | confidence_color mapping | `run-pipeline-v2.ts:708-711` | Maps `email_confidence` → green/yellow/amber/red | n/a (always sets) | n/a | `sr_engine_output.confidence_color` | Portal column |
| 62 | Microsite auto-status='draft' | `run-pipeline-v2.ts:949` | Hardcoded `status: 'draft'` | n/a | n/a | Operator must promote to public manually | Portal microsite status |

---

## One-paragraph role explanations

**1-3 ICP gates.** First-pass regex on company name + title (`fiber`, `electric coop`, `engineering`, `tower`-without-fiber-override). Regex inconclusive → Haiku LLM JSON with a deliberate false-negative-averse default (unknown → `fiber_operator` low-confidence). A `reject` verdict short-circuits the entire pipeline with NO Supabase write — the prospect is silently dropped.

**4-19 Email-find gates** form the waterfall inside `email-finder/orchestrator.ts`. Step 0 only runs in `apolloPrimary` mode (currently off). Step 1 resolves domain (hints → web), Step 1c reads MX for alternative domains, Step 1d queries `sr_company_contacts` for verified peers (2+ agree = GREEN short-circuit). Steps 2-5 detect pattern + provider + candidates. Step 6 is the SMTP verification core: self-hosted RCPT-TO valid = instant GREEN; Autodiscover (M365/Google) collects 200s as survivors, eliminates 302s, and an elimination-narrowed survivor pool ≤3 returns GREEN/YELLOW. Otherwise the best survivor passes through the **MV final-gate** which can upgrade to GREEN or downgrade to RED. Step 7 is Apollo people-match red-fallback. Path A final-gate MV runs one last time before returning RED. Two timeouts protect the path: 60s pipeline-wide, 30s on Step 6.

**20 Path B Apollo (pipeline-level).** `run-pipeline-v2.ts` calls `findEmailForProspect` when Path A returns red/amber/not-found, gated by `creditTracker.shouldStop()`. Apollo high/medium/guessed all promote and overwrite Path A. Critical: 2026-06-09 fix made `guessed` (peer-pattern derived) override red.

**21 Flag-status detector.** Phase 2.5 fires when ICP=pass AND email is missing or red — populates `flag_reason_short` (→ `ae_flag`) and `flag_reason_brief` (→ `company_summary`). Operator-mandated rule: every ICP makes it into the portal, even without an email.

**22-23 Evidence + compose-mode threshold.** Substrate orchestrator runs only for ICP-typed prospects. Specific composer auto-falls-back to generalized if `useDirectly + useToShape < SPECIFIC_MODE_THRESHOLD`.

**24-37 Composer retry stack.** Up to 4 attempts. Each attempt runs 10 mechanical checks: word count, paragraph count, banned phrases, em-dash in subject_alt, company-name lock, numeric-anchor repeat, bigram repeat, participial density, sentence-length variance, echoed structures, Flesch-Kincaid grade. `scoreAttempt` weights violations (-40 company-name, -30 structural, -20 banned, -10 other); best-of-N picks highest scorer. Em-dash strip is unconditional. Post-process re-verifies company name and walks the next-best attempt if winner still fails. Final A/B subject pick scores both candidates and ships the higher.

**38-42 Tiered judge.** Independent verification gate. T1 re-runs mechanical checks (catches composer post-processing regressions) — fail → `action='retry'` which collapses to `flag` at the run-pipeline level since composer already exhausted retries. T2 scores 25 Tim patterns 0-5; ≥3 = ship (with halluc clear), <3 = T3-quality. T3 hallucination is ALWAYS-ON: Gemini reads composer's substrate claims vs body and lists unsupported claims; a clear fail flips action to `flag-hallucination` regardless of other tiers. T3 quality only runs for borderline T2. The judge monitor recomputes rolling rates every 10 prospects and writes `JUDGE-ALERT.md` if thresholds trip (50%/50%/30%).

**43-48 Microsite gates.** Same family of checks (word ceiling, banned phrases, company-name lock) on a 3-attempt loop with a graceful "accept-with-flag" on attempt 3 (so the microsite ALWAYS exists). Headline must NOT name the company; bloom_text MUST cite a real fact. Catastrophic LLM error falls back to a templated headline + persona-typed insight + canned case study. Logo resolver is independent and fails silently to text fallback.

**50-51, 56-60 Persist + skip gates.** ICP=pass is required to upsert sr_prospects (the portal source). The unified send_status resolver coalesces three flag sources (judge, email-flag, system-brief) into one value written to both tables. Run-level flag-skip default-excludes prospects already flagged in sr_prospects — `--include-flagged` overrides for parking-lot re-runs. Persist failures cascade differently: sr_engine_output failure stops downstream writes for that prospect; sr_prospects / sr_microsites failures only warn (sr_engine_output is the canonical record).

**52-55 Credit + timeout gates.** Apollo cap is enforced at every Apollo call site via `shouldStop(maxApolloCredits)`; MV cap defaults to 200, uncapped with `--max-mv-credits 0`. Both caps degrade GRACEFULLY — confidence colors stay at their raw SMTP value rather than being downgraded. Per-call SMTP timeout is 15s (capped by remaining deadline); Step 6 hard deadline is 30s; full pipeline deadline is 60s.

---

## Where does a prospect LAND when a gate fails?

### `confidence_color = 'red'`
Set when `email_confidence` is anything other than `high/medium/guessed/`. Produced by:
- Gate 7 (no domain found AND no Apollo match) → `confidence='not-found'` → also maps to red
- Gate 17/19 (Path A MV final-gate returns `bad/invalid/disposable/do_not_send` OR unknown)
- Gate 18 (Apollo Step 7 confidence='not-found' / MV='bad')
- Gates 5/55 (timeouts) when no candidate found at all → `'not-found'` (also maps red)
- All gates leading to the final `return buildResult(... confidence: 'red' ...)` at `orchestrator.ts:1139-1149`

### `confidence_color = 'amber'`
- Gate 17 (Path A MV final-gate maps catch-all → AMBER on yellow survivor)
- Gate 19 (Path A red MV final-gate `catch_all` → AMBER upgrade)
- Gate 18 (Apollo confidence='guessed' → AMBER) AND Pipeline Path B promotion (Gate 20) when Path A was red
- Gate 5 / timeout before Step 6: returns best candidate with confidence='amber' verificationStatus='skipped'

### `send_status = 'flag'`
Three sources, all collapsed in Gate 51. Operator wants visibility on all three. Produced by:
- Gate 40 (`flag-hallucination`) → `system_brief` lists unsupported claims (classifyFlagReason='hallucination')
- Gate 41 (`flag` quality) → system_brief reason='research_low' OR 'email_guessed_only' depending on cause
- Gate 38 T1 fail → `action='retry'` → run-pipeline-v2:417 collapses retry to flag
- Gate 21 (`flag_status=true`) from email-find exhaustion
- `shouldFlag(result)` true (any ICP-pass with `classifyFlagReason !== 'none'`) — covers compose_failed, email_red, email_guessed_only, research_low. **NOT `icp_leaning_fit`** — that classification was removed 2026-06-10; the ICP volume verdict is inform-only per SoT §15 and the original commit 734f731b7. Verdict + reasoning still persist to `sr_engine_output.icp_volume_verdict` / `.icp_volume_reasoning` for the detail-panel card; they no longer cause a flag.

### `send_status = 'pending'`
- ICP=pass AND email_found with confidence ∈ {high, medium, guessed} (sets green/yellow/amber) AND tiered judge `action='ship'` AND `flag_status=false` AND `shouldFlag()='none'`. The clean path.

### `icp_verdict = 'reject'`
- Gate 1 regex hits NON_ICP_INDICATORS, or NON_ICP_ROLES + NON_ICP_INDICATORS combo, or tower-A&E without fiber override
- Gate 2 LLM returns `icpType='non_icp'`

### Silently dropped (no DB write at all)
- Gate 3 (ICP reject) — no sr_engine_output, no sr_prospects, no microsite written. Returns ProspectResult immediately at `run-pipeline-v2.ts:177-180`. The CSV row exists; the prospect does not.
- Gate 56 (`--include-flagged` off AND id already flagged in sr_prospects) — filtered OUT of input rows; no processing, no re-write
- Gate 57 (no Supabase key in env) — `persist: no Supabase key` error pushed; nothing written at all that run
- Gate 58 (sr_engine_output upsert HTTP fail) throws → caught in `processOne`; sr_prospects + microsite never attempted. Logged to stdout only.
- Fatal exception in `processOne` (`run-pipeline-v2.ts:1154-1156`) — caught at run-level, logged `FATAL on ...`, NOT added to results array. Prospect disappears from summary AND from DB.
- Gate 5 + Gate 7 combined when timeout AND no Apollo configured: result returns but Phase 3+ (orchestrate) only runs if `icp_type` set — if ICP gate threw earlier (Gate 2 LLM error) the default-pass kicks in and a non-typed icp_type stops Phases 3-5 (orchestrate, compose, persist) — prospect exists in `results[]` but has NO sr_engine_output row.

### Soft-flagged / non-fatal warnings (prospect still lands in DB)
- Gate 36 (post-compose company-name verify all attempts fail) — stdout warn, ships winner anyway
- Gate 42 (JUDGE-ALERT.md) — surfaced via git status, doesn't block prospects
- Gates 48-49 (microsite LLM failure / logo failure) — falls back to template / null logo
- Gate 59-60 (sr_prospects / sr_microsites HTTP fail) — sr_engine_output canonical; portal partially desynced
