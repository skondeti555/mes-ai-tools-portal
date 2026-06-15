"""
Vercel Python Serverless Function: /api/rfq_comments

Stores per-RFQ comments for the Quoted RFQs viewer in Upstash Redis as a
single hash keyed by RFQ # (field = RFQ #, value = comment text).

Both GET and POST require a shared access code passed in the X-Access-Code
header. The code lives only in the RFQ_COMMENTS_ACCESS_CODE env var and is
never shipped to the browser bundle, so comment text is never returned to
anyone without it. See docs/CLAUDE.md "PUBLIC repo" rule — nothing here is
committed; comments live only in Upstash, the code only in Vercel env vars.
"""

import hmac
import os
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI()

# Single Redis hash holding every comment: field = RFQ #, value = comment text.
COMMENTS_KEY = "quoted_rfq_comments"


def _get_redis():
    """Return an Upstash Redis client, or None if not configured (e.g. local dev).

    Accepts either the Upstash-native env var names or the KV_* aliases that the
    Vercel Marketplace integration also injects.
    """
    url = os.environ.get("UPSTASH_REDIS_REST_URL") or os.environ.get("KV_REST_API_URL")
    token = os.environ.get("UPSTASH_REDIS_REST_TOKEN") or os.environ.get("KV_REST_API_TOKEN")
    if not url or not token:
        return None
    # Imported lazily so the page/tests work even when the package/creds are absent.
    from upstash_redis import Redis

    return Redis(url=url, token=token)


def _check_access(code: Optional[str]) -> None:
    """Validate the shared access code. 503 if unset on the server, 401 on mismatch."""
    expected = os.environ.get("RFQ_COMMENTS_ACCESS_CODE")
    if not expected:
        raise HTTPException(status_code=503, detail="Comments are not configured on the server.")
    if not code or not hmac.compare_digest(code, expected):
        raise HTTPException(status_code=401, detail="Invalid access code.")


class CommentUpdate(BaseModel):
    rfqNumber: str
    comment: str = ""


@app.get("/api/rfq_comments")
async def get_comments(x_access_code: Optional[str] = Header(default=None)):
    """Return all comments as { "<RFQ #>": "<comment>", ... }."""
    _check_access(x_access_code)
    redis = _get_redis()
    if redis is None:
        # Store not configured (e.g. local dev) — behave as "no comments yet".
        return JSONResponse({})
    data = redis.hgetall(COMMENTS_KEY) or {}
    return JSONResponse(data)


@app.post("/api/rfq_comments")
async def set_comment(update: CommentUpdate, x_access_code: Optional[str] = Header(default=None)):
    """Set or clear the comment for one RFQ. Empty/blank comment deletes the field."""
    _check_access(x_access_code)
    rfq = (update.rfqNumber or "").strip()
    if not rfq:
        raise HTTPException(status_code=400, detail="rfqNumber is required.")
    redis = _get_redis()
    if redis is None:
        raise HTTPException(status_code=503, detail="Comments store is not configured.")
    comment = (update.comment or "").strip()
    if comment:
        redis.hset(COMMENTS_KEY, rfq, comment)
    else:
        redis.hdel(COMMENTS_KEY, rfq)
    return JSONResponse({"rfqNumber": rfq, "comment": comment})
