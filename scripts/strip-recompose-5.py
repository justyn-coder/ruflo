#!/usr/bin/env python3
"""
Strip problematic specifics from 5 emails + update both sr_engine_output AND HubSpot contact properties.

The 5 prospects (with reason):
  1. Michele Sadwick — wrong attribution (1.3M is JV figure, not Greenlight alone)
  2. Gabriel Gilliland — BRMEMC specifics (21K subs, two-thirds) may not match source
  3. Zack Burnes — both claims from ZoomInfo (prohibited)
  4. Ben Lewis-Ramirez — CNE role claim from LeadIQ (prohibited); keep Vistal claim
  5. Jesus Loya — 71 employees from LeadIQ (prohibited); keep geographic reference

For each, we rewrite the body_t1 to use industry framing on the problematic specific.
Other paragraphs (P2, P3, P.S.) are preserved exactly.

Then we PATCH the contact in HS with the new content via showrev_pre_show_t1_paraN properties.
"""
import os
import sys
import json
import urllib.request
import urllib.parse

SB_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SB_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
HS_TOKEN = os.environ['HUBSPOT_PRIVATE_APP_TOKEN']

# The HS contact IDs we got from the earlier smoke load
PROSPECTS = {
    'michele-sadwick-greenlight-networks': {
        'hs_contact_id': '500590375639',
        'name': 'Michele Sadwick',
        'company': 'Greenlight Networks',
        # Original P1: "Michele, Greenlight Networks' path to approximately 1.3 million
        #               household passings by end of 2026 puts real pressure on engineering capacity."
        # The 1.3M is the COMBINED JV figure (T-Mobile/Oak Hill/GoNetspeed/Greenlight). Not Greenlight alone.
        'new_para1': "Michele, Greenlight Networks' aggressive expansion through the T-Mobile/Oak Hill joint venture puts real pressure on engineering capacity.",
    },
    'gabriel-gilliland-blue-ridge-mountain-emc': {
        'hs_contact_id': '500603489979',
        'name': 'Gabriel Gilliland',
        'company': 'Blue Ridge Mountain EMC',
        # Original P1: "Gabriel, BRMEMC Fiber is roughly two-thirds built and approaching
        #               21,000 subscribers, and the last stretch is the hardest to pace."
        # Specifics may not match the cited mountain buzz article. Going generic.
        'new_para1': "Gabriel, BRMEMC Fiber's buildout into the final stretch puts real pressure on engineering throughput — the last mile is always the hardest to pace.",
    },
    'zack-burnes-united-tel-supply': {
        'hs_contact_id': '500586810074',
        'name': 'Zack Burnes',
        'company': 'United Tel Supply',
        # Original P1: "Zack, heading to FiberConnect in Orlando while recruiting a COO
        #               tells me United Tel Supply is in a genuine growth phase, not just a busy one."
        # BOTH claims sourced from ZoomInfo (prohibited). Strip entirely, use industry framing.
        'new_para1': "Zack, for fiber supply distributors riding this BEAD-driven build cycle, keeping pace with operator demand is the quiet pressure that doesn't show up on a P&L until it's already a problem.",
    },
    'ben-lewis-ramirez-communication-network-engineering': {
        'hs_contact_id': '500591262450',
        'name': 'Ben Lewis-Ramirez',
        'company': 'Communication Network Engineering',
        # Original P1: "Ben, the Vistal rebrand and your new Director of Business Development
        #               seat point the same direction: Communication Network Engineering is
        #               expanding geographies and pursuing new client wins."
        # Vistal claim VERIFIED (inforum.com). CNE role claim sourced from LeadIQ (prohibited).
        # Keep Vistal, strip the role specific.
        'new_para1': "Ben, the Vistal rebrand signals a fresh growth strategy at CNE. As the firm expands geographies and pursues new client wins, drawing throughput becomes the constraint between sales velocity and engineering capacity.",
    },
    'jesus-loya-pc-telcom': {
        'hs_contact_id': '500601728717',
        'name': 'Jesus Loya',
        'company': 'PC Telcom',
        # Original P1: "Jesus, PC Telcom covers northeast Colorado and Nebraska as a
        #               member-owned cooperative, and with roughly 71 employees, every
        #               technician's time counts."
        # Geographic claim is fine (it's their public service area). 71 employees from
        # LeadIQ (prohibited) — actual count is ~30.
        'new_para1': "Jesus, at PC Telcom — a member-owned cooperative covering northeast Colorado and Chappell, Nebraska — every technician's time on a build counts.",
    },
}


def get_engine_output(prospect_id):
    """Fetch the latest sr_engine_output for this prospect."""
    enc = urllib.parse.quote(prospect_id)
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/sr_engine_output?prospect_id=eq.{enc}&select=id,email_body_t1,email_ps_t1&order=created_at.desc&limit=1",
        headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'},
    )
    rows = json.loads(urllib.request.urlopen(req).read())
    return rows[0] if rows else None


def update_engine_output(eo_id, new_body):
    """Patch the email_body_t1 in sr_engine_output (so future re-loads use cleaned content)."""
    enc = urllib.parse.quote(eo_id)
    body = json.dumps({'email_body_t1': new_body}).encode()
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/sr_engine_output?id=eq.{enc}",
        data=body,
        method='PATCH',
        headers={
            'apikey': SB_KEY,
            'Authorization': f'Bearer {SB_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
    )
    res = urllib.request.urlopen(req)
    return res.status == 204


def decompose_body(body, ps):
    """Match loader's decomposeEmail: split paragraphs, filter signature, treat ps as para4."""
    paragraphs = [p.strip() for p in body.split('\n\n') if p.strip()]
    # Remove signature lines
    filtered = [p for p in paragraphs if '| Inorsa |' not in p]
    return {
        'para1': filtered[0] if len(filtered) > 0 else '',
        'para2': filtered[1] if len(filtered) > 1 else '',
        'para3': filtered[2] if len(filtered) > 2 else '',
        'para4': ps or '',
    }


def update_hs_contact(contact_id, props):
    """PATCH the HubSpot contact with new showrev_pre_show_t1_* properties."""
    body = json.dumps({'properties': props}).encode()
    req = urllib.request.Request(
        f"https://api.hubapi.com/crm/v3/objects/contacts/{contact_id}",
        data=body,
        method='PATCH',
        headers={
            'Authorization': f'Bearer {HS_TOKEN}',
            'Content-Type': 'application/json',
        },
    )
    try:
        res = urllib.request.urlopen(req)
        return res.status == 200, None
    except urllib.error.HTTPError as e:
        return False, e.read().decode()[:300]


def main():
    print('=== Strip-Recompose 5 prospects ===\n')
    summary = []

    for pid, info in PROSPECTS.items():
        print(f'\n--- {info["name"]} @ {info["company"]} ---')
        eo = get_engine_output(pid)
        if not eo:
            print(f'  ❌ No sr_engine_output found')
            summary.append({'prospect': info['name'], 'status': 'no-engine-output'})
            continue

        old_body = eo.get('email_body_t1', '')
        ps = eo.get('email_ps_t1', '')
        print(f'  Old P1: {old_body[:200]}')
        print(f'  New P1: {info["new_para1"][:200]}')

        # Reconstruct full body: replace para1 with new, keep para2 + para3
        old_paragraphs = [p.strip() for p in old_body.split('\n\n') if p.strip()]
        # Remove signature
        old_filtered = [p for p in old_paragraphs if '| Inorsa |' not in p]
        # Replace first paragraph
        if len(old_filtered) >= 1:
            new_paragraphs = [info['new_para1']] + old_filtered[1:]
        else:
            new_paragraphs = [info['new_para1']]
        new_body = '\n\n'.join(new_paragraphs)

        # Update sr_engine_output
        ok = update_engine_output(eo['id'], new_body)
        print(f'  Engine output update: {"✅" if ok else "❌"}')

        # Push to HS: write each para to showrev_pre_show_t1_paraN
        new_decomposed = decompose_body(new_body, ps)
        hs_props = {
            'showrev_pre_show_t1_para1': new_decomposed['para1'],
            'showrev_pre_show_t1_para2': new_decomposed['para2'],
            'showrev_pre_show_t1_para3': new_decomposed['para3'],
            'showrev_pre_show_t1_para4': new_decomposed['para4'],
        }
        hs_ok, hs_err = update_hs_contact(info['hs_contact_id'], hs_props)
        print(f'  HS contact {info["hs_contact_id"]} update: {"✅" if hs_ok else "❌"}{" " + hs_err if hs_err else ""}')

        summary.append({
            'prospect': info['name'],
            'engine_updated': ok,
            'hs_updated': hs_ok,
            'hs_error': hs_err,
        })

    print('\n=== SUMMARY ===')
    for s in summary:
        marker = '✅' if s.get('engine_updated') and s.get('hs_updated') else '❌'
        print(f'  {marker} {s["prospect"]}')


if __name__ == '__main__':
    main()
