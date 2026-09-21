const API_URL = (
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "/news-api"
);

export type ArticleBrief = {
  id: number;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  clusterId: number | null;
};

export type TimelinePoint = {
  t: string;
  source: string;
  title: string;
};

export type TimelineCluster = {
  id: number;
  label: string;
  articleCount: number;
  startTime: string;
  endTime: string;
  intensity: number;
  sources: string[];
  latestTitle: string;
  points: TimelinePoint[];
};

export type TimelineResponse = {
  generatedAt: string;
  lastFetch: string | null;
  range: { start: string; end: string } | null;
  sources: string[];
  clusters: TimelineCluster[];
};

export type ClusterDetail = {
  id: number;
  label: string;
  startTime: string | null;
  endTime: string | null;
  articles: {
    id: number;
    title: string;
    source: string;
    publishedAt: string;
    url: string;
    summary: string;
    hasFullText: boolean;
  }[];
};

export type IngestJob = {
  jobId: string;
  status: "running" | "completed" | "failed";
  startedAt?: string;
  completedAt?: string | null;
  error?: string | null;
  summary?: string | null;
  log?: string[];
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(
      (body as { error?: string }).error || `HTTP ${res.status}`,
    ) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export function getApiUrl() {
  return API_URL;
}

export function fetchTimeline(sources?: string[]) {
  const q =
    sources && sources.length
      ? `?sources=${encodeURIComponent(sources.join(","))}`
      : "";
  return apiFetch<TimelineResponse>(`/api/timeline${q}`);
}

export function fetchArticles(limit = 15) {
  return apiFetch<ArticleBrief[]>(`/api/articles?limit=${limit}`);
}

export function fetchCluster(id: number) {
  return apiFetch<ClusterDetail>(`/api/clusters/${id}`);
}

export function triggerIngest() {
  return apiFetch<IngestJob>("/api/ingest/trigger", { method: "POST" });
}

export function fetchIngestStatus(jobId: string) {
  return apiFetch<IngestJob>(`/api/ingest/status/${jobId}`);
}

export const SOURCE_COLORS: Record<string, string> = {
  BBC: "#b42318",
  NPR: "#3b4f9a",
  Guardian: "#0d7c7c",
  "Al Jazeera": "#c47a0a",
};

export function sourceClass(source: string): string {
  return `source-${source.toLowerCase().replace(/\s+/g, "-")}`;
}
