"""The REST client refuses plain http except for the local stack (the key would go unencrypted)."""

import pytest

from lib.supabase_rest import SupabaseRest


@pytest.mark.parametrize(
    "url",
    ["https://abc.supabase.co", "http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"],
)
def test_accepts_https_and_local_http(url: str) -> None:
    SupabaseRest(url, "key")


@pytest.mark.parametrize("url", ["http://abc.supabase.co", "abc.supabase.co", "ftp://localhost", ""])
def test_refuses_other_urls(url: str) -> None:
    with pytest.raises(ValueError, match="https"):
        SupabaseRest(url, "key")


def test_retries_only_requests_to_the_project() -> None:
    session = SupabaseRest("http://127.0.0.1:54321", "key")._http  # type: ignore[attr-defined]
    assert session.get_adapter("http://127.0.0.1:54321/rest/v1/portfolios").max_retries.total == 3
    assert session.get_adapter("https://elsewhere.example/").max_retries.total == 0
