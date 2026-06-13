#!/usr/bin/env python3
"""
Stop-hook R5-lite — within-session judge calibration loop.

Plan v2 §"Stop-hook R5-lite": fires on Stop event after every assistant turn.
Reads judge verdicts from sr_emails for the current Claude Code session,
returns a short `additionalContext` summary if the success rate moved
meaningfully vs the running session average.

Depends on:
  - F8 (sr_pipeline_runs telemetry) — session-id boundary
  - F9 (sr_emails per-touch persistence) — judge_verdict + judge_score source

Hook contract (Claude Code 2.1.152+):
  - Receives Stop event input on stdin (JSON, ignored — we read state from DB)
  - Returns stdout JSON: {"hookSpecificOutput": {"additionalContext": "..."}}
  - Empty stdout = no context added this turn

Gate (prevents hook pollution per plan v2 downside-acknowledged section):
  - ≥5 verdicts this session (under 5 = noisy sample, suppress)
  - success-rate movement ≥10 percentage points vs running average (else
    no meaningful signal change)
  - judge_score std-dev <25 on the latest batch (noisy batch suppressed)

Fail closed: any DB error, missing env var, or missing key returns no
context. The hook is best-effort enrichment, NEVER a hard gate.
"""

import json
import os
import sys
from collections import Counter
from urllib import error, parse, request

SUPABASE_URL = os.environ.get(
    "NEXT_PUBLIC_SUPABASE_URL", "https://slttpknnuthbttjuzrnz.supabase.co"
)
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
)
SESSION_ID = os.environ.get("CLAUDE_CODE_SESSION_ID")

MIN_BATCH_SIZE = 5
MIN_MOVEMENT_PP = 10
MAX_SCORE_STDDEV = 25.0
SUCCESS_VERDICTS = {"ship"}

ROLLING_AVG_DIR = "/tmp"
ROLLING_AVG_PATH = (
    f"{ROLLING_AVG_DIR}/judge-rolling-avg-{SESSION_ID}.json" if SESSION_ID else None
)


def _http_get(url: str) -> list[dict] | None:
    """GET against Supabase REST; return parsed JSON list or None on failure."""
    if not SUPABASE_KEY:
        return None
    req = request.Request(
        url,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        with request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read().decode())
        return data if isinstance(data, list) else None
    except (error.URLError, error.HTTPError, json.JSONDecodeError, TimeoutError):
        return None


def fetch_session_verdicts() -> list[dict] | None:
    """
    Find this session's pipeline runs (F8 stamps session_id in config),
    then fetch sr_emails rows created since the earliest of those runs.
    """
    if not SUPABASE_KEY or not SESSION_ID:
        return None

    runs_url = (
        f"{SUPABASE_URL}/rest/v1/sr_pipeline_runs"
        f"?config->>session_id=eq.{parse.quote(SESSION_ID)}"
        f"&select=started_at"
        f"&order=started_at.asc"
        f"&limit=10"
    )
    runs = _http_get(runs_url)
    if not runs:
        return None

    earliest = runs[0].get("started_at")
    if not earliest:
        return None

    emails_url = (
        f"{SUPABASE_URL}/rest/v1/sr_emails"
        f"?created_at=gte.{parse.quote(earliest)}"
        f"&select=judge_verdict,judge_score"
        f"&order=created_at.desc"
        f"&limit=100"
    )
    return _http_get(emails_url)


def load_rolling_avg() -> dict | None:
    if not ROLLING_AVG_PATH:
        return None
    try:
        with open(ROLLING_AVG_PATH, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def save_rolling_avg(payload: dict) -> None:
    if not ROLLING_AVG_PATH:
        return
    try:
        with open(ROLLING_AVG_PATH, "w") as f:
            json.dump(payload, f)
    except OSError:
        pass


def compute_context() -> str | None:
    emails = fetch_session_verdicts()
    if not emails or len(emails) < MIN_BATCH_SIZE:
        return None

    # Score std-dev gate — drop noisy batches before computing anything else
    scores = []
    for e in emails:
        s = e.get("judge_score")
        if s is not None:
            try:
                scores.append(float(s))
            except (TypeError, ValueError):
                pass
    if scores and len(scores) >= 2:
        mean = sum(scores) / len(scores)
        variance = sum((s - mean) ** 2 for s in scores) / len(scores)
        stddev = variance**0.5
        if stddev > MAX_SCORE_STDDEV:
            return None

    successes = sum(1 for e in emails if e.get("judge_verdict") in SUCCESS_VERDICTS)
    success_rate = (successes / len(emails)) * 100

    prev = load_rolling_avg()
    save_rolling_avg({"success_rate": success_rate, "sample_size": len(emails)})

    if not prev or "success_rate" not in prev:
        # First observation this session — establish baseline, no context yet
        return None

    prev_rate = prev["success_rate"]
    delta_pp = success_rate - prev_rate
    if abs(delta_pp) < MIN_MOVEMENT_PP:
        return None

    if delta_pp > 0:
        return (
            f"Judge feedback: last {len(emails)} emails averaged "
            f"{success_rate:.0f}% ship-verdict (up from {prev_rate:.0f}%, "
            f"+{delta_pp:.0f}pp). Continue current substrate selection pattern."
        )

    non_ship = Counter(
        e.get("judge_verdict")
        for e in emails
        if e.get("judge_verdict") not in SUCCESS_VERDICTS and e.get("judge_verdict")
    )
    if non_ship:
        top_verdict, top_count = non_ship.most_common(1)[0]
        return (
            f"Judge feedback: {top_count} of last {len(emails)} emails "
            f"flagged '{top_verdict}' (ship rate dropped "
            f"{abs(delta_pp):.0f}pp to {success_rate:.0f}%). "
            f"Tighten substrate selection."
        )
    return (
        f"Judge feedback: ship rate dropped {abs(delta_pp):.0f}pp to "
        f"{success_rate:.0f}% on {len(emails)} emails. "
        f"Tighten substrate selection."
    )


def main() -> int:
    # Drain any stdin the hook contract delivers (we don't need it)
    try:
        sys.stdin.read()
    except Exception:
        pass

    try:
        ctx = compute_context()
    except Exception:
        # Fail closed — never block the Stop event
        return 0

    if ctx:
        print(json.dumps({"hookSpecificOutput": {"additionalContext": ctx}}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
