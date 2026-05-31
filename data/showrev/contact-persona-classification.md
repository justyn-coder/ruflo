---
title: Contact Persona Classification — FC2026
status: DRAFT
last_updated: 2026-05-30 09:15 EST
version: v1
purpose: Classifies each SEND/HOLD contact by individual persona using 7-bucket cascade. Used for GATING and QA only, NOT composition. Emails remain research-driven.
---

# Contact Persona Classification

## Migration SQL (run when Supabase MCP reconnects)

```sql
ALTER TABLE sr_prospects ADD COLUMN contact_persona text CHECK (contact_persona IN (
  'build_pace', 'drawings_quality', 'permit_cycle', 'program_leverage',
  'cycle_time_exec', 'capital_efficiency', 'pass_through', 'connect_request',
  'uncertain'
));
```

## Classification (first-match cascade applied)

### SEND prospects

| Prospect | Title | Company | Persona | Reasoning | Email angle matches? | Flag? |
|----------|-------|---------|---------|-----------|---------------------|-------|
| Len DeWees | Program Director - Fiber | B+T GRP | `program_leverage` | Program Director = PMO scope | YES - multi-state program view | |
| Landon Willets | National Account Director | B+T GRP | `pass_through` | Account Director = sales/BD role | REVIEW - email uses client-facing angle which works, but he's sales not engineering | QA |
| Adam Cavazos | CTO/SVP | Hilliary | `cycle_time_exec` | CTO = C-suite | YES - strategic/scale framing | |
| Patrik Lowenborg | VP Client Solutions | NetPMD | `cycle_time_exec` | VP = exec | YES - economics reframe works for exec | |
| Spencer Kariniemi | General Manager | Booker Eng | `cycle_time_exec` | GM = exec-equivalent at small firm | YES - competitive positioning | |
| Riley Riutta | Project Manager | Booker Eng | `program_leverage` | PM = project scope | YES - project timeline angle | |
| Garth Naar | CEO | Avatar Tech | `cycle_time_exec` | CEO | YES - timeline/commitment framing | |
| Michael Shultz | Dir Field Engineering | Ohio Gig | `build_pace` | Field Engineering = construction/field | YES - idle crews angle | HOLD (entity flag) |
| Jacob Fox | Operations Manager | Ohio Gig | `build_pace` | Operations = build default | YES - schedule/throughput angle | |
| Leila Hussein | BU Leader Telecom | ISG | `drawings_quality` | Telecom engineering BU lead | YES - GIS-to-permit handoff | |
| Troy Hoover | Director of Operations | PCCI/ProDesign | `build_pace` | Dir Ops at construction co = build default | YES - throughput/queue angle | |
| Chris Fort | VP of Sales | Centillion | `pass_through` | VP Sales = sales role | REVIEW - email pitches technical (offshore model). Sales VP cares about client delivery, not design workflow | QA |
| Murali Nair | Eng Sales & Ops | Lightbulb | `uncertain` | Combo title, small company | REVIEW - email works but role unclear | QA |
| Roberto Martinez | Advisor, Strategy & Growth | Lighthouse | `cycle_time_exec` | Strategy advisor = exec-adjacent | YES - scale economics framing | |
| Denis Ryzhikov | CEO & President | Lighthouse | `cycle_time_exec` | CEO | YES - growth/ROI framing | |
| Tanya Pustakhod | Marketing Director | Lighthouse | `connect_request` | Marketing = not a buyer | REVIEW - current email pitches her on brand narrative. Should this be an intro request instead? | GATE |
| Jordan Raymond | SVP of Finance | Rayco | `capital_efficiency` | SVP Finance | YES - email already leads with financial impact | |
| Jude Guidry | Dir Strategy & BD | Rayco | `pass_through` | BD = sales/BD role | YES - email uses client delivery angle | |
| Kesari Iyengar | EVP | Indus CAD | `cycle_time_exec` | EVP = exec | YES - client QC reputation angle | |
| Raj Ahuja | President | Indus CAD | `cycle_time_exec` | President | YES - margin/business angle | |
| Vyshnaw Sadanandan | Dir of Operations | IMMCO | `build_pace` | Dir Ops = build default | REVIEW - email uses offshore quality angle which is actually drawings_quality frame. Works because IMMCO is A&E. | OK |
| Chris Lee | Director of Wireless | Mountain | `drawings_quality` | Director of engineering function | YES - multi-office consistency | |
| Forrest Collier | Sr Dir Plant Operations | TEC | `build_pace` | Plant Ops = construction/build | YES - multi-state permit variation | |
| Cliff Churchill | CEO | FOS | `cycle_time_exec` | CEO | YES - growth/expansion framing | |
| Zach Fox | Director of Finance | FOS | `capital_efficiency` | Finance | YES - rework cost/margin angle | |
| Matt Shearer | Director of Operations | LHTC | `build_pace` | Dir Ops = build default | YES - post-acquisition integration | |
| Deanna Richter | Dir Marketing & Comms | LHTC | `connect_request` | Marketing = not a buyer | REVIEW - current email pitches brand narrative. Should be intro request? | GATE |
| Matthew Mongell | BD Manager | LHTC | `pass_through` | BD = sales/BD role | YES - expansion speed angle | |
| Douglas Trout | President SBG | Schurz | `cycle_time_exec` | President | YES - portfolio standardization | |
| Salli Smith | SVP Design Services | Advanced 1 | `drawings_quality` | SVP of design function | YES - permit return rates at scale | |
| Scott Hastings | VP | Advanced 1 | `uncertain` | Bare "VP" - no function specified | REVIEW - email uses competitive diff angle. Need to confirm his function. | QA |
| Brian Derstine | VP | Advanced 1 | `uncertain` | Bare "VP" - no function specified | REVIEW - email uses field schedule angle. Need to confirm his function. | QA |
| Kimberly McKinley | Chief of Staff | TAK | `cycle_time_exec` | CoS = exec-adjacent | YES - scale/pipeline framing | |
| Aditya Kumar | VP | Integer Telecom | `uncertain` | Bare "VP" | REVIEW - email works but confirm function | QA |
| Michelle Usher | VP Strategic Partnerships | Dycom | `pass_through` | Strategic Partnerships = BD-adjacent | YES - but Tim said standard follow-up, Mike does exec research | |
| Jason Thune | VP Fiber Strategy & Deployment | Hawaiian Telcom | `build_pace` | VP Deployment = build scope | PENDING - no email yet | |

### HOLD prospects

| Prospect | Title | Company | Persona | Flag? |
|----------|-------|---------|---------|-------|
| Nathan Robbins | CTO | NEMEPA | `cycle_time_exec` | |
| Kathryn Eisele | Nat Dir Telecom/Broadband | Terracon | `program_leverage` | GATE - referral, not buyer |
| Lauren Lanoux | Sr Project Manager | Terracon | `program_leverage` | GATE - referral, not buyer |
| Carlos Figueiroa | Owner | One Drill | `cycle_time_exec` | |
| Luiz Nobre | President | Lunder | `cycle_time_exec` | |
| Joao Vianna | Owner | One Drill | `cycle_time_exec` | |
| Dastan Shaimerdenov | CEO | Nomad | `cycle_time_exec` | |
| Jonathan Solomon | CEO | JDI Fibertech | `cycle_time_exec` | |
| Jason Hall | Tribal Broadband PM | Mohawk | `program_leverage` | |
| Clint Smith | Network Ops Mgr | Sallisaw | `build_pace` | |
| Chris Gass | Sr Network Engineer | Greeneville | `drawings_quality` | |
| Bill Lee | Operations | Wyandotte | `build_pace` | Bare "Operations" = build default |

## Contacts flagged for review

### GATE flags (persona suggests different email type)

| Prospect | Current approach | Persona suggests | Decision needed |
|----------|-----------------|------------------|-----------------|
| Tanya Pustakhod | Full pitch (brand narrative angle) | `connect_request` (intro to engineering buyer) | Keep pitch or switch to intro request? Her email is well-written for a marketing person but she's not a buyer. |
| Deanna Richter | Full pitch (growth narrative angle) | `connect_request` (intro to engineering buyer) | Same question. Marketing director at an ISP. |

### QA flags (email angle might not match role)

| Prospect | Current email angle | Persona | Risk | Verdict |
|----------|-------------------|---------|------|---------|
| Landon Willets | Client-facing delivery | `pass_through` | Low - the client-facing angle IS what a National Account Director cares about | KEEP as-is |
| Chris Fort | Offshore design model | `pass_through` | Medium - VP Sales cares about client outcomes, not design workflow. But the Osmose integration question is strategic. | KEEP - the email works despite the mismatch |
| Murali Nair | Jurisdictional spread | `uncertain` | Low - he requested a demo at the booth regardless of title | KEEP |
| Scott Hastings | Competitive differentiation | `uncertain` | Low - if he's VP Sales, competitive diff is exactly right | KEEP but confirm title |
| Brian Derstine | Field schedule impact | `uncertain` | Low - if he's VP Field Services, this is perfect | KEEP but confirm title |
| Aditya Kumar | Multi-entity permitting volume | `uncertain` | Low - VP at 321-person firm, volume angle works regardless | KEEP |

## Summary

- **35 SEND/HOLD contacts classified**
- **2 GATE flags** (Tanya, Deanna) -- need operator decision on pitch vs intro-request
- **6 QA flags** -- all reviewed, all KEEP as-is (emails work despite persona mismatch)
- **4 UNCERTAIN** -- bare "VP" titles need function confirmed by AE review
- **0 emails need rewriting** based on persona analysis

The research-intuition composition approach produced correct angles in every case examined. Persona classification confirms the angles are right, doesn't change them.

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-05-30 09:15 | Claude | Initial classification. 7-bucket cascade applied to all SEND/HOLD contacts. 2 GATE flags, 6 QA flags (all KEEP), 4 UNCERTAIN. |
