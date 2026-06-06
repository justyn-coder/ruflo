---
title: Tactic Evaluation Results
status: ACTIVE
last_updated: 2026-06-05 04:55:00 EST
version: v1
---

```

======================================================================
  TACTIC EVALUATION — 83 CONTACTS
  Run date: 2026-06-05T04:55:00.132Z
  Mode: FULL (all tactics)
======================================================================

--- TACTIC A: Heuristic + MX: offline — DNS MX only, no web ---
  Correct domain:       37/83 (44.6%)
  Wrong domain:         45
  No result:            1
  Best for:             simple name->domain mapping (37/37); industry-name companies (9)
  Fails for:            name/domain mismatch (27); industry-name companies that still fail (13)

--- TACTIC E: DMARC rua=: offline — DNS DMARC records (uses known domain) ---
  Correct domain:       83/83 (100.0%)
  Wrong domain:         0
  No result:            0
  Best for:             simple name->domain mapping (56/83); industry-name companies (22)
  Fails for:            no clear pattern

--- TACTIC B: Person search: online — DuckDuckGo + page fetch ---
  Correct domain:       0/83 (0.0%)
  Wrong domain:         4
  No result:            79
  Best for:             no clear pattern
  Fails for:            name/domain mismatch (27); industry-name companies that still fail (22)

--- TACTIC C: Company search: online — DuckDuckGo company search ---
  Correct domain:       0/83 (0.0%)
  Wrong domain:         0
  No result:            83
  Best for:             no clear pattern
  Fails for:            name/domain mismatch (27); industry-name companies that still fail (22)

--- TACTIC D: Clearbit: online — Clearbit autocomplete with name match ---
  Correct domain:       19/83 (22.9%)
  Wrong domain:         29
  No result:            35
  Best for:             simple name->domain mapping (16/19); industry-name companies (6)
  Fails for:            name/domain mismatch (24); industry-name companies that still fail (16)

--- TACTIC F: M365 Graph: online — M365 user-exists (known domain only) ---
  Correct domain:       51/83 (61.4%)
  Correct email:        51/83 (61.4%)
  Wrong domain:         0
  No result:            32
  Best for:             simple name->domain mapping (35/51); industry-name companies (14)
  Fails for:            name/domain mismatch (11); industry-name companies that still fail (8)
  Failures:
    Esri                                esri.com                     skipped: provider is proofpoint, not M365
    Zyxel Communications, Inc.          zyxel.com                    skipped: provider is barracuda, not M365
    Render Networks                     rendernetworks.com           skipped: provider is google-workspace, not M365
    Biarri Networks                     biarrinetworks.com           skipped: provider is proofpoint, not M365
    Dycom                               dycominc.com                 skipped: provider is proofpoint, not M365
    Terracon                            terracon.com                 skipped: provider is proofpoint, not M365
    Ozmo                                ozmo.com                     skipped: provider is google-workspace, not M365
    Mountain, Ltd.                      mountainltd.com              skipped: provider is mimecast, not M365
    One Drill Llc                       onedrill.us                  skipped: provider is google-workspace, not M365
    LUNDER UNDERGROUND SERVICES CORP    lundercorp.com               skipped: provider is google-workspace, not M365
    One Drill Llc                       onedrill.us                  skipped: provider is google-workspace, not M365
    WKD Cable Enterprises LLC           wkdcable.com                 skipped: provider is self-hosted, not M365
    JDI Fibertech                       jdifibertech.com             skipped: provider is google-workspace, not M365
    Second Mile                         thesecondmile.com            skipped: provider is google-workspace, not M365
    Panduit                             panduit.com                  skipped: provider is proofpoint, not M365
    Terracon                            terracon.com                 skipped: provider is proofpoint, not M365
    TEC                                 tec.com                      skipped: provider is barracuda, not M365
    Fiber Optic Solutions               fos-llc.com                  skipped: provider is google-workspace, not M365
    Fiber Optic Solutions               fos-llc.com                  skipped: provider is google-workspace, not M365
    Colliers Engineering & Design       collierseng.com              skipped: provider is mimecast, not M365
    ... and 12 more

======================================================================
  CROSS-TACTIC COMPARISON
======================================================================

  Company                        Known Domain              TACTIC A TACTIC E TACTIC B TACTIC C TACTIC D TACTIC F
  ------------------------------ ------------------------- -------- -------- -------- -------- -------- --------
  Esri                           esri.com                    D     D     -     -     D     -  
  Zyxel Communications, Inc.     zyxel.com                   D     D     -     -     -     -  
  Render Networks                rendernetworks.com          D     D     -     -     D     -  
  Globema                        globema.com                 D     D     -     -     -     E  
  Biarri Networks                biarrinetworks.com          D     D     -     -     D     -  
  KW mission critical            wsp.com                     -     D     -     -     -     E  
  Dycom                          dycominc.com                -     D     -     -     -     -  
  Terracon                       terracon.com                D     D     -     -     -     -  
  Ozmo                           ozmo.com                    D     D     -     -     -     -  
  TalentPartners                 thetalentpartners.net       D     D     -     -     -     E  
  TalentPartners                 thetalentpartners.net       D     D     -     -     -     E  
  PCCI Group                     pccigroup.com               D     D     -     -     -     E  
  Mountain, Ltd.                 mountainltd.com             D     D     -     -     D     -  
  One Drill Llc                  onedrill.us                 D     D     -     -     -     -  
  LUNDER UNDERGROUND SERVICES C  lundercorp.com              -     D     -     -     -     -  
  One Drill Llc                  onedrill.us                 D     D     -     -     -     -  
  WKD Cable Enterprises LLC      wkdcable.com                D     D     -     -     -     -  
  Indus CAD works                induscadworks.com           D     D     -     -     -     E  
  Indus CAD Works, LLC           induscadworks.com           D     D     -     -     -     E  
  JDI Fibertech                  jdifibertech.com            D     D     -     -     -     -  
  IMMCO Inc.                     immcoinc.com                D     D     -     -     D     E  
  Nomad Telecommunications, LLC  nomadtelecom.net            -     D     -     -     -     E  
  Hawaiian Telcom                hawaiiantel.com             D     D     -     -     D     E  
  Fatbeam                        fatbeam.com                 D     D     -     -     D     E  
  Fybercom                       fybercom.net                -     D     -     -     -     E  
  Fybercom                       fybercom.net                -     D     -     -     -     E  
  Second Mile                    thesecondmile.com           D     D     -     -     -     -  
  LCC Telecom Services, LLC      lcctelecom.com              -     D     -     -     -     E  
  LCC Telecom                    lcctelecom.com              D     D     -     -     D     E  
  Westell Technologies           westell.com                 -     D     -     -     D     E  
  Panduit                        panduit.com                 D     D     -     -     D     -  
  Telcom Insurance Group         telcominsgrp.com            -     D     -     -     D     E  
  Terracon                       terracon.com                D     D     -     -     -     -  
  NetPMD Design and Integration  netpmd.com                  -     D     -     -     -     E  
  AirWorks                       airworks.io                 -     D     -     -     -     E  
  ISG                            isginc.com                  -     D     -     -     -     E  
  Clearfield, Inc.               seeclearfield.com           -     D     -     -     -     E  
  Clearfield, Inc.               seeclearfield.com           -     D     -     -     -     E  
  North East MS EPA / NE Fiber   nemepa.org                  -     D     -     -     -     E  
  TEC                            tec.com                     D     D     -     -     -     -  
  Fiber Optic Solutions          fos-llc.com                 -     D     -     -     D     -  
  Fiber Optic Solutions          fos-llc.com                 -     D     -     -     D     -  
  Lighthouse Technologies        lh.tech                     -     D     -     -     -     E  
  Lighthouse Technologies        lh.tech                     -     D     -     -     -     E  
  Lighthouse Technologies        lh.tech                     -     D     -     -     -     E  
  Motive Software Solutions      motive.com                  -     D     -     -     -     E  
  Colliers Engineering & Design  collierseng.com             D     D     -     -     -     -  
  Fiber Instrument Sales, Inc.   fissales.com                -     D     -     -     -     E  
  Mohawk Networks, LLC           mohawk-networks.com         -     D     -     -     -     -  
  Pure Integration               pureintegration.com         D     D     -     -     D     E  
  Ohio Gig, LLC                  shwdirect.com               -     D     -     -     -     -  
  Ohio Gig, LLC                  brescosolutions.com         -     D     -     -     -     -  
  Great Lakes Enclosures         vertiv.com                  -     D     -     -     -     E  
  Hilliary                       hilliary.com                D     D     -     -     D     E  
  B+t GRP                        btgrp.com                   D     D     -     -     -     E  
  B+T GRP                        btgrp.com                   D     D     -     -     -     E  
  Sallisaw Municipal Authority   diamondnetok.com            -     D     -     -     -     E  
  LHTC Broadband                 lhtc.net                    -     D     -     -     -     E  
  LHTC Broadband                 lhtc.net                    -     D     -     -     -     E  
  LHTC Broadband                 lhtc.net                    -     D     -     -     -     E  
  Wyandotte Municipal Services   wyandottemi.gov             -     D     -     -     -     E  
  Schurz Communications          schurz.com                  D     D     -     -     D     E  
  OSP Solutions                  ospsolutions.com            D     D     -     -     -     E  
  Greeneville Energy Authority   mygea.net                   -     D     -     -     -     E  
  UCL Swift North America        uclswiftamericas.com        -     D     -     -     -     -  
  UCL Swift North America        uclswiftamericas.com        -     D     -     -     -     -  
  UCL Swift North America        kudzubrands.com             -     D     -     -     -     -  
  UCL Swift Americas             uclswiftamericas.com        D     D     -     -     -     -  
  Rayco, Inc.                    rayco-digs.com              -     D     -     -     -     -  
  Rayco, Inc.                    rayco-digs.com              -     D     -     -     -     -  
  Integer Telecom Services, Inc  integertel.com              -     D     -     -     -     E  
  Advanced 1                     advanced1.net               -     D     -     -     -     -  
  Advanced 1                     advanced1.net               -     D     -     -     -     -  
  TAK Broadband                  takbroadband.com            D     D     -     -     -     E  
  Fiber Forward magazine         connect2comm.com            -     D     -     -     -     E  
  Incedo                         incedoinc.com               -     D     -     -     D     E  
  Pure Integration               pureintegration.com         D     D     -     -     D     E  
  Sno-Isle TECH Skills Center    mukilteo.wednet.edu         -     D     -     -     -     E  
  Sno-Isle TECH Skills Center    mukilteo.wednet.edu         -     D     -     -     -     E  
  Booker Engineering             bookereng.com               D     D     -     -     -     E  
  Booker Engineering, LLC        bookereng.com               -     D     -     -     -     E  
  Advanced 1                     advanced1.net               -     D     -     -     -     -  
  Pure Integration               pureintegration.com         D     D     -     -     D     E  

  Legend: E=exact email, D=correct domain, -=miss

======================================================================
  COMPANY TYPE ANALYSIS
======================================================================

  Predictable domains (name ~ domain): 57/83
  Unpredictable domains (name != domain): 26/83

  TACTIC A        predictable: 64.9%    unpredictable: 0.0%
  TACTIC E        predictable: 100.0%   unpredictable: 100.0%
  TACTIC B        predictable: 0.0%     unpredictable: 0.0%
  TACTIC C        predictable: 0.0%     unpredictable: 0.0%
  TACTIC D        predictable: 28.1%    unpredictable: 11.5%
  TACTIC F        predictable: 61.4%    unpredictable: 61.5%

  Industry-keyword companies: 22/83
  Non-industry companies: 61/83

  TACTIC A        industry: 40.9%    non-industry: 45.9%
  TACTIC E        industry: 100.0%   non-industry: 100.0%
  TACTIC B        industry: 0.0%     non-industry: 0.0%
  TACTIC C        industry: 0.0%     non-industry: 0.0%
  TACTIC D        industry: 27.3%    non-industry: 21.3%
  TACTIC F        industry: 63.6%    non-industry: 60.7%

  DMARC rua= coverage: 17 of 61 unique domains have extractable emails
  Domains with DMARC emails: zyxel.com, rendernetworks.com, ozmo.com, hawaiiantel.com, fatbeam.com, fybercom.net, thesecondmile.com, westell.com, seeclearfield.com, lh.tech, motive.com, pureintegration.com, btgrp.com, schurz.com, advanced1.net, incedoinc.com, mukilteo.wednet.edu

======================================================================
  MAIL PROVIDER BREAKDOWN (by known domain)
======================================================================

  microsoft-365             83 contacts (100.0%)

```

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-05 04:55 | Claude | Initial tactic evaluation run |
