"""Minimal Supabase REST/Auth client built on requests (timeouts + retries).

Works with both key formats: legacy JWT keys and the newer sb_publishable_/sb_secret_ keys.
Never logs keys or tokens.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

TIMEOUT_SECONDS = 15


# Plain http only for the local stack (npx supabase start); anywhere else the key would travel
# unencrypted, so a mistyped SUPABASE_URL is refused rather than used.
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def _check_url(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme == "https" or (parts.scheme == "http" and parts.hostname in LOCAL_HOSTS):
        return
    raise ValueError("Supabase URL must be https:// (http:// only for localhost)")


def _session(base_url: str) -> requests.Session:
    """A session that retries requests to `base_url` (the project) and nowhere else."""
    retry = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=None,  # retry every method; our writes are idempotent upserts
    )
    session = requests.Session()
    session.mount(base_url.rstrip("/") + "/", HTTPAdapter(max_retries=retry))
    return session


def _is_jwt(key: str) -> bool:
    return key.count(".") == 2


@dataclass(frozen=True)
class SupabaseRest:
    url: str
    key: str
    """The API key: anon/publishable for user-level calls, service-role/secret for jobs."""

    def __post_init__(self) -> None:
        _check_url(self.url)
        object.__setattr__(self, "_http", _session(self.url))

    def _headers(self, token: str | None, prefer: str | None) -> dict[str, str]:
        headers = {"apikey": self.key, "Content-Type": "application/json"}
        bearer = token or (self.key if _is_jwt(self.key) else None)
        if bearer:
            headers["Authorization"] = f"Bearer {bearer}"
        if prefer:
            headers["Prefer"] = prefer
        return headers

    def request(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        params: dict[str, str] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> requests.Response:
        http: requests.Session = getattr(self, "_http")
        return http.request(
            method,
            f"{self.url.rstrip('/')}{path}",
            headers=self._headers(token, prefer),
            params=params,
            json=json,
            timeout=TIMEOUT_SECONDS,
        )

    # ---- PostgREST ----

    def select(self, table: str, *, token: str | None = None, **filters: str) -> requests.Response:
        return self.request("GET", f"/rest/v1/{table}", token=token, params={"select": "*", **filters})

    def insert(self, table: str, row: dict[str, Any], *, token: str | None = None) -> requests.Response:
        return self.request(
            "POST", f"/rest/v1/{table}", token=token, json=row, prefer="return=representation"
        )

    def update(
        self, table: str, values: dict[str, Any], *, token: str | None = None, **filters: str
    ) -> requests.Response:
        return self.request(
            "PATCH",
            f"/rest/v1/{table}",
            token=token,
            params=filters,
            json=values,
            prefer="return=representation",
        )

    def delete(self, table: str, *, token: str | None = None, **filters: str) -> requests.Response:
        return self.request(
            "DELETE", f"/rest/v1/{table}", token=token, params=filters, prefer="return=representation"
        )

    def rpc(self, fn: str, args: dict[str, Any], *, token: str | None = None) -> requests.Response:
        return self.request("POST", f"/rest/v1/rpc/{fn}", token=token, json=args)

    # ---- Auth ----

    def sign_in_with_password(self, email: str, password: str) -> tuple[str, str]:
        """Returns (user_id, access_token)."""
        resp = self.request(
            "POST",
            "/auth/v1/token",
            params={"grant_type": "password"},
            json={"email": email, "password": password},
        )
        resp.raise_for_status()
        body = resp.json()
        return body["user"]["id"], body["access_token"]

    def admin_create_user(self, email: str, password: str) -> str:
        """Requires the service-role/secret key. Works even when public sign-up is disabled."""
        resp = self.request(
            "POST",
            "/auth/v1/admin/users",
            json={"email": email, "password": password, "email_confirm": True},
        )
        resp.raise_for_status()
        return str(resp.json()["id"])

    def admin_find_user(self, email: str) -> str | None:
        """The id of the user with this email, or None. Fine for a handful of users."""
        resp = self.request("GET", "/auth/v1/admin/users", params={"per_page": "1000"})
        resp.raise_for_status()
        wanted = email.strip().lower()
        for user in resp.json().get("users", []):
            if str(user.get("email", "")).lower() == wanted:
                return str(user["id"])
        return None

    def admin_user_exists(self, user_id: str) -> bool:
        resp = self.request("GET", f"/auth/v1/admin/users/{user_id}")
        if resp.status_code == 404:
            return False
        resp.raise_for_status()
        return True

    def admin_delete_user(self, user_id: str) -> None:
        resp = self.request("DELETE", f"/auth/v1/admin/users/{user_id}")
        if resp.status_code != 404:
            resp.raise_for_status()
