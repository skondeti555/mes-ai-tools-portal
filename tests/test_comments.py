"""Tests for the /api/rfq_comments endpoint handlers.

Handlers are called directly (no TestClient) so we don't depend on httpx, and
a fake Redis stands in for Upstash so no network/credentials are needed.
"""

import asyncio

import pytest
from fastapi import HTTPException

import api.rfq_comments as comments
from api.rfq_comments import CommentUpdate, _check_access, get_comments, set_comment


class FakeRedis:
    """Minimal stand-in for the Upstash hash operations we use."""

    def __init__(self, initial=None):
        self.store = dict(initial or {})

    def hgetall(self, key):
        return dict(self.store)

    def hset(self, key, field, value):
        self.store[field] = value

    def hdel(self, key, field):
        self.store.pop(field, None)


@pytest.fixture
def configured(monkeypatch):
    """Set the access code and point _get_redis at a fake store."""
    monkeypatch.setenv("RFQ_COMMENTS_ACCESS_CODE", "letmein")
    fake = FakeRedis({"1001": "Open due to Mexico"})
    monkeypatch.setattr(comments, "_get_redis", lambda: fake)
    return fake


# ── access control ─────────────────────────────────────────────

def test_check_access_unconfigured_raises_503(monkeypatch):
    monkeypatch.delenv("RFQ_COMMENTS_ACCESS_CODE", raising=False)
    with pytest.raises(HTTPException) as exc:
        _check_access("anything")
    assert exc.value.status_code == 503


def test_check_access_wrong_code_raises_401(monkeypatch):
    monkeypatch.setenv("RFQ_COMMENTS_ACCESS_CODE", "letmein")
    with pytest.raises(HTTPException) as exc:
        _check_access("nope")
    assert exc.value.status_code == 401


def test_check_access_missing_code_raises_401(monkeypatch):
    monkeypatch.setenv("RFQ_COMMENTS_ACCESS_CODE", "letmein")
    with pytest.raises(HTTPException) as exc:
        _check_access(None)
    assert exc.value.status_code == 401


def test_get_comments_rejects_without_code(monkeypatch):
    monkeypatch.setenv("RFQ_COMMENTS_ACCESS_CODE", "letmein")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_comments(x_access_code=None))
    assert exc.value.status_code == 401


# ── read / write ───────────────────────────────────────────────

def test_get_comments_returns_store(configured):
    resp = asyncio.run(get_comments(x_access_code="letmein"))
    import json

    assert json.loads(resp.body) == {"1001": "Open due to Mexico"}


def test_set_comment_writes_field(configured):
    asyncio.run(set_comment(CommentUpdate(rfqNumber="1002", comment="Waiting on VN"),
                            x_access_code="letmein"))
    assert configured.store["1002"] == "Waiting on VN"


def test_empty_comment_deletes_field(configured):
    asyncio.run(set_comment(CommentUpdate(rfqNumber="1001", comment="   "),
                            x_access_code="letmein"))
    assert "1001" not in configured.store


def test_set_comment_requires_rfq_number(configured):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(set_comment(CommentUpdate(rfqNumber="  ", comment="x"),
                                x_access_code="letmein"))
    assert exc.value.status_code == 400
