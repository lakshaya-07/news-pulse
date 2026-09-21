CREATE TABLE IF NOT EXISTS clusters (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS articles (
  id SERIAL PRIMARY KEY,
  cluster_id INTEGER REFERENCES clusters(id) ON DELETE SET NULL,
  source VARCHAR(100) NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT,
  url TEXT NOT NULL UNIQUE,
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles (published_at);
CREATE INDEX IF NOT EXISTS idx_articles_cluster_id ON articles (cluster_id);
