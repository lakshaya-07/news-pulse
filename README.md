# News Pulse

Topic-clustered news timeline: live RSS from BBC, NPR, The Guardian, and Al Jazeera, grouped with **TF-IDF + cosine similarity**, served by a Node API, and read as an editorial timeline in Next.js.

| | |
|---|---|
| Frontend | Next.js (Vercel-ready) |
| API | Express on Node (Render-ready Docker image) |
| Pipeline | Python (`pipeline/`) spawned by the API |
| Database | Postgres (local Docker Compose or Neon) |

## Architecture

```
RSS feeds → pipeline (fetch, extract, TF-IDF cluster) → Postgres
                                                      ↑
Frontend (Next.js) ← REST API (Express) ──────────────┘
                         │
                         └─ POST /api/ingest/trigger → spawn python -m pipeline.main
```

## Local setup

Prerequisites: Node 22+, Python 3.11+, Docker (for Postgres).

```bash
cp .env.example .env

# Database
docker compose up -d

# Python pipeline
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r pipeline/requirements.txt
export DATABASE_URL=postgresql://newspulse:newspulse@localhost:5432/newspulse
python -m pipeline.main

# API
cd backend && npm install && npm run dev   # http://localhost:43101

# Frontend (another terminal)
cd frontend && npm install && npm run dev  # http://localhost:43100
```

Create `frontend/.env.local` if needed:

```
NEXT_PUBLIC_API_URL=/news-api
API_INTERNAL_URL=http://127.0.0.1:43101
```

The frontend proxies `/news-api/*` to the Express API (see `next.config.ts`), so the browser only needs the Next.js port.

### Example API calls

```bash
curl http://localhost:43101/health
curl http://localhost:43101/api/timeline
curl http://localhost:43101/api/clusters
curl -X POST http://localhost:43101/api/ingest/trigger
# → { "jobId": "...", "status": "running" }
curl http://localhost:43101/api/ingest/status/<jobId>
```

## Clustering

Articles from the last `CLUSTER_DAYS` (default 3) are vectorized with scikit-learn `TfidfVectorizer` on title + summary (+ body snippet). Pairs with cosine similarity ≥ `SIMILARITY_THRESHOLD` (default `0.28`) form a graph; connected components of size ≥ 2 become clusters. Labels are the top shared TF-IDF terms.

## Deployment

- **Frontend:** Vercel — set `NEXT_PUBLIC_API_URL` to the public API URL (or keep `/news-api` with a rewrite/edge proxy). Set `API_INTERNAL_URL` at build time if using the built-in rewrite to a private API host.
- **API + pipeline:** Render Docker service from the root [`Dockerfile`](Dockerfile) / [`render.yaml`](render.yaml). Set `DATABASE_URL`, `FRONTEND_URL` / `CORS_ORIGIN`, `SIMILARITY_THRESHOLD`, `PYTHON_BIN=python3`.
- **Database:** Neon Postgres (`sslmode=require`). Schema is applied automatically on API boot and each pipeline run.

CORS allows only `FRONTEND_URL` / `CORS_ORIGIN` (no wildcard).

## References

This project is inspired by the [Khabar Threads](https://github.com/gauravsoodtech/khabar-threads) repository by Gaurav Sood, which tackled the same news-clustering challenge. We used it as a guide for architecture and product shape, but **all code here is written from scratch**. Shared ideas (unique URL deduplication, Trafilatura extraction, API spawn of a Python ingest job, timeline UX) are acknowledged; the clustering algorithm (TF-IDF), UI system, and implementation are original.

Completed individually; no external proprietary code used.

## License

MIT — see [LICENSE](LICENSE).
