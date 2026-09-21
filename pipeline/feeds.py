"""Fetch and normalise articles from configured RSS feeds into one schema."""
from __future__ import annotations

import html
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit, urlunsplit

from pipeline.config import MAX_PER_FEED, RSS_FEEDS, USER_AGENT

NS = {
    "content": "http://purl.org/rss/1.0/modules/content/",
    "dc": "http://purl.org/dc/elements/1.1/",
}
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}


def fetch_bytes(url: str, timeout: int = 15) -> bytes:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def strip_html(text: str | None) -> str:
    return WS_RE.sub(" ", html.unescape(TAG_RE.sub(" ", text or ""))).strip()


def canonical_url(url: str) -> str:
    """Drop query string and fragment so UTM params do not defeat UNIQUE(url)."""
    parts = urlsplit(url.strip())
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def parse_date(text: str | None, fallback: datetime) -> datetime:
    """RFC 822 first, ISO 8601 second, fetch time last. Always timezone-aware UTC."""
    dt = None
    if text:
        for parser in (parsedate_to_datetime, datetime.fromisoformat):
            try:
                dt = parser(text.strip())
                break
            except (TypeError, ValueError, OverflowError):
                continue
    if dt is None:
        dt = fallback
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def parse_feed(source: str, xml_bytes: bytes, fetched_at: datetime) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    items: list[dict] = []
    for item in root.iter("item"):
        link = (item.findtext("link") or "").strip()
        title = strip_html(item.findtext("title"))
        if not link or not title:
            continue
        summary = item.findtext("description") or item.findtext(
            "content:encoded", None, NS
        )
        date_text = item.findtext("pubDate") or item.findtext("dc:date", None, NS)
        items.append(
            {
                "url": canonical_url(link),
                "source": source,
                "title": title,
                "summary": strip_html(summary),
                "published_at": parse_date(date_text, fetched_at),
            }
        )
    return items


def pull_all(max_per_feed: int | None = None, log=print) -> tuple[list[dict], dict[str, int]]:
    """Fetch every feed. A broken feed is logged and skipped."""
    limit = max_per_feed if max_per_feed is not None else MAX_PER_FEED
    fetched_at = datetime.now(timezone.utc)
    articles: list[dict] = []
    counts: dict[str, int] = {}
    for source, url in RSS_FEEDS.items():
        try:
            items = parse_feed(source, fetch_bytes(url), fetched_at)[:limit]
        except Exception as exc:  # noqa: BLE001 — keep other feeds going
            log(f"feed {source}: FAILED ({exc})")
            counts[source] = 0
            continue
        counts[source] = len(items)
        articles.extend(items)
        log(f"feed {source}: {len(items)} items")
    return articles, counts
