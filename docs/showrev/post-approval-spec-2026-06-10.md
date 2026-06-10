---
title: Post-Approval-to-Send Pipeline — spec
status: DRAFT
last_updated: 2026-06-10 02:15 EDT
version: v1
---

# Post-Approval-to-Send Pipeline

## Headline

When an AE clicks **APPROVE** on a prospect in the portal, the pipeline takes over: load the contact + account into HubSpot, enroll in the right sequence, track engagement, feed bounces/replies/clicks back to Supabase so cohort #2 doesn't repeat cohort #1's mistakes. P1 (booth visitors) shipped a working v1 of this in May 2026; P2 (cold) reuses the same plumbing with the differences below.

This spec covers everything from the moment `send_status` flips from `pending` to `approved` until the engagement data lands back in Supabase. It does NOT cover the build-side engine (Phase B/C composer, etc.) — that's covered by the System Brief v3 spec and is already live.

## State diagram

```
pending  ─(AE APPROVE)→  approved  ─(load)→  loaded  ─(enroll)→  sent  ─(webhook)→  engaged | bounced | replied
                ↓                              ↓                       ↓
            reject/dnc                    load failed             re-flag for
            (terminal)                    → flag                  cohort #2 exclusion
```

`send_status` values:
- `pending` — engine produced a clean email; AE hasn't reviewed
- `approved` — AE clicked APPROVE in portal; pipeline picks up
- `loaded` — written to HubSpot, NOT yet enrolled
- `sent` — enrolled in HubSpot Sequence touch 1
- `engaged` — open + click recorded (touch 2 still scheduled)
- `replied` — sequence paused; AE owns reply
- `bounced` — re-flagged for cohort exclusion + manual review
- `flag` — engine or pre-send check failed; back to AE review
- `dnc` — AE chose DNC, or HubSpot dedup found an active DNC contact
- `rejected` — AE rejected; terminal

## Phase A — Pre-send checks (before any HubSpot write)

When AE clicks APPROVE:

| Check | Source | Action on hit |
|---|---|---|
| Account exists in HubSpot | HubSpot Companies API, domain-first lookup | If active in last 60d → flag for AE override; If inactive → reuse account |
| Contact exists in HubSpot | HubSpot Contacts API, email-first lookup | If exists → notify AE, allow override or merge |
| DNC list (Inorsa master) | `~/.claude/hooks/inorsa_compliance_check.py` `DNC_COMPANY_NAMES` | Auto-flag; AE cannot send without explicit override |
| Unsubscribe flag in HubSpot | HubSpot `marketing_email_optout` property | Auto-flag; cannot send |
| Bounce history | `sr_bounces` (new table, populated by webhook in Phase D) | If 3+ bounces in last 6 months → exclude |
| Sender reputation | Per-domain rolling 7-day bounce rate from Supabase | If >5% → throttle (cohort-level, not per-prospect) |

Implementation: a single `pre_send_checks(prospect_id) -> { allow: bool, reasons: string[], hubspot_account_id?: string, hubspot_contact_id?: string }` function. Runs on AE click, returns to portal for display.

## Phase B — HubSpot loading

If pre-send checks pass:

1. **Account.** Domain-first dedup (HubSpot `domain` property). Create if missing; update only the empty fields if exists (don't overwrite manual data).
2. **Contact.** Create with: first_name, last_name, email, jobtitle (from `sr_engine_output.title`), lifecyclestage='other', AE territory (from `sr_engine_output.ae`), ICP type (`sr_engine_output.icp_type`), persona bucket (`sr_engine_output.persona_bucket`), cohort tag (e.g., `inorsa-fc2026-p2-cohort-1`).
3. **Association.** Explicit contact ↔ account association (per memory `reference_hubspot_loading_protocol.md` — Breeze-validated pattern).
4. **Email body, subject, P.S. as properties.** Per-paragraph properties (per memory `reference_hubspot_sequences_api.md` — line breaks stripped in tokens). Schema: `inorsa_t1_subject`, `inorsa_t1_p1`, `inorsa_t1_p2`, `inorsa_t1_p3`, `inorsa_t1_ps_url`. Subjects A + B both stored for sequence A/B test.

Idempotency: each prospect_id maps to exactly one HubSpot contact_id. Re-runs are no-ops on existing contacts; updates only fields that changed.

## Phase C — Sequence enrollment

HubSpot Sequences API (per memory: no draft API, no deferred enrollment, per-paragraph token quirks):

- Touch 1: send immediately (T1)
- Touch 2: send T1 + 5 business days
- Touch 3: send T2 + 5 business days

Sequence assignment by ICP type:
- `fiber_operator` → `inorsa-fc2026-fiber-operator-v1`
- `ae_firm` → `inorsa-fc2026-ae-firm-v1`

AE assignment drives the FROM address (Mike Rutski / Nathan Dunn / Lucas Spencer / Justyn — territory mapping in `sr_engine_output.ae`).

On successful enrollment, flip `send_status='sent'` and write `sent_at` + HubSpot `engagement_id` to `sr_engine_output`.

## Phase D — Engagement tracking (webhook → Supabase)

New HubSpot webhook listener at `/api/hubspot/webhook` in showrev-microsites (or Vercel serverless function in a separate service). Handles events:

| HubSpot event | Supabase write | Side effect |
|---|---|---|
| `email.open` | `sr_engagement` insert (prospect_id, event='open', touch, timestamp) | None |
| `email.click` | `sr_engagement` insert (event='click', url) | None |
| `email.reply` | `sr_engagement` + `sr_engine_output.send_status='replied'` | Pause sequence in HubSpot; notify AE in portal |
| `email.bounce` | `sr_engagement` + `sr_bounces` row + `sr_engine_output.send_status='bounced'` | Exclude from cohort #2 |
| `email.unsubscribe` | `sr_engagement` + HubSpot `marketing_email_optout=true` | Future cohorts skip |

Webhook security: HubSpot signature validation, idempotency key on event_id.

## Phase E — Feedback loops

The whole point of tracking is to NOT repeat mistakes:

1. **Bounce → re-flag.** Bounce rate per prospect ≥1 → `excluded_until_recheck=true`. Cohort #2 builder excludes these unless email was re-found via Apollo refresh.
2. **Reply → pause.** First reply pauses the sequence (HubSpot API). AE sees the reply in the portal, decides next move.
3. **Cohort drift detection.** Rolling 7-day window: how many prospects opened, clicked, replied, booked? If reply rate <0.5% of sent over a 14-day window, sound the alarm — composer or sequence assumed-fit is wrong.
4. **Domain reputation.** If bounce rate per sender domain >5% in a rolling 7-day window, throttle that domain's sends to 10/day until it recovers.

## Phase F — Cost telemetry

Per-prospect cost rollup at write time:
- Apollo credits used (from pipeline run summary)
- MillionVerifier credits used
- Anthropic tokens (composer + judges + Phase C + intel-structurer)
- Gemini tokens (cross-family judges)
- HubSpot API calls (free at our tier, but logged for tier-jump warnings)

New column `cost_breakdown` (JSONB) on `sr_engine_output`. New view `v_cost_per_cohort` aggregating by `cohort` tag.

Cohort kill-switch: if cumulative cost exceeds X (configurable, default $50 for an 85-prospect cohort), pause and notify operator.

## Phase G — Operational dashboards

Two new portal pages (showrev-microsites):

1. **`/ops/cohort/[cohort-id]`** — single-cohort drill-down. Per-prospect table (status, send timestamp, opens, clicks, replies, bounces). Per-AE warming compliance ("Mike approved 12 of 14 assigned in 24h").
2. **`/ops/dashboard`** — rolling 30-day view. Open rate, click rate, reply rate, booking rate (booked = ≥1 calendar event off the CTA link), bounce rate. Filter by cohort + AE.

Data source: `sr_engagement` + `sr_engine_output` + HubSpot meetings API for booking-rate.

## Phase H — AE runbook

Plain-text doc at `docs/showrev/ae-runbook-2026-06-10.md` (operator authors; my role is the framework). Covers:

- "Reply categorization: positive / objection / unsubscribe / out-of-office / 'are you a bot?'"
- Pre-written acceptance / objection-handling templates for each AE
- When to pause sequence manually
- How to handle a 3-touch silent prospect (drop or re-cadence)
- DNC override protocol (when is it OK to send despite a flag)

## Cohort-fire gating items (from senior PM checklist)

Before cohort `inorsa-fc2026-p2-cohort-1` fires, these are **mandatory**:

| # | Item | Why mandatory | Effort |
|---|---|---|---|
| 10 | End-to-end render test (visit a composed prospect's portal page, click PS link, see microsite, click CTA) | If any link is broken, the whole cohort is wasted | 30 min — manual eyeballs |
| 4 | Send-side compliance verified (HubSpot DNC + unsubscribe + CAN-SPAM wired and tested) | Legal + deliverability | 2 hr verification |
| 5 | Cost-per-cohort calculator + kill-switch | Without it, a runaway pipeline burns $ silently | 2 hr |
| -- | Spam-score check on a sample email (mail-tester.com or equivalent) | If we land in spam, all the quality work is wasted | 30 min |

**Should-have** (target before cohort #1 fires, OK to defer to #2):

| # | Item | Effort |
|---|---|---|
| 1 | Reply-rate webhook (Phase D) | 4 hr |
| 7 | Bounce → re-flag webhook (Phase D) | 2 hr |

**Defer to post-cohort-1:**

- #2 Portal audit trail UI (6 hr) — show source for each email claim
- #3 Grafana dashboard (8 hr) — replaces tailing logs
- #6 Idempotent recovery (4 hr) — resume cohort from checkpoint
- #8 AE runbook (operator authors)
- #9 Composer drift detection (3 hr)

## Acceptance criteria

- A1. AE can click APPROVE in the portal and within 60 seconds see `send_status='sent'` on that prospect's detail page.
- A2. Webhooks land bounce/reply/click events in Supabase within 2 minutes of HubSpot event.
- A3. A prospect that bounces in cohort #1 does NOT appear in cohort #2 unless email is re-found.
- A4. The operator can answer "how much did cohort #1 cost?" with a single SQL query.
- A5. DNC blocks send 100% of the time; override requires explicit AE action with audit trail.

## Out of scope

- Email composition (handled by engine — System Brief v3 spec)
- AE training (operator owns)
- Marketing automation beyond 3-touch sequence (deliberate constraint — keep cohort #1 simple)
- Multi-language email handling (US-only for FC2026)

## Total effort estimate

- Mandatory pre-fire: **~5 hours** (#10 + #4 + #5 + spam-score)
- Should-have pre-fire: **+6 hours** (#1 + #7)
- Phase A pre-send checks build: ~3 hours
- Phase B HubSpot loading build: ~4 hours (P1 plumbing exists; P2 just needs cohort tag + ICP-type-routing)
- Phase C sequence enrollment: ~2 hours (P1 reuse)
- Phase D webhook listener: ~6 hours (most of the work)
- Phase E feedback loop wiring: ~3 hours
- Phase F cost telemetry: ~3 hours
- Phase G dashboards: ~10 hours (deferable)

**Total to ship cohort #1 with minimum + should-have: ~21 hours.** Roughly 2.5 focused days.

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-10 02:15 | Claude | Initial spec — covers Phases A-H, gating items, acceptance criteria. Derived from operator's Senior PM checklist + P1 booth-visitor build + memory rules on HubSpot Sequences API + DNC hook. |
