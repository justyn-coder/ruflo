#!/usr/bin/env python3
"""Generate CSV from 2024-2026 substrate only. ~624 files, safe memory.
Run: python3 gen-substrate-csv.py
"""
import csv, json, gc
from pathlib import Path

BASE = Path(__file__).parent / '../../../data/brain/substrate'
OUT = BASE / 'substrate.csv'

total = 0
with open(OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['source', 'title', 'url', 'published_date', 'chunk_index', 'content', 'char_count'])

    for src in ['dawson-pots-and-pans', 'community-broadband-bits']:
        d = BASE / src
        if not d.exists():
            continue
        # Only 2024+ files for dawson (BEAD era), all files for CBB
        files = sorted(fp for fp in d.iterdir() if fp.suffix == '.json' and not fp.name.startswith('_'))
        if src == 'dawson-pots-and-pans':
            files = [f for f in files if f.name >= '2024']
        print(f'{src}: {len(files)} files')

        for fp in files:
            data = json.loads(fp.read_text())
            c = data.get('content', '')
            if len(c) < 100:
                continue
            s, ci = 0, 0
            while s < len(c):
                e = min(s + 2000, len(c))
                ch = c[s:e].strip()
                if len(ch) > 100:
                    w.writerow([src, data.get('title', '')[:500], data.get('url', ''),
                               data.get('date', ''), ci, ch, len(ch)])
                    total += 1
                    ci += 1
                if e >= len(c):
                    break
                s = e - 200
            del data, c
        gc.collect()
        print(f'  → {total} chunks so far')

print(f'\nDone: {total} chunks → {OUT.name}')
