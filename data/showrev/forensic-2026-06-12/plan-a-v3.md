---
title: Plan A v3 — Claim-Level Semantic Validation + Default-Deny Allowlist
date: 2026-06-13 (drafted)
status: DRAFT v3 for round-3 judge review
authored_by: Claude (Opus 4.7) — incorporating round 2 critiques from GPT-5 + Grok (hold) and Gemini + DeepSeek (ship with minor changes)
purpose: Address claim-to-source semantic correctness gap that GPT-5 surfaced; resolve 0-vs-≤2 contradiction; add default-deny domain allowlist; scope freezes
---

# Why v3

Round 2 confidence: median 52.5% (Gemini 85, DeepSeek 65, GPT-5 40, Grok 35). Still split.

**GPT-5's killer round-2 critique:** "An LLM can attach a `claim_id` that does not actually support the claim; without source snapshots/quotes and FK-backed validation, bad data can still ship despite all gates."

This is correct. v2's claim_id requirement was structural but not semantic. The composer could write "CNE has 71 employees" and attach claim_id pointing to a real T1 evidence row about a different fact entirely. The system would accept it because the row exists. Validation wasn't on the **content** of the claim, only on the **existence** of the cited row.

v3 closes the semantic gap.

# The 4 critical v3 changes (beyond v2)

## v3-Δ1 — Per-claim semantic validation with source snapshots

**At evidence WRITE time** (the moment any claim lands in `sr_company_evidence`):
- Fetch source URL (with bot-bypass headers if needed)
- Store the archived snapshot URL (Wayback Machine API call, OR internal capture to S3)
- Store the EXACT supporting quote (the sentence/paragraph from the page that contains the claim's distinctive terms)
- Store a SHA256 hash of the quote
- Reject the row if no matching content is found

**At composer compose time** (every numeric/named claim in body):
- Composer emits structured output: `{ text, claim_ids: [...], quoted_terms: [...] }`
- For each claim_id, retrieve the stored quote
- Deterministic matcher: every term in `quoted_terms` (locale-aware, case-insensitive numeric/string match) MUST appear in the stored quote
- If any term doesn't match, reject the composition; refeed composer with "your sentence doesn't match the source"

**This is the real gate.** A composer-hallucinated "71 employees" attached to a citation that doesn't contain "71" is REJECTED at the matcher.

Schema:
```sql
ALTER TABLE sr_company_evidence
  ADD COLUMN snapshot_url text,
  ADD COLUMN supporting_quote text,
  ADD COLUMN quote_hash text,
  ADD COLUMN snapshot_captured_at timestamptz,
  ADD CONSTRAINT must_have_snapshot
    CHECK (snapshot_url IS NOT NULL AND supporting_quote IS NOT NULL);
```

CI test: seed a composer output where claim text says "71 employees" but the quote stored against the claim_id says "approximately 100 employees". Assert: matcher rejects, composition is frozen.

## v3-Δ2 — Default-deny domain allowlist (replaces PROHIBITED blocklist)

**v2 was blocklist (default-allow for unknown).** v3 is allowlist (default-deny for unknown):

```sql
CREATE TABLE sr_source_domains (
  domain_etld1 text PRIMARY KEY,           -- e.g., "telecompetitor.com"
  tier text NOT NULL CHECK (tier IN ('1','2','3','4','PROHIBITED')),
  match_wildcards text[],                   -- e.g., ['*.fcc.gov']
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by text,
  notes text
);
```

Seed with explicit allowlist:
- T1: `.gov` wildcards (ntia.gov, fcc.gov, sec.gov, broadbandusa.gov, ntca.gov)
- T2: 30 named trade press domains
- T3: linkedin, glassdoor, indeed, themountainbuzz, inforum, wikipedia
- PROHIBITED: 20+ named (zoominfo, leadiq, rocketreach, prospeo, hunter.io, lusha, snov, cognism, seamless, kaspr, cleanlist, contactout, mailmo, datanyze, salezshark, yelp)

**Unknown domain → BLOCKED until operator classifies it.** No automatic T4 fallback. Forces explicit policy decisions on new sources.

Operator UI: "New unclassified domain detected: example.com — classify as T1/T2/T3/PROHIBITED?" (this is the only portal change in v3; everything else is server-side.)

Redirects: resolve at write time; final landing domain is the one classified.

## v3-Δ3 — Acceptance criteria: ZERO tolerance, no contradiction

v2 had a contradiction ("0 audit-flagged" vs "≤2 minor inference"). v3 resolves: **0 across the board**.

- 0 PROHIBITED claims in any shipped body
- 0 inference-language matches in any shipped body
- 0 claim_id → source mismatches in any shipped body
- 0 freeze events that resolved into a release without explicit operator approval

If audit finds ANY issue: freeze that batch, fix the detection or the composer prompt, re-audit. Repeat until 0.

## v3-Δ4 — Freeze scoping + circuit breaker

v2 had a global kill switch. v3 scopes:

```
Freeze levels:
  PROSPECT: single prospect frozen — workflow continues for others
  TEMPLATE: composer template variant frozen — fallback variants in rotation
  COMPANY: all prospects from one company frozen (e.g., contaminated substrate found)
  GLOBAL: only triggered by circuit breaker

Circuit breaker:
  If > 5 PROSPECT freezes within 10 minutes → escalate to COMPANY freeze of affected co
  If > 3 COMPANY freezes within 1 hour → escalate to GLOBAL freeze + operator alert
  Auto-timeout: GLOBAL freezes resolve to escalation-only after 30 min if no operator action
```

Implementation: simple counters in `sr_pipeline_runs`. Cron-checked.

# v3 keeps everything from v2

All 11 steps from v2 remain. v3 ADDS the 4 deltas above and modifies acceptance criteria.

# Revised time budget

| Item | v2 | v3 |
|---|---|---|
| Steps 0-11 from v2 | 18 hrs | 18 hrs |
| v3-Δ1 source snapshot + quote system | — | 6-8 hrs |
| v3-Δ2 allowlist + UI for unclassified domains | — | 2 hrs |
| v3-Δ3 acceptance criteria cleanup | — | 0.5 hr |
| v3-Δ4 freeze scoping | — | 2 hrs |
| Backfill existing rows with snapshots + quotes | — | 4-8 hrs (depending on bot-bypass success) |
| **Total Day 0 + 1 code** | **18 hrs** | **30-38 hrs** |
| Re-composition + 50-sample audit | 4-6 hrs | 4-6 hrs |
| **First 15 ready** | EOD Day 1 | EOD Day 2-3 |
| **167 cohort ready** | Days 2-3 | Days 4-5 |
| **500 shippable** | 5-7 days | **6-9 days** |

# Other round-2 critiques addressed

**DeepSeek's ongoing audit schedule:** Add daily random 30-50 sample post-launch (same 0-tolerance bar). Cron-scheduled. If miss rate > 0, surface to operator + freeze affected batches.

**Gemini's un-freeze protocol:** Document in runbook:
- Frozen composition → Slack alert to ops channel
- Operator reviews freeze reason
- Either: fix evidence/composer prompt, re-run pipeline → composition unfrozen
- Or: drop prospect from cohort, marked `do_not_compose`
- Track time-to-resolve as a KPI

**GPT-5's adversarial CI tests:** Expand from 5 scenarios to 15:
- Spelled-out numerals ("seventy-one" vs "71")
- IDN/punycode domain attacks
- Redirects allowed→prohibited
- Canonicalization collisions
- Case-sensitive paths
- Multilingual variants
- Concurrent insert/run race conditions
- Adversarial inference paraphrases
- Source content drift (snapshot vs live)
- DB migration with legacy nulls
- Cache invalidation race
- Composer attaches wrong claim_id (semantic matcher catches)
- Allowlist update propagation
- Freeze scope escalation
- Circuit breaker trigger

**GPT-5's staged DB migration:** Online migration plan:
1. Add columns as nullable
2. Backfill in batches
3. Add NOT NULL
4. Add CHECK constraints last
5. Rollback flags + dry-run on staging copy

**Grok's "what happens to 500 in queue if audit flags 1":** Documented:
- Audit-flagged prospect → frozen + fixed
- Same-batch peers → re-audited (50-sample → 100-sample expansion)
- Cohort progression resumes only after 100-sample audit passes

# Answers to round-2 sharp questions

**GPT-5:** "How—at write-time—do you prove every numeric/named claim is supported by the cited T1/T2 source (including an archived snapshot and matching quote/hash), and block the write/send if the proof fails, without relying on regex or an LLM judge?"

→ v3-Δ1 is the answer. Write-time snapshot capture + quote storage + hash. Deterministic matcher at compose time: claim terms must appear in stored quote, case/locale-insensitive. Block on mismatch. Zero LLM judgment in the gate.

**Gemini:** "What quantifiable metric triggers re-introduction of human-in-the-loop audits post-launch if regex detector miss rate proves too high?"

→ Daily 30-50 sample audit ongoing. If any single-day audit catches >0 inference language not flagged by regex → trigger expanded sampling (100 next day, 200 after). If 3 consecutive days catch misses → freeze pipeline and review regex coverage.

**DeepSeek:** "What guarantee do you have that a novel, subtle inference (e.g., implied causation without explicit connector words) will be caught before reaching customers?"

→ Regex alone doesn't guarantee it. The daily independent audit (30-50 samples post-launch) is the guarantee until Plan B's semantic LLM judge ships. We are explicit that regex is a partial defense; the human audit is the safety net.

**Grok:** "What happens to the 500 companies already in the queue if the 50-sample audit flags even one prohibited source?"

→ Documented above. Audit-flagged prospect frozen + fixed. Batch expanded to 100-sample audit. Cohort releases only after 100-sample clean.

# The honest v3 trade-off

v3 is significantly heavier than v2. **30-38 hrs Day 0 + 1**, not 18. **6-9 days to 500**, not 5-7.

But v3 is the answer to "claim-to-source semantic correctness." Without it, an LLM can game any structural gate. With it, the system is structurally honest at the claim level.

This is also where v3 starts overlapping with Plan B B1 (`sr_claim_verifications`). v3 essentially implements B1 as part of Plan A. **That's fine — the trust foundation is the right thing to build twice.**

# Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 00:05 | Claude (Opus 4.7) | Initial Plan A. 3-1 hold vote. |
| v2 | 2026-06-13 00:55 | Claude (Opus 4.7) | Round-1 judge critiques. 2-2 split, median 52.5%. |
| v3 | 2026-06-13 01:30 | Claude (Opus 4.7) | Round-2 judge critiques. Per-claim semantic validation + source snapshots (GPT-5). Default-deny allowlist (GPT-5). 0-tolerance acceptance (Gemini + GPT-5). Freeze scoping (GPT-5). |
