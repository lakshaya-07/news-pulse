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
    <div className="min-h-screen bg-[var(--paper)]">
      <header className="relative overflow-hidden border-x border-b border-white/15 bg-[var(--masthead)] text-white">
        <div className="mx-auto flex max-w-[1500px] flex-col items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:flex-row lg:px-10">
          <a href="#top" className="display-condensed text-3xl leading-none text-[var(--accent-amber)] sm:text-4xl" aria-label="News Pulse home">
            News Pulse.
          </a>
          <nav className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[11px] font-bold uppercase tracking-[0.12em] sm:text-xs" aria-label="Main navigation">
            <a className="transition-colors hover:text-[var(--accent-amber)]" href="#top-stories">Top stories</a>
            <span className="text-[var(--accent-amber)]" aria-hidden>+</span>
            <a className="transition-colors hover:text-[var(--accent-amber)]" href="#timeline">Timeline</a>
            <span className="text-[var(--accent-amber)]" aria-hidden>+</span>
            <a className="transition-colors hover:text-[var(--accent-amber)]" href="#sources">Sources</a>
            <span className="text-[var(--accent-amber)]" aria-hidden>+</span>
            <a className="transition-colors hover:text-[var(--accent-amber)]" href="#about">About</a>
          </nav>
          <div className="text-center text-[10px] font-semibold uppercase tracking-[0.1em] lg:text-right">
            <p>Global desk · live edition</p>
            <p className="mt-1 text-[var(--accent-amber)]">Live · {timeline?.lastFetch ? `Updated ${new Date(timeline.lastFetch).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Awaiting update"}</p>
          </div>
        </div>
        <section id="sources" className="border-t border-white/15 px-5 py-4 sm:px-8 lg:px-10" aria-label="Search and filters">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="flex min-w-0 items-center rounded-full bg-[var(--accent-amber)] px-5 py-3 text-sm text-[var(--ink)] sm:w-[260px]">
                <span className="sr-only">Search topics</span>
                <input
                  id="cluster-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search topics…"
                  className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-black/65"
                />
                <span className="ml-2 text-lg leading-none" aria-hidden>⌕</span>
              </label>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Filter by source">
                {allSources.map((s, index) => {
                  const on = enabledSources.has(s);
                  return (
                    <span key={s} className="flex items-center gap-3">
                      {index > 0 && <span className="text-[var(--accent-amber)]" aria-hidden>+</span>}
                      <button
                        type="button"
                        onClick={() => toggleSource(s)}
                        aria-pressed={on}
                        className="flex items-center gap-2 text-xs font-semibold transition-opacity hover:text-[var(--accent-amber)]"
                        style={{ opacity: on ? 1 : 0.45 }}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_COLORS[s] || "#999" }} aria-hidden />
                        {s}
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-start">
              <div className="flex gap-1" role="group" aria-label="Time window">
                {([ ["6h", "6h"], ["24h", "24h"], ["all", "All"] ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setWindowKey(key)}
                    aria-pressed={windowKey === key}
                    className={`border border-white/25 px-3 py-2 text-xs font-bold uppercase transition-colors ${windowKey === key ? "bg-[var(--paper)] text-[var(--ink)]" : "text-white hover:border-[var(--accent-amber)] hover:text-[var(--accent-amber)]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void onRefresh()}
                disabled={ingestBusy}
                className="rounded-full border border-[var(--accent-amber)] px-5 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-[var(--accent-amber)] hover:text-[var(--ink)] disabled:cursor-wait disabled:opacity-60"
                aria-busy={ingestBusy}
              >
                {ingestBusy ? "Refreshing…" : "↻　Refresh"}
              </button>
              <button type="button" onClick={() => void load()} className="text-xs font-bold uppercase text-white/65 underline-offset-4 hover:text-white hover:underline">Reload</button>
            </div>
          </div>
          {ingestMsg && <p className="mx-auto mt-3 max-w-[1500px] text-xs text-white/70" role="status">{ingestMsg}</p>}
        </section>
        <Ticker articles={articles} onOpenCluster={onTickerOpen} />
      </header>

      <main id="top" className="mx-auto max-w-[1500px] space-y-12 px-5 py-10 sm:px-8 lg:space-y-16 lg:px-10 lg:py-14">
        {(loading || error) && <div role="status">
          {loading && <p className="text-sm text-[var(--ink-muted)]">Loading the latest coverage…</p>}
          {error && <p className="border-l-4 border-[var(--accent-crimson)] bg-[var(--paper-light)] px-4 py-3 text-sm text-[var(--accent-crimson)]" role="alert">{error} <span className="text-[var(--ink-muted)]">API: {getApiUrl()}</span></p>}
        </div>}

        <section className="grid gap-8 border-b border-[var(--line)] pb-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end lg:gap-12 lg:pb-14" aria-labelledby="edition-title">
          <div className="fade-up">
            <p className="mb-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.14em]"><span className="h-2.5 w-2.5 rounded-full bg-[var(--accent-crimson)]" />Live briefing <span className="text-[var(--ink-muted)]">· {filteredClusters.length} threads</span></p>
            <h1 id="edition-title" className="display-condensed max-w-3xl text-[clamp(3.5rem,10vw,10rem)] leading-[0.92] text-[var(--ink)]">The world<br />gathers<span className="text-[var(--accent-amber)]">.</span></h1>
          </div>
          <div className="flex flex-col gap-5 lg:pb-2">
            <p className="max-w-2xl font-[family-name:var(--font-brand)] text-2xl leading-snug sm:text-3xl lg:text-4xl">Every headline is part of a bigger story.</p>
            <div className="flex flex-wrap items-end justify-between gap-4 border-t border-[var(--line)] pt-4">
              <p className="max-w-lg text-sm leading-relaxed text-[var(--ink-muted)]">Follow developing topics across BBC, NPR, The Guardian, and Al Jazeera, gathered into one living timeline.</p>
              <p className="text-right text-xs font-bold uppercase tracking-wide">{articles.length}+ recent<br />headlines</p>
            </div>
          </div>
        </section>

        <div id="top-stories" className="scroll-mt-8">
          <TopStories clusters={filteredClusters} onSelect={(id) => void openCluster(id)} />
        </div>

        {!loading && timeline && <p className="-mt-8 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
          {timeline.clusters.length} topic threads · {articles.length}+ recent headlines
          {timeline.lastFetch ? ` · Updated ${new Date(timeline.lastFetch).toLocaleString()}` : ""}
        </p>}

        <div id="timeline" className="scroll-mt-8">
          <Timeline clusters={filteredClusters} range={filteredRange} onOpen={(id) => void openCluster(id)} highlightedId={highlightId} />
        </div>
      </main>

      <footer id="about" className="border-t border-[var(--accent-amber)] bg-[var(--masthead)] px-5 py-8 text-white sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1500px] flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <span className="display-condensed text-2xl text-[var(--accent-amber)]">News Pulse.</span>
          <p className="max-w-xl text-sm leading-relaxed text-white/75">Independent coverage, connected by topic. Headlines link to their publishers.</p>
          <a className="text-xs font-bold uppercase tracking-wide underline decoration-[var(--accent-amber)] underline-offset-4" href="https://github.com/gauravsoodtech/khabar-threads" target="_blank" rel="noopener noreferrer">About this project ↗</a>
        </div>
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
