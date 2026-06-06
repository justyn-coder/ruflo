---
title: HubSpot Intel Layout Research
status: ACTIVE
last_updated: 2026-06-02 01:00 EST
version: v1
---

# HubSpot Intel Layout Research

## 1. Executive Summary

**Recommended approach: Hybrid (Option D) — Tier 1 fields as properties visible in a dedicated left-sidebar section + a custom CRM card (UI extension) that renders the full ShowRev dossier in formatted, scannable layout.**

The sidebar section gives AEs instant glance-ability for signal strength, next action, and challenger insight without any clicks. The CRM card (React-based, placed in the middle column's About tab) renders the full intel dossier with accordions, color-coded signals, and structured talking points — turning 30+ flat text properties into a formatted briefing that takes 30 seconds to scan. This avoids both the "wall of text properties" problem (Option A) and the "extra click to a custom object" problem (Option B), while being buildable with HubSpot's existing UI extensions SDK.

Property groups (`showrev_intel` for contact, `showrev_intel` for company) keep the settings page organized. Breeze AI enriches the standard fields (industry, revenue, employee count) while ShowRev provides the strategic intel Breeze cannot: challenger insights, persona classification, objection handling, MEDDPICC-adjacent qualification, and show-specific context.

---

## 2. HubSpot Record Anatomy — What Goes Where

### 2.1 The Three Columns (Spring 2026 Layout)

HubSpot's updated record layout (auto-rolled out to Pro/Enterprise mid-April 2026) organizes records into three columns. [verified 2026-06-02]

| Area | Purpose | What goes here for ShowRev |
|------|---------|---------------------------|
| **Left Sidebar** | Core properties, quick-glance info, key details | Signal Strength (color-coded), Next Action, Decision Authority, AE Talking Points, Challenger Insight — the "30-second prep" fields |
| **Middle Column** | Tabs with cards: About, Activities, Catch-up, Intelligence, Revenue | ShowRev CRM Card (UI extension) on About tab showing full formatted dossier; Activities tab for email/call timeline |
| **Right Sidebar** | Associated records, attachments | Company association (with ShowRev company intel visible on hover), other stakeholders as associated contacts |

Sources: [HubSpot Record Layout Docs](https://knowledge.hubspot.com/records/understand-the-default-record-layout), [Customize Records](https://knowledge.hubspot.com/object-settings/customize-records) [verified 2026-06-02]

### 2.2 Default Tabs (Spring 2026)

| Tab | What HubSpot puts here | ShowRev relevance |
|-----|----------------------|-------------------|
| **About** | Breeze record summary, key properties, signals, feedback | **Primary tab for ShowRev CRM card.** This is where AEs land first. |
| **Activities** | Email/call/meeting timeline | Shows Sequence emails sent, replies received. No ShowRev customization needed. |
| **Catch-up** | AI-generated insights, health metrics, data quality | Breeze summarizes engagement. ShowRev data feeds into this indirectly via properties. |
| **Intelligence** | Breeze data enrichment, website visits, outreach data | Breeze standard enrichment. ShowRev intel is richer — complementary, not competing. |
| **Revenue** | Quotes, invoices, CLV | Not relevant for pre-deal prospecting. |

**Custom tab option:** HubSpot allows up to 5 tabs (including Overview). We could add a "ShowRev Intel" tab, but this requires an extra click. Better to put the CRM card on the About tab where AEs already look first. [verified 2026-06-02]

### 2.3 Property Limits and Sections

- Up to **50 properties per section** in the left sidebar [verified 2026-06-02]
- Up to **50 cards total** across sidebars and columns [verified 2026-06-02]
- Up to **5 tabs** including the default Overview/About tab [verified 2026-06-02]
- Team-specific layouts available on **Professional and Enterprise** tiers [verified 2026-06-02]
- Conditional card display supported (e.g., show card only when `showrev_signal_strength` is known) [verified 2026-06-02]

---

## 3. Breeze AI Analysis — What It Does vs What We Provide

### 3.1 Breeze Components

| Component | What it does | Relevance to ShowRev |
|-----------|-------------|---------------------|
| **Breeze Intelligence (Data Enrichment)** | Enriches 40+ standard fields from 200M+ company profiles. Sources: public data, Clearbit (HubSpot-owned), web scraping. Credits: $0.07-$0.30/record. Standard fields now free (2026). | Fills in industry, revenue, employee count, social profiles, HQ location. Useful but generic. |
| **Breeze Copilot (Assistant)** | Summarizes records, drafts emails, answers questions about CRM data. Uses ALL record properties (standard + custom) in summaries. | Will read and surface ShowRev custom properties in record summaries. AEs can ask "summarize this contact" and get ShowRev intel included. |
| **Breeze Agents (Prospecting)** | Automates lead gen, personalizes outreach using buyer intent. | Operates independently of ShowRev. Could conflict with Sequence enrollment — needs coordination. |
| **Smart Properties** | AI-powered fields that auto-populate using prompts + data sources (web research, other properties, call transcripts). | Could auto-refresh ShowRev fields. E.g., a Smart Property that reads `showrev_company_summary` + web data to update competitive landscape. |

Sources: [HubSpot Breeze AI for Sales](https://www.hublead.io/blog/hubspot-breeze-ai), [Breeze Intelligence Deep Dive](https://www.eesel.ai/blog/breeze-intelligence-data-enrichment), [Smart Properties Docs](https://knowledge.hubspot.com/properties/create-smart-properties) [verified 2026-06-02]

### 3.2 Overlap/Gap Analysis

| Data Category | Breeze Provides | ShowRev Provides | Gap/Overlap |
|---------------|----------------|-----------------|-------------|
| Company basics (industry, size, revenue) | Yes — standard enrichment | Yes — `showrev_company_size`, `showrev_company_summary` | **Overlap.** Breeze handles standard fields. ShowRev adds nuance (e.g., "family-owned telco, 60yr history, $250M fiber expansion underway" vs Breeze's "Telecommunications, 201-500 employees"). |
| Contact basics (title, phone, LinkedIn) | Yes — standard enrichment | Yes — from research | **Overlap.** Let Breeze handle these. |
| Company intel (BEAD status, fiber activities, growth signals) | No | Yes — deep industry-specific research | **ShowRev exclusive.** Breeze has no fiber/telecom domain knowledge. |
| Person intel (decision authority, persona, influence pattern) | No | Yes — from booth notes + research | **ShowRev exclusive.** |
| Challenger insight | No | Yes — synthesized from research | **ShowRev exclusive.** Breeze cannot generate contrarian insights. |
| Talking points | No (Copilot can draft generic ones) | Yes — show-specific, company-specific | **ShowRev superior.** Breeze talking points are generic CRM-data-based. |
| Objection handling | No | Yes — researched per prospect | **ShowRev exclusive.** |
| Competitive landscape | No | Yes — per-company research | **ShowRev exclusive.** |
| Buying timeline / external deadlines | No | Yes — BEAD deadlines, project timelines | **ShowRev exclusive.** |
| Email composition | No (Copilot drafts generic) | Yes — fully personalized 3-touch sequence | **ShowRev exclusive.** |

### 3.3 How Breeze Interacts with ShowRev Properties

**Breeze Copilot reads custom properties.** When an AE clicks "Summarize" on a record, Breeze pulls from ALL properties including `showrev_*` fields. This means our intel automatically enhances Breeze's summaries without any additional integration. [verified 2026-06-02 via HubSpot docs]

**Breeze Smart Properties can reference ShowRev fields.** A Smart Property can use "Property data" source to read one ShowRev property and transform it. Example: a Smart Property could read `showrev_company_summary` and generate a one-line elevator pitch. However, each Smart Property can only reference one other property as its source. [verified 2026-06-02]

**Breeze does NOT write to custom properties.** Breeze enrichment only fills standard HubSpot fields. It will not overwrite or modify `showrev_*` properties. No conflict risk. [verified 2026-06-02]

### 3.4 Recommendation: Make Them Complementary

1. Let Breeze handle standard enrichment (industry, size, revenue, contact details)
2. ShowRev owns all `showrev_*` strategic intel properties
3. Breeze Copilot summaries automatically incorporate ShowRev data — no integration needed
4. Consider 2-3 Smart Properties that bridge the two (e.g., "AI Pre-Call Brief" Smart Property that reads `showrev_talking_points` + `showrev_challenger_insight` + `showrev_next_action` and generates a 3-bullet summary)

---

## 4. Recommended Layout — Field-by-Field Placement

### 4.1 Contact Record — Left Sidebar

**Section: "ShowRev Intel" (new section, positioned above standard Contact Information)**

Purpose: the fields an AE glances at in <10 seconds before picking up the phone.

| Priority | Property | Why here |
|----------|----------|----------|
| 1 | `showrev_signal_strength` | Color-coded (GREEN/YELLOW/ORANGE/RED). Instant visual signal. |
| 2 | `showrev_next_action` | "Book demo — prospect asked at booth." The single most actionable field. |
| 3 | `showrev_challenger_insight` | The one thing to teach them. Differentiator for the call. |
| 4 | `showrev_decision_authority` | Budget owner / Influencer / Champion / Unknown. Changes approach. |
| 5 | `showrev_buying_timeline` | "Q4 2026 — BEAD construction start." Urgency signal. |
| 6 | `showrev_ae_talking_points` | 2-3 bullets for the call. |
| 7 | `showrev_likely_objections` | What to prepare for. |
| 8 | `showrev_risk_factors` | Red flags to monitor. |

**Section: "ShowRev Context" (collapsible, below ShowRev Intel)**

| Property | Why here |
|----------|----------|
| `showrev_research_summary` | Full person summary — read if time permits. |
| `showrev_persona_classification` | Persona bucket for approach selection. |
| `showrev_linkedin_summary` | LinkedIn context. |
| `showrev_other_stakeholders` | Multi-threading intel. |
| `showrev_booth_notes` | Raw booth transcript. |
| `showrev_microsite_url` | Link to personalized microsite. |
| `showrev_influence_pattern` | Psychological approach pattern. |

**Section: "ShowRev Email Tokens" (collapsible, below Context — AEs rarely need this)**

| Property | Purpose |
|----------|---------|
| `showrev_pre_show_t1_subject` | T1 subject line |
| `showrev_pre_show_t1_para1` through `para4` | T1 email paragraphs |
| `showrev_pre_show_t1_ps` | P.S. line |

### 4.2 Company Record — Left Sidebar

**Section: "ShowRev Company Intel"**

| Priority | Property | Why here |
|----------|----------|----------|
| 1 | `showrev_company_summary` | One-paragraph company overview. |
| 2 | `showrev_bead_status` | BEAD funding/timeline — critical for Inorsa's fiber focus. |
| 3 | `showrev_growth_signals` | Acquisitions, expansion, hiring. |
| 4 | `showrev_fiber_activities` | What fiber work they do. |
| 5 | `showrev_key_projects` | Named projects to reference. |
| 6 | `showrev_competitive_landscape` | Who else they're talking to. |
| 7 | `showrev_external_deadlines` | Time-bound pressure points. |
| 8 | `showrev_recent_news` | Market moment / news hook. |
| 9 | `showrev_company_size` | Employee count, revenue estimate. |

### 4.3 Middle Column — CRM Card (UI Extension)

**"ShowRev Dossier" card on the About tab**

This card reads all `showrev_*` properties from the current contact + associated company and renders them in a formatted, scannable layout with:

- **Header:** Name, Title, Company, Signal Strength badge (color-coded)
- **Accordion: "30-Second Prep"** (open by default) — Next Action, Challenger Insight, Talking Points
- **Accordion: "About This Person"** — Research Summary, Decision Authority, Persona, LinkedIn Summary
- **Accordion: "About {Company}"** — Company Summary, BEAD Status, Growth Signals, Key Projects
- **Accordion: "Objections & Risks"** — Likely Objections, Risk Factors, Competitive Landscape
- **Accordion: "Timeline & Fit"** — Buying Timeline, External Deadlines, Signal Strength, Fit Rationale
- **Accordion: "Other Contacts"** — Multi-thread contacts, Other Stakeholders
- **Footer:** Research confidence, sources count, research date

**Why this matters:** Raw textarea properties in the sidebar are walls of text. The CRM card formats them with headings, color, spacing, and collapsible sections. The difference between "AE reads it" and "AE ignores it."

### 4.4 Right Sidebar

No ShowRev customization needed. Standard associated records (Company, Deals, Tickets) remain.

---

## 5. Implementation Options — Ranked by Impact and Effort

### Option 1: Property Groups + Sidebar Sections (DO FIRST)

**Impact: High | Effort: Low (2-3 hours) | No code required**

What to do:
1. Create property group `showrev_intel` via API (already in the loader spec)
2. Create property group `showrev_email_tokens` via API
3. In HubSpot UI: Settings → Data Management → Contacts → Record Customization
4. Add a new left sidebar section "ShowRev Intel" — add the 8 priority fields
5. Add a collapsible section "ShowRev Context" — add the 7 context fields
6. Add a collapsible section "ShowRev Email Tokens" — add the email paragraph fields
7. Repeat for Company record with "ShowRev Company Intel" section

**Pros:** Zero development. Immediately usable. AEs see fields today.
**Cons:** Flat text display. No formatting. No color-coding. 30+ text fields in sidebar is scannable but not elegant.

### Option 2: Custom CRM Card (UI Extension) (DO SECOND)

**Impact: Very High | Effort: Medium (1-2 days development) | Requires developer project**

What to build:
1. HubSpot developer project with React UI extension
2. Card placed on `crm.record.tab` (About tab, middle column)
3. Reads all `showrev_*` properties via CRM Data Components (`CrmPropertyList`, `CrmDataHighlight`)
4. Also reads associated company's `showrev_*` properties via `CrmAssociationPropertyList`
5. Renders with Accordion, Text, StatusTag, Statistics, Alert components
6. Color-coded signal strength using `StatusTag` component
7. Expandable/collapsible sections using `Accordion` component

Available HubSpot UI components (confirmed available, [verified 2026-06-02]):
- `Accordion` — collapsible sections for organizing intel categories
- `Statistics` — for signal strength and deal size display
- `StatusTag` — color-coded tags (GREEN/YELLOW/RED for signal strength)
- `Alert` — for risk factors and objection warnings
- `DescriptionList` — key-value pairs for structured data display
- `Table` — for stakeholder lists and project details
- `Text` — formatted text blocks for summaries
- `Tile` — card-like containers for visual grouping
- `Heading` — section headers within the card
- `Link` — clickable microsite URL
- `Divider` — visual separators between sections
- `ScoreCircle` — could display MEDDPICC-style scores

**Plan requirement:** UI extensions work on all HubSpot tiers for private apps (the card is installed as a private app in the Inorsa HubSpot account). No marketplace listing needed.

**Pros:** Best AE experience. Formatted, scannable, color-coded. Turns raw properties into a professional briefing.
**Cons:** Requires React development. Needs HubSpot CLI (`hs project`) setup. Must be maintained if properties change.

Sources: [UI Extensions Components](https://developers.hubspot.com/docs/platform/ui-components), [UI Extensions Overview](https://developers.hubspot.com/docs/apps/developer-platform/add-features/ui-extensions/overview) [verified 2026-06-02]

### Option 3: Smart Properties Bridge (DO THIRD)

**Impact: Medium | Effort: Low (1 hour) | No code required**

Create 2-3 HubSpot Smart Properties that synthesize ShowRev data:

| Smart Property | Source | Prompt | Purpose |
|---------------|--------|--------|---------|
| `showrev_ai_pre_call_brief` | `showrev_talking_points` | "Summarize in 3 bullets: the key talking points, the challenger insight, and the recommended next action for this prospect" | One field that combines the top 3 intel items. AEs who only read one field read this one. |
| `showrev_ai_company_elevator` | `showrev_company_summary` | "Write a one-sentence elevator pitch about this company's current situation and biggest opportunity" | Quick company context. |

**Limitation:** Smart Properties can only reference ONE other property as a data source. Cannot combine `showrev_talking_points` + `showrev_challenger_insight` into one Smart Property directly. Would need a workflow to concatenate first, then have the Smart Property summarize the concatenated field.

**Pros:** AI-enhanced summaries. Auto-refreshable. Uses HubSpot's native AI.
**Cons:** Credit consumption. Single-property-source limitation. Less control than CRM card.

### Option 4: Custom Object "ShowRev Intel Report" (DEFER — NOT RECOMMENDED FOR PILOT)

**Impact: Medium | Effort: High | Adds complexity**

Create a custom object that holds the full dossier as a single rich record associated to the contact.

**Why not for pilot:**
- Extra click required (contact → associated "Intel Report" record)
- Properties work fine for our data volume (30 fields is within HubSpot's comfort zone)
- Custom objects are better for repeating data (multiple intel reports over time) — we have one report per contact per show
- Adds API complexity for the loader

**When it makes sense:** If ShowRev scales to multiple shows per contact (FC2026, FC2027, etc.), a custom object per show engagement would prevent property sprawl. Revisit after pilot.

### Option 5: HubSpot Playbooks Integration (CONSIDER FOR POST-PILOT)

**Impact: Medium | Effort: Low | Pro/Enterprise only**

Create a "ShowRev Pre-Call Playbook" that references `showrev_*` properties inline:

```
1. Check Signal Strength: {{ showrev_signal_strength }}
2. Your opening insight: {{ showrev_challenger_insight }}
3. Key talking points: {{ showrev_talking_points }}
4. Watch for these objections: {{ showrev_likely_objections }}
5. The ask: {{ showrev_next_action }}
```

AEs open the Playbook during the call and follow the guided script with live data.

**Limitation:** Playbooks have limited property type support (text properties work, but formatting is basic). Conditional fields in Playbooks are in private beta as of 2026.

Sources: [HubSpot Playbooks](https://knowledge.hubspot.com/playbooks/use-playbooks) [verified 2026-06-02]

---

## 6. AE Workflow — The 30-Second Pre-Call Prep

### Current State (without ShowRev layout)

AE gets a Sequence task notification → opens contact → sees standard HubSpot fields (name, email, company) → has to scroll through 30+ flat text properties in sidebar → gives up and wings the call.

### Target State (with recommended layout)

```
SEQUENCE TASK FIRES → AE OPENS CONTACT RECORD

┌─────────────────────────────────────────────────────┐
│ LEFT SIDEBAR (glance: 5 seconds)                     │
│                                                       │
│ ShowRev Intel                                         │
│ ┌───────────────────────────────────────────────────┐ │
│ │ Signal: ████ STRONG (GREEN)                       │ │
│ │ Next Action: Book demo — prospect asked at booth  │ │
│ │ Challenger: "50-state licensing means 50           │ │
│ │   jurisdictional rulesets. Most firms track this   │ │
│ │   manually."                                      │ │
│ │ Authority: Budget Owner                           │ │
│ │ Timeline: Q4 2026 — BEAD construction start       │ │
│ └───────────────────────────────────────────────────┘ │
│                                                       │
│ ▸ ShowRev Context (collapsed)                         │
│ ▸ ShowRev Email Tokens (collapsed)                    │
│                                                       │
├─────────────────────────────────────────────────────┤
│ MIDDLE COLUMN — About Tab (read: 25 seconds)          │
│                                                       │
│ ┌─ ShowRev Dossier Card ──────────────────────────┐  │
│ │ Len DeWees — Program Director, Fiber @ B+T GRP   │  │
│ │ Signal: ████ STRONG                              │  │
│ │                                                   │  │
│ │ ▾ 30-SECOND PREP (expanded)                       │  │
│ │   • Book demo — prospect asked at booth           │  │
│ │   • Lead with: 50-state licensing = 50 rulesets   │  │
│ │   • Ask about Maryland ISP project timeline       │  │
│ │   • Reference BEAD construction pressure          │  │
│ │                                                   │  │
│ │ ▸ About This Person                               │  │
│ │ ▸ About B+T GRP                                   │  │
│ │ ▸ Objections & Risks                              │  │
│ │ ▸ Timeline & Fit                                  │  │
│ │ ▸ Other Contacts                                  │  │
│ └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### The Flow

1. **Sequence task fires** → AE sees task in their task queue
2. **AE clicks contact name** → record opens with ShowRev Intel section at top of left sidebar
3. **5 seconds:** AE reads signal strength (GREEN = hot), next action ("book demo"), and challenger insight
4. **10 seconds:** AE scans talking points and buying timeline in sidebar
5. **15 seconds:** AE glances at CRM card "30-Second Prep" accordion (already expanded) for formatted version
6. **25 seconds:** If needed, AE expands "Objections & Risks" accordion to prepare for pushback
7. **30 seconds:** AE picks up phone or replies to email, armed with context

### What the AE Does NOT Have to Do

- Open LinkedIn in a new tab
- Search the company website
- Read through raw booth transcripts
- Ask the SDR "what did we talk about?"
- Check a separate spreadsheet or document
- Switch to another tool (Gong, ZoomInfo, etc.)

---

## 7. Technical Spec — What to Build/Configure

### 7.1 Property Groups (API — run once)

```bash
# Create property group for contacts
POST /crm/v3/properties/contacts/groups
{
  "name": "showrev_intel",
  "label": "ShowRev Intelligence",
  "displayOrder": 1
}

# Create property group for companies
POST /crm/v3/properties/companies/groups
{
  "name": "showrev_intel",
  "label": "ShowRev Intelligence",
  "displayOrder": 1
}

# Create email tokens group for contacts
POST /crm/v3/properties/contacts/groups
{
  "name": "showrev_email_tokens",
  "label": "ShowRev Email Tokens",
  "displayOrder": 2
}
```

Note: The current loader creates properties in `contactinformation` and `companyinformation` groups. These should be migrated to `showrev_intel` for cleaner organization. Property group only affects settings page organization, not sidebar display — sidebar sections are configured separately.

Sources: [Properties API](https://developers.hubspot.com/docs/api-reference/crm-properties-v3/guide), [Organize Properties](https://knowledge.hubspot.com/properties/organize-and-export-properties) [verified 2026-06-02]

### 7.2 Contact Record Sidebar Sections (HubSpot UI — manual)

**Path:** Settings → Data Management → Objects → Contacts → Record Customization → Edit (default view)

**Section 1: "ShowRev Intel"** (positioned first in left sidebar)
- Properties: `showrev_signal_strength`, `showrev_next_action`, `showrev_challenger_insight`, `showrev_decision_authority`, `showrev_buying_timeline`, `showrev_ae_talking_points`, `showrev_likely_objections`, `showrev_risk_factors`

**Section 2: "ShowRev Context"** (collapsible)
- Properties: `showrev_research_summary`, `showrev_persona_classification`, `showrev_linkedin_summary`, `showrev_other_stakeholders`, `showrev_booth_notes`, `showrev_microsite_url`, `showrev_influence_pattern`

**Section 3: "ShowRev Email Tokens"** (collapsible)
- Properties: `showrev_pre_show_t1_subject`, `showrev_pre_show_t1_para1`, `showrev_pre_show_t1_para2`, `showrev_pre_show_t1_para3`, `showrev_pre_show_t1_para4`, `showrev_pre_show_t1_ps`

**Conditional display:** Show "ShowRev Intel" section only when `showrev_engagement_slug` is known (i.e., only on ShowRev-processed contacts). This keeps the record clean for non-ShowRev contacts.

### 7.3 Company Record Sidebar Section (HubSpot UI — manual)

**Path:** Settings → Data Management → Objects → Companies → Record Customization → Edit

**Section: "ShowRev Company Intel"**
- Properties: `showrev_company_summary`, `showrev_bead_status`, `showrev_growth_signals`, `showrev_fiber_activities`, `showrev_key_projects`, `showrev_competitive_landscape`, `showrev_external_deadlines`, `showrev_recent_news`, `showrev_company_size`

### 7.4 CRM Card (UI Extension) — Development Spec

**Project structure:**

```
showrev-hubspot-card/
├── app.json                          # HubSpot app config
├── src/
│   └── app/
│       └── extensions/
│           ├── ShowRevDossier.tsx     # Main card component
│           ├── ShowRevDossier-hsmeta.json  # Card location config
│           └── components/
│               ├── SignalBadge.tsx    # Color-coded signal display
│               ├── PrepSection.tsx   # 30-second prep accordion
│               ├── PersonIntel.tsx   # Person details accordion
│               ├── CompanyIntel.tsx  # Company details accordion
│               └── RiskSection.tsx   # Objections/risks accordion
```

**Card location config (`ShowRevDossier-hsmeta.json`):**

```json
{
  "type": "crm-card",
  "data": {
    "title": "ShowRev Dossier",
    "location": "crm.record.tab",
    "module": {
      "file": "ShowRevDossier.tsx"
    },
    "objectTypes": [
      { "name": "contacts" }
    ]
  }
}
```

**Key components and HubSpot SDK imports:**

```tsx
import {
  Accordion,
  Text,
  StatusTag,
  DescriptionList,
  Alert,
  Heading,
  Link,
  Divider,
  Tile,
  Flex,
  Box
} from '@hubspot/ui-extensions';

import {
  CrmPropertyList,
  CrmAssociationPropertyList,
  CrmDataHighlight
} from '@hubspot/ui-extensions/crm';
```

**Signal strength mapping to StatusTag:**

```tsx
const SIGNAL_COLORS = {
  'GREEN': { type: 'success', label: 'STRONG' },
  'YELLOW': { type: 'warning', label: 'GOOD' },
  'ORANGE': { type: 'warning', label: 'POSSIBLE' },
  'RED': { type: 'error', label: 'WEAK' },
};
```

**Development workflow:**

```bash
# One-time setup
npm install -g @hubspot/cli
hs init                    # Auth with Inorsa HubSpot
hs project create          # Create project from template

# Development
hs project dev             # Local dev with hot reload

# Deploy
hs project upload          # Deploy to Inorsa HubSpot
```

**Plan requirement:** Private apps with UI extensions work on **all HubSpot tiers** — they are installed directly into the account, no marketplace listing needed. The Inorsa account (ID 20729069) needs the developer project installed. [verified 2026-06-02]

**Legacy card deadline:** Legacy CRM cards (built with the old CRM Extensions API) stop rendering on October 31, 2026. Building with UI extensions now ensures longevity. [verified 2026-06-02]

### 7.5 Team-Specific Views (Optional — Pro/Enterprise)

If Inorsa has a Professional or Enterprise subscription, create a "Sales AE" team view:

1. Settings → Data Management → Contacts → Record Customization
2. Create new view → assign to "Sales" team
3. Configure with ShowRev sections prominent
4. Other teams (support, marketing) keep standard views without ShowRev clutter

### 7.6 MEDDPICC Qualification Properties (Future — Deal Level)

When ShowRev intel transitions from pre-deal prospecting to active deal management, add MEDDPICC scoring properties on the **Deal** object:

| Property | Type | Values | Purpose |
|----------|------|--------|---------|
| `showrev_meddpicc_metrics` | Number (0-4) | 1=Missing, 2=Some signals, 3=Confirmed, 4=Proven | M score |
| `showrev_meddpicc_economic_buyer` | Number (0-4) | Same scale | E score |
| `showrev_meddpicc_decision_criteria` | Number (0-4) | Same scale | D1 score |
| `showrev_meddpicc_decision_process` | Number (0-4) | Same scale | D2 score |
| `showrev_meddpicc_paper_process` | Number (0-4) | Same scale | P1 score |
| `showrev_meddpicc_identify_pain` | Number (0-4) | Same scale | I score |
| `showrev_meddpicc_champion` | Number (0-4) | Same scale | C1 score |
| `showrev_meddpicc_competition` | Number (0-4) | Same scale | C2 score |
| `showrev_meddpicc_score` | Calculation | Weighted average of above 8 | Overall handicap % |

Pipeline stage gating (recommended thresholds from industry practice):
- **Qualify exit:** M, E, D1, P all >= 3, average >= 2.5
- **Validate exit:** Add D2, I >= 3, average >= 3.0
- **Commit entry:** All eight >= 3, average >= 3.5

Source: [Using MEDDPICC Inside HubSpot](https://www.kalungi.com/blog/using-meddpicc-inside-hubspot) [verified 2026-06-02]

---

## 8. Sequence + Intel Workflow Integration

### 8.1 What AEs See When a Sequence Task Fires

When a Sequence step creates a task (call task, LinkedIn task, email follow-up):

1. Task appears in AE's task queue with contact name and task description
2. AE clicks the contact name → opens record
3. Record shows ShowRev sidebar sections + CRM card
4. The Sequence email that was sent (or is about to send) is visible in the Activities tab timeline

### 8.2 Can Sequence Task Descriptions Reference Custom Properties?

**No — not directly.** HubSpot Sequence task descriptions are static text set at template creation time. They cannot dynamically pull from `showrev_*` properties.

**Workaround:** Use a HubSpot Workflow triggered by Sequence enrollment to create a custom Task with a description that includes personalization tokens:

```
Call {{ contact.firstname }} at {{ contact.company }}.
Signal: {{ contact.showrev_signal_strength }}
Action: {{ contact.showrev_next_action }}
Insight: {{ contact.showrev_challenger_insight }}
```

This creates a richer task in the AE's queue, but adds workflow complexity. For the pilot, rely on the AE clicking through to the contact record — the sidebar ShowRev Intel section provides the same info.

### 8.3 Linking Intel to Sequence Steps

The email tokens (`showrev_pre_show_t1_para1` through `para4`) are already the bridge — they contain the personalized intel baked into the email. When the AE previews a Sequence email before it sends, they see their own ShowRev-composed talking points in the email body. This creates natural alignment between "what the email said" and "what to say on the follow-up call."

---

## 9. Implementation Roadmap

### Phase 1: Property Organization (Day 1 — 2 hours)

- [ ] Create `showrev_intel` property group for contacts and companies
- [ ] Create `showrev_email_tokens` property group for contacts
- [ ] Migrate existing `showrev_*` properties from `contactinformation`/`companyinformation` to new groups
- [ ] Configure left sidebar sections on Contact record (ShowRev Intel, ShowRev Context, ShowRev Email Tokens)
- [ ] Configure left sidebar section on Company record (ShowRev Company Intel)
- [ ] Set conditional display: show ShowRev sections only when `showrev_engagement_slug` is known

### Phase 2: Validate with AE (Day 1 — 30 minutes)

- [ ] Load one test contact with full ShowRev data
- [ ] Walk an AE through the record and sidebar layout
- [ ] Get feedback: what do they look at first? What's missing? What's noise?
- [ ] Adjust section order and field priority based on feedback

### Phase 3: CRM Card Development (Day 2-3 — if approved)

- [ ] Set up HubSpot developer project
- [ ] Build ShowRevDossier UI extension with accordions
- [ ] Test with real data in dev mode
- [ ] Deploy to Inorsa HubSpot account
- [ ] Validate with AE

### Phase 4: Smart Properties Bridge (Day 3 — 1 hour)

- [ ] Create `showrev_ai_pre_call_brief` Smart Property
- [ ] Configure with prompt + `showrev_talking_points` source
- [ ] Test on existing contacts
- [ ] Set auto-populate schedule (on record creation)

---

## 10. Sources

- [HubSpot: Customize Records](https://knowledge.hubspot.com/object-settings/customize-records) [verified 2026-06-02]
- [HubSpot: Updated Record Default Layout](https://knowledge.hubspot.com/records/understand-the-default-record-layout) [verified 2026-06-02]
- [HubSpot: Customize Properties in Record Sections](https://knowledge.hubspot.com/object-settings/customize-properties-in-record-sections) [verified 2026-06-02]
- [HubSpot: UI Extensions Overview](https://developers.hubspot.com/docs/apps/developer-platform/add-features/ui-extensions/overview) [verified 2026-06-02]
- [HubSpot: UI Extension Components](https://developers.hubspot.com/docs/platform/ui-components) [verified 2026-06-02]
- [HubSpot: Smart Properties](https://knowledge.hubspot.com/properties/create-smart-properties) [verified 2026-06-02]
- [HubSpot: Breeze AI Record Summarization](https://knowledge.hubspot.com/records/summarize-records) [verified 2026-06-02]
- [HubSpot: Properties API](https://developers.hubspot.com/docs/api-reference/crm-properties-v3/guide) [verified 2026-06-02]
- [HubSpot: Spring 2026 Spotlight](https://www.hubspot.com/spotlight) [verified 2026-06-02]
- [HubSpot: Conditional Property Logic](https://knowledge.hubspot.com/properties/set-up-conditional-logic-for-enumeration-properties) [verified 2026-06-02]
- [HubSpot: Playbooks](https://knowledge.hubspot.com/playbooks/use-playbooks) [verified 2026-06-02]
- [HubSpot Breeze AI for Sales Teams](https://www.hublead.io/blog/hubspot-breeze-ai) [verified 2026-06-02]
- [Breeze Intelligence Deep Dive](https://www.eesel.ai/blog/breeze-intelligence-data-enrichment) [verified 2026-06-02]
- [Custom Objects vs Properties Guide](https://blog.pivotslc.com/custom-objects-vs-properties-in-hubspot-a-practical-guide) [verified 2026-06-02]
- [Using MEDDPICC Inside HubSpot](https://www.kalungi.com/blog/using-meddpicc-inside-hubspot) [verified 2026-06-02]
- [MEDDPICC HubSpot Sales Guide](https://consultevo.com/hubspot-meddpicc-sales-guide/) [verified 2026-06-02]
- [AE Call-Prep Notes Template — Lavender](https://www.lavender.ai/blog/sales-call-prep-notes-template) [verified 2026-06-02]
- [Cold Call Prep with AI — Gong](https://www.gong.io/blog/cold-call-preparation-ai-insights) [verified 2026-06-02]
- [Pre-Call Planning Guide — SiftHub](https://www.sifthub.io/blog/pre-call-planning) [verified 2026-06-02]
- [HubSpot Record Customization Guide — ConsultEvo](https://consultevo.com/hubspot-customize-records-guide/) [verified 2026-06-02]
- [HubSpot Record Customization by Team — SMBInfo](https://smbinfo.com/hubspot-tips/using-record-customization-by-team-to-improve-focus-in-hubspot/) [verified 2026-06-02]
- [HubSpot CRM Cards Setup Guide](https://developers.hubspot.com/blog/how-to-set-up-and-use-hubspot-crm-cards) [verified 2026-06-02]
- [UI Extensions Examples — GitHub](https://github.com/hubspotdev/ui-extensions-examples) [verified 2026-06-02]
- [Legacy CRM Card Deprecation — Oct 31 2026](https://developers.hubspot.com/changelog/developer-updates-for-january-2026) [verified 2026-06-02]

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-02 01:00 | Claude | Initial research. 6 areas investigated: record layout, AE optimization, Breeze AI, implementation options, data architecture, sequence workflow. 23 web sources verified and cited. |
