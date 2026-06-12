---
title: Fresh Session Prompt — pick up from exhausted 9-hour session
date: 2026-06-12 03:10 EST
purpose: Hand off cleanly to a fresh Claude session. No context loss, no panic, full strategic clarity.
authored_by: Claude (Opus 4.7) at end of session, after operator-requested red team
---

# Copy-paste prompt for fresh session

Paste everything between the `===` lines as your first message to the fresh Claude session.

```
===

Hey — picking up from a 9-hour session that ended at ~3am ET. Previous Claude
(Opus 4.7) handed off cleanly with full red-teamed documentation. You are NOT
in a panic. Tomorrow morning's smoke is already locked and safe to fire. Your
job is fresh strategic thinking + judge panel orchestration + Saturday's
substrate rebuild planning — NOT to redo the tactical work.

## Read these first, IN THIS ORDER (45 min total)

1. docs/showrev/HANDOFF-2026-06-12-FRESH-SESSION.md (~15 min)
   The tactical handoff. Tells you what's locked for tomorrow's smoke
   (18 HubSpot contacts, 6 sequences, 3 lists, AE morning email drafts ready).
   Includes operator-requested red team findings: 1 real issue caught and
   fixed (Zack Burnes' subject mismatch), 5 blow-up risks flagged for
   monitoring, 4 gaps that red team did NOT cover.

2. docs/showrev/COLD-PROSPECTING-FIRST-PRINCIPLES-2026-06-12.md (~25 min)
   The strategic synthesis. 584 lines. Covers:
   - What we built tonight + what we trust
   - The Trust Tier Framework (T0-T7 + PROHIBITED) for source classification
   - 7 root cause failure modes in current substrate pipeline
   - Elite cold prospecting principles (target: top 0.01% B2B SaaS AEs)
   - Proposed 5-layer rewrite (substrate → composer → send → learn)
   - Database schema changes + composer state machine pseudocode
   - Preliminary OKRs
   - 8 open questions for the judge panel

3. https://code.claude.com/docs/en/changelog (~5 min)
   Operator-flagged: check the Claude Code changelog for new capabilities
   that may apply. Look specifically for:
   - New verification / fact-checking tools
   - Background research / long-running task patterns
   - New agent coordination primitives
   - Anything relevant to substrate verification or composer architecture

## After reading, your first 4 actions

ACTION 1 — Verify tomorrow's smoke is still solid (~5 min)
Run this from the ruflo repo:

  set -a; source src/showrev/.env; set +a
  python3 << 'PYEOF'
  import urllib.request, json, os
  hs = os.environ['HUBSPOT_PRIVATE_APP_TOKEN']
  CONTACTS = {
      'Michele Sadwick': '500590375639',
      'Zack Burnes': '500586810074',
      'Gabriel Gilliland': '500603489979',
      'Ben Lewis-Ramirez': '500591262450',
      'Jesus Loya': '500601728717',
  }
  for name, cid in CONTACTS.items():
      url = f"https://api.hubapi.com/crm/v3/objects/contacts/{cid}?properties=showrev_pre_show_t1_subject,showrev_pre_show_t1_para1"
      req = urllib.request.Request(url, headers={'Authorization': f'Bearer {hs}'})
      d = json.loads(urllib.request.urlopen(req).read())
      p = d.get('properties', {})
      print(f'\n{name}:')
      print(f'  Subject: {p.get("showrev_pre_show_t1_subject")}')
      print(f'  P1: {(p.get("showrev_pre_show_t1_para1") or "")[:150]}')
  PYEOF

Confirms the 5 strip-recomposed bodies are intact. Expected output:
- Michele: "Greenlight Networks' 2026 build pace" / "aggressive expansion through T-Mobile/Oak Hill JV"
- Zack: "BEAD build cycle, drawings keeping pace?" / "fiber supply distributors riding this BEAD-driven build cycle"
- Gabriel: BEAD timeline subject / "BRMEMC Fiber's buildout into the final stretch"
- Ben: "Vistal expansion..." / "Vistal rebrand signals a fresh growth strategy at CNE"
- Jesus: "PC Telcom drawings keeping pace?" / "PC Telcom — a member-owned cooperative covering northeast Colorado and Chappell, Nebraska"

If anything's missing → previous session's HS updates didn't persist. Investigate
before AE enrollment.

ACTION 2 — Pull Ruflo open source updates (~10 min)
Operator mentioned: "we need to download new updates from Ruvent/Ruflo open
source — he added some stuff that could be very helpful."

  cd ~/Documents/GitHub/ruflo
  git fetch --all
  git log --oneline HEAD..origin/main | head -30
  # Or check the upstream Ruflo repo: https://github.com/ruvnet/claude-flow

Look for new substrate verification primitives, composer architecture patterns,
trust tier reference implementations, agent coordination updates.

Note: this repo IS Ruflo (cloned + customized). The upstream is at
https://github.com/ruvnet/claude-flow. Check what's new there.

ACTION 3 — Invoke the external judge panel (~60-90 min)
Per synthesis doc Section 6, send to 4 models in parallel:
- Gemini Deep Research (via gemini-verify.py pattern in showrev/engine/scripts)
- GPT-5 (via cross-model-judge-gpt.py if exists, else build it)
- Grok (xAI API, $XAI_API_KEY env)
- DeepSeek (DeepSeek API, $DEEPSEEK_API_KEY env)

The judge prompt is in Section 6 of synthesis doc. The synthesis doc itself
is the input. Expected return: 30-90 min per model.

Save outputs to /tmp/judge-panel-{model}-2026-06-12.md and the merged synthesis
will be the basis for the Saturday architecture v2 decisions.

ACTION 4 — Draft "Saturday architecture v2" doc (~60 min)
After judge feedback synthesizes, produce:
- docs/showrev/COLD-PROSPECTING-ARCHITECTURE-V2-2026-06-12.md
- Database schema (sr_company_evidence + ALTER for tier columns, sr_claim_verifications table, sr_prohibited_sources table)
- Composer state machine spec (substrate-strict mode)
- Migration plan from current substrate to tiered substrate
- OKR v2 (refined from synthesis Section 7)

This becomes the spec the team builds Saturday morning when operator wakes up.

## What you should NOT do

- DO NOT make architectural decisions on partial sleep
- DO NOT change tomorrow morning's smoke roster (locked)
- DO NOT redo the substrate citation audit (already done — see /tmp/citation-audit-15-v2.json)
- DO NOT strip-recompose more emails (5 already done — Michele/Gabriel/Zack/Ben/Jesus)
- DO NOT enroll prospects via API tonight (operator wants manual AE enrollment tomorrow morning for first smoke — confidence-building)
- DO NOT mark this work "done" — Saturday architecture rebuild is the real product

## When operator wakes up at 7am ET

Operator will:
1. Read your status update (what you accomplished overnight)
2. Send 3 AE morning emails (drafts already in handoff doc, copy-paste ready)
3. Watch HS sequence stats at 8-10am ET
4. Check their Gmail at 9-10am for 3 dummy emails from Mike/Nathan/Lucas
5. Decide Saturday session strategy based on judge panel feedback you assemble

## Operator's stated goal

"Better cold prospecting than the top 0.01% of B2B SaaS AEs."

Translation: 15-25% reply rate, 3-6% meeting rate, sustainable over 800+
prospects without trust degradation, brain function actively learning from
outcome data.

We have most of the mechanical pieces (attendee list, MV, DNS, HS sequences,
bounce monitor, watcher, send-cap). What's missing is the trust-tiered
substrate verification + composer state machine. That's Saturday's build.

## Operator's tone preferences (calibrated over the session)

- Direct over polite
- Honest about uncertainty over confident-sounding speculation
- Push back when their direction conflicts with first principles
- Acknowledge corrections immediately when they catch you wrong
- "Take your time" + "think in first principles" — they prefer thoughtful over fast
- Operator authority: when they say "the attendee list IS the ground truth",
  trust that instantly — don't re-litigate
- No emojis unless they use them first

## Anti-patterns to avoid

- DO NOT call any persona "synthetic" — they're on the attendee list, real per
  self-attestation
- DO NOT cite ZoomInfo, LeadIQ, Apollo, RocketReach, Prospeo, Hunter, Lusha,
  Cleanlist, ContactOut, Mailmo, Snov, Kaspr, Cognism, Seamless.ai, Datanyze,
  or SalezShark as primary sources — PROHIBITED
- DO NOT trust LLM-generated citations without URL verification
- DO NOT extrapolate from "Gemini couldn't find them" to "they don't exist"
- DO NOT promise "easy fix" on substrate quality — it's a Saturday rebuild
- DO NOT mark verification done without `sr_claim_verifications` row with VERIFIED status + recent timestamp

## Resources

- This handoff: docs/showrev/HANDOFF-2026-06-12-FRESH-SESSION.md (v2 with red team)
- Strategic synthesis: docs/showrev/COLD-PROSPECTING-FIRST-PRINCIPLES-2026-06-12.md
- Substrate audit scripts: scripts/audit-15-citations-v2.py
- Strip-recompose tooling: scripts/strip-recompose-5.py
- Gemini Deep Research script: ~/Documents/GitHub/showrev/engine/scripts/gemini-verify.py
- Trust tier domain blocklist: scripts/audit-15-citations-v2.py PROHIBITED_DOMAINS
- Cross-model judge scripts: ~/Documents/GitHub/showrev/engine/scripts/ (gemini-stranger-judge.py, cross-model-judge-gemini.py)
- Memory: ~/.claude/projects/-Users-justynszymczyk-Documents-GitHub-ruflo/memory/
- Repo CLAUDE.md: /Users/justynszymczyk/Documents/CLAUDE.md (project context)

## What success looks like for your shift

Operator wakes up to:
1. Verification that tomorrow's smoke is still solid
2. Ruflo open source updates pulled + summary of what's new
3. Judge panel feedback compiled (4 model perspectives)
4. Saturday architecture v2 doc ready for review
5. Maybe: morning sanity check script for the smoke

If you finish all 4 by 6am ET, great. If you finish 1-2, also great —
strategic depth beats tactical breadth here.

## Final wisdom from previous Claude

The operator's wisest move in our 9-hour session was hitting the brakes when
we were chasing our tail. Their question that broke everything open was:

  "why does the composer need to be so specific as to explicitly say
   '334k passings/quarter' when it could just say something more general."

That reframed the entire problem from "personalization quality" to "trust
architecture." Most substrate failures are actually trust failures —
unverifiable specifics that don't pass the recipient's gut check in 3 seconds.

The composer should default to industry framing. Specifics earn their way in
via trust tier + verification gate. That's the v2 architecture in one sentence.

Good luck. Get some thinking time in. Operator earned a clean handoff and is
running on fumes. You're the bridge to the rebuild that fixes this at the
foundation.

===
```

# Why this prompt structure

The prompt is intentionally long because:

1. **Tactical context first** — fresh session needs to know smoke is locked BEFORE thinking strategy
2. **Reading order matters** — handoff first (concrete) then synthesis (strategic) then Claude changelog (capabilities)
3. **First 4 actions explicit** — no decision fatigue at 3am
4. **Anti-patterns listed** — saves fresh session from re-discovering tonight's mistakes
5. **Operator tone calibration** — preserves the working relationship we built
6. **No emojis** — operator hasn't used them; respect their style
7. **Direct authority signals** — "DO NOT" used sparingly but explicitly where it matters
8. **Resources at end** — easy to scan when actually working

# Adjustments to make if you customize

- If operator wants the fresh session to ALSO ship code Saturday, add an ACTION 5
- If operator wants you to NOT invoke judge panel (cost concern), remove ACTION 3
- If operator wants Fable 5 dual-path, add ACTION 6 to spawn parallel Fable session

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-12 03:10 EST | Claude (Opus 4.7) | Initial fresh-session prompt. Designed to bridge exhausted handoff → fresh strategic work. |
