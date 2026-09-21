"""News Pulse pipeline configuration.

RSS feed URLs match the credible world desks used by the Khabar Threads
reference project (idea only — this module is original).
"""
from __future__ import annotations

import os

RSS_FEEDS: dict[str, str] = {
    "BBC": "http://feeds.bbci.co.uk/news/world/rss.xml",
    "NPR": "https://feeds.npr.org/1004/rss.xml",
    "Guardian": "https://www.theguardian.com/world/rss",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml",
}

SIMILARITY_THRESHOLD = float(os.environ.get("SIMILARITY_THRESHOLD", "0.28"))
CLUSTER_DAYS = int(os.environ.get("CLUSTER_DAYS", "3"))
MAX_PER_FEED = int(os.environ.get("MAX_PER_FEED", "40"))
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Browser-like agent — some outlets 403 bare urllib.
USER_AGENT = "Mozilla/5.0 (compatible; NewsPulse/1.0; +https://github.com/news-pulse)"
