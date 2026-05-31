---
title: Claude Design Prompt -- Microsite V3 (The Narrative, Revised)
status: DRAFT
last_updated: 2026-05-29 10:45 EST
version: v1
---

# Agent-to-Agent Brief: ABM Microsite V3

## Context

You are building a 1:1 ABM microsite for B2B tradeshow follow-up. The prospect is a fiber infrastructure executive (VP/Director/SVP level, 40-60 years old) who visited our client's booth at Fiber Connect 2026. They will receive a cold/warm email and the P.S. links to this page. This is the only page. There is no navigation, no second page, no menu. One page, one action: book a 20-minute call.

The page must earn trust before asking for anything. These are conservative engineering buyers in telecom infrastructure. They are skeptical of AI claims, skeptical of vendors, and will bounce in under 3 seconds if the page looks like marketing automation output.

## Design Direction

**Layout:** Single-column, F-pattern (Option 1 "The Narrative" from the prior round). NOT a split/Z-pattern. The single column earns trust sequentially before presenting the CTA. The split layout assumes trust that doesn't exist yet.

**Color:** Midnight (dark) background + Purple accent, reserved exclusively for the proof metric and the CTA button. Nothing else gets the accent color. This is the brand palette and it tested best for premium/serious positioning. Provide a Daylight (light) toggle as an alternative but default to Midnight.

**Typography:** 16px/1.6 minimum body. General Sans or equivalent clean sans-serif. Monospace accent for metrics only (JetBrains Mono or similar). All body text must be comfortable reading for a 50+ executive on a phone in variable lighting.

## Content Hierarchy (exact sequence, do not reorder)

### 1. Header
- Inorsa logo (white on dark) left-aligned
- "Confidential. Prepared 1:1" right-aligned, muted text
- No navigation. No hamburger menu. Nothing clickable except the logo (links to inorsa.com).

### 2. Prepared For (recognition block, 0-3 seconds)
- Kicker text: "Prepared for"
- Company logo (provided as image) + company name, large
- "For **[Full Name]** -- [Title]"
- This section's job: pattern interrupt. The prospect sees their own name and company. This is not a mass page.

### 3. Hero Insight (the challenger moment, 3-8 seconds)
- The single largest text element on the page
- 1-2 sentences of the prospect's operational reality, specific to their business
- This is NOT an Inorsa pitch. It is a statement about THEIR world that demonstrates we understand their situation better than they expected
- Example: "Filing permits across 50 states means 50 different sets of jurisdictional requirements. On a build like the Maryland ISP project, a permit return in one county can stall work packages three states away."

### 4. The Problem (1 line, bridging)
- Smaller text, muted
- "The workflows powering your builds weren't designed for this volume."
- This bridges from their specific pain to the general category of problem Inorsa solves

### 5. How It Works (2 cards, not 3)
- Kicker: "How Inorsa works"
- Two cards side by side on desktop, stacked on mobile:
  - **Ingest** -- "Inorsa structures your GIS and LLD inputs into asset-level data. No manual extraction. No version confusion."
  - **Generate** -- "Produces construction and permit drawings ready for engineer review and submission, with full traceability back to source documents."
- Each card gets a simple icon (document-in for Ingest, drawing-out for Generate)
- Do NOT use three cards. Do NOT break into Data Suite / Validation Suite / Engineering Suite. Two steps. Simple.

### 6. Proof Metric (the credibility moment, 8-15 seconds)
- Before/After layout:
  - "Before" -- "3-4 weeks" (muted styling)
  - Arrow or visual separator
  - "With Inorsa" -- "2 days" (accent color, largest number on the page)
- Below the metric: "Anonymized customer result"
- This is one of only TWO elements on the page that use the accent color (the other is the CTA button)

### 7. Trust Line (objection killer)
- Full width, slightly larger than body text, centered
- "Every output is deterministic and traceable back to source data. No AI guesswork. No black box."
- This addresses the unspoken objection of every fiber engineer: "Is this just another AI thing that makes stuff up?" It goes here, between the proof and the ask, because this is where skepticism peaks.

### 8. AE Contact + Booking CTA (the ask, 25-40 seconds)
- AE headshot (circular, real photo)
- AE name, title ("Sr. Account Executive, Inorsa")
- Email and phone (clickable on mobile)
- Heading: "20 minutes with [AE first name]."
- Subhead: "No deck, no pitch. A working session on your permit pipeline."
- **CTA button:** "Choose a time" (accent color, full width on mobile, prominent on desktop)
- Below button: embedded calendar widget (Calendly or equivalent). If calendar cannot load, the button should fall back to a mailto: link to the AE. NEVER show a dead button or empty white space.
- The CTA button is the second of TWO elements using the accent color

### 9. Footer
- Inorsa logo (smaller)
- "The AI-native platform for infrastructure assets."
- "Confidential. Prepared for [Company Name]"
- No social links. No blog links. No sitemap. Nothing that creates an exit from this page.

## Content Variables (per prospect)

Each microsite instance is populated from a database. The following fields change per prospect:

| Variable | Example (B+T GRP) |
|----------|-------------------|
| company_name | B+T GRP |
| company_logo_url | /bt-grp-mark.png |
| recipient_name | Len DeWees |
| recipient_title | Program Director - Fiber |
| hero_insight | "Filing permits across 50 states means 50 different sets of jurisdictional requirements. On a build like the Maryland ISP project, a permit return in one county can stall work packages three states away." |
| ae_name | Nathan Dunn |
| ae_title | Sr. Account Executive |
| ae_email | nathan@inorsa.com |
| ae_phone | (phone from HS) |
| ae_photo_url | /nathan-headshot.png |
| case_study_text | (optional override, defaults to "3-4 weeks to 2 days") |
| slug | b-t-grp |

## Critical: Cross-Platform Rendering Requirements

This is a sales tool for cold/warm outreach. If the page doesn't load fast, look right, and work on first click, we lose the prospect permanently. There is no second chance.

### Device/Browser Matrix (must render correctly on ALL)

**Mobile (priority -- most prospects will open on phone):**
- iPhone Safari (iOS 16+) -- 375px, 390px, 428px viewports
- Chrome on Android (Samsung Galaxy S series, Pixel) -- 360px, 412px viewports
- Samsung Internet Browser

**Desktop:**
- Chrome (latest, Windows + Mac)
- Safari (latest, Mac)
- Edge (latest, Windows)
- Firefox (latest)

**Tablet:**
- iPad Safari (768px, 1024px viewports)

### Rendering Rules

1. **Zero horizontal scroll at any viewport width from 320px to 1440px.** No exceptions. No overflow. No elements running off screen. Test at 320, 375, 390, 412, 428, 768, 1024, 1280, 1440.

2. **No layout shift on load.** Every element must have explicit dimensions or aspect ratios. No content jumping as fonts/images load. CLS score must be < 0.1.

3. **All tap targets minimum 44x44px on mobile.** The CTA button, phone number, email address, and calendar slots must all be easily tappable without zooming. No adjacent tap targets within 8px of each other.

4. **Font loading: system font stack fallback.** If General Sans fails to load, the page must still look correct with the system font stack. No FOUT (Flash of Unstyled Text) that changes layout.

5. **Images: all images must have explicit width/height attributes** to prevent layout shift. AE headshot and company logo must have fallback (colored circle with initial for headshot, text-only for logo).

6. **Dark mode: the page IS dark mode by default (Midnight theme).** Do NOT let the OS dark mode setting invert colors or change the palette. Force the theme regardless of system preference.

7. **Calendar widget graceful degradation:** If the JS calendar widget fails to load (ad blocker, slow connection, corporate proxy), the "Choose a time" button must still work -- fall back to a mailto: link with a pre-filled subject line. NEVER show a dead button, a spinner that spins forever, or empty white space where the calendar should be.

8. **Page load: the entire above-the-fold content must render in under 1.5 seconds on a 4G connection.** No heavy frameworks. No client-side rendering that blocks the first paint. The page is static HTML + CSS with JS only for the calendar enhancement.

9. **No JavaScript required for content.** All text, images, and layout must render with JS disabled. JS only enhances the calendar booking interaction.

10. **Email client preview:** When the link is pasted into an email, the og:image and og:description meta tags must produce a clean preview card. The preview should show the Inorsa logo + "Prepared for [Company Name]". No broken image, no "404", no generic description.

### QA Checklist (verify before shipping each build)

- [ ] Load page on iPhone Safari -- visually correct, no overflow, CTA tappable
- [ ] Load page on Chrome Android -- same checks
- [ ] Load page on desktop Chrome 1440px -- layout correct, calendar loads
- [ ] Load page on desktop Safari -- same checks
- [ ] Load page with JS disabled -- all content visible, CTA falls back to mailto
- [ ] Load page on 4G throttle (Chrome DevTools, "Fast 3G") -- above fold renders < 2s
- [ ] Tap the CTA button on mobile -- calendar opens or mailto fires, no dead state
- [ ] Tap the phone number on mobile -- initiates call
- [ ] Tap the email on mobile -- opens mail client
- [ ] Paste URL into iMessage / Slack / Gmail -- og:image preview renders correctly
- [ ] No horizontal scroll at 320px viewport
- [ ] No horizontal scroll at 375px viewport
- [ ] No layout shift on page load (visually confirm, or Lighthouse CLS < 0.1)

## Deliverables

1. **Static HTML + CSS for the microsite template** -- all content in semantic HTML, all styling in a single CSS file (or inline). The template uses placeholder variables ({{company_name}}, {{hero_insight}}, etc.) that our build system replaces per prospect.

2. **abm-booking.js** -- calendar widget script. Graceful degradation to mailto if blocked.

3. **Daylight theme variant** -- same content, light background. Switchable via a CSS class or URL param for A/B testing later.

4. **QA screenshots** at 375px (iPhone), 412px (Android), 768px (iPad), 1440px (desktop) for both Midnight and Daylight themes.

## What NOT to Include

- No animation or motion. Static page. No fade-ins, no scroll-triggered reveals, no parallax.
- No video embeds.
- No cookie banners (the page sets no cookies).
- No analytics scripts in the HTML (we inject tracking server-side).
- No "Back to top" button.
- No social proof logos ("Trusted by...") -- we don't have permission to use client logos.
- No pricing information.
- No product screenshots.
- No "About Inorsa" section. The insight IS the credibility.
