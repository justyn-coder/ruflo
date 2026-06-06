## Claude Design Prompt — Animated Workflow Schematic v2

### Overview
Redesign the workflow schematic page as a PROGRESSIVE REVEAL EXPERIENCE. The prospect doesn't see a static diagram — they watch a story build that diagnoses their workflow problem and shows the solution. Total experience: ~15 seconds of animated building after a single click.

### Page states

**STATE 1: The hook (on load)**

The full schematic is visible but BLURRED behind a frosted glass overlay (backdrop-filter: blur(12px)). Just enough visible to see there's a technical diagram underneath — shapes, lines, the grid background.

Over the blur, centered:
- Company logo (Mountain Ltd.) small, top
- One provocative line in large, clean type: **"What if the bottleneck in your construction schedule isn't your crews?"**
- A subtle secondary line: "We mapped your drawing production pipeline."
- Button: **"Show me →"** (Inorsa purple, prominent)

The blurred schematic creates curiosity. They can ALMOST see it. They want to click.

**STATE 2: The build sequence (after click, ~15 seconds total)**

The blur dissolves (400ms ease). Then the schematic builds progressively:

**Beat 1 (0-2s): Current pipeline appears left-to-right**
Each step card fades in + slides up 8px, staggered 300ms apart:
- GIS Design (neutral)
- Export / Convert (neutral)
- Manual CAD Drafting (GLOWS RED — border pulse, box shadow expands. This is the bottleneck.)
- QC Review (labeled "rushed")
- Submit to Jurisdiction (labeled "40-50% rejected")

**Beat 2 (2-4s): The rework loop draws**
A red arrow path ANIMATES from the Submit box, curves down and back to Manual CAD Drafting. SVG path animation (stroke-dashoffset). "3-6 WEEKS" appears at the center of the loop with a slight scale-up. This is the emotional peak — they see the cascade.

**Beat 3 (4-6s): The time-shift bar appears**
The BEFORE bar slides in: hatched red "80% DRAFTING / FORMATTING" fills most of the bar. Small grey "20% QC" at the end. Pause here. Let them absorb.

**Beat 4 (6-8s): The upper section dims**
Everything above softly dims to 60% opacity. A divider line draws across. "WITH INORSA" label fades in.

**Beat 5 (8-10s): The compressed pipeline builds**
Fewer steps, same stagger:
- GIS Design (same as before)
- Inorsa Drawing Agent (GLOWS PURPLE — "~10 min" appears with emphasis)
- Team Finishes + QC (labeled "judgment, not formatting")
- Submit to Jurisdiction (labeled "higher first-pass rate")

The visual compression is obvious — 4 steps instead of 5, the layout is tighter.

**Beat 6 (10-11s): Diminished rework loop**
A faint dotted line draws where the rework loop was. Much smaller. "rework — now rare" in muted text. The contrast with the bold red loop above tells the story.

**Beat 7 (11-12s): The AFTER bar appears**
Small grey "20% DRAFT" + large hatched purple "80% QC + ENGINEERING JUDGMENT." Side-by-side with the BEFORE bar above, the shift is visceral.

**Beat 8 (12-13s): The key line**
Centered between the two pipelines, fading in with a slight letter-spacing animation:
**"The time didn't disappear. It shifted from formatting to judgment."**

**Beat 9 (13-15s): Metrics + CTA**
Three metric callouts fade in (staggered): ~10 min / 2-5x / 70%
Then the CTA section fades in at the bottom:
- "See this on your data."
- AE photo + name + booking button

### Design tokens (same as v1 schematic)
- Background: dark navy (#0B1120) with faint CAD grid
- Lines: light grey (#C8C2B8)
- Bottleneck: red (#E8473B) with glow
- Inorsa: purple (#6d28d9) with glow
- Text: white (#F2EFE9) for primary, muted (#8a93a9) for secondary
- Font: DM Mono for all technical labels, DM Sans for the headline and key line
- The frosted blur overlay: semi-transparent dark with backdrop-filter

### Animation principles
- Everything uses CSS transitions/animations — no JS animation library needed
- Stagger via animation-delay on each element
- The blur dissolve is a single class toggle (add .revealed to the container)
- Each beat is triggered by animation-delay, not scroll. Once they click, the whole sequence plays automatically.
- Easing: cubic-bezier(0.16, 1, 0.3, 1) for the slide-ups (snappy start, gentle land)
- The rework loop SVG uses stroke-dasharray + stroke-dashoffset animation for the drawing effect
- The key line uses letter-spacing animation: starts at 0.02em, settles to -0.01em (subtle tightening)

### Personalization tokens
- [COMPANY_NAME], [COMPANY_LOGO_URL]
- [GIS_TOOL], [CAD_STANDARD], [TEAM_SIZE], [JURISDICTION]
- [AE_NAME], [AE_PHOTO], [BOOKING_URL]

### What this should NOT be
- Not a video or a GIF — it's live HTML/CSS animation
- Not scroll-driven — the entire sequence plays after one click
- Not slow or dramatic — 15 seconds total, brisk and confident
- Not playful or cute — this is a technical diagram that builds itself. The tone is "engineering presentation" not "product demo"

### Sample data
Mountain Ltd., IQGeo, AutoCAD, 8 engineers, 8 state DOTs, Mike Rutski as AE.

### Mobile behavior
On mobile (<880px), skip the blur/reveal — show the schematic directly with a simplified vertical layout. The animation is a desktop experience. Mobile gets the clear, readable diagram immediately.

### The one thing to get right
The moment the Manual CAD Drafting box glows red and the rework loop draws — that's the "I see myself in this" moment. Everything before builds to it. Everything after resolves it. If that moment doesn't land, nothing else matters.
