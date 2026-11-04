"""Shared fixtures for database tests.

Target selection (deliberately NOT read from .env, so tests never hit production by accident):
- default: the local Supabase stack (`npx supabase start` at the repo root)
- another project: set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY.
  Tests only create throwaway users and `pytest-` rows, and remove them afterwards.
"""

from __future__ import annotations

import json
import os
import secrets
import subprocess
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import pytest

from lib.supabase_rest import SupabaseRest

REPO_ROOT = Path(__file__).resolve().parents[2]
SUPABASE_CLI = ["npx", "-y", "supabase@3.0.0"]


@dataclass(frozen=True)
class Target:
    url: str
    anon_key: str
    service_key: str


@dataclass(frozen=True)
class AuthUser:
    id: str
    token: str


def _local_target() -> Target | None:
    try:
        out = subprocess.run(
            [*SUPABASE_CLI, "status", "-o", "json"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=120,
            check=True,
        ).stdout
        status = json.loads(out[out.index("{") :])
        return Target(status["API_URL"], status["ANON_KEY"], status["SERVICE_ROLE_KEY"])
    except (subprocess.SubprocessError, ValueError, KeyError, OSError):
        return None


@pytest.fixture(scope="session")
def target() -> Target:
    url = os.environ.get("TEST_SUPABASE_URL")
    if url:
        return Target(
            url,
            os.environ["TEST_SUPABASE_ANON_KEY"],
            os.environ["TEST_SUPABASE_SERVICE_ROLE_KEY"],
        )
    local = _local_target()
    if local is None:
        pytest.skip("No Supabase target: run `npx supabase start` or set TEST_SUPABASE_* variables")
    return local


@pytest.fixture(scope="session")
def anon(target: Target) -> SupabaseRest:
    return SupabaseRest(target.url, target.anon_key)


@pytest.fixture(scope="session")
def service(target: Target) -> SupabaseRest:
    return SupabaseRest(target.url, target.service_key)


def _make_user(service: SupabaseRest, anon: SupabaseRest) -> Iterator[AuthUser]:
    email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    password = secrets.token_urlsafe(24)
    user_id = service.admin_create_user(email, password)
    try:
        _, token = anon.sign_in_with_password(email, password)
        yield AuthUser(user_id, token)
    finally:
        # owner_id references auth.users ON DELETE CASCADE, so this also removes the user's rows.
        service.admin_delete_user(user_id)


@pytest.fixture(scope="session")
def user_a(service: SupabaseRest, anon: SupabaseRest) -> Iterator[AuthUser]:
    yield from _make_user(service, anon)


@pytest.fixture(scope="session")
def user_b(service: SupabaseRest, anon: SupabaseRest) -> Iterator[AuthUser]:
    yield from _make_user(service, anon)


@pytest.fixture
def test_key() -> str:
    """A unique market-data key (scheme code, symbol or FX pair) for one test."""
    return f"pytest-{uuid.uuid4().hex[:10]}"
