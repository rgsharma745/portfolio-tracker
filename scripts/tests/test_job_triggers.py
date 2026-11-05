"""The 30-minute lock behind "Run now": claim_job_trigger and release_job_trigger.

Writes the shared job_triggers rows, so like the job tests it targets the local stack only.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timedelta
from typing import Any

import pytest

from lib.supabase_rest import SupabaseRest

from .conftest import AuthUser

JOBS = ("fetch_nav", "fetch_prices")


@pytest.fixture(autouse=True)
def clean(service: SupabaseRest) -> Iterator[None]:
    for job in JOBS:
        service.delete("job_triggers", job=f"eq.{job}")
    yield
    for job in JOBS:
        service.delete("job_triggers", job=f"eq.{job}")


def claim(api: SupabaseRest, job: str, token: str | None) -> dict[str, Any]:
    resp = api.rpc("claim_job_trigger", {"p_job": job}, token=token)
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert len(rows) == 1
    return rows[0]


def ts(value: str) -> datetime:
    return datetime.fromisoformat(value)


def test_first_claim_wins_and_second_is_locked(anon: SupabaseRest, user_a: AuthUser) -> None:
    first = claim(anon, "fetch_nav", user_a.token)
    assert first["claimed"] is True
    assert ts(first["next_allowed_at"]) - ts(first["claimed_at"]) == timedelta(minutes=30)

    second = claim(anon, "fetch_nav", user_a.token)
    assert second["claimed"] is False
    assert second["next_allowed_at"] == first["next_allowed_at"]


def test_each_job_has_its_own_lock(anon: SupabaseRest, user_a: AuthUser) -> None:
    assert claim(anon, "fetch_nav", user_a.token)["claimed"] is True
    assert claim(anon, "fetch_prices", user_a.token)["claimed"] is True


def test_claim_allowed_again_after_30_minutes(
    anon: SupabaseRest, service: SupabaseRest, user_a: AuthUser
) -> None:
    claim(anon, "fetch_nav", user_a.token)
    old = (datetime.now().astimezone() - timedelta(minutes=31)).isoformat()
    service.update("job_triggers", {"triggered_at": old}, job="eq.fetch_nav").raise_for_status()
    assert claim(anon, "fetch_nav", user_a.token)["claimed"] is True


def test_release_removes_only_the_matching_claim(anon: SupabaseRest, user_a: AuthUser) -> None:
    first = claim(anon, "fetch_nav", user_a.token)
    other = (ts(first["claimed_at"]) - timedelta(seconds=1)).isoformat()
    resp = anon.rpc("release_job_trigger", {"p_job": "fetch_nav", "p_at": other}, token=user_a.token)
    assert resp.status_code in (200, 204), resp.text
    assert claim(anon, "fetch_nav", user_a.token)["claimed"] is False

    resp = anon.rpc("release_job_trigger", {"p_job": "fetch_nav", "p_at": first["claimed_at"]},
                    token=user_a.token)
    assert resp.status_code in (200, 204), resp.text
    assert claim(anon, "fetch_nav", user_a.token)["claimed"] is True


def test_unknown_job_is_rejected(anon: SupabaseRest, user_a: AuthUser) -> None:
    resp = anon.rpc("claim_job_trigger", {"p_job": "backup"}, token=user_a.token)
    assert resp.status_code == 400, resp.text


def test_anon_cannot_claim_or_release(anon: SupabaseRest) -> None:
    assert anon.rpc("claim_job_trigger", {"p_job": "fetch_nav"}).status_code in (401, 403)
    resp = anon.rpc("release_job_trigger", {"p_job": "fetch_nav", "p_at": "2026-11-05T00:00:00Z"})
    assert resp.status_code in (401, 403)


def test_owner_can_read_but_not_write_directly(anon: SupabaseRest, user_a: AuthUser) -> None:
    claim(anon, "fetch_nav", user_a.token)
    rows = anon.select("job_triggers", token=user_a.token).json()
    assert [r["job"] for r in rows] == ["fetch_nav"]

    t = user_a.token
    assert anon.insert("job_triggers", {"job": "fetch_prices", "triggered_at": "2026-11-05T00:00:00Z"},
                       token=t).status_code in (401, 403)
    assert anon.update("job_triggers", {"triggered_at": "2000-01-01T00:00:00Z"}, token=t,
                       job="eq.fetch_nav").status_code in (401, 403)
    assert anon.delete("job_triggers", token=t, job="eq.fetch_nav").status_code in (401, 403)
