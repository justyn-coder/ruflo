---
title: Engine QA Test Plan -- Proving Engine Matches Hand-Crafted Quality
status: ACTIVE
last_updated: 2026-05-31 02:00 EST
version: v1
purpose: Test plan to verify the Engine produces emails at the same quality level as the hand-crafted v3 insight-led emails approved by operator and Tim.
---

# Engine QA Test Plan

## Goal

Prove that the coded Engine (premium-pipeline.ts with v3 prompt updates) produces research, ICP decisions, and emails at the same quality as the hand-crafted work from the FC2026 pilot -- before using it on the 2,300-contact cold prospecting project.

---

## Test 1: Blind Comparison (Engine vs Approved)

### What it proves
The Engine, given the same inputs, produces output comparable to the hand-crafted emails that were approved.

### Prospects to test
Pick 3 with approved v3 emails already in the system:

| Prospect | Company | Why this one |
|----------|---------|-------------|
| Len DeWees | B+T GRP | Multi-state operator. Booth notes available. Nathan's account. Complex pitch. |
| Roberto Martinez | Lighthouse Technologies | Large contractor. Multi-contact company. Mike's account. |
| Spencer Kariniemi | Booker Engineering | Small A&E firm. BEAD angle. Lucas's account. |

### Inputs (same for Engine and hand-crafted)
- Prospect name, title, email, company from sr_prospects
- AE booth notes (if any)
- Company from booth-scan CSV

### How to run
```bash
# After v3 prompt updates are applied:
npx tsx src/showrev/m1-email-find/premium-pipeline.ts run --prospect=fc2026-001  # Len
npx tsx src/showrev/m1-email-find/premium-pipeline.ts run --prospect=fc2026-xxx  # Roberto
npx tsx src/showrev/m1-email-find/premium-pipeline.ts run --prospect=fc2026-xxx  # Spencer
```

### Comparison dimensions

| Dimension | How to compare | Pass criteria |
|-----------|---------------|---------------|
| **Research depth** | Compare Engine dossier vs sr_brain_dossiers record. Did Engine find the same facts? Did it find MORE? | Engine finds >= 80% of hand-crafted facts |
| **ICP decision** | Did Engine reach the same pass/hold/reject? | Same ICP decision for all 3 |
| **Email structure** | Does T1 open with prospect reality (not booth callback)? Does Inorsa appear once, by outcome? | Matches v3 format |
| **Word count** | Under 80 words? | All 3 under 80 |
| **Anti-AI-tell** | Run the 10-point checklist from influence.ts | Zero violations |
| **Subject line** | Under 8 words? Specific to their situation? | All 3 pass |
| **Salutation** | `[FirstName],` only? | All 3 correct |
| **AE signature** | Correct AE for this prospect? | All 3 correct |
| **P.S.** | Correct personalized microsite slug? | All 3 correct |
| **Angle quality** | Does the email angle match or exceed the approved angle? | Operator judges (blind review) |

### Blind review process
1. Strip all metadata. Present operator with two emails per prospect: "Email A" and "Email B" (one hand-crafted, one Engine, randomized order)
2. Operator rates each on the 4-dimension judge scale (research depth, VP connection, tone, conciseness)
3. Operator guesses which is Engine-generated
4. If operator cannot consistently identify the Engine version, the test passes

### Pass/fail
- **Pass:** Engine emails score within 1 point of hand-crafted on all 4 dimensions, AND operator cannot reliably identify which is Engine-generated
- **Fail:** Engine emails score 2+ points lower on any dimension, OR operator can consistently identify Engine output

---

## Test 2: New Prospect (Engine on unseen contact)

### What it proves
The Engine produces quality output on a contact it has never seen, with no prior hand-crafted reference to imitate.

### Prospect to test
Pick 1 HOLD contact with no existing email:

| Candidate | Company | Why |
|-----------|---------|-----|
| Jason Hall | Mohawk Networks | Tribal FTTH, $15M project, NTIA funded. Interesting angle. No email exists yet. |

### How to run
```bash
npx tsx src/showrev/m1-email-find/premium-pipeline.ts run --prospect=fc2026-xxx  # Jason Hall
```

### Review process
1. Engine produces dossier + 3-touch email sequence
2. Operator reviews WITHOUT knowing it's Engine output (present as "draft from the system")
3. Operator marks: approve / edit / reject per email
4. Tim reviews (if available) with same blind protocol

### Pass/fail
- **Pass:** T1 approved as-is or with minor edits (< 10 words changed). Dossier contains verifiable facts.
- **Fail:** T1 requires major rewrite. Dossier contains hallucinated claims.

---

## Test 3: Scale Test (10 contacts, template fatigue check)

### What it proves
The Engine produces structurally diverse emails at batch scale without falling into repetitive patterns.

### Contacts to test
Run 10 SEND contacts through the Engine in one batch:

1. Brian Derstine (Advanced 1) -- A&E firm
2. Salli Smith (Advanced 1) -- same company, different angle needed
3. Cliff Churchill (FOS) -- small operator
4. Zach Fox (FOS) -- same company, finance angle
5. Leila Hussein (ISG) -- A&E firm
6. Matt Shearer (LHTC) -- regional operator
7. Denis Ryzhikov (Lighthouse) -- CEO
8. Troy Hoover (PCCI/ProDesign) -- construction contractor
9. Jordan Raymond (Rayco) -- construction contractor
10. Douglas Trout (Schurz) -- multi-ISP holding company

### How to run
```bash
npx tsx src/showrev/m1-email-find/premium-pipeline.ts run --batch=10 --tiers=SEND
```

### Checks

| Check | Method | Pass criteria |
|-------|--------|---------------|
| **Template fatigue** | Compare all 10 T1 openers. Do any two start with the same structure? | No two openers share the same pattern |
| **Influence pattern diversity** | Tabulate which of the 8 patterns were selected. | At least 4 different patterns used across 10 contacts |
| **Same-company differentiation** | Compare Advanced 1 pair (Brian vs Salli) and FOS pair (Cliff vs Zach). Different angles? | Different influence patterns, different openers, different angles |
| **Fact accuracy** | Spot-check 3 random dossiers. Verify 5 factual claims per dossier against web sources. | >= 90% of checked claims verifiable (4.5 of 5 per dossier) |
| **AE assignment** | Verify all 10 have correct AE per territory. | 10/10 correct |
| **P.S. slugs** | Verify all 10 P.S. lines link to the correct personalized microsite. | 10/10 correct |
| **Word count** | All 10 T1s under 80 words. | 10/10 under 80 |
| **Anti-AI-tell** | Run 10-point checklist on all 10 T1s. | Zero violations across all 10 |
| **No em-dashes** | Grep all 10 email bodies for em-dash character. | Zero found |
| **Salutation format** | Check all 10 for `[FirstName],` (comma only, no greeting word). | 10/10 correct |

### Pass/fail
- **Pass:** All checks pass. Operator reviews 10 emails in < 15 minutes with zero rewrites needed.
- **Fail:** Any structural check fails (template fatigue, AE assignment, slug, format). OR > 2 emails require substantive rewrites.

---

## Test 4: HubSpot Loading Dry Run

### What it proves
The loading protocol works end-to-end without creating duplicates or triggering unwanted automations.

### Contacts to test
Pick 1 contact at a company with NO existing HubSpot presence:

| Candidate | Company | Domain | Why |
|-----------|---------|--------|-----|
| Salli Smith | Advanced 1 | advanced1.net | Clean company, 3 contacts, no HS history |

### Steps
1. Turn OFF "Create and associate companies with contacts" setting
2. Search HubSpot companies by domain `advanced1.net` -- should return 0
3. Create company "Advanced 1" with domain + showrev_* fields
4. Capture company ID
5. Create contact Salli Smith with showrev_* fields + lifecyclestage=1162148264
6. Explicitly associate contact to company by ID
7. Wait 30 seconds
8. Read back: verify owner, lifecycle stage, association, showrev_* fields all correct
9. Check: did any Workflow fire? (check contact timeline for unexpected activities)
10. If clean: add Brian Derstine and Scott Hastings to same company (multi-contact test)
11. Verify all 3 contacts associated with same company, correct owners

### Pass/fail
- **Pass:** All fields set correctly. No duplicate company created. No unexpected Workflow activity. Multi-contact association works.
- **Fail:** Duplicate company. Wrong owner after Workflow fires. Missing fields. Unexpected email sent.

### Rollback
If anything goes wrong:
- Delete test contacts (search by showrev_engagement_slug = inorsa-fiberconnect-2026)
- Archive test company
- Turn auto-create setting back on

---

## Test Sequence

Run in this order. Stop if any test fails.

| Order | Test | Estimated time | Prereq |
|-------|------|---------------|--------|
| 1 | Test 1 (Blind comparison) | 30 min | v3 prompt updates applied to premium-pipeline.ts |
| 2 | Test 2 (New prospect) | 15 min | Test 1 passed |
| 3 | Test 3 (Scale test) | 45 min | Test 2 passed |
| 4 | Test 4 (HubSpot dry run) | 20 min | Operator approval for HS writes |

Total estimated: ~2 hours including operator review time.

---

## What success looks like

After all 4 tests pass:
- The Engine produces emails indistinguishable from hand-crafted quality
- It handles batch diversity without template fatigue
- It loads cleanly into HubSpot without creating chaos
- The operator can give it a CSV and trust the output

At that point, we're ready for the 2,300-contact cold prospecting project.

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-05-31 02:00 | Claude | Initial QA test plan. 4 tests: blind comparison, new prospect, scale, HubSpot dry run. |
