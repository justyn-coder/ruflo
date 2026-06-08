---
title: P2 Wet Run Handoff — Session Brief
status: ACTIVE
last_updated: 2026-06-08 16:14 EST
version: v1
---

# P2 Wet Run Handoff

Read this FIRST in the new session. This is everything you need to execute the wet run.

---

## 1. The Task

Run 5 hard P2 cold prospects through the pipeline and post results to the portal for operator review.

```bash
cd ~/Documents/GitHub/ruflo
npx tsx src/showrev/m1-email-find/run-pipeline.ts \
  --input data/showrev/wet-run-p2-hard5.csv \
  --touches 1 \
  --lead-type Cold \
  --verbose
```

**Portal:** https://showrev-microsites.vercel.app/ops
**This is a WET run — writes to Supabase, visible on portal.**

---

## 2. The 5 Prospects (and why they're hard)

| Name | Company | Why Hard |
|------|---------|----------|
| Dan Gillan | Dobson Fiber | Previously hallucinated company name ("Dobson Telephone Company") + fabricated tools ("3-GIS"). Tests company hard-lock fix. CRO title. |
| Blake Griffin | Communication Network Engineering | Shares name with NBA player. Email domain (ccfargo.com) doesn't match company. President title. |
| Adam Willoughby | Farmers Telecommunications Cooperative | Senior OSP Tech (not exec). Rural co-op in AL. Tests non-C-suite framing. |
| Joe Kunz | GFiber | Google Fiber. Massive company, research noise. joekunz@google.com. Head of OSP Strategy. |
| Andrew Aeschliman | United Fiber, LLC | Generic company name. Could match many "United Fiber" entities. Services Facility Manager. |

CSV: `data/showrev/wet-run-p2-hard5.csv`

---

## 3. Three Fixes Deployed This Session (commit 3a88aeffc)

### Fix 1: Company Name Hard-Lock (influence.ts)
- Prompt now says: `use EXACTLY "${prospect.company}" in the email`
- Prevents LLM from substituting parent/historical/trade names
- **Watch for:** Dobson Fiber must appear as "Dobson Fiber", not "Dobson Technologies" or "Dobson Telephone Company"

### Fix 2: Must-Fix Enforcement (run-pipeline.ts)
- Judge must-fix items now collected into `allMustFix[]` and `allFailures[]`
- Must-fix triggers `finalPass = false` → recomposition
- Previously: HOLD treated as PASS, letting hallucinations through
- **Watch for:** Console should show "FAIL (N must-fix items — triggers recomposition)" when must-fix found

### Fix 3: Email Confidence Gate (run-pipeline.ts)
- Red confidence → prospect upserted, but research/composition SKIPPED (early return as draft)
- Yellow confidence → continues but marked draft for operator review
- New `outputStatus` field flows through to microsite status
- **Watch for:** Blake Griffin's ccfargo.com domain may trigger yellow/red confidence

---

## 4. Hard Constraints (non-negotiable)

- **Sender:** Mike Rutski (East), Nathan Dunn (Central), Lucas Spencer (West/spread). Default = Lucas. Tom Marciano = INERT, never a sender.
- **Salutation:** `[FirstName],` (comma only, NO greeting word). Capitalize normally after comma.
- **Word count:** T1 ceiling 100 words body. Prompt targets 60-75.
- **Value prop:** Drawings only (Engineering Suite + Data Suite). NO Validation. NO structural analysis. NO Drawing QC. Fiber only.
- **Show:** Fiber Connect (TWO words). May 18-19, 2026. Booth 1728. Gaylord Palms, Kissimmee FL.
- **Pitch:** "We turn design data into permit-ready construction drawings. Quality control is built in, so builds keep moving."
- **Office Hours:** Microsite footer ONLY. Never in email body or P.S.
- **No em dashes** in prospect-facing content.
- **P.S. "We scored [Company]'s drawing workflow against 300+ fiber firms"** is INTENTIONAL. Do not flag.
- **--lead-type Cold** for P2. Do not use post-show framing.
- **--touches 1** only for this run.

---

## 5. Database State

| Table | State |
|-------|-------|
| sr_prospects | 28 P2 (true cold, booth visitors removed) + 3 P1 |
| sr_engine_output | 0 rows (cleared) |
| sr_microsites | 0 non-brief rows (cleared) |
| sr_microsite_events | Cleared for P2 test entries |

**DO NOT touch P1 data.**

---

## 6. Known Issues (not blockers for this run)

1. **Finley Engineering (3 prospects):** Missing state field — affects AE routing. Not in test 5.
2. **EPB vs EPB Fiber Optics:** Same parent, different contacts, both @epb.net. Flag for operator review on full run.
3. **premium-pipeline.ts:** Deprecated but still exists. Use run-pipeline.ts exclusively.
4. **AE reassignment:** Pipeline may flag state mismatch (e.g., Dan Gillan: HQ=OK, contact=FL). This is working as designed — operator reviews the flag.

---

## 7. After the Run

1. Check portal at https://showrev-microsites.vercel.app/ops for the 5 new entries
2. Verify each: correct company name, no hallucinated tools/facts, correct AE, word count under ceiling
3. Check for any `draft` status entries (confidence gate or judge failure)
4. Report results to operator for review

---

## 8. What NOT to Do

- Do NOT run with `--dry-run` — this is a wet run
- Do NOT change influence.ts, judge.ts, or run-pipeline.ts without operator approval
- Do NOT touch P1 data or brief- microsites
- Do NOT look at P1 prospects/accounts — P2 only
- Do NOT send anything — composition and portal posting only, operator reviews before any send

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-08 16:14 | Claude | Initial handoff doc for P2 wet run |
