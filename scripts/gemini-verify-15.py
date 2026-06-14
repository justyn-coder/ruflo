#!/usr/bin/env python3
"""
Gemini Deep Research fact-verification for the smoke 15.

Sends 15 composed email bodies to Gemini 2.5 Pro with strict anti-hallucination
rules. Returns per-claim TRUE/FALSE/UNKNOWN + per-prospect SAFE/RECOMPOSE verdict.
"""
import os
import sys
import json
import urllib.request
import urllib.parse

SB_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SB_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
GEMINI_KEY = os.environ['GEMINI_API_KEY']

# Final 15 — with Zack + Jeff swapped in for Emily + David
SMOKE_15 = [
    ('Michele', 'Sadwick', 'Greenlight'),
    ('Laurie', 'Turck', 'Network Connex'),
    ('Dara', 'Leslie', 'Shentel'),
    ('Brendan', 'Karchner', 'Buckeye'),
    ('Gabriel', 'Gilliland', 'Blue Ridge'),
    ('Aamer', 'Abbasi', 'Lyte'),
    ('Casey', 'Worth', 'United Fiber'),
    ('Doug', 'Spurlin', 'Frontier'),
    ('Zack', 'Burnes', 'United Tel Supply'),
    ('Issac', 'Roehm', 'IdeaTek'),
    ('Ben', 'Lewis-Ramirez', 'Communication Network'),
    ('Anthony', 'Jelniker', 'Great Plains'),
    ('Jesus', 'Loya', 'PC Telcom'),
    ('Jeff', 'Reiman', 'The Broadband Group'),
    ('George', 'Spengler', 'Lyte'),
]


def fetch_prospect_compositions():
    rows = []
    for first, last, co_partial in SMOKE_15:
        enc_f = urllib.parse.quote(first)
        enc_l = urllib.parse.quote(last)
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/sr_prospects?first_name=eq.{enc_f}&last_name=eq.{enc_l}&select=id,first_name,last_name,company,company_website,assigned_ae",
            headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'},
        )
        candidates = json.loads(urllib.request.urlopen(req).read())
        match = None
        for c in candidates:
            if co_partial.lower() in (c.get('company') or '').lower():
                match = c
                break
        if not match:
            print(f'  ⚠️ Skip — {first} {last} @ {co_partial} not found', file=sys.stderr)
            continue
        enc_id = urllib.parse.quote(match['id'])
        req2 = urllib.request.Request(
            f"{SB_URL}/rest/v1/sr_engine_output?prospect_id=eq.{enc_id}&select=email_subject_t1,email_body_t1,email_ps_t1&order=created_at.desc&limit=1",
            headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'},
        )
        eo = json.loads(urllib.request.urlopen(req2).read())
        if eo:
            rows.append({**match, **eo[0]})
    return rows


def build_prompt(rows):
    parts = []
    parts.append("""You are Gemini Deep Research. I need you to verify factual claims in 15 draft cold outreach emails before they are sent to real prospects tomorrow morning.

CRITICAL RULES (READ FIRST):

1. URL+QUOTE REQUIREMENT. For every TRUE verdict you MUST include: source URL, date accessed, AND a 1-2 sentence direct quote. Without all three, the claim is automatically UNKNOWN — not TRUE.

2. NO INFERENCE. If the claim is not literally stated in a primary source (company website, press release, SEC filing, news article), it is UNKNOWN.

3. DISTINGUISH ANNOUNCED VS CLOSED for acquisition/merger claims.

4. NO PATTERN/PERCENTAGE CLAIMS. No email-pattern-guesser sites. We use MillionVerifier for email validation.

5. NO SYNTHETIC PERSONAS. Stick to real companies + people only.

6. UNKNOWN is the correct answer when evidence is absent. Marking TRUE without primary-source URL is worse than admitting UNKNOWN.

For each row, list every specific factual claim in the email body and verify each. Per claim format:
  Claim: [verbatim quote from email]
  Verdict: TRUE / FALSE / UNKNOWN
  Source URL: [URL or "none found"]
  Source date accessed: [date or "N/A"]
  Source quote: "[direct quote]" or "N/A"

After listing claims, provide a SEND DECISION per row:
  SAFE TO SEND — all specific claims verified TRUE
  NEEDS RECOMPOSE — has UNKNOWN/FALSE specific claims

═══ ROWS TO VERIFY ═══
""")
    for i, r in enumerate(rows, 1):
        parts.append(f'\n### Row {i} — {r["first_name"]} {r["last_name"]} @ {r["company"]}')
        parts.append(f'Website: {r.get("company_website", "")}')
        parts.append(f'AE: {r.get("assigned_ae", "")}')
        parts.append(f'Subject: "{r.get("email_subject_t1", "")}"')
        parts.append(f'Body:\n```\n{r.get("email_body_t1", "")}\n```')
        parts.append(f'P.S.: "{r.get("email_ps_t1", "")}"')
        parts.append('---')
    parts.append("""\n═══ END OF ROWS ═══

After all 15 rows, please provide:
- Total claims: X TRUE, Y FALSE, Z UNKNOWN
- Decisions: X SAFE TO SEND, Y NEEDS RECOMPOSE
- Top FALSE claims (must fix)
- Top UNKNOWN claims (consider removing specifics)

Reminder: 15 honest UNKNOWNs better than 15 fabricated TRUEs. Be conservative.""")
    return '\n'.join(parts)


def call_gemini(prompt):
    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={GEMINI_KEY}"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 32000,
        },
        "tools": [{"google_search": {}}],
    }
    req = urllib.request.Request(
        api_url,
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    res = urllib.request.urlopen(req, timeout=300)
    data = json.loads(res.read())
    candidates = data.get('candidates') or []
    if not candidates:
        return f'(no response: {json.dumps(data)[:500]})'
    parts = candidates[0].get('content', {}).get('parts', [])
    return ''.join(p.get('text', '') for p in parts)


def main():
    print('=== Fetching 15 prospect compositions ===', file=sys.stderr)
    rows = fetch_prospect_compositions()
    print(f'Fetched {len(rows)} compositions', file=sys.stderr)

    print('=== Building Gemini prompt ===', file=sys.stderr)
    prompt = build_prompt(rows)
    print(f'Prompt size: {len(prompt)} chars, ~{len(prompt) // 4} tokens', file=sys.stderr)

    # Save prompt for reference
    with open('/tmp/gemini-verify-15-prompt.md', 'w') as f:
        f.write(prompt)

    print('=== Calling Gemini 2.5 Pro with Google Search grounding ===', file=sys.stderr)
    print('(this may take 60-120 seconds)', file=sys.stderr)
    try:
        verdict = call_gemini(prompt)
    except Exception as e:
        print(f'❌ Gemini call failed: {e}', file=sys.stderr)
        return 1

    with open('/tmp/gemini-verify-15-output.md', 'w') as f:
        f.write(verdict)
    print(verdict)
    print(f'\n\n💾 Output saved to /tmp/gemini-verify-15-output.md', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
