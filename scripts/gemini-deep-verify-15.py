#!/usr/bin/env python3
"""
Gemini Deep Research fact-verification — TRUE DEEP RESEARCH mode.

Uses the /v1beta/interactions API (multi-step research) — same pattern
as engine/scripts/gemini-verify.py in showrev repo.
"""
import os
import sys
import time
import json
import urllib.request
import urllib.error

GEMINI_KEY = os.environ['GEMINI_API_KEY']
BASE_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"

with open('/tmp/gemini-DR-prompt.md') as f:
    prompt = f.read()

print(f'Prompt size: {len(prompt)} chars', file=sys.stderr)
print('Submitting to Gemini Deep Research MAX...', file=sys.stderr)

create_url = f"{BASE_URL}?key={GEMINI_KEY}"
payload = json.dumps({
    "input": prompt,
    "agent": "deep-research-max-preview-04-2026",
    "background": True,
}).encode()

req = urllib.request.Request(create_url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        interaction = json.loads(resp.read())
except urllib.error.HTTPError as e:
    print(f'❌ HTTP {e.code}: {e.read().decode()[:1000]}', file=sys.stderr)
    sys.exit(1)

interaction_id = interaction.get('id')
if not interaction_id:
    print(f'❌ No interaction id: {json.dumps(interaction)[:500]}', file=sys.stderr)
    sys.exit(1)

print(f'✅ Research started: {interaction_id}', file=sys.stderr)
print(f'   Polling every 10 sec (Deep Research typically 5-10 minutes)...', file=sys.stderr)

start = time.time()
while True:
    elapsed = time.time() - start
    get_url = f"{BASE_URL}/{interaction_id}?key={GEMINI_KEY}"
    req = urllib.request.Request(get_url)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            interaction = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f'\n❌ Poll error HTTP {e.code}: {e.read().decode()[:500]}', file=sys.stderr)
        sys.exit(1)

    status = interaction.get('status', 'unknown')

    if status == 'completed':
        outputs = interaction.get('outputs', [])
        result = ''
        for out in outputs:
            if 'text' in out:
                result = out['text']
        if not result:
            print(f'\n⚠️ Completed but no text. Full response:', file=sys.stderr)
            print(json.dumps(interaction, indent=2)[:3000], file=sys.stderr)
            sys.exit(1)
        out_path = '/tmp/gemini-DEEP-RESEARCH-15-verification.md'
        with open(out_path, 'w') as f:
            f.write(result)
        print(f'\n✅ Deep Research complete in {elapsed:.0f}s', file=sys.stderr)
        print(f'   Saved to {out_path} ({len(result)} chars)', file=sys.stderr)
        print()
        print(result)
        break
    elif status == 'failed':
        print(f'\n❌ Failed: {interaction.get("error", "unknown")}', file=sys.stderr)
        print(json.dumps(interaction, indent=2)[:2000], file=sys.stderr)
        sys.exit(1)
    else:
        sys.stderr.write(f'\r  [{elapsed:.0f}s] status={status}')
        sys.stderr.flush()
        time.sleep(10)
