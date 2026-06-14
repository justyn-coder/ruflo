---
title: Adversarial red-team round 2 — Send Priority spec v2
status: DRAFT
author: Claude (skeptic lens, round 2)
date: 2026-06-09
supersedes_check: round-1 killer (green + fit + 5 cites w/ 1 fabricated stat → SEND)
---

## Verdict

**STILL NEEDS REVISION.** v2 closes the round-1 killer ONLY if the fabricated claim was inserted directly into the email body without a backing evidence row. The killer mutates: composer agents that hallucinate a stat AND simultaneously write a real-looking `sr_company_evidence` row for it still get full research_pts. v2 validates row EXISTENCE, not row TRUTH or row–body TEXT FIDELITY. Three new worst-case sends below. Plus a tier3='split' loophole that lets fabricated emails ride at halluc_pts=0.5.

## Worst-case constructions v2 does NOT defend

**WC1 — Broken-URL cite (Light Reading 403):**
Composer cites `claim_id=ev_4471`. Row exists in `sr_company_evidence`. Source URL returns 403 (P3C confirmed Light Reading link-rot). v2 cite-validation: row resolves → `cited_AND_validated++`. No URL liveness check. green/fit/2-cited+"valid" → **raw 7.8 → 8 SEND**. AE clicks Approve, prospect Googles the cite, gets a 404, brand-damage. v2 misses.

**WC2 — Number-mismatch (row says 1500mi, body says 1700mi):**
Row `ev_4471` claim_text = "north of 1500 miles fiber". Composer body says "1700 miles of fiber per Light Reading 2025". Same `claim_id`, fabricated number. v2 validates id→row exists. Does NOT diff the email body sentence against `claim_text`. green/fit/3-cited+"valid"/pass → **raw 8.65 → 9 SEND**. Prospect's COO knows their own mileage; "1700" is the tell. Sender looks sloppy or dishonest. v2 misses entirely.

**WC3 — Substrate contradiction (ALLO/Finley class):**
Two `sr_company_evidence` rows: one says "exited fiber 2024", one says "expanding fiber 2025". Composer cherry-picks the expansion row. `substrate_contradiction_flag` is RESERVED-NULL in v2.0 (no behavior until Phase C). green/fit/3-cited+valid/pass → **raw 8.65 → 9 SEND**. The contradiction is in the DB; nothing in v2 reads it. Email lands at a company that just sold the asset. v2 known-defers.

## halluc_pts=0.5 loophole

NULL halluc → 0.5 ("caution"). `'split'` (tier3 errored / 50-50) ALSO → 0.5. v2 §"halluc_pts" treats split same as null. Construction: green + fit + 3-cited+valid + tier3='split' (because tier3 LLM call timed out or returned malformed JSON, which happens) → 3 + 2.55 + 2.1 + 0.5 = **8.15 → 8 SEND**. A tier3 *infrastructure error* should not pass as caution-worthy-but-shippable. It should hold.

Worse: an attacker (or just a flaky network) who can force tier3 timeouts gets every email scored as if no halluc check ran. 0.5 is not "caution" when the cohort raw_score baseline is ~5; it's a 5-10% surcharge that pushes borderline OK→SEND.

## How to harden (4 cheap fixes)

1. **Cite content validation, not just row existence.** Compare email-body sentence text against `sr_company_evidence.claim_text` via substring or numeric-token diff. Mismatch → `cited_AND_validated` does NOT increment. Catches WC2. ~2hr.
2. **URL liveness gate (cached).** Nightly job HEADs every `sr_company_evidence.source_url`; flags 4xx/5xx as `url_dead=true`. Cite validation requires `url_dead=false`. Catches WC1. ~1hr + cron.
3. **Wire `substrate_contradiction_flag` minimal-version NOW.** Even a naive 2-cite-disagreement detector (numeric-direction diff: "exited" vs "expanding") demotes to HOLD. Don't ship the column as decoration. Catches WC3. ~3hr.
4. **Split halluc_pts: null=0.5, split=0.25, fail=0+MUST_NOT_SEND.** Treat tier3 infrastructure error as worse than "not checked." Also add: if `halluc_pts < 1` AND `raw_score ≥ 7`, demote band to OK ceiling (cap at 6). Stops the 0.5-surcharge → SEND escalation.

## Bottom line

v2 fixed v1's row-existence hole. It did NOT fix the row-content hole, the URL-liveness hole, or the contradiction hole. The polished-fabrication killer survives in mutated form. Ship after fixes 1–4 (~6hr total) — or accept that "SEND" means "no caught lies," not "verified truth."
