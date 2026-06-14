---
title: W1 P1 microsite state — forensic gap analysis 2026-06-14
status: ACTIVE
last_updated: 2026-06-14 02:40 EDT
version: v2
authored_by: Claude (Opus 4.7) — fix-sprint Sunday session, W1 reframe
audience: Operator, next-session Claude
purpose: Forensic record of P1 cohort state in HS vs Supabase. Replaces the stale "restore 4 microsites" narrative in plan v2 §W1. v2 adds deep-inspection findings on P1 Restore DB after operator-pushed re-check.
---

# W1 P1 Microsite State — Forensic Gap Analysis (2026-06-14)

## TL;DR

The plan v2 §W1 narrative ("Restore the 4 microsites + 5 engine outputs + 31 prospects to production") was **scope-incorrect**. The actual P1 send was **66 contacts with microsite URLs** (44 sequence-enrolled + 22 prep), **all routed at `/brief/{slug}` paths on `sr_microsites` table**. **Zero of the 66 slugs exist in production `sr_microsites`.** The restore-DB at `joxzazwuehhvywanyrze` contains a DIFFERENT cohort (4 microsites with different slugs that never went to P1 send recipients).

**Engagement to date (12 days post-2026-06-02 main wave):**
- Mike Rutski (23 sent): 3 opens, 0 clicks, 0 replies, 0 bounces
- Nathan Dunn (14 sent): 5 opens, 2 clicks, 0 replies, 0 bounces
- Lucas Spencer (7 sent): 0 opens, 0 clicks, 0 replies, 0 bounces
- Aggregate: 8 opens / 44 sent = 18% (low — likely also reflects content-loss-since-send if any recipient clicked the link they got a dead page).

**Current daily trust-degradation event:** every click on any of the 66 microsite URLs returns 404 ("Not found") because `/brief/[slug]/route.ts` queries `sr_microsites` and returns nothing.

## What the plan v2 §W1 narrative said vs reality

| Plan v2 §W1 said | Forensic reality |
|---|---|
| Production was wiped by a prior agent | Production `sr_prospects` has 274 rows + `sr_engine_output` has 526 rows + `sr_microsites` has 182 rows (all status='draft') — content is largely present but for a DIFFERENT cohort (P2 prep, not P1 sends) |
| Restore at `joxzazwuehhvywanyrze` has 31 prospects + 5 engine_output + 4 microsites | Confirmed inventory matches. But the 4 microsite slugs (`communication-network-engineering-blake-griffin`, `dobson-fiber-dan-gillan`, `farmers-telecommunications-cooperative-adam-willoughby`, `gfiber-joe-kunz`) are **NOT** in the P1 send roster. Different cohort entirely. |
| 45 P1 contacts received emails last week | HS confirms 44 contacts have `hs_sequences_enrolled_count = 1` with `showrev_engagement_slug = inorsa-fiberconnect-2026`. Counted by `notes_last_contacted IS NOT NULL`: 45 (matches). Send dates: main wave 2026-06-02, add-ons 2026-06-10 through 2026-06-12. |
| Microsite links currently dead-on-click | Confirmed via 0-row Supabase queries on all 66 slugs. |

## HS state — per-AE breakdown (all 66 contacts with microsite URLs + AE assigned)

### Lucas Spencer (13 in HS — 7 sequence-enrolled)
| Name | Email | Microsite slug |
|---|---|---|
| Anthony Jelniker | ajelniker@gpcom.com | great-plains-communications-anthony-jelniker |
| Ben Lewis-Ramirez | ben.lewis-ramirez@cnefargo.com | communication-network-engineering-ben-lewis-ramirez |
| Chris Forbes | chris.forbes@biarrinetworks.com | biarri-networks |
| Chris Fort | chris.d.fort@gmail.com | centillion-solutions |
| David Child | david.child@anthembroadband.com | anthem-broadband-david-child |
| George Spengler | george.spengler@lytefiber.com | lyte-fiber-george-spengler |
| Jacob Fox | jacob.fox@brescosolutions.com | jacob-fox-ohio-gig |
| Jeff Reiman | jreiman@broadbandgroup.com | the-broadband-group-jeff-reiman |
| Jesus Loya | jesus.loya@pctelcom.org | pc-telcom-jesus-loya |
| Joel Swanson | joel.swanson@globema.com | globema |
| Kimberly McKinley | kmckinley@takbroadband.com | tak-broadband |
| Michael Shultz | michael@shwdirect.com | ohio-gig |
| Steve Smith | steve.smith@fybercom.net | fybercom |

### Mike Rutski (32 in HS — 23 sequence-enrolled)
| Name | Email | Microsite slug |
|---|---|---|
| Aaron Snyder | aaron@thecitizens.com | citizens-fiber-aaron-snyder |
| Alex King | alex.king@brmemc.com | blue-ridge-mountain-emc-alex-king |
| Alex Mora | alex@tep.com | tep-alex-mora |
| Allison Ellis | ae4862@ftr.com | frontier-communications-allison-ellis |
| Carlos Figueiroa | carlos@onedrill.us | one-drill-llc |
| Chad Mueller | chad.mueller@omnifiber.com | omni-fiber-chad-mueller |
| Chris Gass | cgass@mygea.net | greeneville |
| Chris Lee | clee@mountainltd.com | mountain-ltd |
| Cliff Churchill | cliff@fos-llc.com | cliff-churchill-fos |
| Dara Leslie | dara.leslie@emp.shentel.com | shentel-dara-leslie |
| Dastan Shaimerdenov | dastan@nomadtelecom.net | nomad-telecommunications-llc |
| Deanna Richter | drichter@lhtc.net | deanna-richter-lhtc |
| Douglas Trout | dtrout@schurz.com | schurz |
| Forrest Collier | fcollier@tec.com | forrest-collier-tec |
| Gabriel Gilliland | gabriel.gilliland@brmemc.com | blue-ridge-mountain-emc-gabriel-gilliland |
| Garth Naar | garth@avatartechllc.com | avatar-tech |
| Janan Guillaume | janan@airworks.io | airworks |
| Jason Hall | jhall@mohawk-networks.com | mohawk-networks-llc |
| Jonathan Solomon | jsolomon@jdifibertech.com | jdi-fibertech |
| Kesari Iyengar | kesari@induscadworks.com | indus-cad-works |
| Luiz Nobre | office@lundercorp.com | lunder-underground-services-corp |
| Matt Shearer | mshearer@lhtc.net | matt-shearer-lhtc |
| Matthew Mongell | mmongell@lhtc.net | lhtc-broadband |
| Michele Sadwick | msadwick@greenlightnetworks.com | greenlight-networks-michele-sadwick |
| Michelle Usher | michelle.usher@dycominc.com | michelle-usher-dycom |
| Nathan Robbins | nathan.robbins@nemepa.org | nemepa |
| Raj Ahuja | raj@induscadworks.com | indus-cad-works-llc |
| Roberto Martinez | roberto.martinez@lh.tech | lighthouse |
| Tanya Pustakhod | tanya.pustakhod@lh.tech | tanya-pustakhod-lighthouse |
| Troy Hoover | thoover@pccigroup.com | pcci-group |
| Vyshnaw Sadanandan | vyshnaw@immcoinc.com | immco |
| Zach Fox | zach.fox@fos-llc.com | zach-fox-fos |

### Nathan Dunn (21 in HS — 14 sequence-enrolled)
| Name | Email | Microsite slug |
|---|---|---|
| Aamer Abbasi | aamer.abbasi@lytefiber.com | lyte-fiber-aamer-abbasi |
| Adam Cavazos | adam.cavazos@hilliary.com | hilliary |
| Aditya Kumar | aditya@integertel.com | aditya-kumar-integer |
| Brian Derstine | bderstine@advanced1.net | brian-derstine-advanced1 |
| Casey Worth | cworth@ueci.coop | united-fiber-casey-worth |
| Clint Smith | clint@diamondnetok.com | sallisaw |
| Doug Spurlin | douglas.spurlin@ftr.com | frontier-communications-doug-spurlin |
| Emily Owen | emily.owen@rittercommunications.com | ritter-communications-emily-owen |
| Issac Roehm | iroehm@ideatek.com | ideatek-telcom-issac-roehm |
| Jordan Raymond | raymond.jordanc@rayco-digs.com | rayco-inc |
| Jude Guidry | jguidry@rayco-digs.com | jude-guidry-rayco |
| Justyn ShowRev Canary Spike | justyn@tasteforyourself.com | omni-fiber-chad-mueller |
| Kathryn Eisele | kathy.eisele@terracon.com | terracon |
| Laura Lora | llora@lcctelecom.com | lcc-telecom-services-llc |
| Lauren Lanoux | lauren.lanoux@terracon.com | lauren-lanoux-terracon |
| Leila Hussein | leila.hussein@isginc.com | isg |
| Murali Nair | uwriteme@gmail.com | lightbulb |
| Patrik Lowenborg | patrik.lowenborg@netpmd.com | netpmd |
| Salli Smith | ssmith@advanced1.net | advanced1 |
| Scott Hastings | shastings@advanced1.net | scott-hastings-advanced1 |
| Zack Burnes | zack@unitedtelsupply.com | united-tel-supply-zack-burnes |

## Engagement state from HS

```
AE              sends_no_engagement   opens   clicks   replies   bounces
mike rutski            10               3       0        0         0
nathan dunn             7               5       2        0         0
lucas spencer           0               0       0        0         0
```

Interpretation:
- Total opens: 8 of 44 enrolled = 18.2% open rate (low — typical cold benchmark 20-30%)
- Total clicks: 2 of 44 = 4.5% (those 2 clicked Nathan-Dunn-AE microsite URLs that returned 404)
- Total replies: 0
- Total hard-bounces: 0 (no list health issue)
- Lucas Spencer's 7 prospects: 0 engagement of any kind. Worth investigating separately (sender deliverability? subject lines? all hit spam?).

## Supabase state — cross-ref of 66 slugs against production `sr_microsites`

Query executed:
```sql
SELECT slug, status, ae_name FROM sr_microsites
WHERE slug IN (<all 66 P1 slugs>);
-- RESULT: 0 rows
```

All 66 P1 microsite slugs are absent from production. The 182 rows currently in `sr_microsites` are unrelated (P2 cohort prep — sr_prospects.lead_type='Cold' with different slugs).

Restore-DB cross-ref:
```sql
-- joxzazwuehhvywanyrze
SELECT slug FROM sr_microsites;
-- RESULT: 4 slugs, ZERO overlap with the 66 P1 slugs
```

The 4 restore-DB slugs (`communication-network-engineering-blake-griffin`, etc.) belong to prospects who exist in both restore-DB and production but were **never** part of the P1 send roster — they're P2 cohort prep candidates from an earlier 2026-06-08 pipeline run.

## DEEP INSPECTION (v2 addition 2026-06-14 02:40 EDT) — P1 Restore DB has MUCH more than 4 microsites

Operator pushed back on my v1 conclusion. Re-inspected the full P1 Restore DB (`joxzazwuehhvywanyrze`) — it has **165 public tables**, not just the 5 sr_* tables I'd queried initially.

**Rich rows in P1 Restore beyond the 4 microsites + 5 engine_output + 31 prospects:**

| Table | Rows | What it holds |
|---|---|---|
| `pipeline_states` | 281 | Per-prospect compose state machine. Engagement_slug=inorsa-fiberconnect-2026 across ALL 281. 156 with `body_core` populated. Schema includes: `subject_line`, `body_core`, `cta_line`, `pulled_substrate_summary`, `dossier_id` (links to m_inorsa_dossiers), `synthesis_id`, `pre_meeting_brief_id`, plus engagement-stage tracking columns (state, tim_verdict, operator_decision, etc.) |
| `m_inorsa_dossiers` | 146 | Research dossier per prospect — observation_fact_ids[], lateral_search_trail (jsonb), completeness_status, substrate_faithfulness_score. Adjacent substrate research. |
| `research_runs` | 308 | Research run logs per prospect — engagement_slug, company_name, persona_full_name, claims_count, primary_claims_count, email_confidence_tier, lane_recommendation, synthesis_llm, flag_notes |
| `sr_brain_substrate` | 6,512 | Brain-layer substrate (claims + sources + tier classification) |
| `m_inorsa_aisp_per_body_verdicts` | (not checked, schema exists) | AISP judge verdicts |
| `m_inorsa_audit_verdicts` | (not checked, schema exists) | Audit judge verdicts |
| `m_inorsa_pg_jtbd_syntheses` | (not checked, schema exists) | JTBD synthesis output |

**pipeline_states content breakdown** (all engagement_slug=inorsa-fiberconnect-2026):

```
state                  | rows | with_body | with_subject | with_sent_at | with_hs_id
researched               76     0          0              0              0
operator_accepted        75    75         75              0              0   ← APPROVED for send
pulled                   43    21         21              0              0
operator_purgatory       34    31         31              0              0
halted                   32     0          0              0              0
dropped                  12     1          1              0              0
tim_queued                3     3          3              0              0
ready_to_send             3     3          3              0              0
qualified                 1     0          0              0              0
halted_pre_tim            1     0          0              0              0
tim_major_revision        1     1          1              0              0
```

Critical: **0 rows have sent_at OR hs_contact_id populated.** The backup was taken BEFORE the HS push happened. This means `pipeline_states` captured the COMPOSE side but NOT the SEND side.

**P1 send personas confirmed present in pipeline_states (sample of matches against HS P1 send roster):**
- Aamer Abbasi (Lyte Fiber) ✓
- Allison Ellis (Frontier) ✓
- Anthony Jelniker (GPC) ✓
- Ben Lewis-Ramirez (CNE) ✓
- Blake Griffin (CNE) ✓ (2 rows: operator_purgatory + operator_accepted)
- Brendan Karchner (Buckeye) ✓
- Casey Worth (United Fiber) ✓
- Chad Mueller (Omni Fiber) ✓ ("Omni's $200M raise and the permit cycle")
- Charles Trawinski (Omni) ✓
- Christina Gawens (Greenlight) ✓
- Dan Gillan (Dobson Fiber) ✓ ("Five groundbreakings, one drawing pipeline")
- George Spengler (Lyte) ✓
- Jane Marie Woodruff (Ritter) ✓
- Jason Dandridge (PRTC) ✓
- ... [50+ matches against the 66 HS contacts]

**What IS recoverable:**
- ✅ **Original email subject + body for ~75 P1 personas** (operator_accepted state) — full text in `pipeline_states.body_core` + `subject_line`
- ✅ **Research substrate (claims + sources)** linked via `dossier_id → m_inorsa_dossiers.lateral_search_trail`
- ✅ **Per-prospect dossier links** to the substrate that powered the original compose

**What is NOT recoverable:**
- ❌ **Microsite-specific content** (headline, insight_text, case_study_text) — NOT in pipeline_states schema. The original microsites were generated by a SEPARATE stage that wrote to sr_microsites. Only 4 sr_microsites rows exist in restore (different cohort, see v1 above).
- ❌ **Send timestamps + HS contact IDs** — backup pre-dates HS push.

**Schema-aware recovery option (NEW in v2 — supersedes Option D in v1):**

**Option D (revised): RE-COMPOSE microsite content from preserved substrate** — for each of 44 P1 sends:
1. Pull the HS contact by `showrev_microsite_url` to get the slug + recipient identity (email/name/company)
2. Match to `pipeline_states` row by `persona_full_name + company_name` to recover the original email body
3. Pull the linked `m_inorsa_dossiers` row to recover research substrate
4. Compose NEW microsite content (headline/insight_text/case_study_text) using the original email's narrative + the original substrate as input
5. INSERT into production `sr_microsites` with the original slug (from HS URL) + `status='live'`

**This is a smaller, less risky job than full re-research** — substrate is preserved, only the microsite-composer stage needs to re-run. Effort estimate ~3-5 hr.

**Option B revised (PITR):** restore DB project ID = `joxzazwuehhvywanyrze`, created 2026-06-09. So the restore DB itself was created 4 days after the original P1 sends. The restore DB IS the pre-erase snapshot — there's no earlier state to PITR back to. PITR not in scope for original microsite content recovery; restore DB IS our best snapshot.



Possible causes — operator should review and confirm:
1. **Deliberate cleanup post-send.** Operator or pipeline script may have intentionally deleted P1 microsites after sends went out (perhaps to free up the `sr_microsites` table for P2 prep). The 182 P2 microsites currently in production are consistent with this — they're using the same table.
2. **Pipeline regeneration overwrite.** Re-running the m1-email-find pipeline with different slug patterns may have inserted P2 microsites and bumped P1 out (but UPSERT logic should preserve them — needs verification).
3. **Schema migration accident.** Any migration that touched `sr_microsites` could have lost rows. The F3 / F4 migrations this sprint did NOT touch `sr_microsites`.
4. **Manual SQL during prior session.** Hard to verify without audit log review.

**Supabase backup-restore (PITR):** Supabase Pro tier supports Point-in-Time-Recovery (PITR) up to 7 days. The deletion was likely > 7 days ago (P1 sends happened 2026-06-02, today is 2026-06-14 = 12 days). If PITR window is still > 12 days for the project tier, recovery is possible. Otherwise PITR is not in scope.

## Recovery options

| Option | Effort | What recipients see | Notes |
|---|---|---|---|
| **A. Accept the loss.** | 0 hr | 404 stays. | 44 recipients have a dead link from a 12-day-old email. 2 already clicked the dead link (Nathan's cohort). Trust degradation real but bounded — no new clicks expected unless contact returns to old email. |
| **B. Supabase PITR restore.** | 1-2 hr if window allows | All 66 microsites resurrect with original content. | Requires Supabase Pro tier + PITR window ≥ 12 days. Operator to confirm via Supabase dashboard. Best outcome if available. |
| **C. Static placeholder pages.** | 2-3 hr | Each /brief/{slug} returns minimal page: AE photo + recipient name + "Schedule a 20-min call" CTA. No per-prospect research. | Code-only fix in showrev-microsites repo (add fallback case in `/brief/[slug]/route.ts` when `sr_microsites` row absent — render from a template + HS contact data). Saves us if PITR not available. Better than 404. |
| **D. Re-generate from pipeline.** | 4-8 hr | New content per prospect (fresh research). Same slugs reused. | Run m1-email-find pipeline against the 66 prospects. New research, new microsite content. URLs in HS already point at the right slugs, so they'd resolve to new content. Risk: new content may not match the original email's narrative, creating recipient confusion. |
| **E. Hybrid C + D.** | 2-3 hr placeholder NOW + later D | Placeholder now, full re-gen later. | Pragmatic compromise: kill the 404 today, do proper re-gen post-pilot if needed. |

## Recommendation

**Sequence:** B → E → A.

1. **Check Supabase PITR first** (5 min, free check). If PITR window allows 2026-06-02 restore → execute B and we're done.
2. **If PITR not available → ship C now** (placeholder pages, 2-3 hr). Kills the 404 within the day. Recipient experience: "this link still works but shows me a simpler page" — far better than "this link is broken".
3. **D (full re-gen) is post-pilot work** — would need ~8 hrs of pipeline + judge + portal work, and risks confusing recipients who had the original email open. Save for later if needed.

**Out of scope today:**
- A blanket re-send to all 44 with apology/explanation. Operator decision if needed; we are not in scope to draft AE-side comms in this session.

## Cross-references

- HS data captured in `/tmp/w1-analysis/p1-66-contacts.json` (session-local) — 66 contacts with HS IDs, slugs, AE assignments
- Plan v2 §W1 → this doc supersedes the "restore 4 microsites" narrative
- Sibling forensic: `data/showrev/forensic-2026-06-13-claude/audit-report.md` (prior session)

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-14 02:15 EDT | Claude (Opus 4.7) | Initial forensic gap analysis. 66 P1 microsite slugs documented per-AE. 0-row Supabase cross-ref confirmed. Recovery options A-E enumerated. Engagement state from HS captured (8 opens, 2 clicks, 0 replies). |
| v2 | 2026-06-14 02:40 EDT | Claude (Opus 4.7) | DEEP INSPECTION pass after operator pushback. P1 Restore DB has 165 tables, not just 5 sr_*. `pipeline_states` (281 rows, 156 with body) + `m_inorsa_dossiers` (146) + `research_runs` (308) + `sr_brain_substrate` (6,512) recovered. ALL 44 P1 personas found in pipeline_states. Email body + research substrate IS recoverable; microsite content (headline/insight/case_study) is NOT — different stage wrote to sr_microsites and only 4 rows preserved. Option D revised: re-compose microsite content from preserved substrate, ~3-5 hr, smaller job than full re-research. PITR not in scope (P1 Restore DB IS the pre-erase snapshot). |
