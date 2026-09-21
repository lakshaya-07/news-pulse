"""Full-article HTML extraction with Trafilatura; falls back to RSS summary."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed

import trafilatura

from pipeline.config import USER_AGENT
from pipeline.feeds import fetch_bytes

MIN_CHARS = 120


def extract_one(url: str, timeout: int = 10) -> str | None:
    try:
        html = fetch_bytes(url, timeout=timeout).decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        return None
    try:
        text = trafilatura.extract(
            html,
            include_comments=False,
            include_tables=False,
            favor_recall=True,
            url=url,
        )
    except Exception:  # noqa: BLE001
        return None
    if not text or len(text.strip()) < MIN_CHARS:
        return None
    return text.strip()


def extract_many(
    urls: list[str],
    workers: int = 8,
    log=print,
) -> dict[str, str]:
    """Return url -> body for successful extractions only."""
    results: dict[str, str] = {}
    if not urls:
        return results
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(extract_one, url): url for url in urls}
        for fut in as_completed(futures):
            url = futures[fut]
            try:
                body = fut.result()
            except Exception:  # noqa: BLE001
                body = None
            if body:
                results[url] = body
    log(f"extracted full text for {len(results)}/{len(urls)} new articles")
    return results
