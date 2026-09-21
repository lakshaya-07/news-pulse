"""CLI entry: fetch feeds, store new articles, rebuild TF-IDF clusters."""
from __future__ import annotations

import argparse
import sys

from pipeline import cluster as cluster_mod
from pipeline import db as db_mod
from pipeline.config import CLUSTER_DAYS, MAX_PER_FEED, SIMILARITY_THRESHOLD
from pipeline.extract import extract_many
from pipeline.feeds import pull_all


def run(log=print, days: int | None = None, threshold: float | None = None) -> int:
    conn = db_mod.connect()
    try:
        db_mod.apply_schema(conn)
        articles, counts = pull_all(max_per_feed=MAX_PER_FEED, log=log)
        urls = [a["url"] for a in articles]
        known = db_mod.existing_urls(conn, urls)
        new_items = [a for a in articles if a["url"] not in known]
        log(f"fetched {len(articles)} items; {len(new_items)} new")

        if new_items:
            bodies = extract_many([a["url"] for a in new_items], log=log)
            for a in new_items:
                a["content"] = bodies.get(a["url"])
            inserted = db_mod.insert_articles(conn, new_items)
            log(f"stored {inserted} new articles")
        else:
            log("stored 0 new articles")

        window = days if days is not None else CLUSTER_DAYS
        recent = db_mod.load_recent_articles(conn, days=window)
        log(f"clustering {len(recent)} articles from last {window} day(s)")
        groups = cluster_mod.cluster_articles(
            recent,
            threshold=threshold if threshold is not None else SIMILARITY_THRESHOLD,
        )
        created = db_mod.replace_clusters(conn, groups, recent)
        log(f"created {created} clusters (threshold={threshold or SIMILARITY_THRESHOLD})")
        for source, n in counts.items():
            log(f"summary {source}: {n}")
        return 0
    finally:
        conn.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="News Pulse ingest + cluster pipeline")
    parser.add_argument("--days", type=int, default=None, help="Recluster window in days")
    parser.add_argument(
        "--threshold",
        type=float,
        default=None,
        help="Cosine similarity threshold for TF-IDF clustering",
    )
    args = parser.parse_args(argv)
    try:
        return run(days=args.days, threshold=args.threshold)
    except Exception as exc:  # noqa: BLE001
        print(f"pipeline failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
