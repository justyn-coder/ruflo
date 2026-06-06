## Claude Design Prompt — Fiber Drawing Workflow Assessment

### Goal
Design a one-page interactive assessment for fiber engineering professionals. It has two states: the QUESTIONS view (4 multiple-choice questions) and the RESULTS view (personalized scorecard). The design should feel like a professional industry tool, not a sales page.

### Layout — Questions View

Top section:
- Headline: "How does your fiber drawing workflow compare?"
- Subhead: "60 seconds. 4 questions. See where you stand vs. 300+ firms."
- Small text: "Based on industry data from fiber engineering podcasts, cost reports, and broadband research"

Body: 4 questions, each as a horizontal card with 3 radio-button options (A/B/C). Cards are stacked vertically with generous spacing. Each question has a short label and the 3 options side by side.

Questions:
1. "How do your drawings go from GIS to CAD?" → Manual / Partially automated / Mostly automated
2. "How many jurisdictions do you submit to?" → 1-3 / 4-10 / 11+
3. "Typical turnaround, GIS design to submitted package?" → Under a day / 1-5 days / More than a week
4. "What happens when a permit comes back?" → Rare / Regular / Major cascade

Bottom: A prominent "See my results" button. Disabled until all 4 questions are answered.

Footer: "Prepared for [Name] at [Company]" + Inorsa logo (subtle, not dominant) + AE contact info

### Layout — Results View

Top: "YOUR WORKFLOW SCORECARD" with score prominently displayed (large number / 12)

Visual element: A horizontal gauge/bar showing where they sit vs. industry average (7.2). Their position marked with a dot or arrow. Left label "Ahead of the curve", right label "Room to gain".

Middle section — two cards side by side:
- Left card: "WHAT THIS MEANS" — 2-3 sentence insight paragraph
- Right card: "YOUR BIGGEST OPPORTUNITY" — one specific area based on their highest-scoring question

Bottom section: "WHAT FIRMS LIKE YOURS ARE DOING" — 1-2 boxed quotes from industry leaders (styled like pull quotes with name/role attribution)

CTA: "See what automation looks like for your workflow → Book a 30-minute walkthrough" with AE photo, name, and booking button

### Design tokens
- Background: warm paper (#f5f1eb) — matches the /report page, not the dark microsite
- Text: dark (#1a1510)
- Accent: Inorsa purple (#6d28d9) for the score, gauge, and CTA button
- Question cards: white (#fff) with subtle border (#e0dcd6)
- Result insight cards: light grey (#f8f6f3)
- Quote boxes: white with left purple border (pull-quote style)
- Font: DM Sans
- AE photo: circular, 48px

### Audience
VP of Engineering or Engineering Manager at a fiber design firm (A&E) or fiber operator. Age 40-60. They want data, not flair. Professional, clean, information-dense but not cluttered. Think Bloomberg Terminal aesthetic applied to a simple assessment, not Buzzfeed quiz.

### Personalization placeholders
Use these where dynamic content will be inserted:
- [PROSPECT_NAME], [COMPANY_NAME]
- [AE_NAME], [AE_PHOTO_URL], [BOOKING_URL]
- [SCORE], [INSIGHT_TEXT], [OPPORTUNITY_TEXT]
- [QUOTE_1_TEXT], [QUOTE_1_AUTHOR], [QUOTE_2_TEXT], [QUOTE_2_AUTHOR]

### What NOT to include
- No Inorsa product description or features list
- No "we do X" language — this is about THEM
- No stock photos or illustrations
- No animations or fancy transitions
- No "congratulations" or gamification language — this is a professional tool
