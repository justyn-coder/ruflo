---
title: HubSpot Load + Sequence Enrollment SOP — Saturday 2026-06-13
date: 2026-06-12 06:45 EDT
status: READY for Saturday morning execution
authored_by: Claude (Opus 4.7) Coordinator
audience: Operator (Justyn) + Coordinator (Claude) + 3 AEs (Mike, Nathan, Lucas)
duration: ~90 min total (operator review + Coordinator load + AE enrollment)
---

# Saturday timeline (target dates/times)

| Time (ET) | Actor | Action | Duration |
|---|---|---|---|
| 7:00am | Coordinator | Re-run MV email verification on all 15 → confirm `safe` status | 5 min |
| 7:30am | Coordinator | Verify HubSpot webhook wiring for sr_sent_emails / sr_bounce_events / sr_outcomes | 10 min |
| 7:30am | Coordinator | Confirm Lucas Spencer HubSpot Owner ID (query HS for Lucas's user record) | 5 min |
| 8:00am | **OPERATOR** | Reviews `MORNING-BRIEFING.md` + `01-fifteen-final.md` + this SOP | 15 min |
| 8:15am | Operator | Approves 15 OR proposes substitutions OR halts | 5 min |
| 8:30am | Coordinator | Test enrollment: enroll Justyn@tasteforyourself.com in one AE's sequence with sample tokens; verify rendering | 15 min |
| 8:45am | Coordinator | If render test PASS → HS load all 15 with per-paragraph properties + AE owner assignment + showrev_engagement_slug | 15 min |
| 9:00am | AEs | Receive briefing email; each enrolls 5 contacts in their Sequence | 15 min × 3 AEs (parallel) |
| 9:15am | Coordinator | Verify each AE's enrollment via HS query (5 contacts × 3 AEs = 15 enrolled with correct owner + sequence) | 10 min |
| 9:30am | All | Sequence configured for **Monday 9am recipient-local fire** (or Sat 11am ET if operator overrides) | confirm |
| Sat afternoon | Coordinator | Monitor for any bounce-on-enrollment (rare but possible) | passive |
| Sun all-day | Coordinator | Verify Sequence triggered for Monday fire; spot-check from HS dashboard | 5 min |
| **Mon 9am-noon ET** | **System** | **Sequence fires per recipient timezone** (East 9am ET, Central 10am ET, West 12pm ET) | automated |

---

# Phase 1 — Saturday 7am: Pre-flight verification

## 1.1 MV email re-verification

Coordinator runs MillionVerifier on all 15 emails (cost: $0.08). Expected: all `safe`. If any returns `risky` → operator decision (sub from defer pool). If `bad`/`invalid` → auto-substitute from defer pool.

Script:
```bash
cd /Users/justynszymczyk/Documents/GitHub/ruflo
# Verify the 15
npx tsx src/showrev/m1-email-find/mv-batch.ts --emails-from data/showrev/redesign-2026-06-12/sprint-15-smoke/01-fifteen-final.md
```

(If `mv-batch.ts` doesn't exist as helper, Coordinator runs direct curl against MV API with API key from `.env`.)

## 1.2 Webhook wiring verification

Per v2 Patch 10:

1. Trigger test "email sent" event in HubSpot dev sandbox → confirm `sr_sent_emails` row appears within 60 sec
2. If FAIL → manual fallback (Coordinator manually inserts rows after each enrollment)

## 1.3 Lucas Spencer Owner ID

**CONFIRMED: 163468117** (operator-provided 2026-06-12).

| AE | Owner ID |
|---|---|
| Mike Rutski | 89105202 |
| Nathan Dunn | 89105203 |
| Lucas Spencer | **163468117** |

Coordinator verifies all 5 West prospects in `sr_engine_output.assigned_ae` resolve to this ID before HS load. If DB shows mismatch → fix before push.

---

# Phase 2 — Saturday 8am: Operator review

Operator reads:
1. `MORNING-BRIEFING.md` — exec summary
2. `01-fifteen-final.md` — the 15 + composition previews + spot-check 3 bodies
3. `03-audit-trail.md` — per-prospect substrate audit log

Operator decides:
- Approve all 15 → continue to Phase 3
- Substitute (e.g., "swap Aimee Linn in for Alex King") → Coordinator adjusts before HS load
- Halt → root-cause + escalate

**Target operator review time: < 15 min.**

---

# Phase 3 — Saturday 8:30am: Test enrollment

Coordinator enrolls test contact (Justyn@tasteforyourself.com) in ONE AE's sequence (likely Mike Rutski since East is the largest cohort). Verify:

| Check | Expected | If fails |
|---|---|---|
| Subject token renders | "Omni Fiber acquisition, drawing capacity" (Aaron's subject reused for test) | Halt; investigate token mapping |
| Body paragraph tokens render in order | 3 paragraphs separated by blank lines | Investigate per-paragraph property mapping |
| Salutation renders | "Justyn," (comma, no greeting word) | Halt; salutation regex broken |
| Pitch verbatim present | "We turn design data into permit-ready construction drawings. Quality control is built in, so builds keep moving." | Investigate pitch token |
| Microsite link slug renders | correct prospect slug | Investigate slug generation |
| From-field renders | Mike Rutski <mike@inorsa.com> | Verify owner-to-sender mapping |
| Reply-to renders | Mike's email | Verify config |

**If test PASS:** proceed to bulk load.
**If test FAIL:** halt; debug; re-test before any production enrollment.

---

# Phase 4 — Saturday 8:45am: Bulk HS load

Coordinator runs existing `hubspot-loader.ts` with the 15 final:

```bash
cd /Users/justynszymczyk/Documents/GitHub/ruflo
npx tsx src/showrev/m1-email-find/hubspot-loader.ts \
  --input data/showrev/redesign-2026-06-12/sprint-15-smoke/01-fifteen-final.csv \
  --engagement-slug inorsa-fiberconnect-2026-cold \
  --outreach-cohort fc2026-cold \
  --signal-strength-from-confidence-color \
  --dry-run false
```

(If csv doesn't exist yet, Coordinator generates from the markdown 01-fifteen-final.md table.)

Expected: 15 HS contacts created/updated with:
- `hubspot_owner_id` matches assigned AE
- `showrev_engagement_slug` = 'inorsa-fiberconnect-2026-cold'
- `showrev_outreach_cohort` = 'fc2026-cold'
- `showrev_pilot_owner` = true
- All per-paragraph properties populated (subject + body paragraphs + PS + microsite slug)
- `showrev_signal_strength` mapped from `confidence_color` (green → GREEN, yellow/amber → YELLOW, red → RED)

**Verification:** Coordinator runs HS MCP query to confirm all 15 contacts exist with correct properties.

---

# Phase 5 — Saturday 9am: AE briefing email

Coordinator sends briefing to each AE (or operator sends; whichever operator prefers):

```
Subject: ShowRev cold smoke — your 5 prospects for Sat enrollment

Hi {AE_NAME},

5 cold-prospect contacts have been loaded to HubSpot under your ownership. 
Please enroll each in your "ShowRev Cold T1" sequence by EOD today (Saturday).

Your 5 prospects:
{prospect_table}

CRITICAL — do not edit subject or body text. The Sequence template is operator-approved 
with audited substrate. Any edits invalidate the smoke test.

What to do:
1. Open HubSpot Sequences → ShowRev Cold T1 (Mike/Nathan/Lucas)
2. Select all 5 contacts (URLs above)
3. Enroll with yourself as sender
4. Confirm in #showrev-ops Slack

Sequence is configured to fire Monday 9am recipient-local time.

If any contact looks wrong → flag in Slack BEFORE enrolling; we'll substitute.
```

---

# Phase 6 — Saturday 9-9:30am: AE enrollment

Each AE:
1. Receives Coordinator briefing email
2. Opens HubSpot Sequences → their "ShowRev Cold T1" sequence
3. Reviews the 5 contacts (1-min skim of each name + title + composition rendered preview)
4. Enrolls all 5 as themselves (sender = AE)
5. Confirms enrollment in #showrev-ops Slack within 15 min

**AE bandwidth:** 5 contacts × 3 AEs = total 15 contacts; ~3 min/contact = 15 min total AE time per AE.

**Sender verification (Coordinator does this):**
- Open each enrolled contact's HS record
- Confirm From = AE name + AE email
- Confirm sequence = correct AE sequence

If verification fails → pause that enrollment, fix, re-enroll, re-verify.

---

# Phase 7 — Sat afternoon → Sun monitor

Coordinator (passive monitoring):
- Every 6 hours: check HubSpot Sequence Dashboard for any pre-send bounce events
- Verify Sun afternoon: Sequence configured to fire Mon 9am (no edits drifted)
- Sun 6pm: send operator a "ready for Mon fire" confirmation

---

# Phase 8 — Monday 9am-noon ET: Sequence fires

Per v3 Patch 11.2:
- 9:00am ET: Mike Rutski's 5 East prospects fire (East cohort, recipient 9am ET)
- 10:00am ET: Nathan Dunn's 5 Central prospects fire (Central cohort, recipient 9am CT)
- 12:00pm ET: Lucas Spencer's 5 West prospects fire (West cohort, recipient 9am PT/MT)

**Coordinator monitors:** real-time HubSpot Sequence Dashboard for send events. Each AE's batch should complete within 10 min of trigger.

---

# Phase 9 — Mon EOD: First-day metrics review

Coordinator pulls from HubSpot:
- 15 send events confirmed (verify in sr_sent_emails)
- Bounce count (target: 0)
- Open count
- Click count
- Any reply

Operator reviews EOD Mon. If all clean → set Sun-evening prod start at 60 prospects (Phase 1 of ramp).

---

# Failure modes + rollback

| Failure | Action |
|---|---|
| MV verification returns `bad` for any of 15 | Substitute from defer pool; re-audit replacement |
| Webhook wiring fails | Switch to manual fallback (Coordinator logs sr_sent_emails manually); ship Pillar 4 webhook fix before Sun ramp |
| Lucas Owner ID missing | Halt West cohort load until confirmed |
| Test enrollment render FAILS | Halt; investigate token mapping; fix; re-test |
| HS load returns errors | Halt; debug; re-run; verify all 15 loaded successfully before AE briefing |
| AE doesn't enroll by EOD Sat | Operator decides: defer to Sun morning OR operator enrolls on AE's behalf |
| Pre-send bounce event Sat/Sun | Investigate; re-verify that email with MV; possibly substitute |
| Recipient flags spam during Mon send | Activate kill switch (v2 Patch 3 comm chain) |
| Sequence fires but no bodies render | Halt all sequences immediately; investigate token rendering issue post-send |

---

# Open operator decisions (Saturday morning)

1. Send time: Mon 9am recipient-local (recommended) OR Sat 11am ET?
2. Lucas Spencer Owner ID (Coordinator queries Sat AM if not provided)
3. Aimee Linn substitution: keep current East 5 OR swap?
4. AE briefing email sent by Coordinator OR by Operator?

---

# Version history

| Version | Date | Author | Change |
|---|---|---|---|
| v1 | 2026-06-12 06:45 EDT | Claude (Opus 4.7) Coordinator | Full SOP from MV re-verify through Mon EOD review. 9 phases. Failure modes mapped. |
