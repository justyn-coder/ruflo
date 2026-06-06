## Claude Design Prompt — Engineering Workflow Schematic

### Goal
Design a technical workflow schematic showing a fiber engineering team's drawing production pipeline — before and after automation. This is NOT a marketing infographic. It should look like something a VP of Engineering would whiteboard for their team, or pin on the wall next to their project schedule. Engineers should look at it and immediately understand what changes and what the time impact is.

### The concept: two pipeline views, one page

**TOP: "Your current pipeline"**
A horizontal flow with time annotations at each step:

```
[GIS Design] ——→ [Export / Convert] ——→ [Manual CAD Drafting] ——→ [QC Review] ——→ [Submit to Jurisdiction]
  (complete)      30-60 min              4-8 hrs per set          rushed          ↓
                                                                                 40-50% rejected
                                                                                 ↓
                                                              ←——— REWORK (3-6 weeks) ←———
```

Each step is a box with:
- Step name
- Tool/person responsible: "[GIS_TOOL]", "[TEAM_SIZE] drafters", "Senior engineer", "Jurisdiction"
- Time per step (annotated below)
- A color intensity showing where time accumulates (the bottleneck glows)

The rework loop is the visual centerpiece — a prominent return arrow from "Rejected" back to "Manual CAD Drafting" with "3-6 WEEKS" prominently labeled. This is the pain.

**BOTTOM: "With Inorsa"**
Same pipeline structure, but the middle compresses:

```
[GIS Design] ——→ [Inorsa Drawing Agent] ——→ [Team Finishes + QC] ——→ [Submit to Jurisdiction]
  (complete)      ~10 min                    Your engineers focus     ↓
                  Automated                  on judgment, not         Higher first-pass rate
                                             formatting               (more time for QC)
```

The visual compression is the key — the "before" is stretched wide (lots of steps, lots of time). The "after" is compact (fewer steps, faster). The rework loop arrow should be visually diminished (dotted, faded) to show it's still possible but less frequent because QC time increased.

### Time comparison bar (between the two pipelines)

A side-by-side horizontal bar:
```
BEFORE: ████████████████████████████████░░░░ — 80% drafting / 20% QC
 AFTER: ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ — 20% drafting / 80% QC + engineering judgment
```

Label: "The time didn't disappear. It shifted from formatting to judgment."

### Metric callouts (small, technical, not marketing)

Three data points in monospace, placed like engineering annotations:
- "~10 min" — source to preliminary drawing
- "2-5x" — drafting capacity, same headcount
- "70%" — reduction in CD cycle time

These should look like dimension callouts on a CAD drawing — small, precise, technical.

### Personalization tokens

These will be swapped per prospect:
- [GIS_TOOL] — their GIS platform (IQGeo, ArcGIS, 3GIS, etc.)
- [TEAM_SIZE] — "27 drafters" or "8 engineers" or "your team"
- [CAD_STANDARD] — "AutoCAD" (almost always)
- [JURISDICTION] — "Cobb County" or "multiple jurisdictions" or "[State] DOT"
- [COMPANY_NAME] — in the page title
- [AE_NAME], [AE_PHOTO], [BOOKING_URL] — for the CTA

### Design aesthetic

**Blueprint meets data visualization.**

- Background: dark navy (#0B1120) — like a CAD workspace or engineering monitor
- Lines: light grey (#C8C2B8) for pipeline connectors, white for text
- Boxes: subtle dark cards with thin borders, NOT rounded-corner marketing boxes
- Accent: Inorsa purple (#6d28d9) ONLY for the Inorsa step and the time-compression visual
- Rework loop: red/orange (#E8473B) to show pain
- Font: DM Mono for all labels and annotations (monospace = technical). DM Sans for headers only.
- Time annotations: small monospace below each step, like dimension marks on a drawing
- Overall feel: if you squint, it should look like a simplified construction plan or network diagram, not a SaaS product page

### What it should NOT look like
- No rounded pill shapes or soft gradients (that's marketing)
- No icons or emojis
- No "Step 1 → Step 2 → Step 3" numbering (engineers don't think in numbered steps, they think in flows)
- No stock imagery
- No drop shadows or glassmorphism
- No "before/after" split screen with green checkmarks — that's a weight loss ad

### What it SHOULD look like
- A systems diagram that could hang on the wall of an engineering office
- Clean enough to screenshot and drop into a project proposal
- Dense enough that an engineer spends 30 seconds studying it (that's engagement)
- The kind of thing an engineering VP sends to their team in Slack saying "this is what I'm talking about"

### CTA (bottom, minimal)
"See this on your data" — AE photo, name, booking link. Same pattern as the assessment page. Keep it understated — the diagram IS the pitch.

### One page, two states
Unlike the assessment (which has quiz → results), this is a SINGLE VIEW. No interaction needed. The diagram tells the story on load. One page, one viewport on desktop. Mobile stacks vertically.

### Sample data for preview
Use: "Mountain Ltd." as company, "IQGeo" as GIS tool, "8 engineers" as team, "Mike Rutski" as AE with realistic headshot placeholder. Jurisdictions: "8 state DOTs."
