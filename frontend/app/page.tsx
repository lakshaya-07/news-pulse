"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchArticles,
  fetchCluster,
  fetchIngestStatus,
  fetchTimeline,
  getApiUrl,
  triggerIngest,
  type ArticleBrief,
  type ClusterDetail,
  type TimelineCluster,
  type TimelineResponse,
  SOURCE_COLORS,
} from "./api";
import { ClusterDrawer } from "./ClusterDrawer";
import { Ticker } from "./Ticker";
import { Timeline } from "./Timeline";
import { TopStories } from "./TopStories";

type WindowKey = "6h" | "24h" | "all";

function withinWindow(iso: string, windowKey: WindowKey) {
  if (windowKey === "all") return true;
  const hours = windowKey === "6h" ? 6 : 24;
  return Date.now() - new Date(iso).getTime() <= hours * 3600 * 1000;
}

export default function HomePage() {
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [articles, setArticles] = useState<ArticleBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coldStart, setColdStart] = useState(false);
  const [enabledSources, setEnabledSources] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [windowKey, setWindowKey] = useState<WindowKey>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClusterDetail | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    setError(null);
    try {
      const [t, a] = await Promise.all([fetchTimeline(), fetchArticles(15)]);
      setTimeline(t);
      setArticles(a);
      setColdStart(false);
      setEnabledSources((prev) => {
        if (prev.size === 0) return new Set(t.sources);
        const next = new Set(prev);
        for (const s of t.sources) {
          if (!prev.has(s)) next.add(s);
        }
        return next;
      });
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === undefined || status >= 500) {
        setColdStart(true);
        setError(
          "API is waking up or unreachable. Free-tier hosts sleep after idle — retrying…",
        );
      } else {
        setError((err as Error).message || "Failed to load timeline");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Quiet auto-refresh while tab visible
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && !ingestBusy) {
        void load({ quiet: true });
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [load, ingestBusy]);

  // Cold-start retry
  useEffect(() => {
    if (!coldStart) return;
    const id = window.setTimeout(() => void load({ quiet: true }), 4000);
    return () => window.clearTimeout(id);
  }, [coldStart, load]);

  const filteredClusters: TimelineCluster[] = useMemo(() => {
    if (!timeline) return [];
    const q = search.trim().toLowerCase();
    return timeline.clusters.filter((c) => {
      const sourceOk = c.sources.some((s) => enabledSources.has(s));
      if (!sourceOk) return false;
      const points = c.points.filter((p) => enabledSources.has(p.source));
      if (points.length < 2 && c.sources.every((s) => enabledSources.has(s)) === false) {
        // still show if remaining points exist after source filter
      }
      const inWindow =
        withinWindow(c.startTime, windowKey) ||
        withinWindow(c.endTime, windowKey) ||
        points.some((p) => withinWindow(p.t, windowKey));
      if (!inWindow) return false;
      if (!q) return true;
      const hay = `${c.label} ${c.latestTitle} ${points.map((p) => p.title).join(" ")}`.toLowerCase();
      return hay.includes(q);
    }).map((c) => {
      const points = c.points.filter(
        (p) =>
          enabledSources.has(p.source) &&
          (windowKey === "all" || withinWindow(p.t, windowKey)),
      );
      if (points.length === 0) return null;
      const startTime = points[0].t;
      const endTime = points[points.length - 1].t;
      return {
        ...c,
        points,
        startTime,
        endTime,
        articleCount: points.length,
        sources: [...new Set(points.map((p) => p.source))],
      };
    }).filter(Boolean) as TimelineCluster[];
  }, [timeline, enabledSources, search, windowKey]);

  const filteredRange = useMemo(() => {
    if (filteredClusters.length === 0) return timeline?.range ?? null;
    const times = filteredClusters.flatMap((c) => [c.startTime, c.endTime]);
    return {
      start: new Date(Math.min(...times.map((t) => new Date(t).getTime()))).toISOString(),
      end: new Date(Math.max(...times.map((t) => new Date(t).getTime()))).toISOString(),
    };
  }, [filteredClusters, timeline]);

  const openCluster = useCallback(async (id: number) => {
    setHighlightId(id);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerError(null);
    setDetail(null);
    try {
      const d = await fetchCluster(id);
      setDetail(d);
    } catch (err) {
      setDrawerError((err as Error).message || "Could not load cluster");
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const onTickerOpen = useCallback(
    (clusterId: number | null, articleUrl: string) => {
      if (clusterId) void openCluster(clusterId);
      else window.open(articleUrl, "_blank", "noopener,noreferrer");
    },
    [openCluster],
  );

  const toggleSource = (source: string) => {
    setEnabledSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        if (next.size > 1) next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  };

  const onRefresh = async () => {
    setIngestBusy(true);
    setIngestMsg("Starting ingest…");
    try {
      let job = await triggerIngest();
      const jobId = job.jobId;
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          job = await fetchIngestStatus(jobId);
        } catch (err) {
          const status = (err as Error & { status?: number }).status;
          if (status === 404) {
            setIngestMsg("API restarted during ingest — reloading data");
            break;
          }
          throw err;
        }
        const lastLog = job.log?.at(-1);
        setIngestMsg(lastLog || `Status: ${job.status}`);
        if (job.status === "completed" || job.status === "failed") break;
      }
      if (job.status === "failed") {
        setIngestMsg(job.error || "Ingest failed");
      } else {
        setIngestMsg(job.summary || "Ingest complete");
      }
      await load({ quiet: true });
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 409) {
        setIngestMsg("Ingest already running — wait a moment");
      } else {
        setIngestMsg((err as Error).message || "Ingest failed");
      }
    } finally {
      setIngestBusy(false);
    }
  };

  const allSources = timeline?.sources?.length
    ? timeline.sources
    : Object.keys(SOURCE_COLORS);

  return (
    <div className="min-h-screen">
      <header className="relative overflow-hidden">
        <div className="bg-[var(--masthead)] px-4 pt-6 pb-5 text-white md:px-8 md:pt-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="fade-up">
              <p className="text-xs font-semibold tracking-[0.28em] text-[var(--accent-teal)] uppercase">
                Topic-clustered news
              </p>
              <h1 className="mt-1 font-[family-name:var(--font-brand)] text-4xl leading-none tracking-tight md:text-6xl">
                NEWS PULSE
              </h1>
              <p className="mt-2 max-w-xl text-sm text-white/70 md:text-base">
                Live stories grouped by theme across BBC, NPR, The Guardian, and
                Al Jazeera — read as a timeline, not a feed.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void onRefresh()}
                disabled={ingestBusy}
                className="bg-[var(--accent-teal)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                aria-busy={ingestBusy}
              >
                {ingestBusy ? "Refreshing…" : "Refresh data"}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                className="border border-white/30 px-3 py-2 text-sm text-white/90 hover:bg-white/10"
              >
                Reload
              </button>
            </div>
          </div>
          {ingestMsg && (
            <p className="mx-auto mt-3 max-w-6xl text-xs text-white/60" role="status">
              {ingestMsg}
            </p>
          )}
        </div>
        <Ticker articles={articles} onOpenCluster={onTickerOpen} />
      </header>

      <main className="mx-auto max-w-6xl space-y-8 py-8">
        {(loading || error) && (
          <div className="px-4 md:px-8" role="status">
            {loading && (
              <p className="text-sm text-[var(--ink-muted)]">Loading timeline…</p>
            )}
            {error && (
              <p className="text-sm text-[var(--accent-crimson)]" role="alert">
                {error}{" "}
                <span className="text-[var(--ink-muted)]">
                  API: {getApiUrl()}
                </span>
              </p>
            )}
          </div>
        )}

        <TopStories clusters={filteredClusters} onSelect={(id) => void openCluster(id)} />

        <section
          className="flex flex-col gap-4 px-4 md:flex-row md:items-end md:justify-between md:px-8"
          aria-label="Filters"
        >
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-[var(--ink-muted)] uppercase">
              Sources
            </p>
            <div className="flex flex-wrap gap-2">
              {allSources.map((s) => {
                const on = enabledSources.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSource(s)}
                    aria-pressed={on}
                    className="inline-flex items-center gap-2 border px-3 py-1.5 text-sm transition"
                    style={{
                      borderColor: on ? SOURCE_COLORS[s] || "var(--line)" : "var(--line)",
                      opacity: on ? 1 : 0.4,
                      background: on ? "rgba(255,255,255,0.7)" : "transparent",
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: SOURCE_COLORS[s] || "#999" }}
                      aria-hidden
                    />
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="cluster-search">
              Search topics
            </label>
            <input
              id="cluster-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search topics…"
              className="min-w-[200px] border border-[var(--line)] bg-white/70 px-3 py-2 text-sm outline-none focus:border-[var(--accent-teal)]"
            />
            <div className="flex gap-1" role="group" aria-label="Time window">
              {(
                [
                  ["6h", "6h"],
                  ["24h", "24h"],
                  ["all", "All"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setWindowKey(key)}
                  aria-pressed={windowKey === key}
                  className="border border-[var(--line)] px-3 py-2 text-sm"
                  style={{
                    background:
                      windowKey === key ? "var(--ink)" : "rgba(255,255,255,0.6)",
                    color: windowKey === key ? "#fff" : "var(--ink)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {!loading && timeline && (
          <p className="px-4 text-xs text-[var(--ink-muted)] md:px-8">
            {timeline.clusters.length} threads · {articles.length}+ recent headlines
            {timeline.lastFetch
              ? ` · last fetch ${new Date(timeline.lastFetch).toLocaleString()}`
              : ""}
          </p>
        )}

        <Timeline
          clusters={filteredClusters}
          range={filteredRange}
          onOpen={(id) => void openCluster(id)}
          highlightedId={highlightId}
        />
      </main>

      <footer className="border-t border-[var(--line)] px-4 py-8 text-center text-xs text-[var(--ink-muted)] md:px-8">
        News Pulse — original implementation inspired by{" "}
        <a
          className="underline"
          href="https://github.com/gauravsoodtech/khabar-threads"
          target="_blank"
          rel="noopener noreferrer"
        >
          Khabar Threads
        </a>
        . Headlines link to their publishers.
      </footer>

      <ClusterDrawer
        open={drawerOpen}
        loading={drawerLoading}
        error={drawerError}
        detail={detail}
        onClose={() => {
          setDrawerOpen(false);
          setHighlightId(null);
        }}
      />
    </div>
  );
}
