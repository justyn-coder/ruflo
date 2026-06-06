#!/usr/bin/env python3
"""Bulk load substrate into Supabase sr_brain_substrate via REST API."""
import json, os, sys, urllib.request
from pathlib import Path

def load_env():
    for line in (Path(__file__).parent / '.env').read_text().splitlines():
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip())

def chunk(text, size=2000, overlap=200):
    chunks, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        c = text[start:end].strip()
        if len(c) > 100:
            chunks.append(c)
        start = end - overlap
        if start >= len(text):
            break
    return chunks

def post(url, key, rows):
    req = urllib.request.Request(
        f'{url}/rest/v1/sr_brain_substrate',
        data=json.dumps(rows).encode('utf-8'),
        headers={'apikey': key, 'Authorization': f'Bearer {key}',
                 'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
        method='POST')
    return urllib.request.urlopen(req).status

def load_source(src_dir, src_name, url, key):
    progress_file = src_dir / '_load_progress.json'
    done = set()
    if progress_file.exists():
        done = set(json.loads(progress_file.read_text()).get('loaded', []))
        print(f'  Resuming: {len(done)} already loaded')

    files = sorted(f for f in src_dir.iterdir() if f.suffix == '.json' and not f.name.startswith('_'))
    batch, loaded, skipped, errors = [], 0, 0, 0

    for i, fp in enumerate(files):
        if fp.name in done:
            skipped += 1
            continue
        try:
            data = json.loads(fp.read_text())
            content = data.get('content', '')
            if len(content) < 100:
                skipped += 1
                continue
            for ci, c in enumerate(chunk(content)):
                batch.append({
                    'source': src_name,
                    'title': data.get('title', '')[:500],
                    'url': data.get('url', ''),
                    'published_date': data.get('date', ''),
                    'chunk_index': ci,
                    'content': c,
                    'char_count': len(c),
                })
            done.add(fp.name)
            loaded += 1
            if len(batch) >= 100:
                post(url, key, batch)
                batch = []
            if loaded % 200 == 0:
                print(f'  {loaded} loaded ({skipped} skip, {i+1}/{len(files)})')
                progress_file.write_text(json.dumps({'loaded': list(done)}))
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f'  Error {fp.name}: {e}')

    if batch:
        post(url, key, batch)
    progress_file.write_text(json.dumps({'loaded': list(done)}))
    return loaded, skipped, errors

if __name__ == '__main__':
    load_env()
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    if not url or not key:
        print('Missing env vars'); sys.exit(1)

    base = Path(__file__).parent / '../../../data/brain/substrate'
    src = sys.argv[1] if len(sys.argv) > 1 else 'all'
    sources = []
    if src in ('all', 'dawson'):
        sources.append(('dawson-pots-and-pans', base / 'dawson-pots-and-pans'))
    if src in ('all', 'cbb'):
        sources.append(('community-broadband-bits', base / 'community-broadband-bits'))

    for name, path in sources:
        print(f'\n=== {name} ===')
        n, s, e = load_source(path, name, url, key)
        print(f'Done: {n} loaded, {s} skipped, {e} errors')
