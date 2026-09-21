"""Postgres helpers for the News Pulse pipeline."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from pipeline.config import CLUSTER_DAYS, DATABASE_URL

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "database" / "migrations" / "001_init.sql"


def connect() -> psycopg.Connection:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def apply_schema(conn: psycopg.Connection) -> None:
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


def existing_urls(conn: psycopg.Connection, urls: list[str]) -> set[str]:
    if not urls:
        return set()
    with conn.cursor() as cur:
        cur.execute("SELECT url FROM articles WHERE url = ANY(%s)", (urls,))
        return {row["url"] for row in cur.fetchall()}


def insert_articles(conn: psycopg.Connection, articles: list[dict]) -> int:
    """Insert new articles; ON CONFLICT DO NOTHING. Returns inserted count."""
    if not articles:
        return 0
    inserted = 0
    with conn.cursor() as cur:
        for a in articles:
            cur.execute(
                """
                INSERT INTO articles (url, source, title, summary, content, published_at)
                VALUES (%(url)s, %(source)s, %(title)s, %(summary)s, %(content)s, %(published_at)s)
                ON CONFLICT (url) DO NOTHING
                """,
                {
                    "url": a["url"],
                    "source": a["source"],
                    "title": a["title"],
                    "summary": a.get("summary") or "",
                    "content": a.get("content"),
                    "published_at": a["published_at"],
                },
            )
            inserted += cur.rowcount
    conn.commit()
    return inserted


def load_recent_articles(conn: psycopg.Connection, days: int | None = None) -> list[dict]:
    window = days if days is not None else CLUSTER_DAYS
    since = datetime.now(timezone.utc) - timedelta(days=window)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, url, source, title, summary, content, published_at
            FROM articles
            WHERE published_at >= %s
            ORDER BY published_at ASC
            """,
            (since,),
        )
        return list(cur.fetchall())


def replace_clusters(
    conn: psycopg.Connection,
    clusters: list[dict],
    articles: list[dict],
) -> int:
    """Rebuild cluster rows for the current article set in one transaction."""
    article_ids = [a["id"] for a in articles]
    with conn.cursor() as cur:
        if article_ids:
            cur.execute(
                "UPDATE articles SET cluster_id = NULL WHERE id = ANY(%s)",
                (article_ids,),
            )
            # Drop orphan clusters that no longer have members.
            cur.execute(
                """
                DELETE FROM clusters c
                WHERE NOT EXISTS (
                  SELECT 1 FROM articles a WHERE a.cluster_id = c.id
                )
                """
            )
        created = 0
        for cluster in clusters:
            cur.execute(
                """
                INSERT INTO clusters (label, created_at, updated_at)
                VALUES (%s, now(), now())
                RETURNING id
                """,
                (cluster["label"],),
            )
            cluster_id = cur.fetchone()["id"]
            member_ids = [articles[i]["id"] for i in cluster["article_indices"]]
            cur.execute(
                "UPDATE articles SET cluster_id = %s WHERE id = ANY(%s)",
                (cluster_id, member_ids),
            )
            created += 1
    conn.commit()
    return created
