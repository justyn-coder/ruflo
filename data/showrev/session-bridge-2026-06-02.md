---
title: Session Bridge — FC2026 HubSpot Load + Next Steps
status: ACTIVE
last_updated: 2026-06-02 15:30 EST
version: v1
---

# Session Bridge — June 2, 2026

## What Was Accomplished This Session

### HubSpot Load (COMPLETE)
- 45 contacts loaded into HubSpot via `hubspot-loader.ts`
- 3 Active Lists created: Mike Rutski (25), Nathan Dunn (13), Lucas Spencer (7)
- Sequence test passed — AEs ready to enroll their lists
- Christine Kohut test record deleted

### Issues Found & Fixed During QA (13 total)
Full post-mortem: `data/showrev/postmortem-fc2026-hubspot-load.md`

**Broken microsite URLs (6):** Mongell, Hussein had wrong slugs. Lanoux, Lora, Swanson had no microsites. Steve Smith cross-refs Vince Calkins' (intentional). Fixed: 2 slug corrections in Supabase + HubSpot, 3 new microsites created.

**Microsite AE/photo mismatches (4):** Nathan's 7 microsites showed Mike's headshot (NULL ae_photo_url). Nomad + NEMEPA had Nathan as AE but prospect assigned to Mike. LCC + Globema had WordPress/wrong favicon as logo. Fixed: all photos set, AEs corrected, real logos set.

**HubSpot record issues (3):** Laura Lora + Lauren Lanoux had duplicate records (from Nathan's prior-show attendee import). 4 contacts had wrong Contact Owner. New microsites created with status='active' but app requires 'live'. Fixed: duplicates merged, owners corrected, status fixed.

### Supabase Security
- 3 tables were missing RLS (sr_engine_output, sr_review_notes, sr_review_timestamps) — enabled with permissive policy to clear advisory
- **CRITICAL: ALL sr_ tables have permissive `ALL true` policies — RLS is on but provides zero actual protection. Anon key is in client bundle. Full database is publicly readable/writable. Needs proper policy rewrite before cold prospecting.**

---

## Open Work Items (Prioritized)

### 0. HS Loader + Sequences Re-Spec
**What:** Incorporate post-mortem learnings into hubspot-loader.ts. Build the 10-check `verify` command that blocks `load` on failure. Add to the spec: Pro vs Enterprise HubSpot feature differences (Sequences enrollment API, workflow automation access, list limits). Add automation conflict detection as a pre-load gate.
**Where:** `src/showrev/m1-email-find/hubspot-loader.ts` + `data/showrev/runbook-hubspot-load.md`
**Why:** At 900 contacts, manual QA is impossible. This is the #1 blocker for cold prospecting.
**Spec exists:** 10 checks defined in post-mortem. Needs implementation.

### 1. Client-Facing HubSpot Report (Inorsa CEO + Head of Marketing)
**What:** Dashboard showing ShowRev's value to the client. NOT an AE pipeline view. Metrics: contacts researched, emails composed, microsites created, page views, engagement rates (opens/clicks/replies once Sequences run), meetings booked.
**Where:** HubSpot Reports / Dashboard
**Why:** Proves ROI to Inorsa leadership. This is how the client sees what they're paying for.
**Spec exists:** Discussed in prior session but spec was NOT written to file before compaction. Needs re-scoping from current data state.
**Note:** Verify what's possible on Inorsa's HubSpot plan tier (Pro vs Enterprise reporting features).

### 2. HubSpot Record Customization for AEs
**What:** Reorder contact and company record sidebar sections so AEs see ShowRev intel prominently.
**Contact layout:**
- ShowRev Intelligence section at TOP (signal strength, challenger insight, talking points, next action, risk factors, objections, decision authority, buying timeline)
- Email Tokens section collapsed at BOTTOM (para1-4, subject, PS — AEs don't need to see these)
- Remove legacy pilot fields from sections: About/Bio, Areas of Expertise, City/State, LinkedIn URL, Prior Companies, Years at Company, Seniority
**Company layout:**
- ShowRev Company Intel section with 9 fields (summary, size, fiber activities, BEAD status, growth signals, competitive landscape, key projects, recent news, external deadlines)
**Where:** HubSpot Settings → Record Customization (Justyn now has admin access)
**Why:** AEs are about to use these records daily. Intel needs to be front-and-center, not buried.
**Spec exists:** Checklist in runbook. Best practices scoping discussion was in prior session but may have been lost to compaction.

### 3. Watcher Module (Outcome Tracking / Reporter)
**What:** Automated pipeline that pulls HubSpot engagement events (opens, clicks, replies, meetings booked, unsubscribes) into Supabase, feeds the Brain for learning, and powers a report in the Mission Control portal.
**Where:** New module in `src/showrev/` — the "Outcome Tracking / Reporter" box in the architecture diagram (Phase 6 Delivery)
**Why:** Closes the learning loop. The Brain can't learn which patterns/insights/CTAs work unless it gets outcome data back. Also feeds the client report (#1).
**Spec exists:** Architecture diagram has it. No implementation spec yet. Depends on Sequences being active (needs real engagement data).
**Prerequisite:** AEs must enroll and send first. Data flows after that.

### 4. Supabase + Vercel Security Hardening
**What:** Replace all permissive `ALL true` RLS policies with proper role-based access. Switch server-side code to service role key. Remove anon key from client bundle where not needed. Audit Vercel env vars.
**Where:** Supabase policies + `src/showrev/microsite/` (supabase client init) + Vercel dashboard
**Why:** 24 tables with prospect PII are publicly readable/writable via the anon key visible in page source. Not acceptable before cold prospecting adds 2,300 contacts.
**Spec exists:** No. Needs a proper security spec.
**Proper RLS policy sketch:**
- `anon` can SELECT from sr_microsites WHERE status='live'
- `anon` can INSERT into sr_microsite_events (page view tracking)
- `anon` cannot access any other table
- `service_role` gets full access (used by loader, engine, ops portal server components)
- Microsite route.ts and ops page.tsx switch from anon key to service role key (server-side only)

---

## Key File Locations

| File | Purpose |
|------|---------|
| `data/showrev/postmortem-fc2026-hubspot-load.md` | 13 issues found, root causes, 10-check verify spec |
| `data/showrev/runbook-hubspot-load.md` | Step-by-step loading process, field reference, gotchas |
| `src/showrev/m1-email-find/hubspot-loader.ts` | HubSpot loader code |
| `src/showrev/m1-email-find/influence.ts` | Composition prompts + influence patterns |
| `src/showrev/m1-email-find/judge.ts` | Mechanical email checks |
| `src/showrev/microsite/app/brief/[slug]/route.ts` | Microsite page renderer (uses anon key — security issue) |
| `src/showrev/microsite/app/ops/page.tsx` | Mission Control server component |

## AE Active Lists (HubSpot)
- FC2026 — Mike Rutski Sends (25 contacts)
- FC2026 — Nathan Dunn Sends (13 contacts)
- FC2026 — Lucas Spencer Sends (7 contacts)
- Filter: showrev_assigned_ae = [AE Name] AND showrev_engagement_slug = inorsa-fiberconnect-2026

## HubSpot Owner IDs
- Mike Rutski: 89105202
- Nathan Dunn: 89105203
- Lucas Spencer: 163468117
- Automations Team: 78040026
- Joao Feliciano (DEACTIVATED): 399598919

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-02 15:30 | Claude | Initial bridge from FC2026 load session |
