---
title: T2/T3 Framework — Fiber Connect 2026 Post-Show Sequence
status: DRAFT — sleep on before executing
last_updated: 2026-05-29 01:00 EST
version: v1
---

# T2/T3 Framework

## Guiding principle

One story told in three chapters, not three separate pitches. Each touch reinforces the SAME narrative from a DIFFERENT angle with ESCALATING commitment. The prospect should feel like a conversation is building, not like they're being spammed.

## Sequence timing

| Touch | Timing | Day (if T1 fires Friday May 30) |
|-------|--------|--------------------------------|
| T1 | Send day | Friday May 30, 10am EST |
| T2 | T1 + 5 business days | Friday June 6 |
| T3 | T2 + 5 business days | Friday June 13 |

Note: Friday sends are unconventional. For these booth visitors, the "catching up before the weekend" framing arguably works better than Tuesday's "mass outreach day." Monitor open rates to validate or adjust for subsequent batches.

## T1 recap (locked, Tim-approved)

- Opens with prospect's operational reality
- One sentence on Inorsa described by outcome
- CTA: interest-based ("Is this the kind of problem you're dealing with?")
- P.S. with microsite link (for Full-tier microsites) or proof point (for Standard/no microsite)
- Under 80 words
- Structurally unique per prospect

## T2 design

### Core job

Deepen the insight. Add proof. Take a different angle on the same pain. Advance toward a meeting.

### T2 branching logic (based on T1 engagement signals)

**Signal source:** Supabase `sr_microsite_events` (page views, time on page, Calendly clicks) + HubSpot sequence engagement (opens, clicks) once wired.

| T1 signal | T2 approach | CTA |
|-----------|-------------|-----|
| **Viewed microsite, 30+ seconds** | Reference the microsite content. "The permit compression we outlined on the page maps directly to your [specific project]. One thing I didn't include..." | Soft time ask: "Would 20 minutes next week work to walk through how this applies to [project]?" |
| **Viewed microsite, clicked booking** | Direct scheduling assist. Skip the pitch entirely. | "Saw you were looking at times. Nathan has [specific slots] open this week." |
| **Opened email, didn't click microsite** | Different angle on same pain. Do NOT re-pitch what T1 said. Introduce the case study metric or a competitive pressure angle. | "Worth 20 minutes to see how this works?" |
| **Didn't open T1** | Completely different subject line. Lead with the strongest single fact from research. Treat as a fresh first touch. | Interest-based (same as T1 approach but different content) |
| **No microsite (HOLD prospects)** | Qualifying touch. Ask a diagnostic question that surfaces whether they're a fit. | "Are you handling [specific workflow] in-house or outsourced?" |

### T2 content per segment

| Segment | T1 opened with | T2 opens with (different angle) |
|---------|---------------|-------------------------------|
| **Fiber operators (BEAD-funded)** | Permitting timeline pressure | Cost of idle crews when drawings lag the construction schedule |
| **A&E firms (high volume)** | Throughput math (drawings vs headcount) | Margin erosion from rework cycles. "Every revision that goes back to drafting costs X hours at your billing rate." |
| **Construction contractors** | Field crew utilization | Multi-jurisdiction permit variability. "Same network, different paperwork per county." |
| **Rural co-ops** | Phase 2 expansion QC | BEAD compliance documentation requirements. "The reporting requirements on BEAD-funded builds are more stringent than RDOF." |

### T2 structural rules

- Each T2 must stand alone. Tim's rule: "Do not assume the reader saw the previous emails."
- Different subject line than T1. Do NOT use "Re:" prefix (Tim didn't object to Re: in earlier batches, but the research says follow-ups that feel like replies outperform formal follow-ups by ~30%. Test both.)
- Under 80 words
- P.S. line: re-link microsite if prospect didn't click in T1, or add a new proof point if they did
- No "Following up on my previous email" or any cross-touch assumption language
- One Inorsa sentence, different wording than T1
- CTA: soft time ask ("Would 20 minutes work?" not "Worth a look?")
- Signed same AE as T1

### T2 Inorsa sentences (rotate, don't repeat T1)

T1 might have used: "Inorsa catches the input conflicts that cause permit returns before drawings leave your team."

T2 options (pick a DIFFERENT one):
- "Inorsa validates design data before drawings are produced. Fewer returns, fewer timeline surprises."
- "Inorsa eliminates the upstream errors that create downstream rework."
- "One of our customers cut permit review from 3-4 weeks to 2 days by validating inputs before submission."
- "Inorsa sits between your design process and the jurisdiction. Problems get caught before they become kickbacks."

### T2 preview text (first ~50 characters)

The first sentence after the salutation must work as inbox preview. Examples per segment:
- Operator: "Every permit return across four regions costs..."
- A&E: "At your billing rate, each revision cycle..."
- Contractor: "Same fiber route, four different permit..."
- Co-op: "BEAD compliance documentation is more..."

## T3 design

### Core job

Close or release. Respect their time. Give two paths to yes (meeting OR Office Hours). Make it easy to say no.

### T3 structure (standardized by segment, not per-prospect)

T3 does NOT need to be insight-led or research-deep. It needs to be short, direct, and final.

**Template shape:**

```
[Name],

[One sentence summarizing the value in terms of their segment's pain.]

[Two options: 1:1 call or Office Hours.]

[AE signature]
```

### T3 by segment

**Fiber operators:**
```
[Name],

Permit-ready drawings that go through clean the first time. That is
what Inorsa does for fiber operators building at your scale.

Two options: a 20-minute call with [AE first name] to walk through
your workflow, or drop into our Wednesday Office Hours (noon ET,
Teams link below) to see a live demo alongside other operators.

[Which works better?]

[AE signature]
```

**A&E firms:**
```
[Name],

Fewer revision cycles, higher throughput, same headcount. That is the
math Inorsa changes for engineering firms at your volume.

Two options: a 20-minute call to run the numbers on your current
project mix, or join our Wednesday Office Hours (noon ET, Teams link
below) where we walk through a live design-to-permit workflow.

[Worth one of those?]

[AE signature]
```

**Construction contractors:**
```
[Name],

Permit-ready drawings that keep pace with your construction schedule
across multiple jurisdictions. That is where Inorsa fits.

Two options: a 20-minute call with [AE first name], or our Wednesday
Office Hours (noon ET, Teams link below) to see it in action.

[Either one work?]

[AE signature]
```

**Rural co-ops:**
```
[Name],

Clean permit packages on the first submission, regardless of which
engineering firm produces the designs. That is what Inorsa gives
network owners like [company].

Our Wednesday Office Hours (noon ET) are a low-commitment way to
see how it works. Or a 20-minute call if you prefer. Either works.

[AE signature]
```

### T3 rules

- Under 60 words (shorter than T1 and T2)
- No P.S. line
- No microsite link (if they haven't clicked by now, they won't)
- No research citations (the research already did its job in T1 and T2)
- Office Hours link: real Teams/Zoom URL (need from Inorsa once format is confirmed)
- Binary close: two positive options, not "yes or no"
- Each T3 must stand alone (Tim's rule still applies)
- Professional, respectful. Not desperate. The tone should communicate: "I've reached out twice with relevant information. Here's an easy way to engage if the timing is right. If not, no problem."

### T3 subject lines

Not cheeky. Not "Quick question." Professional and final.

Per segment:
- Operator: "Permit pipeline for [Company] — two ways to see it"
- A&E: "Engineering throughput at [Company] — quick options"
- Contractor: "Drawing-to-permit workflow — worth a look?"
- Co-op: "Inorsa for [Company] — low-commitment way to see it"

### T3 preview text

First sentence IS the preview. Each T3 opens with the one-sentence value summary, which naturally serves as the preheader.

## Microsite role across the sequence

| Touch | Microsite action |
|-------|-----------------|
| T1 | Link in P.S. Framed as "put together an overview." First exposure. |
| T2 (if viewed) | Reference it. "The overview I put together covers the basics. The call goes deeper into your specific [project/workflow]." |
| T2 (if not viewed) | Re-link in a different frame. "Pulled together a page on how this maps to [Company]: [link]" |
| T3 | Do not link. If they haven't engaged with the microsite by T3, another link won't change that. T3's job is to offer the lowest-friction engagement path (Office Hours). |

## Microsite updates between touches

If the prospect engages with the microsite (views it, spends time), we can update it before T2:
- Add a "Since we last connected" section with a new insight
- Swap the case study for one more relevant to their segment
- Add a video message from the AE (Loom, 30 seconds)

This makes the microsite feel alive, not static. The prospect returns and sees it's been updated — reinforces that a real person is behind this.

## What we measure

| Metric | Source | What it tells us |
|--------|--------|-----------------|
| T1 open rate | HubSpot | Subject line effectiveness |
| T1 reply rate | HubSpot | Email body + CTA effectiveness |
| Microsite view rate | Supabase | P.S. link + framing effectiveness |
| Microsite time on page | Supabase | Content relevance |
| Microsite Calendly clicks | Supabase | Intent signal strength |
| T2 open rate | HubSpot | Subject line + branching effectiveness |
| T2 reply rate | HubSpot | Whether the different angle worked |
| T3 reply rate | HubSpot | Binary close + Office Hours conversion |
| Meetings booked | HubSpot + Calendly | THE metric. Everything else is diagnostic. |

## What we defer to next show

- Subject line A/B testing (sample size too small this pilot)
- Per-contact send time optimization (need response data first)
- LinkedIn touchpoints coordinated with email (adds complexity without proven lift for this audience)
- Direct mail integration (high-impact but adds 2 weeks of lead time)
- Display ad retargeting for microsite visitors (overkill for 47 prospects)

## Decision log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| T2 branching | Yes, based on microsite engagement | We have the tracking data. Simple branch: viewed vs. not viewed. |
| T3 standardization | By segment, not per-prospect | T3's job is to close, not to demonstrate research depth. 4 segment templates are sufficient. |
| Office Hours in T3 | Yes, as alternative to 1:1 | Gives a second path to yes. Lower friction for prospects who won't commit to a 1:1 but might drop into a group session. |
| Microsite in T1 only | Link in T1 P.S., reference in T2 if viewed, skip in T3 | Diminishing returns on re-linking. If they haven't clicked by T3, the microsite isn't the conversion mechanism. |
| Preview text | Craft T1/T2 opening lines knowing they double as preheader | No separate preheader needed for HubSpot sequences. The first sentence after the salutation IS the preview. |

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-05-29 01:00 | Claude | Initial framework. T2 branching logic, T3 segment templates, microsite role, measurement plan. DRAFT status — sleep on before executing. |
