---
title: Email Finder Council Synthesis
status: ACTIVE
last_updated: 2026-06-04 13:30 EST
version: v1
---

# Email Finder Council — Cross-Model Synthesis

**Models consulted:** Gemini 2.5 Pro, GPT-4o, Grok-3-Mini, DeepSeek-Chat
**Existing system:** Findymail + Apollo + ZeroBounce cascade (all paid)
**Existing hit rate:** ~60% on P1 booth cohort. 24 contacts left at 0.55 confidence (pattern-guess only, no verification).

---

## 1. Consensus Techniques (All or Most Models Agree)

These are high-confidence — every model independently recommended them.

### C1. Domain Discovery via Google/DuckDuckGo Scraping + DNS MX Validation
**Agreed by:** All 4 models
**Technique:** Search `"{company name}" official website` or `"{company name}" email`, extract the top result URL, validate with DNS MX lookup. If MX records exist, the domain can receive email.
**Gap it fills:** The existing system relies on Findymail/Apollo for domain resolution. These fail on small regional ISPs not in their databases. Web scraping finds ANY company with a website.
**Unresolved contacts it would catch:** Most of the 24 — Axon Fiber, Go-Broadband, Glass Utility Engineering, Bonfire, Luminate Broadband etc. all have websites. Domain discovery wasn't the gap for these; pattern verification was.

### C2. Pattern Detection via Website/PDF/Public Email Scraping
**Agreed by:** All 4 models
**Technique:** Scrape `/contact`, `/team`, `/about`, `/leadership` pages + public PDFs for any `@domain` email addresses. Infer the pattern (first.last, flast, etc.) from observed examples.
**Gap it fills:** The existing system generates pattern guesses but has no way to detect which pattern a company actually uses. If the system found even ONE email from Axon Fiber's site, it could infer the pattern for all Axon contacts.
**Unresolved contacts:** High value for multi-contact companies (Axon Fiber has 2, Go-Broadband has 4, Glass Utility has 2, Choptank Fiber has 2). One discovered email patterns the rest.

### C3. SMTP RCPT TO Verification
**Agreed by:** All 4 models
**Technique:** Connect to the MX server on port 25, issue HELO/MAIL FROM/RCPT TO. A 550 response = email doesn't exist. A 250 = accepted (valid or catch-all).
**What works in 2026:** Self-hosted mail servers (Postfix, Exim) — very common in small fiber companies. Google Workspace gives accurate 550 for invalid users. Microsoft 365 is less reliable (sometimes accepts everything).
**Gap it fills:** The existing system uses ZeroBounce ($0.01/check, credits ran out at 13 remaining). Self-hosted RCPT TO is free and unlimited.
**Unresolved contacts:** Would resolve most of the 24 if combined with pattern generation. Small fiber ISPs (Axon Fiber, Go-Broadband, Bonfire, Luminate) often run self-hosted mail.

### C4. Catch-All Detection via Gibberish Probe
**Agreed by:** All 4 models
**Technique:** Before testing real candidates, send RCPT TO for a clearly fake address (`xz7q9k_invalid@domain`). If the server returns 250, it's catch-all — SMTP verification is useless for that domain.
**Gap it fills:** The existing system marks ZeroBounce "accept_all" as YELLOW but doesn't detect catch-all independently. Self-hosted detection eliminates the need to spend ZeroBounce credits on catch-all detection.
**Unresolved contacts:** Dakota Carrier Network (Seth Arndorfer) was YELLOW/catch-all. This technique would have classified it correctly without ZeroBounce.

### C5. SPF/DKIM DNS Record Analysis for Provider Detection
**Agreed by:** All 4 models
**Technique:** Query DNS TXT records for SPF (`v=spf1 include:...`). The `include:` directives reveal the mail provider: `_spf.google.com` = Google Workspace, `spf.protection.outlook.com` = Microsoft 365, custom = self-hosted. This tells you which SMTP verification strategy to use before connecting.
**Gap it fills:** The existing system doesn't fingerprint the mail provider. Knowing the provider determines whether RCPT TO will work or if you need alternative approaches.

### C6. Name Normalization + 6-8 Pattern Candidate Generation
**Agreed by:** All 4 models
**Technique:** Generate candidates in priority order: first.last, flast, firstl, first, f.last, first_last, last.first, first.l. All models agree on roughly the same set.
**Gap it fills:** The existing `_construct_email_candidates()` function already does this (8 patterns). The existing implementation is solid here — no gap.

### C7. GitHub Commit Search for Email Discovery
**Agreed by:** 3 of 4 (Grok, DeepSeek, GPT)
**Technique:** Search GitHub API for `commit author:"{first} {last}" "@{domain}"`. Public commits often contain the committer's corporate email. Free API, no key needed for basic search.
**Gap it fills:** Novel source not used by the existing system. Unlikely to work for most fiber telecom contacts (not a developer-heavy industry), but cheap to try.

---

## 2. Unique/Novel Ideas (From Individual Models)

### N1. Gravatar MD5 Probing (Gemini)
**Technique:** Hash the candidate email with MD5, query `gravatar.com/avatar/{hash}?d=404`. A 200 response means someone registered that email on Gravatar — strong positive signal.
**Assessment:** Low hit rate for B2B fiber telecom (these aren't WordPress/tech people), but zero cost and zero risk. Worth adding as a cheap yes/no check before SMTP.

### N2. "Forgot Password" Side-Channel on Google/Microsoft Login (Gemini, DeepSeek)
**Technique:** Use headless Chrome to navigate to Google/Microsoft password recovery flow. Enter the candidate email. The response reveals whether the account exists.
**Assessment:** Effective but ethically gray. Google and Microsoft actively block automated probing of login flows. Requires residential proxies and fingerprint rotation. **Flag for operator decision.** High value on catch-all Google Workspace domains where SMTP fails.

### N3. SMTP DATA Verification (DeepSeek — unique detail)
**Technique:** For Google Workspace and Microsoft 365 where RCPT TO always returns 250, proceed past RCPT TO to the DATA command. Send a minimal message body. Google/M365 will return 550 AFTER DATA for non-existent addresses.
**Assessment:** DeepSeek is the only model that described this in protocol detail. This is the key technique for verifying emails on catch-all Google/M365 domains. **Requires care:** you're closer to sending actual email. Must throttle heavily (1 connection per 5 seconds per MX). Must QUIT before delivery completes.
**Unresolved contacts:** Would help with any of the 24 on Google Workspace or M365 catch-all domains.

### N4. FCC Form 477 / State Utility Filing Scraping (Grok)
**Technique:** Scrape FCC filings and state broadband authority documents for contact emails. Fiber telecom companies are required to file regulatory documents that often include named contacts with email addresses.
**Assessment:** Extremely relevant to our niche. FCC Form 477 is public, state broadband office filings are public, and fiber companies MUST file them. This is the kind of industry-specific signal that generic email finders completely miss.
**Unresolved contacts:** High likelihood of catching emails for: Allo Communications (Scott Speer), Omni Fiber (Chad Mueller), Race Communications (Tiffany Hess), RTC Fiber (Matt Rust), Shentel/GloFiber (Jeff Manning). These are all regulated entities with public filings.

### N5. Favicon Hash Correlation for Pattern Reuse (Gemini)
**Technique:** Hash company website favicons. Companies using the same web platform often share email patterns. If you verified `first.last@companyA.com` and `companyB.com` has the same favicon hash (same platform), `first.last@` is a strong first guess.
**Assessment:** Creative but low practical value for fiber telecom. These companies don't share web platforms in predictable ways. Skip.

### N6. Job Posting Email Scraping (Grok)
**Technique:** Scrape the company's careers page for "email your resume to" addresses. These almost always follow the real corporate email pattern.
**Assessment:** Excellent signal. Many fiber companies post jobs with a direct email (especially smaller firms without an ATS). Dobson Fiber, Finley Engineering, etc. all have active job postings.

---

## 3. Disagreements Between Models

### D1. Google Workspace RCPT TO reliability
- **Gemini says:** Google gives accurate 550 for invalid users, "best-case scenario"
- **DeepSeek says:** Google "always accepts RCPT TO" — you need DATA verification
- **Reality in 2026:** Both are partially right. Google Workspace rejects at RCPT TO for non-catch-all accounts, but many Google Workspace domains have catch-all enabled. The correct approach: probe for catch-all FIRST, then use RCPT TO if not catch-all, DATA verification if catch-all.

### D2. LinkedIn scraping feasibility
- **GPT and Grok suggest:** Scrape LinkedIn for emails and patterns
- **DeepSeek acknowledges:** It's an "ethical gray area"
- **Reality:** LinkedIn aggressively blocks scraping. Their "Contact info" section rarely shows email to non-connections. Legally risky (hiQ vs LinkedIn settled but TOS still prohibit). **Not recommended for production pipeline.**

### D3. The "Bounce Back" Probe (DeepSeek only)
- DeepSeek suggests sending a real email and waiting for an NDR bounce to verify
- **No other model suggests this** — for good reason. This IS sending email. It risks blacklisting, hurts sender reputation, and is ethically indistinguishable from spam probing. **Reject this approach.**

### D4. Catch-all strategy
- **Gemini:** Use Google/Microsoft password reset flow
- **DeepSeek:** Use SMTP DATA verification
- **Grok:** Fall back to web scraping + secondary signals only
- **Best synthesis:** Try SMTP DATA first (protocol-level, no browser needed). If that fails, mark as unverified and require a secondary signal (web scrape, GitHub, FCC filing) before trusting.

---

## 4. Mapping to the 24 Unresolved Contacts

| Contact | Company | Current State | Which technique would catch them |
|---|---|---|---|
| Scott Speer | Allo Communications | MEDIUM (peer-pattern) | FCC filings (N4), SMTP verify (C3) |
| Yurii Antonyk | Axon Fiber | GUESS p=0.55 | Website scrape (C2), SMTP verify (C3) |
| Denys Pihur | Axon Fiber | GUESS p=0.55 | Pattern from Yurii (C2), SMTP verify (C3) |
| Ron Llamas | Azimuth Engineering | GUESS p=0.55 | Website /team page (C2), SMTP (C3) |
| William Platt | BHC | GUESS p=0.55 | Website scrape (C2), SMTP (C3) |
| Josh Orlowitz | Bonfire | GUESS p=0.55 | Website scrape (C2), SMTP (C3) |
| Chris Hartman | Cedar Falls Utilities | GUESS p=0.55 | Municipal filings (N4), known decoupling (cfu.net) |
| Kyle Holcomb | Choptank Fiber | GUESS p=0.55 | Website scrape (C2), SMTP (C3) |
| Tyler Thompson | Choptank Fiber | GUESS p=0.55 | Pattern from Kyle (C2), SMTP (C3) |
| Scott Craig | Citizens Fiber | GUESS p=0.55 | Website scrape (C2), SMTP (C3) |
| Ryan Kudera | Finley Engineering | GUESS p=0.55 | Website /team (C2), job postings (N6), SMTP (C3) |
| Wesley Kudera | Finley Engineering | GUESS p=0.55 | Pattern from Ryan (C2), SMTP (C3) |
| Todd Miller | Glass Utility | GUESS p=0.55 | Website scrape (C2), SMTP (C3) |
| Butch Wilson | Glass Utility | GUESS p=0.55 | Pattern from Todd (C2), SMTP (C3) |
| Arnaldo Blanco | Go-Broadband | GUESS p=0.55 | Website scrape (C2), SMTP (C3) |
| Jeff Hindman | Go-Broadband | GUESS p=0.55 | Pattern from Arnaldo (C2), SMTP (C3) |
| Ashley Ball | Go-Broadband | GUESS p=0.55 | Pattern shared (C2), SMTP (C3) |
| Lee Comer | Go-Broadband | GUESS p=0.55 | Pattern shared (C2), SMTP (C3) |
| Larissa Rock | Luminate Broadband | GUESS p=0.55 | Website scrape (C2), SMTP (C3) |
| Chad Mueller | Omni Fiber | GUESS p=0.55 | FCC filings (N4), SMTP (C3) |
| Aaron Williams | Orbital Engineering | GUESS p=0.55 | Website scrape (C2), SMTP (C3) |
| Tiffany Hess | Race Communications | GUESS p=0.55 | FCC filings (N4), SMTP (C3) |
| Matt Rust | RTC Fiber | GUESS p=0.55 | Website scrape (C2), SMTP (C3) |
| Jeff Manning | Shentel/GloFiber | GUESS p=0.55 | FCC filings (N4), SMTP (C3) |
| Thomas Vito | TEP Group | GUESS p=0.55 | Website scrape (C2), SMTP (C3) |

**Estimate:** SMTP verification alone (C3 + C4) would upgrade 15-18 of these 24 from GUESS to GREEN/RED (confirmed valid or confirmed invalid). Adding website pattern scraping (C2) would catch the pattern for multi-contact companies (Axon, Choptank, Glass Utility, Go-Broadband, Finley) — another 3-5 resolutions. FCC filings (N4) adds 3-5 for regulated entities. **Net: 18-22 of 24 resolvable with self-hosted techniques.**

---

## 5. Ranked Implementation Plan

### Priority 1: SMTP Verification Engine (2-3 hours)
**Impact:** Replaces ZeroBounce ($0.01/check). Unlimited free verifications.
**Build:** Node.js `net` module + `dns/promises`. Connect to MX, HELO, MAIL FROM, RCPT TO. Handle 250/550/4xx. Add catch-all detection (gibberish probe).
**Files:** New module in engine, e.g., `engine/researcher/smtp_verifier.ts`
**Catches:** 15-18 of 24 unresolved contacts.

### Priority 2: Domain Discovery via Web Search + DNS (2-3 hours)
**Impact:** Replaces Findymail/Apollo domain resolution for P2's 2,300 contacts.
**Build:** Google/DuckDuckGo scraping (headless Chrome or raw HTML parse), extract top result URL, validate with MX lookup. Store domain + confidence.
**Files:** New module, e.g., `engine/researcher/domain_resolver.ts`
**Catches:** Critical for P2 where we don't have domains at all.

### Priority 3: Website Pattern Scraper (1-2 hours)
**Impact:** Detects email patterns from public company pages.
**Build:** Fetch `/contact`, `/team`, `/about`, `/leadership` pages. Regex for `@domain` addresses. Count pattern frequency. Return dominant pattern.
**Files:** New module, e.g., `engine/researcher/pattern_detector.ts`
**Catches:** Multi-contact companies (one discovery patterns all contacts).

### Priority 4: SPF/DKIM Provider Fingerprinting (30 min)
**Impact:** Determines which SMTP strategy to use per domain.
**Build:** DNS TXT lookup, parse SPF `include:` directives. Map to Google/Microsoft/self-hosted.
**Files:** Integrate into smtp_verifier as a pre-check.
**Catches:** Routes verification correctly, avoids wasting time on unverifiable domains.

### Priority 5: FCC/Regulatory Filing Scraper (2-3 hours)
**Impact:** Industry-specific email source no competitor uses.
**Build:** Scrape FCC Form 477 database, state broadband office filings. Extract contact emails. Match to company names.
**Files:** New module, e.g., `engine/researcher/regulatory_scraper.ts`
**Catches:** 3-5 additional contacts from regulated entities.

### Priority 6: Gravatar MD5 Probe (30 min)
**Impact:** Free, fast, zero-risk positive signal.
**Build:** MD5 hash candidate email, HTTP HEAD to gravatar.com. 200 = exists.
**Files:** Add to verification pipeline as cheap pre-check.
**Catches:** Low hit rate for fiber telecom, but costs nothing.

### Priority 7: Job Posting Scraper (1-2 hours)
**Impact:** "Email your resume to" addresses reveal corporate patterns.
**Build:** Scrape careers pages for mailto: links or email patterns in job descriptions.
**Files:** Integrate into pattern_detector.
**Catches:** Companies actively hiring (Dobson Fiber, Finley Engineering, etc.).

### Priority 8 (Optional): SMTP DATA Verification (1-2 hours)
**Impact:** Verifies emails on catch-all Google/M365 domains.
**Build:** Extend SMTP verifier to proceed past RCPT TO to DATA stage. Requires careful throttling.
**Files:** Extension of smtp_verifier.
**Catches:** Catch-all domains that otherwise show YELLOW confidence.
**Risk:** Closer to actually sending email. Must throttle heavily. Operator decision.

---

## 6. Realistic Hit Rate Estimates

### Fully Self-Hosted (Priorities 1-7, no paid services)
- Domain discovery: 85-90% of companies resolved
- Pattern detection: 60-70% of domains yield a pattern
- SMTP verification: 70-80% of candidates verified (valid or invalid)
- **Overall: 65-75% verified email hit rate**
- **Gap:** Catch-all domains (30-40% of B2B domains) remain YELLOW without paid verification

### Hybrid (Self-hosted + one paid service)
Add ONE service — either Apollo enrichment (already have) or a cheap verification service (MillionVerifier at $37 for 10K checks):
- Self-hosted resolves 65-75%
- Paid service catches another 10-15%
- **Overall: 76-85% verified email hit rate**

### Full Paid Stack (status quo + improvements)
Findymail + Apollo + ZeroBounce + Hunter.io:
- **Overall: 80-89% verified email hit rate**
- **Cost: $200-600/month during active campaigns**

**Recommendation:** Build Priorities 1-5 (self-hosted core), keep Apollo as the one paid enrichment source (we already have it), add MillionVerifier as a $37 one-time bulk verification for the final sweep. This gets us to 80-85% at ~$37 incremental cost vs. $200-600/month.

---

## 7. Ethically/Legally Questionable Techniques

| Technique | Model | Issue | Recommendation |
|---|---|---|---|
| Google/Microsoft password reset probing | Gemini, DeepSeek | Automated probing of login flows violates TOS. Requires proxies to evade detection. | **Operator decision.** Effective but gray area. |
| LinkedIn scraping | GPT, Grok | Violates LinkedIn TOS. Legal risk (hiQ settlement didn't fully resolve). | **Skip.** Use Tim's Sales Navigator for manual lookups on high-value targets only. |
| Facebook Pixel exploit | DeepSeek | Sending fake Lead events to Facebook — clearly unethical. | **Reject outright.** |
| "Bounce Back" real email probe | DeepSeek | Sends actual email to verify. Hurts sender reputation, indistinguishable from spam probing. | **Reject outright.** |
| SMTP DATA verification | DeepSeek | Proceeds closer to actual mail delivery. Not technically sending but could be viewed as abuse. | **Acceptable with throttling.** 1 conn per 5s per MX. Standard industry practice for verification services. |
| Job posting email scraping | Grok | Public data, no TOS violation. Career pages are meant to be read. | **Fully acceptable.** |
| FCC filing scraping | Grok | Public government records. No legal issue. | **Fully acceptable.** |
| Gravatar probing | Gemini | Public API, designed for this use case. | **Fully acceptable.** |

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-04 13:30 | Claude | Initial synthesis from 4-model council |
