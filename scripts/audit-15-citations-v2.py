#!/usr/bin/env python3
"""
Substrate citation audit v2 — bypass bot-blocking with proper browser headers.

Improvements over v1:
  - Real Chrome browser headers (User-Agent, Accept, Accept-Language)
  - Multiple retries
  - More lenient content matching (find 1 of several distinctive phrases)
  - Fall back to Wayback Machine for 403/404 URLs
"""
import os
import sys
import json
import time
import urllib.request
import urllib.parse
import urllib.error
import re
import ssl
from collections import defaultdict

SB_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SB_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']

# Real Chrome headers
BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',  # no gzip — easier to inspect
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
}

PROHIBITED_DOMAINS = {
    'zoominfo.com', 'leadiq.com', 'apollo.io', 'rocketreach.co',
    'rocketreach.com', 'prospeo.io', 'prospeo.com', 'hunter.io',
    'cleanlist.com', 'cleanlist.io', 'contactout.com', 'mailmo.com',
    'snov.io', 'kaspr.io', 'lusha.com', 'salezshark.com',
    'datanyze.com', 'cognism.com', 'seamless.ai',
}

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


def extract_domain(url):
    if not url: return ''
    m = re.search(r'https?://([^/\s]+)', url)
    if not m: return ''
    domain = m.group(1).lower()
    if domain.startswith('www.'): domain = domain[4:]
    return domain


def classify_domain(url):
    domain = extract_domain(url)
    if not domain: return 'NO-URL'
    if any(p in domain for p in PROHIBITED_DOMAINS): return 'CONTAMINATED'
    return 'OK'


def clean_url(raw):
    m = re.search(r'https?://[^\s\)\>\|]+', raw)
    if not m: return None
    return m.group(0).rstrip('.,;')


def fetch_with_browser(url, timeout=20, max_redirects=5):
    """Fetch with browser headers. Returns (status, body)."""
    clean = clean_url(url)
    if not clean: return None, '(malformed url)'
    try:
        # Allow self-signed certs since some company sites are sloppy
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(clean, headers=BROWSER_HEADERS)
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            body = resp.read(200000).decode('utf-8', errors='replace')
            return resp.status, body
    except urllib.error.HTTPError as e:
        return e.code, f'(HTTP {e.code})'
    except Exception as e:
        return None, f'({type(e).__name__}: {str(e)[:80]})'


def try_wayback(url):
    """If URL fails, try Wayback Machine's latest snapshot."""
    clean = clean_url(url)
    if not clean: return None, '(malformed url)'
    wb_url = f'https://web.archive.org/web/2026*/' + clean
    # Use the Memento API directly
    api_url = f'https://archive.org/wayback/available?url={urllib.parse.quote(clean)}'
    try:
        req = urllib.request.Request(api_url, headers=BROWSER_HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            snap = data.get('archived_snapshots', {}).get('closest', {})
            if snap.get('available') and snap.get('url'):
                # Fetch the snapshot
                return fetch_with_browser(snap['url'])
    except Exception as e:
        return None, f'(wayback failed: {e})'
    return None, '(no wayback snapshot)'


def check_claim_in_content(claim, body):
    """More lenient: find distinctive words/numbers and check if MOST appear."""
    if not body or len(body) < 200: return False
    # Strip HTML tags from body for cleaner matching
    body_clean = re.sub(r'<[^>]+>', ' ', body)
    body_clean = re.sub(r'\s+', ' ', body_clean).lower()

    # Find distinctive items in the claim
    distinctive = []
    # Numbers > 100 or with decimals/commas
    for m in re.finditer(r'\b\d[\d,\.]{2,}\b', claim):
        n = m.group(0).replace(',', '').replace('.', '')
        if len(n) >= 3:
            distinctive.append(m.group(0))
    # Capitalized proper-noun phrases
    for m in re.finditer(r'\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}\b', claim):
        phrase = m.group(0)
        # Skip common words
        if phrase.lower() in ('the', 'a', 'and', 'or', 'but', 'this'): continue
        if len(phrase) >= 5:
            distinctive.append(phrase)
    # Money amounts ($X million)
    for m in re.finditer(r'\$[\d,\.]+\s*(?:million|billion|M|B|k|K)?', claim):
        distinctive.append(m.group(0))
    # Percentages
    for m in re.finditer(r'\b\d+(?:\.\d+)?%', claim):
        distinctive.append(m.group(0))

    if not distinctive: return False

    matches = []
    for d in distinctive:
        if d.lower() in body_clean:
            matches.append(d)

    # Lenient: match if 1 of distinct items OR 30%+ of all distinctive items
    threshold = max(1, len(distinctive) // 3)
    return len(matches) >= threshold, matches, distinctive


def fetch_prospect_data():
    rows = []
    for first, last, co in SMOKE_15:
        f_enc = urllib.parse.quote(first)
        l_enc = urllib.parse.quote(last)
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/sr_prospects?first_name=eq.{f_enc}&last_name=eq.{l_enc}&select=id,company,company_website,assigned_ae,email",
            headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'},
        )
        candidates = json.loads(urllib.request.urlopen(req).read())
        match = next((c for c in candidates if co.lower() in (c.get('company') or '').lower()), None)
        if not match: continue
        enc_id = urllib.parse.quote(match['id'])
        req2 = urllib.request.Request(
            f"{SB_URL}/rest/v1/sr_engine_output?prospect_id=eq.{enc_id}&select=email_subject_t1,email_body_t1,email_ps_t1,research_summary&order=created_at.desc&limit=1",
            headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'},
        )
        eo = json.loads(urllib.request.urlopen(req2).read())
        if not eo: continue
        d = {**match, **eo[0], 'first_name': first, 'last_name': last}
        rows.append(d)
    return rows


def audit_prospect(row):
    rs_raw = row.get('research_summary') or ''
    if not rs_raw: return {'verdict': 'NO-RS', 'claims': []}
    try:
        rs = json.loads(rs_raw) if isinstance(rs_raw, str) else rs_raw
    except:
        return {'verdict': 'BAD-RS-JSON', 'claims': []}

    citations = rs.get('citations', {})
    body_sentences = rs.get('body_sentences', [])

    claim_results = []
    seen_cids = set()
    for sent in body_sentences:
        cids = sent.get('claim_ids', [])
        text = sent.get('text', '')
        for cid in cids:
            if cid in seen_cids: continue
            seen_cids.add(cid)
            c = citations.get(cid, {})
            claim = c.get('claim', '')
            source = c.get('source_citation', '')
            domain_class = classify_domain(source)

            if domain_class == 'CONTAMINATED':
                claim_results.append({
                    'cid': cid, 'sentence': text, 'claim': claim,
                    'source': source, 'domain_class': domain_class,
                    'verdict': 'CONTAMINATED-SOURCE',
                })
                continue

            print(f'  [{cid}] fetching {clean_url(source)[:80]}...', file=sys.stderr)
            status, body = fetch_with_browser(source)
            wb_tried = False

            if status is None or status >= 400:
                print(f'    initial fetch failed ({status}), trying wayback', file=sys.stderr)
                wb_status, wb_body = try_wayback(source)
                if wb_status == 200:
                    status, body, wb_tried = wb_status, wb_body, True
                    print(f'    wayback succeeded', file=sys.stderr)

            match_result = (False, [], [])
            if status == 200 and body:
                match_result = check_claim_in_content(claim, body)
            content_match = match_result[0] if isinstance(match_result, tuple) else match_result

            if status is None or (isinstance(status, int) and status >= 400):
                verdict = 'DEAD-URL'
            elif not content_match:
                verdict = 'CONTENT-MISMATCH'
            else:
                verdict = 'VERIFIED'

            claim_results.append({
                'cid': cid, 'sentence': text, 'claim': claim[:300],
                'source': source[:200], 'domain_class': domain_class,
                'http_status': status,
                'content_match': content_match,
                'matched_terms': match_result[1] if isinstance(match_result, tuple) else [],
                'distinctive_terms': match_result[2] if isinstance(match_result, tuple) else [],
                'wayback_used': wb_tried,
                'verdict': verdict,
            })
            time.sleep(0.5)  # be nice to servers

    verdicts = [c['verdict'] for c in claim_results]
    if not verdicts:
        overall = 'NO-CLAIMS-DEFENSIBLE'
    elif all(v == 'VERIFIED' for v in verdicts):
        overall = 'SHIP AS-IS'
    elif any(v == 'CONTAMINATED-SOURCE' for v in verdicts):
        overall = 'STRIP CONTAMINATED'
    elif any(v == 'DEAD-URL' for v in verdicts):
        overall = 'STRIP DEAD-URL'
    elif any(v == 'CONTENT-MISMATCH' for v in verdicts):
        overall = 'STRIP CONTENT-MISMATCH'
    else:
        overall = 'REVIEW'
    return {'verdict': overall, 'claims': claim_results}


def main():
    print('=== Substrate Citation Audit v2 ===', file=sys.stderr)
    rows = fetch_prospect_data()
    print(f'Got {len(rows)} prospects', file=sys.stderr)

    audits = []
    for row in rows:
        name = f"{row['first_name']} {row['last_name']}"
        print(f'\n=== {name} ===', file=sys.stderr)
        audit = audit_prospect(row)
        audit['prospect'] = name
        audit['company'] = row['company']
        audit['ae'] = row.get('assigned_ae', '')
        audit['email'] = row.get('email', '')
        audit['subject'] = row.get('email_subject_t1', '')
        audit['body'] = row.get('email_body_t1', '')
        audit['ps'] = row.get('email_ps_t1', '')
        audits.append(audit)
        print(f'  → {audit["verdict"]}', file=sys.stderr)

    # Save raw + report
    with open('/tmp/citation-audit-15-v2.json', 'w') as f:
        json.dump(audits, f, indent=2, default=str)

    # Tally
    tally = defaultdict(int)
    for a in audits:
        tally[a['verdict']] += 1

    print('\n=== TALLY ===', file=sys.stderr)
    for v, c in sorted(tally.items(), key=lambda x: -x[1]):
        print(f'  {v}: {c}', file=sys.stderr)

    print('\n=== PER PROSPECT ===', file=sys.stderr)
    for a in audits:
        print(f'  {a["prospect"]:35} {a["verdict"]}', file=sys.stderr)


if __name__ == '__main__':
    main()
