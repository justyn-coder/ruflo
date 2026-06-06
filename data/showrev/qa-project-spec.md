---
title: QA Project — Intel Quality Assurance Before HubSpot Load
status: ACTIVE
last_updated: 2026-06-01 22:00 EST
version: v1
---

# QA Project: Intel Quality Assurance

## Objective

Before loading to HubSpot, ensure every prospect record is accurate, properly attributed, and formatted for AE consumption. No fabricated data. No misattributed companies. No theatre fields.

## OKRs

### O1: Every fact claim in AE-facing content is verified or tagged
- **KR1:** 100% of dollar amounts, employee counts, project names, and BEAD claims in email bodies have been web-verified with source URLs
- **KR2:** 100% of dollar amounts in intel reports carry confidence tags ([VERIFIED — Tier 1: url] or [UNVERIFIED])
- **KR3:** 0 fabricated claims survive to HubSpot (Dycom-class errors = 0)

### O2: Every record attributes the correct company to the correct contact
- **KR1:** 100% of records audited: contact name + email + company name + title match a verifiable real person at that real company
- **KR2:** 0 records where company_summary describes a different company than the contact works at
- **KR3:** Multi-contact companies (Advanced 1, Lighthouse, Ohio Gig, etc.) have consistent company data across all contacts

### O3: Fields are rationalized — only useful fields survive
- **KR1:** Field audit complete: every field mapped to "AE uses this before a call" or "system metadata — hide from AE"
- **KR2:** Redundant fields identified and consolidated (e.g., pilot's challenger_insight vs engine's challenger_insight)
- **KR3:** Final field list documented with purpose, source, and example value

### O4: Intel formatted for 30-second AE scan
- **KR1:** Company summary: 1-2 sentences max, fragment style
- **KR2:** Objections: numbered list, max 3
- **KR3:** Talking points: bullet format with discovery questions
- **KR4:** No prose paragraphs in any AE-facing field

## Agent Team

### Agent 1: Data Auditor
**Task:** Audit 10 random records from sr_engine_output. For each:
- Verify contact exists at the company (web search name + company)
- Verify company_summary describes the RIGHT company
- Verify any dollar amounts or project names in intel are real
- Flag any misattribution or fabrication

**Output:** Audit report with pass/fail per record, issues found

### Agent 2: Field Rationalizer  
**Task:** Analyze all fields across sr_engine_output, sr_brain_dossiers, and sr_microsites. For each field:
- Is it populated? (% fill rate across 69 records)
- Is it redundant with another field?
- Would an AE read this before a call? (yes/no with reasoning)
- Should it go to HubSpot? (yes/no)

**Output:** Field rationalization table with keep/merge/drop recommendations

### Agent 3: Format Enforcer
**Task:** Check all 69 intel reports for AE readability:
- Company summary: is it fragment-style or prose?
- Objections: numbered or paragraph?
- Talking points: bullets or narrative?
- Any field over 200 chars that should be shorter?

**Output:** Format compliance report + list of records needing reformatting

### Agent 4: Cross-Company Consistency Checker
**Task:** For multi-contact companies, verify:
- Same company_summary across all contacts at same company
- Same fiber_activities, bead_status, growth_signals
- Different challenger_insight / talking points (contact-specific, not company-level)
- AE assignment consistent within company

**Output:** Consistency report per company with conflicts flagged

## Success Criteria

**PASS (ready for HubSpot):**
- All 4 agent reports clean
- 0 fabricated claims
- 0 misattributed companies
- Field list rationalized and documented
- All intel formatted for 30-second scan

**FAIL (more work needed):**
- Any fabricated claim found in AE-facing content
- Any company_summary describes wrong company
- Any field can't be justified as useful to AE

## Timeline

~45 minutes for all 4 agents running in parallel.

---

# Project 2: HubSpot Load Readiness

## Objective

Define exactly what goes into HubSpot, where it displays, and verify the data matches the intent — before a single record is loaded.

## OKRs

### O1: Every field tiered by AE value
- **KR1:** Tier 1 (Critical): fields AE MUST see before sending email or taking a call. If this field is empty, don't load the contact.
- **KR2:** Tier 2 (High Value): fields that make the AE noticeably better prepared. Show in the main sidebar section.
- **KR3:** Tier 3 (Nice to Have): deep intel for the keener AE who wants everything. Show in a collapsed/expandable section.
- **KR4:** Every field assigned to exactly one tier with justification.

### O2: HubSpot display locations mapped
- **KR1:** Tier 1 fields → which HubSpot sidebar section, which card position
- **KR2:** Tier 2 fields → which sidebar section, visible by default
- **KR3:** Tier 3 fields → collapsed section or separate tab (Intelligence tab?)
- **KR4:** MEDDPICC fields → Sales Qualification section (existing)
- **KR5:** Sequence token fields (para1-4) → hidden from sidebar (system fields, not AE-facing)

### O3: Database schema matches the spec
- **KR1:** Every Tier 1+2 field exists as a HubSpot property with correct type (string, enumeration, etc.)
- **KR2:** Every field in sr_engine_output maps to exactly one HubSpot property (no orphans, no duplicates)
- **KR3:** Enumeration fields (signal_strength, decision_authority, persona) use values that match HubSpot's allowed options
- **KR4:** Field name mapping documented: sr_engine_output column → HubSpot property name → display label

### O4: Content matches field intent
- **KR1:** 100% of records audited: company_summary actually contains a company summary (not a challenger insight, not a research dump)
- **KR2:** 100% of records: likely_objections contains objections (not talking points, not next actions)
- **KR3:** 100% of records: intel_signal_strength is a valid enum (Strong/Good/Possible/Weak), not a paragraph
- **KR4:** Format consistency: same field looks the same across all 69 records

## Agent Team

### Agent 6: Field Tiering Architect
**Task:** Take the full list of fields from sr_engine_output + sr_brain_dossiers + HubSpot existing properties. For each field:
- Assign Tier 1 / Tier 2 / Tier 3 / System-only / Drop
- Justify the tier assignment from the AE's perspective
- Map to HubSpot display location
- Identify fields that exist in our DB but shouldn't go to HubSpot
- Identify fields AEs need that we don't have yet

**Output:** Tiered field map with HubSpot locations

### Agent 7: DB-to-HubSpot Schema Aligner
**Task:** For every field that should go to HubSpot (Tier 1+2+3):
- Does the HubSpot property exist? (check via API)
- Is the type correct? (string for text, enumeration for dropdowns)
- Does our DB column name match? If not, document the mapping
- Are enumeration values aligned? (our "Strong" vs HubSpot's "GREEN")

**Output:** Schema alignment report with mismatches flagged

### Agent 8: Content-Field Audit
**Task:** For all 69 records, check every populated field:
- Does the content match what the field name implies?
- Is the format consistent? (all company_summaries look similar, all objections are numbered lists)
- Flag any field where the content is clearly in the wrong place
- Flag any field where the content is a paragraph but should be a list (or vice versa)
- Flag any signal_strength that's a paragraph instead of an enum

**Output:** Content audit report with mismatches and format violations

## Success Criteria

**PASS (ready to load):**
- Field tiers documented and approved by operator
- Schema alignment clean (0 mismatches)
- Content audit clean (0 wrong-field, 0 format violations)
- HubSpot display locations mapped

**FAIL (more work):**
- Any Tier 1 field missing from HubSpot properties
- Any content in the wrong field
- Any enum field containing free text
- Display locations not mapped

---

## Execution Order

1. **Project 1 agents (1-5) run first** — QA the data + rationalize fields + audit portal
2. **Review Project 1 results together** — fix any issues found
3. **Project 2 agents (6-8) run second** — tier fields + align schema + audit content
4. **Review Project 2 results together** — approve field tiers + fix content issues
5. **Load to HubSpot** — only after both projects pass

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-01 22:00 | Claude | Initial QA project spec. 4 OKRs, 4 agents, clear success criteria. |
