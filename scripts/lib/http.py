"""HTTP for the market-data providers: timeouts, retries, and an honest User-Agent.

The jobs identify themselves as what they are; they never pose as a browser or try to get
around a site's bot checks. A source that refuses scripted access is simply not used.
"""

from __future__ import annotations

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

USER_AGENT = "portfolio-tracker-jobs/1.0 (personal portfolio tracker; scheduled daily job)"
TIMEOUT_SECONDS = 30


def session() -> requests.Session:
    retry = Retry(
        total=3,
        backoff_factor=2,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s


def get(http: requests.Session, url: str, **params: str) -> requests.Response:
    """GET with the standard timeout; raises for 4xx/5xx."""
    resp = http.get(url, params=params or None, timeout=TIMEOUT_SECONDS)
    resp.raise_for_status()
    return resp
