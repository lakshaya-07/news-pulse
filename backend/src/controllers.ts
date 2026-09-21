import type { Request, Response, NextFunction } from "express";
import { query } from "./db.js";
import { getJob, startIngestJob } from "./jobs.js";

function parseSources(raw: unknown): string[] | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") return null;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePositiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function listClusters(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sources = parseSources(req.query.sources);
    const params: unknown[] = [];
    let sourceFilter = "";
    if (sources) {
      params.push(sources);
      sourceFilter = `AND EXISTS (
        SELECT 1 FROM articles a2
        WHERE a2.cluster_id = c.id AND a2.source = ANY($1)
      )`;
    }

    const { rows } = await query<{
      id: number;
      label: string;
      article_count: string;
      start_time: Date;
      end_time: Date;
      sources: string[];
    }>(
      `
      SELECT
        c.id,
        c.label,
        COUNT(a.id)::int AS article_count,
        MIN(a.published_at) AS start_time,
        MAX(a.published_at) AS end_time,
        ARRAY_AGG(DISTINCT a.source ORDER BY a.source) AS sources
      FROM clusters c
      JOIN articles a ON a.cluster_id = c.id
      WHERE 1=1
      ${sourceFilter}
      GROUP BY c.id, c.label
      HAVING COUNT(a.id) >= 2
      ORDER BY MIN(a.published_at) ASC
      `,
      params,
    );

    res.json(
      rows.map((r) => ({
        id: r.id,
        label: r.label,
        articleCount: Number(r.article_count),
        startTime: r.start_time?.toISOString?.() ?? r.start_time,
        endTime: r.end_time?.toISOString?.() ?? r.end_time,
        sources: r.sources || [],
      })),
    );
  } catch (err) {
    next(err);
  }
}

export async function getCluster(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id == null) {
      res.status(400).json({ error: "Cluster id must be a positive integer" });
      return;
    }

    const clusterResult = await query<{
      id: number;
      label: string;
      start_time: Date | null;
      end_time: Date | null;
    }>(
      `
      SELECT
        c.id,
        c.label,
        MIN(a.published_at) AS start_time,
        MAX(a.published_at) AS end_time
      FROM clusters c
      LEFT JOIN articles a ON a.cluster_id = c.id
      WHERE c.id = $1
      GROUP BY c.id, c.label
      `,
      [id],
    );

    if (clusterResult.rows.length === 0) {
      res.status(404).json({ error: "Cluster not found" });
      return;
    }

    const articlesResult = await query<{
      id: number;
      title: string;
      source: string;
      published_at: Date;
      url: string;
      summary: string;
      content: string | null;
    }>(
      `
      SELECT id, title, source, published_at, url, summary, content
      FROM articles
      WHERE cluster_id = $1
      ORDER BY published_at ASC
      `,
      [id],
    );

    const c = clusterResult.rows[0];
    res.json({
      id: c.id,
      label: c.label,
      startTime: c.start_time?.toISOString?.() ?? c.start_time,
      endTime: c.end_time?.toISOString?.() ?? c.end_time,
      articles: articlesResult.rows.map((a) => ({
        id: a.id,
        title: a.title,
        source: a.source,
        publishedAt: a.published_at?.toISOString?.() ?? a.published_at,
        url: a.url,
        summary: a.summary,
        hasFullText: Boolean(a.content),
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function getTimeline(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sources = parseSources(req.query.sources);
    const params: unknown[] = [];
    let sourceFilter = "";
    if (sources) {
      params.push(sources);
      sourceFilter = `AND a.source = ANY($1)`;
    }

    const { rows } = await query<{
      id: number;
      label: string;
      article_count: string;
      start_time: Date;
      end_time: Date;
      sources: string[];
      latest_title: string;
      points: { t: string; source: string; title: string }[];
    }>(
      `
      SELECT
        c.id,
        c.label,
        COUNT(a.id)::int AS article_count,
        MIN(a.published_at) AS start_time,
        MAX(a.published_at) AS end_time,
        ARRAY_AGG(DISTINCT a.source ORDER BY a.source) AS sources,
        (ARRAY_AGG(a.title ORDER BY a.published_at DESC))[1] AS latest_title,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            't', a.published_at,
            'source', a.source,
            'title', a.title
          )
          ORDER BY a.published_at ASC
        ) AS points
      FROM clusters c
      JOIN articles a ON a.cluster_id = c.id
      WHERE 1=1
      ${sourceFilter}
      GROUP BY c.id, c.label
      HAVING COUNT(a.id) >= 2
      ORDER BY MIN(a.published_at) ASC
      `,
      params,
    );

    const maxCount = rows.reduce(
      (m, r) => Math.max(m, Number(r.article_count)),
      1,
    );

    const lastFetch = await query<{ last: Date | null }>(
      `SELECT MAX(created_at) AS last FROM articles`,
    );

    const allTimes = rows.flatMap((r) => [r.start_time, r.end_time]).filter(Boolean);
    const range =
      allTimes.length > 0
        ? {
            start: new Date(
              Math.min(...allTimes.map((d) => new Date(d).getTime())),
            ).toISOString(),
            end: new Date(
              Math.max(...allTimes.map((d) => new Date(d).getTime())),
            ).toISOString(),
          }
        : null;

    const sourceList = await query<{ source: string }>(
      `SELECT DISTINCT source FROM articles ORDER BY source`,
    );

    res.json({
      generatedAt: new Date().toISOString(),
      lastFetch: lastFetch.rows[0]?.last?.toISOString?.() ?? null,
      range,
      sources: sourceList.rows.map((r) => r.source),
      clusters: rows.map((r) => ({
        id: r.id,
        label: r.label,
        articleCount: Number(r.article_count),
        startTime: r.start_time?.toISOString?.() ?? r.start_time,
        endTime: r.end_time?.toISOString?.() ?? r.end_time,
        intensity: Number(r.article_count) / maxCount,
        sources: r.sources || [],
        latestTitle: r.latest_title,
        points: (r.points || []).map((p) => ({
          t: typeof p.t === "string" ? p.t : new Date(p.t).toISOString(),
          source: p.source,
          title: p.title,
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function listArticles(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const limitRaw = req.query.limit ?? "15";
    const limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      res.status(400).json({ error: "limit must be an integer from 1 to 50" });
      return;
    }

    const { rows } = await query<{
      id: number;
      title: string;
      source: string;
      published_at: Date;
      url: string;
      cluster_id: number | null;
    }>(
      `
      SELECT id, title, source, published_at, url, cluster_id
      FROM articles
      ORDER BY published_at DESC
      LIMIT $1
      `,
      [limit],
    );

    res.json(
      rows.map((a) => ({
        id: a.id,
        title: a.title,
        source: a.source,
        publishedAt: a.published_at?.toISOString?.() ?? a.published_at,
        url: a.url,
        clusterId: a.cluster_id,
      })),
    );
  } catch (err) {
    next(err);
  }
}

export async function triggerIngest(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const job = startIngestJob();
    res.status(202).json({
      jobId: job.jobId,
      status: job.status,
      startedAt: job.startedAt,
    });
  } catch (err) {
    const e = err as Error & { status?: number; jobId?: string };
    if (e.status === 409) {
      res.status(409).json({
        error: e.message,
        jobId: e.jobId,
        status: "running",
      });
      return;
    }
    next(err);
  }
}

export async function ingestStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const jobId = req.params.jobId;
    if (!isUuid(jobId)) {
      res.status(400).json({ error: "jobId must be a UUID" });
      return;
    }
    const job = getJob(jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({
      jobId: job.jobId,
      status: job.status,
      startedAt: job.startedAt,
      completedAt: job.completedAt ?? null,
      error: job.error ?? null,
      summary: job.summary ?? null,
      log: job.log.slice(-20),
    });
  } catch (err) {
    next(err);
  }
}
