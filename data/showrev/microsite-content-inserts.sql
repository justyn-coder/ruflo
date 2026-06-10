-- ============================================================
-- ShowRev ABM Microsites — 13 Full-Tier Prospects
-- Generated: 2026-05-29
-- Target table: sr_microsites
-- Status: all rows inserted as 'draft' — operator sets to 'live'
-- ============================================================

-- 1. B+T GRP (UPDATE — already live, improved content)
INSERT INTO sr_microsites (
  slug, company_name, headline, insight_text, case_study_text, case_study_source,
  ae_name, value_props, status
) VALUES (
  'b-t-grp',
  'B+T GRP',
  'Filing permits across 50 states means 50 different rejection reasons for the same drawing.',
  'B+T GRP holds licensing in all 50 states. That reach is a competitive advantage until a permit return in one county stalls work packages three states away. The Maryland ISP project is one build. Your team files in dozens of jurisdictions simultaneously. The variable is not design quality — it is whether each drawing matches what each jurisdiction expects before it leaves your office. Inorsa eliminates the input conflicts that cause those returns.',
  'One of our customers cut permit review cycles from 3-4 weeks to 2 days by validating design inputs before submission.',
  'National fiber engineering firm',
  'Nathan Dunn',
  '["Reduce permit return rates across all 50 state jurisdictions from one accelerated production workflow","Speed up production so your team has the time to QC before drawings leave — not after a county flags them","Scale multi-state project volume without proportional growth in QC headcount"]',
  'draft'
)
ON CONFLICT (slug) DO UPDATE SET
  headline = EXCLUDED.headline,
  insight_text = EXCLUDED.insight_text,
  case_study_text = EXCLUDED.case_study_text,
  case_study_source = EXCLUDED.case_study_source,
  ae_name = EXCLUDED.ae_name,
  value_props = EXCLUDED.value_props,
  status = EXCLUDED.status;

-- 2. Hilliary Communications
INSERT INTO sr_microsites (
  slug, company_name, headline, insight_text, case_study_text, case_study_source,
  ae_name, value_props, status
) VALUES (
  'hilliary',
  'Hilliary Communications',
  'Running long haul and FTTH under one roof means two engineering workflows with different documentation standards.',
  'Hilliary just absorbed 35,000 TDS locations on top of an existing long haul and FTTH operation. That is two design workflows, two sets of documentation standards, and a growing list of municipalities that each review drawings their own way. The drawing review process stops scaling with headcount before the expansion does. Inorsa accelerates drawing production from your GIS/LLD inputs so your team has time to QC properly before submission so permits go through clean the first time.',
  'One of our customers cut permit review cycles from 3-4 weeks to 2 days by validating design inputs before submission.',
  'Multi-state fiber operator',
  'Nathan Dunn',
  '["Unify QC across long haul and FTTH engineering workflows without adding review staff","Absorb acquired territory (TDS 35K locations) without doubling permit rework","Keep construction schedules on track as expansion adds unfamiliar municipal jurisdictions"]',
  'draft'
);

-- 3. NetPMD Design & Integration
INSERT INTO sr_microsites (
  slug, company_name, headline, insight_text, case_study_text, case_study_source,
  ae_name, value_props, status
) VALUES (
  'netpmd',
  'NetPMD Design & Integration',
  'At 12.5 million feet of annual design volume, a single permit kickback costs more in schedule delay than the tool costs for the year.',
  'The Solutions merger changed the denominator. NetPMD now processes 12.5 million feet of annual design volume across projects like Escondido. At that throughput, the economics of permit returns are different than they were at half the volume. One kickback does not just cost rework hours — it backs up the queue behind it and delays downstream construction starts. Inorsa eliminates the input errors that cause those kickbacks.',
  'One of our customers cut permit review cycles from 3-4 weeks to 2 days by validating design inputs before submission.',
  'National fiber engineering firm',
  'Nathan Dunn',
  '["Protect margins on high-volume design work by eliminating rework from permit kickbacks","Maintain consistent quality across multi-client project portfolios without adding QC headcount","Complement your existing IQGeo workflow with a accelerated production so your team can QC before permit submission"]',
  'draft'
);

-- 4. Booker Engineering
INSERT INTO sr_microsites (
  slug, company_name, headline, insight_text, case_study_text, case_study_source,
  ae_name, value_props, status
) VALUES (
  'booker-engineering',
  'Booker Engineering',
  'Washington''s $848M BEAD allocation means 236 project areas entering the permitting pipeline. The firms that win that work will not be the biggest — they will be the ones whose permit sets do not get returned.',
  'The PNW is about to see a surge in fiber permitting volume from BEAD. For a firm like Booker, the competitive advantage is not headcount — it is submission quality. Every permit package that clears on the first pass is revenue earned while competitors wait on resubmissions. Inorsa flags the data conflicts that cause permit returns before drawings go out the door.',
  'One of our customers cut permit review cycles from 3-4 weeks to 2 days by validating design inputs before submission.',
  'Regional A&E firm',
  'Lucas Spencer',
  '["Win BEAD subcontracts by demonstrating the lowest permit return rate in your market","Scale for the 236-project-area wave without proportional headcount growth","Deploy in days, not months — built for firms your size"]',
  'draft'
);

-- 5. Avatar Tech
INSERT INTO sr_microsites (
  slug, company_name, headline, insight_text, case_study_text, case_study_source,
  ae_name, value_props, status
) VALUES (
  'avatar-tech',
  'Avatar Tech',
  'Avatarius commits municipalities to construction timelines. Avatar Tech has to deliver them. The variable is permit review cycles.',
  'When Avatarius helps a municipality secure BEAD funding, it comes with a construction timeline commitment. Avatar Tech builds what Avatarius wins. Every rejected drawing set is 3-6 weeks of delay, and municipal jurisdictions across NJ, NY, and MD all flag different things on the same engineering package. The gap between winning the award and breaking ground is where timelines compress or blow. Inorsa accelerates drawing production from your GIS/LLD inputs so your team has time to QC properly before submission — fewer returns, fewer timeline surprises.',
  'One of our customers cut permit review cycles from 3-4 weeks to 2 days by validating design inputs before submission.',
  'Multi-state fiber operator',
  'Mike Rutski',
  '["Compress the gap between BEAD award and construction start by reducing permit cycle time","Eliminate rejected drawings that cost 3-6 weeks per resubmission across municipal jurisdictions","Keep construction crews on schedule when Avatarius commits to a municipal delivery timeline"]',
  'draft'
);

-- 6. Ohio Gig
INSERT INTO sr_microsites (
  slug, company_name, headline, insight_text, case_study_text, case_study_source,
  ae_name, value_props, status
) VALUES (
  'ohio-gig',
  'Ohio Gig',
  'Building FTTH in four regions plus 614 Gig means field crews sitting idle every time a drawing set comes back.',
  'Ohio Gig is running simultaneous FTTH builds across six Ohio counties and launching the 614 Gig Columbus expansion. Each municipality has its own permit requirements. When a drawing set comes back in one region, field crews in that region sit idle while engineering resubmits. Multiply that across four simultaneous builds and $11M in BEAD construction. The bottleneck is not crews or equipment — it is whether permit-ready drawings stay ahead of the construction schedule. Inorsa keeps them ahead.',
  'One of our customers cut permit review cycles from 3-4 weeks to 2 days by validating design inputs before submission.',
  'Multi-state fiber operator',
  'Mike Rutski',
  '["Keep construction crews productive across all four regions by eliminating permit returns that cause idle time","Submit clean engineering packages to every Ohio municipality regardless of their specific review standards","Protect $11M+ in BEAD-funded construction timelines from permit-driven schedule delays"]',
  'draft'
);

-- 7. ISG
INSERT INTO sr_microsites (
  slug, company_name, headline, insight_text, case_study_text, case_study_source,
  ae_name, value_props, status
) VALUES (
  'isg',
  'ISG',
  'The gap between what ArcGIS Pro produces and what each county DOT actually accepts is where permit returns happen.',
  'ISG runs joint-use designs and make-ready estimates for programs the size of Charter across 17 locations and multiple states. Every jurisdiction reads the same drawings differently. Your ArcGIS Pro workflow produces consistent output, but the review criteria change from county to county and from DOT to railroad to DNR. Inorsa catches the input conflicts that cause permit returns before drawings leave your team.',
  'One of our customers cut permit review cycles from 3-4 weeks to 2 days by validating design inputs before submission.',
  'National fiber engineering firm',
  'Nathan Dunn',
  '["Increase drafter throughput by eliminating rework cycles from jurisdiction-specific permit kickbacks","Protect margins on high-volume programs like Charter by reducing the cost of permit returns","Maintain consistent QC across 17 office locations without multiplying review headcount"]',
  'draft'
);

-- 8. PCCI Group / ProDesign
INSERT INTO sr_microsites (
  slug, company_name, headline, insight_text, case_study_text, case_study_source,
  ae_name, value_props, status
) VALUES (
  'pcci-prodesign',
  'PCCI Group / ProDesign',
  'At 27 CAD drafters pushing large-scale city redesigns, a single permit kickback does not just cost rework hours — it backs up the queue behind it.',
  'ProDesign runs a high-throughput CAD operation spanning AutoCAD through 3GIS, producing construction documents for multi-city FTTH projects and military base infrastructure. When one permit package comes back from a jurisdiction, it does not just require rework on that package — it backs up every package behind it in the queue. At your team''s volume, the cost of a single kickback is measured in days of delayed output, not hours. Inorsa accelerates drawing production from your GIS/LLD inputs so your team has time to QC properly before submission so fewer packages come back.',
  'One of our customers cut permit review cycles from 3-4 weeks to 2 days by validating design inputs before submission.',
  'National fiber engineering firm',
  'Mike Rutski',
  '["Protect throughput across a high-volume CAD operation by catching errors before they enter the permit queue","Reduce rework that backs up production for every designer behind the rejected package","Accelerate production across your full tool stack (AutoCAD, 3GIS, Katapult Pro) with consistent output to each standard"]',
  'draft'
);

-- 9. Lighthouse Technologies
INSERT INTO sr_microsites (
  slug, company_name, headline, insight_text, case_study_text, case_study_source,
  ae_name, value_props, status
) VALUES (
  'lighthouse-tech',
  'Lighthouse Technologies',
  '350 crews across 23 states. One rejected drawing set in Georgia backs up crew allocation across three neighboring states.',
  'At Lighthouse''s scale, the construction schedule is only as fast as the permit pipeline feeding it. A single permit return does not just delay one project — it cascades across crew allocation in neighboring states. With 26 years of operations and thousands of miles deployed, the math is clear: the cost of idle crews waiting on resubmissions is measured in crew-days multiplied across 23 states. Inorsa accelerates drawing production from your GIS/LLD inputs so your team has time to QC properly before submission — fewer returns, fewer days with crews waiting on paperwork.',
  'One of our customers cut permit review cycles from 3-4 weeks to 2 days by validating design inputs before submission.',
  'Multi-state fiber operator',
  'Mike Rutski',
  '["Keep 350+ crews productive by eliminating the permit returns that cause idle time across state lines","Prevent one rejected drawing from cascading into crew allocation delays across neighboring states","Maintain field-ready documentation standards across all 23 operating states"]',
  'draft'
);

-- 10. Indus CAD Works
INSERT INTO sr_microsites (
  slug, company_name, headline, insight_text, case_study_text, case_study_source,
  ae_name, value_props, status
) VALUES (
  'indus-cad-works',
  'Indus CAD Works',
  'When an input conflict in source data makes it through drafting into a permit submission, the rejection comes back to your firm. Your team redesigns on your dime, not the client''s.',
  'Indus CAD Works produces FTTX designs, F1/F2 engineering packages, and pole loading analysis for telecom clients using ARAMIS-standard workflows. With a hybrid model running domestic oversight and offshore execution, every permit rejection that requires rework crosses time zones and adds days to the correction cycle. The margin impact compounds across projects. Inorsa catches the input conflicts that cause permit returns before drawings leave your team.',
  'One of our customers cut permit review cycles from 3-4 weeks to 2 days by validating design inputs before submission.',
  'Regional A&E firm',
  'Mike Rutski',
  '["Catch input conflicts before drawings leave your team — not after a client''s jurisdiction flags them","Protect margins by eliminating rework that crosses time zones in your hybrid delivery model","Maintain ARAMIS-standard quality across every project without adding manual review cycles"]',
  'draft'
);

-- 11. Terracon (REFERRAL PLAY — not direct buyer)
INSERT INTO sr_microsites (
  slug, company_name, headline, insight_text, case_study_text, case_study_source,
  ae_name, value_props, status
) VALUES (
  'terracon',
  'Terracon',
  'When a BEAD grantee submits fiber routes that conflict with wetland boundaries or NEPA-sensitive areas, the environmental review sends the whole package back. That is rework for both sides.',
  'Terracon''s telecom and broadband practice reviews 100,000+ telecom projects for environmental and geotechnical compliance. When design errors in the engineering drawings trigger environmental re-review, your team re-processes work that should have been clean upstream. The problem is not in your review — it is in the design data that reaches your desk. Inorsa sits upstream of your team''s work, catching the input conflicts in fiber route designs before they trigger environmental or NEPA rework on your side.',
  'One of our customers cut permit review cycles from 3-4 weeks to 2 days by validating design inputs before submission.',
  'National fiber engineering firm',
  'Nathan Dunn',
  '["Reduce the volume of design-level errors that trigger environmental re-review on your team''s desk","Give BEAD grantees you advise a tool that produces cleaner packages before they reach Terracon","Fewer upstream input conflicts means fewer NEPA and Section 106 re-processing cycles for your staff"]',
  'draft'
);

-- 12. IMMCO Inc.
INSERT INTO sr_microsites (
  slug, company_name, headline, insight_text, case_study_text, case_study_source,
  ae_name, value_props, status
) VALUES (
  'immco',
  'IMMCO Inc.',
  '756 engineers across four continents solve the throughput problem. They do not solve the rejection rate.',
  'IMMCO has built a global team to handle FTTx design volume at scale. But every US municipality still has its own permit requirements. Adding engineers in Hyderabad solves throughput — it does not solve the rejection rate when a drawing does not match what Cobb County or Fulton County expects. The rejection rate is a local problem that a global workforce cannot engineer around. Inorsa catches the input conflicts that cause permit returns before drawings leave your team — the rejection rate drops independent of where the design work happens.',
  'One of our customers cut permit review cycles from 3-4 weeks to 2 days by validating design inputs before submission.',
  'National fiber engineering firm',
  'Mike Rutski',
  '["Drop permit rejection rates regardless of whether the design originated in the US, India, or Australia","Eliminate rework cycles that cross time zones and add days to every correction","Complement your iBISS field automation with upstream production speed that gives your team time to QC before permit submission"]',
  'draft'
);

-- 13. Schurz Communications
INSERT INTO sr_microsites (
  slug, company_name, headline, insight_text, case_study_text, case_study_source,
  ae_name, value_props, status
) VALUES (
  'schurz',
  'Schurz Communications',
  'Six ISPs. Nine states. Six design processes. Permit return rates will vary until the engineering standard converges.',
  'Schurz Broadband Group unifies Antietam, Burlington Telecom, Hiawatha, Long Lines, NKTelco, and Orbitel under one portfolio. Each ISP has its own engineering process, its own vendor relationships, and its own jurisdictional knowledge — built over years in their local markets. Standardizing those six workflows across nine states is a multi-year effort. The permit return rate is the metric that tells you how far the convergence has progressed. Inorsa validates design data before drawings leave any of your six ISPs — one QC layer across the entire portfolio.',
  'One of our customers cut permit review cycles from 3-4 weeks to 2 days by validating design inputs before submission.',
  'Multi-state fiber operator',
  'Mike Rutski',
  '["Standardize engineering QC across all six ISPs without waiting for workflow convergence","Pilot with one ISP and roll the playbook across the remaining five","Reduce permit return rates across nine states from a single accelerated production platform"]',
  'draft'
);
