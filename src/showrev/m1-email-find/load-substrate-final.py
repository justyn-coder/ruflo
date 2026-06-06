#!/usr/bin/env python3
"""Safe substrate loader. 10 files per batch, 1s pause, gc between batches.
Run: python3 load-substrate-final.py
"""
import json, os, sys, gc, time, urllib.request
from pathlib import Path

# Load env
for line in (Path(__file__).parent / '.env').read_text().splitlines():
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1)
        os.environ.setdefault(k.strip(), v.strip())

URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']
BASE = Path(__file__).parent / '../../../data/brain/substrate'
BATCH = 10

def post(rows):
    data = json.dumps(rows).encode('utf-8')
    req = urllib.request.Request(
        f'{URL}/rest/v1/sr_brain_substrate',
        data=data, method='POST',
        headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}',
                 'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    resp = urllib.request.urlopen(req, timeout=30)
    return resp.status

def chunk(text):
    out, s = [], 0
    while s < len(text):
        e = min(s + 2000, len(text))
        c = text[s:e].strip()
        if len(c) > 100:
            out.append(c)
        s = e - 200
        if s >= len(text):
            break
    return out

total = 0
for src_name in ['dawson-pots-and-pans', 'community-broadband-bits']:
    d = BASE / src_name
    if not d.exists():
        continue
    files = sorted(f for f in d.iterdir() if f.suffix == '.json' and not f.name.startswith('_'))
    print(f'\n=== {src_name}: {len(files)} files ===')

    for start in range(0, len(files), BATCH):
        batch_files = files[start:start + BATCH]
        rows = []
        for fp in batch_files:
            data = json.loads(fp.read_text())
            c = data.get('content', '')
            if len(c) < 100:
                continue
            for ci, ch in enumerate(chunk(c)):
                rows.append({
                    'source': src_name,
                    'title': data.get('title', '')[:500],
                    'url': data.get('url', ''),
                    'published_date': data.get('date', ''),
                    'chunk_index': ci,
                    'content': ch,
                    'char_count': len(ch),
                })
        if not rows:
            continue

        try:
            status = post(rows)
            total += len(rows)
            print(f'  {start}: {len(rows)} chunks → {status} (total: {total})')
        except Exception as e:
            print(f'  {start}: ERROR {e}')

        # Memory cleanup + pause
        del rows
        gc.collect()
        time.sleep(1)

print(f'\n=== DONE: {total} chunks loaded ===')
