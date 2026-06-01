---
title: HubSpot Load Plan — Step by Step
status: ACTIVE
last_updated: 2026-06-01 09:15 EST
version: v2
---

# HubSpot Load Plan

Loading ICP-PASS prospects from the Engine into HubSpot, enrolled in Sequences for automated send. No manual AE sending.

---

## How Sequences Work (the architecture)

HubSpot Sequences send emails using **personalization tokens** — placeholders in the email template that pull values from contact properties. Every paragraph of the email is personalized per contact, nothing is static.

### Sequence template structure (from the pilot)

```
Subject: {{ Contact: ShowRev Pre-Show T1 Subject }}

{{ Contact: First Name }},
{{ Contact: ShowRev Pre-Show T1 Paragraph 1 }}

{{ Contact: ShowRev Pre-Show T1 Paragraph 2 }}

{{ Contact: ShowRev Pre-Show T1 Paragraph 3 }}

{{ Contact: ShowRev Pilot — CTA Phrasing }}

[AE Signature — auto-inserted by HubSpot from sender's profile]

{{ P.S. line — either in para4 or manually appended }}
```

### Contact properties that feed the template

These already exist in HubSpot from the pilot:

| Property | What it stores | Example |
|----------|---------------|---------|
| `showrev_pre_show_t1_subject` | Subject line | "18,000 drops a month and the engineering that feeds them" |
| `showrev_pre_show_t1_para1` | Opening anchor paragraph | "at TAK's volume, 18,000 drops per month means..." |
| `showrev_pre_show_t1_para2` | Pitch/insight paragraph | "Inorsa validates design data before drawings go to the jurisdiction. Fewer returns, faster starts." |
| `showrev_pre_show_t1_para3` | CTA question | "Worth a 20-minute conversation?" |
| `showrev_pre_show_t1_para4` | P.S. or extra paragraph (optional) | "Your UTOPIA experience means you've seen design QC at open-access scale." |
| `showrev_pilot_anchor_paragraph` | Same as para1 (legacy alias) | — |
| `showrev_pilot_cta_phrasing` | Same as last content paragraph | — |

### How the Engine feeds Sequences

The Engine composes a full email body. The HubSpot loader **decomposes** it into paragraphs:

```
Engine output:                          HubSpot properties:
──────────────                          ───────────────────
Kim,                                    (First Name token)
at TAK's volume, 18,000 drops...   →   showrev_pre_show_t1_para1
                                    
Inorsa validates design data...    →   showrev_pre_show_t1_para2

Worth a 20-minute conversation?    →   showrev_pre_show_t1_para3

P.S. Your UTOPIA experience...     →   showrev_pre_show_t1_para4
```

The Sequence template assembles these tokens back into the email. Every paragraph is unique per contact.

### Existing FC2026 Sequences in HubSpot

| Sequence | ID | Status |
|----------|-----|--------|
| FC2026 — Mike East T1 | 653354691 | Exists, 1 send |
| FC2026 — Justyn Test | 654164721 | Test sequence |

**Decision:** Do we reuse `FC2026 — Mike East T1` for all AEs, or create per-AE sequences?
- Per-AE is cleaner: `FC2026 — Mike East`, `FC2026 — Nathan Central`, `FC2026 — Lucas West`
- Each has 3 steps (T1 immediately, T2 at +5 business days, T3 at +5 business days)
- The template is identical across all three — only the enrolled contacts differ

### AE details for Sequences

| AE | HubSpot Owner ID | Territory | Connected email needed? |
|----|-------------------|-----------|------------------------|
| Mike Rutski | 89105202 | East | Yes — Sequences send FROM this person's inbox |
| Nathan Dunn | 89105203 | Central | Yes |
| Lucas Spencer | 163468117 | West | Yes |

**Prerequisite:** Each AE must have their email connected in HubSpot (Settings → General → Email). Sequences cannot send from a disconnected email. Check: [HubSpot Email Settings](https://app-na2.hubspot.com/settings/20729069/sales/email)

---

## Phase 1: Pre-Load Checklist (you, 10 min)

### Step 1.1: Turn off auto-create companies

Go to: [HubSpot Settings → Companies](https://app-na2.hubspot.com/contacts/20729069/objects/0-2/settings)

- Find **"Create and associate companies with contacts"**
- Toggle it **OFF**
- This prevents HubSpot from auto-creating duplicate companies when we load contacts

### Step 1.2: Verify AE email connections

Go to: [HubSpot Email Settings](https://app-na2.hubspot.com/settings/20729069/sales/email)

- Confirm Mike, Nathan, and Lucas each have a connected inbox
- If any AE's email is not connected, the Sequence cannot send from them

### Step 1.3: Review emails in Mission Control

Go to: [ShowRev Mission Control](https://showrev-microsites.vercel.app/ops)

- Review the 11 ICP-PASS prospects
- Verify each has: correct AE, email body you're comfortable sending, no red flags
- This is your last chance to edit before emails go out

### Step 1.4: Verify/create Sequence templates

Go to: [HubSpot Sequences](https://app-na2.hubspot.com/sequences/20729069)

- Check if `FC2026 — Mike East T1` has 3 steps with the token structure above
- If not, create 3 sequences (one per AE territory) with this template for each step:

**Step 1 (T1) template:**
```
Subject: {{ showrev_pre_show_t1_subject }}

{{ contact.firstname }},
{{ showrev_pre_show_t1_para1 }}

{{ showrev_pre_show_t1_para2 }}

{{ showrev_pre_show_t1_para3 }}

{{ showrev_pre_show_t1_para4 }}
```

*(Same structure for T2 and T3, using `showrev_t2_*` and `showrev_t3_*` properties — these need to be created if they don't exist yet.)*

---

## Phase 2: Create Missing HubSpot Properties (I do, 2 min)

I run the property creation script:

```bash
npx tsx hubspot-loader.ts create-properties
```

Creates 17 `showrev_*` properties that don't exist yet:
- **Contact (8):** decision_authority, talking_points, microsite_url, booth_notes, other_stakeholders, challenger_insight, linkedin_summary, likely_objections
- **Company (9):** company_summary, company_size, fiber_activities, bead_status, growth_signals, competitive_landscape, key_projects, recent_news, external_deadlines

Nothing deleted or modified. Only new properties added.

---

## Phase 3: Dry Run (I do, you review, 5 min)

I run the loader in preview mode — shows what would happen without touching HubSpot:

```bash
npx tsx hubspot-loader.ts dry-run
```

Output per prospect:
```
Chris Fort @ Centillion Solutions
  [DRY RUN] Company: UPDATE 12345678 (centillionsolutions.com)
  [DRY RUN] Contact: CREATE
  [DRY RUN] Props: 24 fields (incl. T1 para1-4, subject, CTA)
  [DRY RUN] Signal: Strong → GREEN
  [DRY RUN] AE: Lucas Spencer → owner 163468117
  [DRY RUN] T1 Subject: "your booth comment about the use case"
  [DRY RUN] T1 Para1: "you said there might be a use case for Inorsa..."
  [DRY RUN] T1 Para2: "Your blog already names the problem: QC doesn't..."
  [DRY RUN] T1 Para3: "Is this something you're actively trying to solve?"
```

You review and approve:
- Correct AE assignments
- Email paragraphs look right
- No existing contacts that shouldn't be updated
- Companies matched by domain correctly

---

## Phase 4: Load Test (1 contact, 5 min)

I load ONE low-risk contact to verify everything end-to-end.

What happens:
1. Company found by domain (or created if new)
2. Contact created with all `showrev_*` fields + T1 paragraphs + owner + lifecycle
3. Contact associated with company

**You verify in HubSpot:**
- Go to: [HubSpot Contacts](https://app-na2.hubspot.com/contacts/20729069)
- Search for the test contact
- Check: name, email, title correct
- Check: ShowRev section in sidebar shows research summary, signal strength, talking points
- Check: T1 paragraph properties populated (may need to add these to the sidebar view)
- Check: company association correct
- Check: owner is the right AE

---

## Phase 5: Sequence Enrollment Test (1 contact, 5 min)

After the contact exists, I enroll them in the FC2026 Sequence.

The Sequence pulls the T1 paragraphs from the contact properties and assembles the email.

**You verify in HubSpot:**
- Go to the contact's timeline
- Sequence enrollment appears
- Click "Preview" on the T1 email step
- The email should show the personalized paragraphs assembled correctly
- The "From" address is the AE (Mike/Nathan/Lucas), not you
- If preview looks right, T1 sends on the scheduled time

**If anything is wrong:** unenroll the contact from the Sequence before T1 fires.

---

## Phase 6: Full Load (remaining contacts, 15 min)

After test passes, I load the remaining contacts:
1. Create/update companies
2. Create/update contacts with all `showrev_*` + T1 paragraph properties
3. Associate contacts → companies
4. Enroll each in the appropriate AE's FC2026 Sequence

Batched by AE territory:
- **Mike Rutski (East):** contacts in CT-MI states
- **Nathan Dunn (Central):** contacts in TX-IL states
- **Lucas Spencer (West):** contacts in WA-AK states + default

---

## Phase 7: Post-Load Verification (you, 10 min)

Go to: [HubSpot Contacts — FC2026 filter](https://app-na2.hubspot.com/contacts/20729069/objects/0-1/views/all/list)

Filter by: `showrev_engagement_slug = inorsa-fiberconnect-2026`

Verify:
- All contacts visible with correct AEs
- Each is enrolled in a Sequence
- T1 emails are queued with correct subjects + personalized paragraphs
- ShowRev intel fields populated in sidebar
- Company associations correct

### Turn auto-create companies back ON

Go to: [HubSpot Settings → Companies](https://app-na2.hubspot.com/contacts/20729069/objects/0-2/settings)
- Toggle **"Create and associate companies with contacts"** back **ON**

---

## Rollback Plan

If anything goes wrong:

**Unenroll from Sequences:**
- Go to the Sequence → Enrolled tab → select contacts → Unenroll
- This stops all pending emails immediately

**Clear ShowRev data:**
- Filter contacts by `showrev_engagement_slug = inorsa-fiberconnect-2026`
- Clear `showrev_*` fields or delete test contacts

---

## T2 and T3 Sequence Properties (to be created)

For T2 and T3 touches, we need additional contact properties:

| Property | Touch |
|----------|-------|
| `showrev_t2_subject` | T2 subject |
| `showrev_t2_para1` | T2 paragraph 1 |
| `showrev_t2_para2` | T2 paragraph 2 |
| `showrev_t2_para3` | T2 paragraph 3 |
| `showrev_t3_subject` | T3 subject |
| `showrev_t3_para1` | T3 paragraph 1 |
| `showrev_t3_para2` | T3 paragraph 2 |
| `showrev_t3_para3` | T3 paragraph 3 |

These get created alongside the other missing properties in Phase 2. The T2 and T3 Sequence steps use the same token template structure, just pointing to `showrev_t2_*` and `showrev_t3_*` properties.

---

## Tim's Rules (enforced by the loader)

- New contacts: set owner + lifecycle stage + all showrev_* fields
- Existing contacts: PATCH showrev_* fields ONLY (no owner or lifecycle override)
- Contacts with active communication (`hs_sales_email_last_replied` recent): skip, do not enroll
- DNC contacts from Mission Control: not loaded
- Heavily worked accounts (B+T GRP, Dycom, TAK, Terracon): require AE coordination before enrollment

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v2 | 2026-06-01 09:15 | Claude | Complete rewrite. Added Sequence token architecture, existing pilot properties, email decomposition approach, T2/T3 properties, Tim's rules. |
| v1 | 2026-06-01 08:30 | Claude | Initial plan. Incorrectly assumed step-level overrides instead of token-based Sequences. |
