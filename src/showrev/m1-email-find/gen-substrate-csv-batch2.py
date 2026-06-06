#!/usr/bin/env python3
"""Generate CSV for batch 2 substrate: Cartesian + Fiber for Breakfast + NTIA BEAD.
Run: python3 gen-substrate-csv-batch2.py
Import via Supabase Dashboard → sr_brain_substrate → Import CSV
"""
import csv, json, gc
from pathlib import Path

BASE = Path(__file__).parent / '../../../data/brain/substrate'
OUT = BASE / 'substrate-batch2.csv'

total = 0
with open(OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['source', 'title', 'url', 'published_date', 'chunk_index', 'content', 'char_count'])

    for src in ['cartesian-cost-report', 'fiber-for-breakfast', 'ntia-bead']:
        d = BASE / src
        if not d.exists():
            continue
        files = sorted(fp for fp in d.iterdir() if fp.suffix == '.json' and not fp.name.startswith('_'))
        print(f'{src}: {len(files)} files')

        for fp in files:
            data = json.loads(fp.read_text())
            c = data.get('content', '')
            if len(c) < 50:
                continue
            s, ci = 0, 0
            while s < len(c):
                e = min(s + 2000, len(c))
                ch = c[s:e].strip()
                if len(ch) > 50:
                    w.writerow([src, data.get('title', '')[:500], data.get('url', ''),
                               data.get('date', data.get('published_date', '')), ci, ch, len(ch)])
                    total += 1
                    ci += 1
                if e >= len(c):
                    break
                s = e - 200
        gc.collect()
        print(f'  → {total} chunks so far')

print(f'\nDone: {total} chunks → {OUT.name}')
