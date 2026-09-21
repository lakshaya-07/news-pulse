"""TF-IDF + cosine similarity clustering (Option B).

Articles whose vectors have cosine similarity >= threshold are linked;
connected components of size >= 2 become topic clusters.
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from pipeline.config import SIMILARITY_THRESHOLD


def _document(article: dict) -> str:
    parts = [
        article.get("title") or "",
        article.get("summary") or "",
    ]
    content = article.get("content") or ""
    if content:
        parts.append(content[:800])
    return " ".join(parts)


def _union_find(n: int):
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    return find, union


def cluster_articles(
    articles: list[dict],
    threshold: float | None = None,
) -> list[dict]:
    """Return clusters: [{label, article_indices: [int, ...]}, ...]."""
    if len(articles) < 2:
        return []

    thresh = SIMILARITY_THRESHOLD if threshold is None else threshold
    docs = [_document(a) for a in articles]
    vectorizer = TfidfVectorizer(
        stop_words="english",
        max_df=0.85,
        min_df=1,
        ngram_range=(1, 2),
        max_features=8000,
        sublinear_tf=True,
    )
    try:
        matrix = vectorizer.fit_transform(docs)
    except ValueError:
        return []

    sim = cosine_similarity(matrix)
    n = len(articles)
    find, union = _union_find(n)

    for i in range(n):
        for j in range(i + 1, n):
            if sim[i, j] >= thresh:
                union(i, j)

    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)

    feature_names = vectorizer.get_feature_names_out()
    clusters: list[dict] = []
    for indices in groups.values():
        if len(indices) < 2:
            continue
        # Label from mean TF-IDF of member docs (top terms).
        sub = matrix[indices]
        mean_vec = np.asarray(sub.mean(axis=0)).ravel()
        top_idx = mean_vec.argsort()[::-1][:3]
        terms = [feature_names[k] for k in top_idx if mean_vec[k] > 0]
        label = " · ".join(terms) if terms else (articles[indices[0]].get("title") or "Story")
        # Prefer a short headline-ish label if terms are weak.
        if not terms:
            label = articles[indices[0]]["title"][:80]
        clusters.append({"label": label[:120], "article_indices": sorted(indices)})

    clusters.sort(key=lambda c: -len(c["article_indices"]))
    return clusters
