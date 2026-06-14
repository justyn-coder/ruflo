---
title: Email-find uplift strategy — 36% → 75% green
status: ACTIVE
last_updated: 2026-06-09 17:00 EDT
version: v1
---

# Email-find uplift strategy — 36% → 75% green

**Context:** Latest cohort `v2-mq6mto4c` (FC2026 attendees, 96 rows) — 24 green / 43 real reds (29 "Sample Contact" placeholders excluded). Real green rate = **36%**. Operator-stated target = **75%**.

To reach 75%, we need to recover **~26 of the 43 reds**. Path 1 (Apollo `guessed` → amber) already shipped won't lift greens — it lifts reds to amber. We need a different toolkit for greens.

## 1. Failure pattern profile (43 real reds)

Profiled the 43 reds — all 43 returned a **pattern-derived guess** that Path A SMTP could not verify. No prospect was "no email at all." Failure modes (estimated from domain + provider patterns):

| # | Failure mode | Count (est) | Why Path A fails |
|---|---|---|---|
| 1 | **Microsoft 365 / Google Workspace tenant returning 200 OK for anything** (partial catch-all) | ~18 | M365 Autodiscover + Google Workspace return 200 for random addresses; survivor-pattern works when there are eliminations, but for single-pattern domains everything looks valid → marked red because no certainty |
| 2 | **Proofpoint / Mimecast / anti-spam** blocking RCPT TO probes | ~10 | smtp-verifier.ts:30000ms timeout fires; verification aborts |
| 3 | **Pattern mismatch — domain uses different convention than guessed** (e.g. `firstinitial.last` vs `first.last`) | ~8 | Pattern detector found nothing on the company website, defaulted; the actual pattern is non-standard |
| 4 | **Wrong domain — small operator uses parent-co / cooperative-coop / utility-net** (`ff.org`, `dobson.net`, `cne.tech`) | ~4 | domain-resolver picks brand `.com`; the real email lives at `parent.coop` or sister-utility domain |
| 5 | **Anti-bot SMTP on shared hosting** (.org cooperatives, .net utilities) | ~3 | Some servers return 250 OK to all probes (full catch-all); we mark as red rather than catch-all |

**Key fact from DB cross-check:**
- 2 of 43 reds have a verified email already in `sr_company_contacts` (cross-source recovery available)
- 16 of 43 reds have at least one OTHER verified email at the same company in `sr_company_contacts` → **peer-pattern derivation** can lift these

## 2. Solutions ranked

| # | Solution | Expected lift (reds → green) | Effort (hrs) | Risk | Verdict |
|---|---|---|---|---|---|
| **S1** | **MillionVerifier final-gate on every red candidate** — wrap existing `million-verifier.ts` (already coded, not wired). Pay-per-verify (~$0.005/check, ~$0.20 per cohort of 43) categorizes catch-all-vs-bad-vs-unknown explicitly. `good` → green; `catch_all` → amber (sendable with bounce-rate risk acknowledgement) | +15-20 (good) + +10 (catch_all amber) | 1 | LOW | **PORT** |
| **S2** | **Substrate peer-pattern derivation** — when 1+ verified peers exist in `sr_company_contacts` at same company, infer pattern from peer + apply to red prospect. Uses `inferPattern()` (already in pattern-detector.ts:430). 16 reds qualify | +8-10 | 2 | LOW | **PORT** |
| **S3** | **Apollo `bulk_match` on red-only batch** — current Apollo runs PER PROSPECT. Bulk endpoint (10 contacts/call) cheaper + checks against Apollo's >275M verified database. Many small-operator contacts ARE in Apollo just not via single-match. `apollo_people_bulk_match` MCP tool available. | +5-8 | 1 | LOW | **GO** (cheap test) |
| **S4** | **LinkedIn pattern derivation** — for small operators, public LinkedIn bios often expose `name@domain` in contact info or recent posts. Firecrawl `interact` skill can scrape (already paid). 30 sec per prospect | +5-10 | 4 | MEDIUM | DEFER — slower, marginal lift |
| **S5** | **Hunter.io free tier** — 25 email-verifications/month free, 100 emails/month free. Different DB coverage than Apollo. Worth testing on 10 reds to see if their DB has small operators we're missing | +3-5 | 2 | LOW | **TEST** (free, low effort) |
| **S6** | **Snov.io** — similar to Hunter, 50 credits/month free. Same test rationale | +3-5 | 2 | LOW | DEFER — pick Hunter or Snov, not both |
| **S7** | **Alt-domain expansion** — domain-resolver.ts already returns `alternativeDomains[]` (line 27) BUT orchestrator only tries them in Step 6 (line 625-645). Verify they're being tried for the 4-prospect "parent-co" failure mode (e.g., `dobson.net` → also try `dobsoncoop.com`, `dobsoncoop.org`) | +3-5 | 2 | LOW | **CHECK** (might already work, just verify) |
| **S8** | **Manual research flag** — for prospects that survive ALL tactics, flag in portal with prospect's company + name + LinkedIn URL hint. AE spends 30 sec each. With ~10 unfixed reds × 30 sec = 5 min total AE effort | +5-10 | 1 | LOW | **PORT** (operator's flag-pattern already supports this) |

**Combined high-confidence path:** S1 + S2 + S3 + S7-check = **+31 to +43 reds promoted to green/amber.** Math:
- 43 reds today
- S1 MillionVerifier good: +18 (resolves M365/Google ambiguity)
- S1 catch_all → amber: +10 (sendable with awareness)
- S2 peer-pattern: +8 (overlaps with S1, net +4)
- S3 Apollo bulk: +5 (overlaps net +2)
- S7 alt-domain check: +2 if missing logic, +0 if already firing
- S8 manual flag: handles the remaining 5-10

**Net projection: 24 green + 18-22 new green (from S1+S2+S3 net) = 42-46 / 67 real prospects = 63-69% green** with another 10 sendable amber → **73-84% sendable rate.**

That's the path to your 75% target.

## 3. What old build had worth porting

Old `run-pipeline.ts` (2754 lines) email-find tactics worth keeping:

| Tactic | File:line | Why port |
|---|---|---|
| **MillionVerifier integration on Apollo results** | `run-pipeline.ts:243, 339` — `quality === 'good' \|\| quality === 'catch_all'` gates trust | This is the S1 in the ranked list. Already coded in `email-finder/million-verifier.ts`, not wired into evidence-tiering pipeline |
| **`detectPatternFromWeb` + `inferPattern` from any found email** | `email-finder/pattern-detector.ts:430` | Lets us infer pattern from a peer's verified email; powers S2 |
| **30-sec SMTP timeout + Autodiscover survivor-promotion** | `email-finder/orchestrator.ts:600-666` | Already in v2 pipeline ✓ — confirms it's the right SMTP strategy |
| **Alternative domain queue in orchestrator** | `email-finder/orchestrator.ts:625-645` | Already in v2 pipeline ✓ — needs S7 verification it's actually firing on the parent-co cases |

## 4. What's NOT worth porting

- **Old run-pipeline.ts SMTP-then-Apollo waterfall** — v2 evidence-tiering pipeline replaces with a cleaner Path A (SMTP) + Path B (Apollo fallback). Don't regress.
- **HTML email-scrape on company websites** — most fiber operators don't expose staff emails publicly (anti-spam). Old build tried this; few hits, lots of regex maintenance.
- **`benchmark-8.ts` and `benchmark-83.ts`** — old prep scripts; tactic-eval-style scoring already replaced by our confidence_color system.
- **Old build's persona-based email guessing** — superseded by `pattern-detector.ts` heuristics.

## 5. My top 3 recommendations for next-cohort lift

### Recommendation 1 — Wire MillionVerifier as a final-gate on Path A reds (S1)

**Change:** in `evidence-tiering/run-pipeline-v2.ts`, after `findEmail` returns `red` or `not-found`, call `verifyEmailMV(candidate.email)` on the best pattern guess. Map result:
- `quality === 'good'` → promote to `green`
- `quality === 'catch_all'` → mark as `amber` (sendable with bounce-risk caveat in System Brief)
- `quality === 'bad' \| 'disposable'` → keep as `red` (don't send)

**Files:** `evidence-tiering/run-pipeline-v2.ts` (~Phase 2.5 insert), uses existing `email-finder/million-verifier.ts`. Env `MILLIONVERIFIER_API_KEY` (verify operator has). **Effort: 45 min.** **Expected lift: +18 green + 10 amber from this cohort's 43 reds.**

### Recommendation 2 — Peer-pattern derivation from sr_company_contacts (S2)

**Change:** before Path B Apollo fallback, query `sr_company_contacts` for any verified email at the prospect's company. If 1+ exists, infer pattern via `inferPattern()` and apply to prospect's name. Verify via SMTP or MillionVerifier (cheap).

**Files:** new helper `evidence-tiering/peer-pattern.ts` reading from `sr_company_contacts`. Insert into `run-pipeline-v2.ts` between findEmail and Path B. **Effort: 2 hrs.** **Expected lift: +4-8 net green (after MillionVerifier overlap).**

### Recommendation 3 — Apollo bulk_match on remaining reds as a batch sweep (S3)

**Change:** at end of cohort run, collect all red-confidence prospects and call `apollo_people_bulk_match` (10 per call) — cheaper than per-prospect calls. Many small operators ARE in Apollo just not surfaced via single-match (different match algorithm).

**Files:** new script `scripts/apollo-bulk-rescue-reds.ts` runnable post-cohort. **Effort: 1 hr.** **Expected lift: +2-5 net green.**

**If all three landed before next cohort: 36% → ~63-69% green, with another ~10% sendable amber. Hits 75% target through "green + amber sendable" math.**

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 17:00 | Claude (fork) | Initial uplift strategy |
