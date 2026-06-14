---
title: Email Finder of Last Resort — Specification
status: DRAFT
last_updated: 2026-06-08 00:32 EDT
version: v1
---

# Email Finder of Last Resort

## Problem Statement

The ShowRev pipeline rejects prospects when email discovery confidence is too low to send (score < 40, color = red, `canSend = false`). These rejects fall into three categories:

1. **No email found** — Apollo returned nothing, domain resolution failed, no pattern detected
2. **Low confidence** — email was derived via pattern guess or catch-all domain, but no verification passed
3. **MV bad** — MillionVerifier flagged the address as bad/disposable

The current pipeline exhausts these tactics before giving up:
- Apollo People Match (primary or fallback)
- Domain resolution (Clearbit Autocomplete, web search, FCC filings, subsidiary/DBA detection)
- MX-based domain validation + alternative domain discovery
- Pattern detection (web scraping for published emails, pattern inference from found emails)
- Candidate generation (10 patterns: first.last, flast, firstl, first, etc.)
- SMTP RCPT TO verification (self-hosted) or Autodiscover elimination (M365/Google)
- MillionVerifier quality check

**The gap:** When all of the above fail, the prospect is silently dropped. There is no second-pass mechanism, no escalation path, and no visibility into *why* it failed or *what else* could be tried.

**This component fills that gap.** It runs *after* a batch completes, is invoked per-prospect from the Operator Portal, and throws every remaining tactic at the problem — including tactics that are too slow, too expensive, or too risky for the main pipeline's per-prospect time budget (~60s).

## Architecture

```
Operator Portal
    │
    ▼
[Retry Queue]  ← prospects with confidence_color = 'red' or email = null
    │
    ▼
[Last Resort Orchestrator]
    │
    ├─ Tier 1: Low-cost, fast (< 10s each)
    │   ├─ Google dorking
    │   ├─ Company website scraping (team/about/leadership)
    │   ├─ Multi-domain detection (subsidiary brands)
    │   └─ Extended pattern generation + SMTP verify
    │
    ├─ Tier 2: Medium-cost, slower (10-60s each)
    │   ├─ Press release mining
    │   ├─ Conference speaker list search
    │   ├─ Wayback Machine archived team pages
    │   └─ GitHub/GitLab profile search
    │
    ├─ Tier 3: Expensive or niche (60s+ each)
    │   ├─ SEC/EDGAR filing search
    │   ├─ Patent filing search
    │   └─ Catch-all domain exploitation (deep verification)
    │
    └─ [Confidence Re-evaluation]
        │
        └─ Update sr_prospects + sr_engine_output
            │
            └─ Portal shows updated status
```

### Design Principles

1. **Standalone module** — not wired into the main pipeline. Invoked separately.
2. **Progressive escalation** — Tier 1 tactics run first. If they succeed, skip Tier 2/3.
3. **Operator-initiated** — no automatic retry. Operator selects specific rejects to retry.
4. **Transparent** — every tactic attempted, every result, every confidence change is logged and visible in the Portal.
5. **Time-budgeted** — operator sets a max time (default 5 min per prospect). Tactics abort cleanly on timeout.

## Tactics

### Tier 1: Low-Cost, Fast

#### T1-1: Google Dorking
**What:** Targeted search queries that find published email addresses.
**Queries:**
- `site:{domain} "{firstName}" email OR mailto:`
- `"{firstName} {lastName}" "{company}" email`
- `"{firstName} {lastName}" @{domain}`
- `site:{domain} team OR about OR leadership OR staff OR contact`

**How:** Use existing `searchFn` (DuckDuckGo). Parse results for email-pattern regex matches. Cross-reference any found email against the target name.

**Confidence boost:** Found email matching name → +50 (pattern-derived). Found email at same domain but different person → enables pattern detection for the domain.

**Effort:** 4 hours. Mostly prompt engineering for query generation + result parsing.
**Legal:** Standard web search. No scraping ToS concerns. Public information.

#### T1-2: Company Website Scraping
**What:** Fetch the company's /team, /about, /leadership, /staff, /our-team, /people, /contact pages and extract email addresses and names.
**How:** Resolve company URL (already available from domain resolution). Fetch common paths. Parse HTML for `mailto:` links, plaintext email patterns, and hCard/vCard structured data.
**Paths to try:** `/team`, `/about`, `/about-us`, `/leadership`, `/our-team`, `/staff`, `/people`, `/contact`, `/contact-us`, `/directory`

**Confidence boost:** Email found on official company page with matching name → +70 (provided-equivalent). Email found but name doesn't match → enables pattern inference.

**Effort:** 6 hours. HTML parsing, path enumeration, name-matching logic.
**Legal:** Public company websites. Respect robots.txt. Rate limit to 1 req/s per domain.

#### T1-3: Multi-Domain Detection
**What:** Detect subsidiary/brand domains that may host the prospect's email, beyond what MX analysis already catches.
**How:**
- Search `"{company}" site:linkedin.com/company` → extract domain from company page
- Search `"{company}" subsidiary OR "a division of" OR "formerly"` → extract parent/related companies
- Check if company has multiple TLDs (.com, .net, .io, .us)
- Cross-reference with Apollo organization data if available

**Confidence boost:** New domain found → re-run full candidate generation + SMTP verify on new domain.

**Effort:** 4 hours. Extends existing `alternativeDomains` logic in the orchestrator.
**Legal:** Public web search. No concerns.

#### T1-4: Extended Pattern Generation + SMTP Verify
**What:** Generate additional candidate patterns beyond the standard 10, including:
- Nickname variants (Bill/William, Rob/Robert, Mike/Michael — already partially implemented)
- Middle initial variants if available (first.m.last@, fmlast@)
- Hyphenated last name variants (first.lastname vs first.last-name)
- Department-based patterns (engineering@, sales@, info@ → then find forwarding)

**How:** Extended `generateCandidates()` with broader pattern set, then run through SMTP/Autodiscover verify.

**Confidence boost:** Same as existing verification pipeline.

**Effort:** 3 hours. Extends existing pattern-detector.ts.
**Legal:** SMTP probing at higher volume may trigger rate limits. Existing per-call timeouts and backoff apply.

### Tier 2: Medium-Cost, Slower

#### T2-1: Press Release Mining
**What:** Search PRWeb, BusinessWire, GlobeNewswire, PR Newswire for press releases from the company that contain contact email addresses.
**Queries:**
- `site:prnewswire.com "{company}"`
- `site:businesswire.com "{company}"`
- `site:globenewswire.com "{company}"`

**How:** Fetch top 3 results per source. Parse for media contact emails. These are often generic (media@, pr@) but sometimes include executive emails. If found, use the domain for pattern detection and the email pattern for candidate generation.

**Confidence boost:** PR contact email at company domain → enables accurate pattern detection. Direct match → +60.

**Effort:** 5 hours. Multi-source search + parsing.
**Legal:** Public press releases. Standard web scraping. No concerns.

#### T2-2: Conference Speaker List Search
**What:** Search for the prospect as a conference speaker (fiber industry events publish speaker bios with contact info).
**Queries:**
- `"{firstName} {lastName}" "{company}" speaker OR panelist OR presenter`
- `"{firstName} {lastName}" "Fiber Connect" OR "ISE Expo" OR "NTCA" OR "Broadband Communities"`

**How:** Fiber telecom conferences are a rich source because our ICP companies regularly present. Speaker bio pages often include professional emails.

**Confidence boost:** Speaker bio with email → +65 (public, professional context). Speaker bio with LinkedIn but no email → enables LinkedIn correlation (see T3 limitations).

**Effort:** 4 hours. Industry-specific query tuning + bio page parsing.
**Legal:** Public conference information. No concerns.

#### T2-3: Wayback Machine Archived Team Pages
**What:** If the company website's current /team page doesn't list emails (or the page was removed), check archived versions via the Wayback Machine CDX API.
**How:**
- Query `https://web.archive.org/cdx/search/cdx?url={domain}/team*&output=json&limit=5&fl=timestamp,original`
- Fetch the most recent archived snapshot of team/about/leadership pages
- Parse for emails that may have been removed from the current site

**Confidence boost:** Archived email for matching person → +55 (was public, may be stale). Flag as "historical — verify before sending."

**Effort:** 4 hours. Wayback CDX API integration + snapshot fetching.
**Legal:** Internet Archive is public. However, emails found in archives may be outdated. Always verify via SMTP before using. Flag to operator as "historical source."

#### T2-4: GitHub/GitLab Profile Search
**What:** For technical contacts (CTO, VP Engineering, Director of IT), search GitHub/GitLab for public email addresses in profiles or commit history.
**How:**
- GitHub API: `GET /search/users?q={firstName}+{lastName}+{company}`
- Check profile `email` field and `blog` field
- For top match, check recent commit emails via `GET /users/{username}/events`

**Confidence boost:** GitHub profile email matching company domain → +60. Commit email → +50 (may be personal).

**Effort:** 5 hours. GitHub API integration, commit email extraction.
**Legal:** Public GitHub profiles and commits. GitHub API rate limit: 10 req/min unauthenticated, 30 req/min with token. **Note:** Some developers consider commit email scraping intrusive even though it's public. Use only for technical roles. Do not scrape personal email addresses.

### Tier 3: Expensive or Niche

#### T3-1: SEC/EDGAR Filing Search
**What:** Search SEC EDGAR for company filings (10-K, 10-Q, 8-K, DEF 14A proxy statements) that may contain executive email addresses.
**How:**
- EDGAR EFTS full-text search: `https://efts.sec.gov/LATEST/search-index?q="{company}"&dateRange=custom&startdt=2024-01-01`
- Parse filing HTML for email patterns
- Proxy statements (DEF 14A) are highest-value — they often list contact info for named executives

**Applicability:** Only useful for publicly traded companies or companies that have filed with the SEC. Most fiber operators in our ICP are private. However, large players (Lumen, Frontier, Charter, Consolidated Communications) do file.

**Confidence boost:** Email in SEC filing → +70 (legal document, high trust).

**Effort:** 6 hours. EDGAR API integration + filing parser.
**Legal:** Public government records. EDGAR has a 10 req/s rate limit (respect it). No legal concerns with reading public filings.

#### T3-2: Patent Filing Search
**What:** Search USPTO/Google Patents for patents filed by the prospect, which list inventor contact details.
**How:**
- Google Patents: `https://patents.google.com/?inventor={firstName}+{lastName}&assignee={company}`
- USPTO PatentsView API: `https://api.patentsview.org/inventors/query?q={"_and":[{"inventor_first_name":"{firstName}"},{"inventor_last_name":"{lastName}"}]}`

**Applicability:** Only useful for technical executives at companies that file patents. Limited for fiber construction/operations, but relevant for technology companies in the space (Render Networks, Biarri, IQGeo, etc.).

**Confidence boost:** Patent with inventor email → +60. Patent confirms person-company association → enables more targeted web search.

**Effort:** 4 hours. Google Patents scraping + PatentsView API.
**Legal:** Public government records. No concerns.

#### T3-3: Catch-All Domain Deep Verification
**What:** For domains that accept all addresses (catch-all), use advanced verification to narrow down the actual address.
**How:**
- Send a verification email to each top-3 candidate pattern with a tracking pixel or unique link
- The one that triggers engagement (open/click) is the real address
- Alternative: use Findymail or ZeroBounce "catch-all resolver" API endpoint

**Applicability:** Only for confirmed catch-all domains where SMTP returns 250 for everything.

**Confidence boost:** Catch-all resolved → +40 to +70 depending on method.

**Effort:** 8 hours for full implementation. 2 hours if using a paid API (Findymail catch-all resolver).
**Legal:** **CAUTION.** Sending verification emails to guessed addresses without consent may violate CAN-SPAM (commercial email to unverified addresses) and GDPR (processing personal data without basis). **Recommendation: Use Findymail's catch-all resolver API only. Do NOT send test emails to unverified addresses.** The API-based approach is compliant because it uses header-level verification, not message delivery.

## Tactics NOT Included

### Social Media Profile Correlation (LinkedIn, Twitter)
**Why excluded:** LinkedIn scraping violates their ToS and risks account bans. We use LinkedIn for research only via Chrome Extension (rate limited, 15 profiles/session). Twitter/X bios rarely contain professional emails for B2B executives. The risk/reward ratio is poor.

**Alternative:** If the operator identifies a prospect's LinkedIn profile during manual review, they can add any found email manually via the Portal.

## Confidence Scoring Model

The Last Resort component uses the same `evaluateConfidence()` function from `confidence-gate.ts`, but with additional source mappings:

| Source | Base Score | Rationale |
|--------|-----------|-----------|
| Company website team page (name match) | 75 | Official company page, likely current |
| SEC/EDGAR filing | 70 | Legal document, high trust |
| Conference speaker bio | 65 | Professional context, may be dated |
| GitHub profile (company domain) | 60 | Public, professional |
| Press release contact | 60 | Media contact, may be generic |
| Wayback Machine archive | 55 | Was public, may be stale |
| Patent filing | 55 | Government record, may be dated |
| Google dork result | 50 | Unstructured, needs verification |
| GitHub commit email | 50 | Public but may be personal |
| Extended pattern + SMTP verify | Same as existing pipeline | Follows current verification logic |
| Catch-all API resolution | 45 | Probabilistic, not deterministic |

All scores are further adjusted by:
- MillionVerifier quality (+20 good, -60 bad, -10 catch-all)
- Domain mismatch (-15)
- Staleness penalty: sources older than 2 years get -10

## Integration with Existing Pipeline

### Data Flow

```
sr_engine_output (confidence_color = 'red' OR email IS NULL)
    │
    ▼
[Operator Portal: "Retry Email Discovery" button]
    │
    ▼
[Last Resort Orchestrator]
    │
    ▼
sr_prospects (updated email, confidence_score, confidence_color)
sr_engine_output (updated email, email_confidence, last_resort_tactics, last_resort_log)
    │
    ▼
[If confidence now >= 40 (yellow/green)]
    │
    ▼
[Re-enter pipeline at Phase 5 (Pattern Selection) with existing research]
```

### New Database Columns

Add to `sr_engine_output`:
- `last_resort_attempted` (boolean, default false)
- `last_resort_tactics` (text[] — list of tactics tried)
- `last_resort_log` (jsonb — detailed per-tactic results)
- `last_resort_at` (timestamptz)

### API Endpoint

```
POST /api/last-resort
Body: { prospect_id: string, max_time_seconds?: number, tiers?: number[] }
Response: { 
  email: string | null, 
  confidence: { score: number, color: string, canSend: boolean },
  tactics_attempted: string[],
  tactics_succeeded: string[],
  duration_ms: number,
  log: object[]
}
```

## Portal UI

### Reject Queue View

On the batch results page, rejected prospects show a "Retry Discovery" button. The operator can:

1. **Select individual prospects** to retry
2. **Select all rejects** from a batch
3. **Set tier limit** (1 = fast only, 2 = include medium, 3 = include expensive)
4. **Set time budget** per prospect (default 5 min)
5. **View progress** as tactics execute (streaming updates)

### Per-Prospect Detail

After Last Resort runs, the prospect detail page shows:

```
Email Discovery: Last Resort Attempted
─────────────────────────────────────────
Original Pipeline:  not-found (score: 0)
Last Resort:        chad.mueller@omnifiber.com (score: 75, green)
                    Source: Company website /team page
                    
Tactics Attempted (6):
  ✓ Google dork: found 2 emails at omnifiber.com
  ✓ Company website /about: found chad.mueller@omnifiber.com  
  ○ Press releases: 0 results
  ○ Conference speakers: 0 results
  — Wayback Machine: skipped (Tier 2 not needed)
  — SEC/EDGAR: skipped (Tier 3 not needed)

Time: 12.3s | Stopped at Tier 1 (success)
```

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Recovery rate | 30-50% of rejects upgraded to yellow/green | Count of prospects that move from red/not-found to sendable |
| Accuracy | < 5% bounce rate on recovered emails | Track bounces on Last Resort emails vs pipeline emails |
| Time per prospect | < 5 min average | Telemetry |
| Operator effort | < 30s to initiate retry for a batch | Portal UX timing |
| Cost per recovery | < $0.50 in API calls | Track API costs per tactic |

## Build Effort Estimate

| Component | Effort |
|-----------|--------|
| Core orchestrator (tier routing, timeout, logging) | 8 hours |
| Tier 1 tactics (4 tactics) | 17 hours |
| Tier 2 tactics (4 tactics) | 18 hours |
| Tier 3 tactics (3 tactics) | 18 hours |
| Confidence re-evaluation + pipeline re-entry | 4 hours |
| Database schema changes | 2 hours |
| Portal UI (retry queue + detail view) | 10 hours |
| Testing + edge cases | 8 hours |
| **Total** | **~85 hours** |

### Recommended Phased Build

**Phase A (MVP, ~25 hours):** Core orchestrator + Tier 1 tactics + confidence re-eval + basic Portal button. Delivers ~20-30% of the total recovery potential at ~30% of the cost.

**Phase B (+30 hours):** Tier 2 tactics + Portal detail view + streaming progress. Covers the middle ground.

**Phase C (+30 hours):** Tier 3 tactics + catch-all API integration + full metrics. Diminishing returns but covers edge cases.

**Recommendation:** Build Phase A first. Measure recovery rate on 20 rejects. If < 20%, proceed to Phase B. If Phase A alone hits 30%+, defer B/C.

## Compliance Notes

| Tactic | Risk Level | Notes |
|--------|-----------|-------|
| Google dorking | Low | Public search results |
| Company website scraping | Low | Public pages, respect robots.txt |
| Multi-domain detection | Low | Public search results |
| Extended pattern + SMTP | Low-Medium | Higher SMTP volume may trigger blocks |
| Press release mining | Low | Public news distribution |
| Conference speaker lists | Low | Public event information |
| Wayback Machine | Low | Public archive, but emails may be stale |
| GitHub profiles | Low-Medium | Public but some consider commit email scraping intrusive |
| SEC/EDGAR | Low | Public government records |
| Patent filings | Low | Public government records |
| Catch-all deep verify (API) | Low | Using paid API, not sending test emails |
| Catch-all deep verify (test email) | **High** | **DO NOT BUILD.** CAN-SPAM and GDPR risk. |
| LinkedIn scraping | **High** | **EXCLUDED.** ToS violation, account ban risk. |

## Dependencies

- Existing `searchFn` (DuckDuckGo) for web searches
- Existing `fetchFn` for HTML fetching
- Existing SMTP/Autodiscover verification
- MillionVerifier API (existing integration)
- Findymail API (existing integration, for catch-all resolution)
- GitHub API token (new, optional — for Tier 2 GitHub tactic)
- Supabase schema migration for new columns
- Portal route + component (showrev-microsites repo)

## Open Questions

1. Should Last Resort run automatically for all rejects in a batch, or always be operator-initiated?
2. Should recovered emails bypass the judge gate or re-enter at Phase 5?
3. Should we track Last Resort recovery rates separately from pipeline rates for OKR measurement?
4. Is Findymail's catch-all resolver worth the per-query cost, or should we build our own elimination logic?

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-08 00:32 | Claude | Initial spec from pipeline audit findings. 11 tactics across 3 tiers, 1 excluded (LinkedIn). |
