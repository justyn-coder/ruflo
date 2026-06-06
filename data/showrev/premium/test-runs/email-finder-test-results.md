---
title: Email Finder Test Results
status: ACTIVE
last_updated: 2026-06-04 19:32:07 EST
version: v1
---

```

=== EMAIL FINDER TEST HARNESS ===
Test set: 83 contacts with corporate emails
Run date: 2026-06-04T19:32:07.298Z

--- DOMAIN RESOLUTION (heuristic + MX) ---
Correct domain found:        35/83 (42.2%)
Correct in alternatives:     22/83 (26.5%)
Domain not found:            1
Wrong domain:                25

--- PATTERN DETECTION (on 35 contacts with correct domain) ---
Pattern correctly inferred:  32/35 (91.4%)
Unknown pattern:             3

Pattern breakdown:
  first.last      15 (42.9%)
  flast           9 (25.7%)
  first           7 (20.0%)
  unknown         3 (8.6%)
  firstl          1 (2.9%)

--- CANDIDATE GENERATION (no pattern hint, on 35 correct-domain contacts) ---
Correct email in candidates: 32/35 (91.4%)
Average rank of correct:     2.6
Correct email at rank 1:     13/35 (37.1%)

--- CANDIDATE GENERATION (with known pattern) ---
Correct email generated:     32/32 (100.0%)

--- FULL PIPELINE (heuristic only, no SMTP, no web) ---
GREEN:            0 (0.0%)
YELLOW:           0 (0.0%)
AMBER:            0 (0.0%)
RED:              82 (98.8%)
NOT-FOUND:        1 (1.2%)
Correct email:    13/83 (15.7%)
Correct domain:   35/83 (42.2%)

--- MISSED CONTACTS (70) ---
Name                      Company                        Known Email                         Found                               Conf
────────────────────────────────────────────────────────────
Jason Hart                Esri                           jhart@esri.com                      jason.hart@esri.com                 red
Andrew Cuellar            Zyxel Communications, Inc.     andrewc@zyxel.com                   andrew.cuellar@zyxel.com            red
Ken Savell                KW mission critical            ken.savell@wsp.com                  ken.savell@kmc-llc.com              red
Michelle Usher            Dycom                          michelle.usher@dycominc.com         michelle.usher@dycom.com            red
Jon Millet                TalentPartners                 jon@thetalentpartners.net           jon.millet@thetalentpartners.net    red
Brett Sarubbi             TalentPartners                 brett@thetalentpartners.net         brett.sarubbi@thetalentpartners.ne  red
Troy Hoover               PCCI Group                     thoover@pccigroup.com               troy.hoover@pccigroup.com           red
Chris Lee                 Mountain, Ltd.                 clee@mountainltd.com                chris.lee@mountainltd.com           red
Joao Vianna               One Drill Llc                  joao@onedrill.us                    joao.vianna@onedrill.us             red
Luiz Nobre                LUNDER UNDERGROUND SERVICES C  office@lundercorp.com               luiz.nobre@lus.net                  red
Carlos Figueiroa          One Drill Llc                  carlos@onedrill.us                  carlos.figueiroa@onedrill.us        red
Wolfgang Domschke         WKD Cable Enterprises LLC      wkd@wkdcable.com                    wolfgang.domschke@wkdcable.com      red
Kesari Iyengar            Indus CAD works                kesari@induscadworks.com            kesari.iyengar@induscadworks.com    red
Raj Ahuja                 Indus CAD Works, LLC           raj@induscadworks.com               raj.ahuja@induscadworks.com         red
Jonathan Solomon          JDI Fibertech                  jsolomon@jdifibertech.com           jonathan.solomon@jdifibertech.com   red
Vyshnaw Sadanandan        IMMCO Inc.                     vyshnaw@immcoinc.com                vyshnaw.sadanandan@immcoinc.com     red
Dastan Shaimerdenov       Nomad Telecommunications, LLC  dastan@nomadtelecom.net             dastan.shaimerdenov@nomadllc.com    red
Christopher Davis         Fatbeam                        chris.davis@fatbeam.com             christopher.davis@fatbeam.com       red
Steve Smith               Fybercom                       steve.smith@fybercom.net            steve.smith@fybercom.com            red
Vince Calkins             Fybercom                       vince@fybercom.net                  vince.calkins@fybercom.com          red
Jacob Kedra               Second Mile                    jacob@thesecondmile.com             jacob.kedra@secondmile.com          red
Laura Lora                LCC Telecom Services, LLC      llora@lcctelecom.com                laura.lora@lccllc.com               red
Michael Romesburg         LCC Telecom                    mromesburg@lcctelecom.com           michael.romesburg@lcctelecom.com    red
Salvatore Orefiche        Westell Technologies           sorefiche@westell.com               salvatore.orefiche@westelltechnolo  red
Jim Hummingbird           Telcom Insurance Group         jimh@telcominsgrp.com               jim.hummingbird@tig-llc.com         red
Kathryn Eisele            Terracon                       kathy.eisele@terracon.com           kathryn.eisele@terracon.com         red
Patrik Lowenborg          NetPMD Design and Integration  patrik.lowenborg@netpmd.com         patrik.lowenborg@ndai.com           red
Janan Guillaume           AirWorks                       janan@airworks.io                   janan.guillaume@airworks.com        red
Leila Hussein             ISG                            leila.hussein@isginc.com            leila.hussein@isg.com               red
Sara Peters               Clearfield, Inc.               speters@seeclearfield.com           sara.peters@clearfieldinc.com       red
Mark School               Clearfield, Inc.               mschool@seeclearfield.com           mark.school@clearfieldinc.com       red
Nathan Robbins            North East MS EPA / NE Fiber   nathan.robbins@nemepa.org           (none)                              not-found
Forrest Collier           TEC                            fcollier@tec.com                    forrest.collier@tec.com             red
Cliff Churchill           Fiber Optic Solutions          cliff@fos-llc.com                   cliff.churchill@fiberopticsolution  red
Zach Fox                  Fiber Optic Solutions          zach.fox@fos-llc.com                zach.fox@fiberopticsolutions.net    red
Roberto Martinez          Lighthouse Technologies        roberto.martinez@lh.tech            roberto.martinez@lighthousetechnol  red
Denis Ryzhikov            Lighthouse Technologies        denis.ryzhikov@lh.tech              denis.ryzhikov@lighthousetechnolog  red
Tanya Pustakhod           Lighthouse Technologies        tanya.pustakhod@lh.tech             tanya.pustakhod@lighthousetechnolo  red
Randy Van Buren           Motive Software Solutions      randy.van_buren@motive.com          randy.vanburen@mss.com              red
Jim Fasano                Fiber Instrument Sales, Inc.   jfasano@fissales.com                jim.fasano@fiberinstrumentsales.co  red
Jason Hall                Mohawk Networks, LLC           jhall@mohawk-networks.com           jason.hall@mohawknetworksllc.com    red
Michael Shultz            Ohio Gig, LLC                  michael@shwdirect.com               michael.shultz@ohiogig.com          red
Jacob Fox                 Ohio Gig, LLC                  jacob.fox@brescosolutions.com       jacob.fox@ohiogig.com               red
Shanna Ronschke           Great Lakes Enclosures         shanna.ronschke@vertiv.com          shanna.ronschke@gle.com             red
Clint Smith               Sallisaw Municipal Authority   clint@diamondnetok.com              clint.smith@sma.com                 red
Matt Shearer              LHTC Broadband                 mshearer@lhtc.net                   matt.shearer@lhtcbroadband.com      red
Deanna Richter            LHTC Broadband                 drichter@lhtc.net                   deanna.richter@lhtcbroadband.com    red
Matthew Mongell           LHTC Broadband                 mmongell@lhtc.net                   matthew.mongell@lhtcbroadband.com   red
William Lee               Wyandotte Municipal Services   billlee@wyandottemi.gov             william.lee@wms.com                 red
Douglas Trout             Schurz Communications          dtrout@schurz.com                   douglas.trout@schurz.com            red
Shivam Goel               OSP Solutions                  marketing@ospsolutions.com          shivam.goel@ospsolutions.com        red
Chris Gass                Greeneville Energy Authority   cgass@mygea.net                     chris.gass@gea.com                  red
Richard Boyne             UCL Swift North America        rboyne@uclswiftamericas.com         richard.boyne@usna.com              red
Kb Kim                    UCL Swift North America        kb@uclswiftamericas.com             kb.kim@usna.com                     red
Heather Johnson           UCL Swift North America        heather@kudzubrands.com             heather.johnson@usna.com            red
Todd Morse                UCL Swift Americas             tmorse@uclswiftamericas.com         todd.morse@uclswiftamericas.com     red
Jude Guidry               Rayco, Inc.                    jguidry@rayco-digs.com              jude.guidry@raycoinc.com            red
Jordan Raymond            Rayco, Inc.                    raymond.jordanc@rayco-digs.com      jordan.raymond@raycoinc.com         red
Aditya Kumar              Integer Telecom Services, Inc  aditya@integertel.com               aditya.kumar@integerinc.com         red
Scott Hastings            Advanced 1                     shastings@advanced1.net             scott.hastings@advanced1.com        red
Brian Derstine            Advanced 1                     bderstine@advanced1.net             brian.derstine@advanced1.com        red
Kimberly McKinley         TAK Broadband                  kmckinley@takbroadband.com          kimberly.mckinley@takbroadband.com  red
Doug Mohney               Fiber Forward magazine         doug@connect2comm.com               doug.mohney@ffm-llc.com             red
Deepika Chanamolu         Incedo                         deepika.chanamolu@incedoinc.com     deepika.chanamolu@incedo.com        red
Ted Rodriquez             Sno-Isle TECH Skills Center    rodriqueztn@mukilteo.wednet.edu     ted.rodriquez@stscinc.com           red
Trudy Swain               Sno-Isle TECH Skills Center    swaintl@mukilteo.wednet.edu         trudy.swain@stsc.com                red
Riley Riutta              Booker Engineering             riley@bookereng.com                 riley.riutta@bookerengineering.com  red
Spencer Kariniemi         Booker Engineering, LLC        spencer@bookereng.com               spencer.kariniemi@bookerllc.net     red
Salli Smith               Advanced 1                     ssmith@advanced1.net                salli.smith@advanced1.com           red
Rob Woggins               Pure Integration               rob.wiggins@pureintegration.com     rob.woggins@pureintegration.com     red

--- TOP FAILURE PATTERNS ---

Wrong domain guessed (25 cases):
  - Ken Savell @ KW mission critical (wsp.com) -> guessed kmc-inc.com
  - Luiz Nobre @ LUNDER UNDERGROUND SERVICES CORP (lundercorp.com) -> guessed lus.net
  - Jim Hummingbird @ Telcom Insurance Group (telcominsgrp.com) -> guessed tigcorp.com
  - Patrik Lowenborg @ NetPMD Design and Integration (netpmd.com) -> guessed ndai.com
  - Sara Peters @ Clearfield, Inc. (seeclearfield.com) -> guessed clearfieldinc.com

Correct domain in alternatives but not primary (22 cases):
  - Michelle Usher @ Dycom (dycominc.com)
  - Dastan Shaimerdenov @ Nomad Telecommunications, LLC (nomadtelecom.net)
  - Steve Smith @ Fybercom (fybercom.net)
  - Vince Calkins @ Fybercom (fybercom.net)
  - Jacob Kedra @ Second Mile (thesecondmile.com)

Pattern not recognized (3 cases):
  - wkd@wkdcable.com (local: wkd)
  - marketing@ospsolutions.com (local: marketing)
  - rob.wiggins@pureintegration.com (local: rob.wiggins)

Correct email not in candidate list (3 cases):
  - wkd@wkdcable.com
  - marketing@ospsolutions.com
  - rob.wiggins@pureintegration.com

Domain name bears no resemblance to company name (1 cases):
  - Nathan Robbins @ North East MS EPA / NE Fiber (nemepa.org)

```

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-04 19:32 | Claude | Initial test run |
