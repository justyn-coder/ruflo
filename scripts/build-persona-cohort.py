#!/usr/bin/env python3
"""
Persona-prioritized cohort builder for P2 cold prospecting.

Reads data/showrev/p2-cold/fc2026-attendees-usa.csv (2,571 attendees, P1 already
removed). Detects persona from title. Outputs batches sorted by persona priority:
  1. revenue_leader (C-suite, VP, SVP, Founder, Owner, Partner)
  2. ops_builder (Director, Head, Operations, Construction, Field, Manager, Supervisor)
  3. technical_designer (Engineer, GIS, CAD, Architect, Designer, Developer)
  4. other (anything else — likely non-ICP, deprioritized)

Within each persona, attendees are sorted by company so same-company contacts
are grouped together for AE review.

USAGE:
  python3 scripts/build-persona-cohort.py --batch-size 300
  python3 scripts/build-persona-cohort.py --batch-size 300 --persona revenue_leader
  python3 scripts/build-persona-cohort.py --batch-size 300 --already-run-runs v2-mq6mto4c

OUTPUT:
  data/showrev/p2-cold/cohort-batches/cohort-batch-001.csv (revenue leaders first 300)
  data/showrev/p2-cold/cohort-batches/cohort-batch-002.csv (next 300)
  ... etc

Decision provenance (operator 2026-06-09):
  - Focus 100 list deprecated — too much trouble, false mismatches
  - Single source of truth = fc2026-attendees-usa.csv (P1 booth visitors + their company employees removed)
  - Batches of 300 so AE can review between batches
  - Persona priority because revenue leaders convert highest in cold outbound
"""

import argparse
import csv
import os
import re
import sys
from pathlib import Path

# Persona detection patterns — mirror what generalized-composer.ts uses
REVENUE_LEADER = re.compile(
    r"\b(ceo|cfo|coo|cto|cmo|cio|cco|cso|cpo|cdo|cro|cbo|svp|vp|"
    r"chief|founder|owner|president|partner|managing\s+director|managing\s+partner)\b",
    re.IGNORECASE,
)
OPS_BUILDER = re.compile(
    r"\b(director|head\s+of|operation|construction|field|"
    r"manager|supervisor|outside\s+plant|osp|construction\s+lead)\b",
    re.IGNORECASE,
)
TECHNICAL_DESIGNER = re.compile(
    r"\b(engineer|technical|designer|gis|cad|architect|developer|"
    r"design\s+lead|design\s+manager)\b",
    re.IGNORECASE,
)

PERSONA_PRIORITY = {
    "revenue_leader": 1,
    "ops_builder": 2,
    "technical_designer": 3,
    "other": 4,
}


def detect_persona(title: str) -> str:
    if not title:
        return "other"
    t = title.strip()
    if REVENUE_LEADER.search(t):
        return "revenue_leader"
    if OPS_BUILDER.search(t):
        return "ops_builder"
    if TECHNICAL_DESIGNER.search(t):
        return "technical_designer"
    return "other"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", default="data/showrev/p2-cold/fc2026-attendees-usa.csv")
    parser.add_argument("--output-dir", default="data/showrev/p2-cold/cohort-batches")
    parser.add_argument("--batch-size", type=int, default=300)
    parser.add_argument("--persona", choices=list(PERSONA_PRIORITY), help="Only emit one persona bucket")
    parser.add_argument("--max-batches", type=int, default=99, help="Cap number of batches emitted")
    parser.add_argument("--dry-run", action="store_true", help="Show counts only, do not write")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    input_path = repo_root / args.input
    output_dir = repo_root / args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    if not input_path.exists():
        print(f"ERROR: input not found: {input_path}", file=sys.stderr)
        return 1

    # Load attendees
    rows = []
    with input_path.open() as f:
        reader = csv.DictReader(f)
        for r in reader:
            title = (r.get("Title") or r.get("Role") or r.get("title") or "").strip()
            persona = detect_persona(title)
            rows.append(
                {
                    "firstName": (r.get("First Name") or r.get("fName") or r.get("firstName") or "").strip(),
                    "lastName": (r.get("Last Name") or r.get("lName") or r.get("lastName") or "").strip(),
                    "company": (r.get("Company Name") or r.get("company") or "").strip(),
                    "title": title,
                    "state": (r.get("State") or r.get("state") or "").strip(),
                    "persona": persona,
                    "priority": PERSONA_PRIORITY[persona],
                }
            )

    # Filter empty rows
    rows = [r for r in rows if r["firstName"] and r["lastName"] and r["company"]]

    if args.persona:
        rows = [r for r in rows if r["persona"] == args.persona]

    # Sort: persona priority, then company (so same-company contacts cluster)
    rows.sort(key=lambda r: (r["priority"], r["company"].lower(), r["lastName"].lower()))

    # Persona breakdown
    print(f"Total attendees considered: {len(rows)}")
    persona_counts = {p: 0 for p in PERSONA_PRIORITY}
    for r in rows:
        persona_counts[r["persona"]] += 1
    for p in PERSONA_PRIORITY:
        print(f"  {p:<20} {persona_counts[p]}")

    if args.dry_run:
        return 0

    # Batch
    batch_size = args.batch_size
    total_batches = min((len(rows) + batch_size - 1) // batch_size, args.max_batches)
    print(f"\nWriting {total_batches} batch(es) of up to {batch_size} prospects each to {output_dir}")

    fieldnames = ["firstName", "lastName", "company", "title", "state"]
    for batch_idx in range(total_batches):
        start = batch_idx * batch_size
        end = min(start + batch_size, len(rows))
        batch_rows = rows[start:end]
        batch_num = batch_idx + 1
        out_path = output_dir / f"cohort-batch-{batch_num:03d}.csv"
        with out_path.open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            for r in batch_rows:
                w.writerow({k: r[k] for k in fieldnames})
        first_persona = batch_rows[0]["persona"]
        last_persona = batch_rows[-1]["persona"]
        print(f"  cohort-batch-{batch_num:03d}.csv  rows={len(batch_rows)}  {first_persona} → {last_persona}")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
