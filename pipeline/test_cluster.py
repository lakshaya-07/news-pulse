"""Self-check: related headlines should cluster together under TF-IDF."""
from __future__ import annotations

from pipeline.cluster import cluster_articles


def test_related_headlines_cluster():
    articles = [
        {
            "title": "Earthquake strikes southern Turkey overnight",
            "summary": "A strong earthquake hit southern Turkey causing damage in several towns.",
            "content": "",
        },
        {
            "title": "Turkey quake leaves residents shaken",
            "summary": "Residents in southern Turkey described a powerful earthquake overnight.",
            "content": "",
        },
        {
            "title": "Asian Games opening ceremony dazzles hosts",
            "summary": "Athletes gathered for the opening ceremony of the Asian Games.",
            "content": "",
        },
        {
            "title": "Hosts open Asian Games with spectacular show",
            "summary": "The Asian Games began with a ceremony featuring athletes from across Asia.",
            "content": "",
        },
        {
            "title": "Central bank holds interest rates steady",
            "summary": "Policymakers left interest rates unchanged amid inflation concerns.",
            "content": "",
        },
    ]
    clusters = cluster_articles(articles, threshold=0.2)
    assert len(clusters) >= 2, clusters
    membership = {tuple(sorted(c["article_indices"])) for c in clusters}
    assert (0, 1) in membership or any(0 in c["article_indices"] and 1 in c["article_indices"] for c in clusters)
    assert (2, 3) in membership or any(2 in c["article_indices"] and 3 in c["article_indices"] for c in clusters)
    print("ok: related headlines clustered", [c["label"] for c in clusters])


if __name__ == "__main__":
    test_related_headlines_cluster()
