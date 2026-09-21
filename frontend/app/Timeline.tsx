"use client";

import { useMemo } from "react";
import type { TimelineCluster } from "./api";
import { SOURCE_COLORS } from "./api";

type Props = {
  clusters: TimelineCluster[];
  range: { start: string; end: string } | null;
  onOpen: (id: number) => void;
  highlightedId?: number | null;
};

type LaneItem = TimelineCluster & { lane: number; left: number; width: number };

function assignLanes(clusters: TimelineCluster[], minMs: number, spanMs: number): LaneItem[] {
  const sorted = [...clusters].sort(
    (a, b) => b.articleCount - a.articleCount || a.startTime.localeCompare(b.startTime),
  );
  const laneEnds: number[] = [];
  const placed: LaneItem[] = [];

  for (const c of sorted) {
    const start = new Date(c.startTime).getTime();
    const end = new Date(c.endTime).getTime();
    const left = ((start - minMs) / spanMs) * 100;
    const width = Math.max(((end - start) / spanMs) * 100, 2.5);
    let lane = laneEnds.findIndex((e) => start >= e);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    placed.push({ ...c, lane, left, width });
  }
  return placed;
}

function formatTick(iso: string, showDay: boolean) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: showDay ? "short" : undefined,
    day: showDay ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Timeline({ clusters, range, onOpen, highlightedId }: Props) {
  const layout = useMemo(() => {
    if (!range || clusters.length === 0) return null;
    const minMs = new Date(range.start).getTime();
    const maxMs = new Date(range.end).getTime();
    const spanMs = Math.max(maxMs - minMs, 60 * 60 * 1000);
    const paddedMax = maxMs + spanMs * 0.02;
    const paddedSpan = paddedMax - minMs;
    const items = assignLanes(clusters, minMs, paddedSpan);
    const laneCount = items.reduce((m, i) => Math.max(m, i.lane + 1), 1);
    const ticks: string[] = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      ticks.push(new Date(minMs + (paddedSpan * i) / steps).toISOString());
    }
    const nowLeft = ((Date.now() - minMs) / paddedSpan) * 100;
    return { items, laneCount, ticks, minMs, paddedSpan, nowLeft, showDay: paddedSpan > 36 * 3600 * 1000 };
  }, [clusters, range]);

  if (!layout) {
    return (
      <div
        className="mx-4 my-6 rounded-sm border border-[var(--line)] bg-white/40 px-6 py-16 text-center md:mx-8"
        role="status"
      >
        <p className="font-[family-name:var(--font-brand)] text-xl text-[var(--ink)]">
          No clustered stories yet
        </p>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Run a refresh to pull live RSS feeds and build the timeline.
        </p>
      </div>
    );
  }

  const rowH = 56;
  const height = layout.laneCount * rowH + 48;

  return (
    <section
      className="fade-up px-2 md:px-6"
      aria-label="News timeline"
    >
      <div className="mb-2 flex items-end justify-between px-2">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-[var(--ink-muted)] uppercase">
          Timeline
        </h2>
        <p className="text-xs text-[var(--ink-muted)]">
          Ribbons span first→latest article; beads are outlets
        </p>
      </div>
      <div className="overflow-x-auto pb-4">
        <div
          className="relative min-w-[720px] border-y border-[var(--line)] bg-white/35"
          style={{ height }}
        >
          {/* hour ticks */}
          {layout.ticks.map((t, i) => {
            const left = (i / (layout.ticks.length - 1)) * 100;
            return (
              <div
                key={t}
                className="absolute top-0 bottom-0 border-l border-[var(--line)]"
                style={{ left: `${left}%` }}
              >
                <span className="absolute top-1 left-1 text-[10px] tracking-wide text-[var(--ink-muted)]">
                  {formatTick(t, layout.showDay)}
                </span>
              </div>
            );
          })}

          {layout.nowLeft >= 0 && layout.nowLeft <= 100 && (
            <div
              className="absolute top-0 bottom-0 z-20 w-px bg-[var(--accent-crimson)]"
              style={{ left: `${layout.nowLeft}%` }}
              aria-hidden
            >
              <span className="absolute -top-0.5 left-1 text-[10px] font-semibold tracking-wider text-[var(--accent-crimson)] uppercase">
                now
              </span>
            </div>
          )}

          {layout.items.map((c, idx) => {
            const top = 28 + c.lane * rowH;
            const thickness = 10 + c.intensity * 14;
            const active = highlightedId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                className={`ribbon-enter absolute z-10 flex items-center rounded-full px-2 text-left transition-shadow ${
                  active ? "ring-2 ring-[var(--accent-teal)]" : ""
                }`}
                style={{
                  left: `${c.left}%`,
                  width: `${c.width}%`,
                  top,
                  height: thickness,
                  background: `linear-gradient(90deg, var(--ribbon), #2a5580)`,
                  opacity: 0.85 + c.intensity * 0.15,
                  animationDelay: `${Math.min(idx * 40, 400)}ms`,
                }}
                onClick={() => onOpen(c.id)}
                aria-label={`Cluster ${c.label}, ${c.articleCount} articles from ${c.sources.join(", ")}`}
                title={`${c.label} — ${c.latestTitle}`}
              >
                <span className="truncate pr-2 text-[11px] font-medium text-white/95">
                  {c.label}
                </span>
                <span className="absolute inset-y-0 left-0 right-0 flex items-center">
                  {c.points.map((p, pi) => {
                    const t = new Date(p.t).getTime();
                    const pct =
                      ((t - layout.minMs) / layout.paddedSpan) * 100 - c.left;
                    const rel = (pct / c.width) * 100;
                    return (
                      <span
                        key={`${c.id}-${pi}`}
                        className="absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-white/80 shadow-sm"
                        style={{
                          left: `${Math.min(Math.max(rel, 4), 96)}%`,
                          background: SOURCE_COLORS[p.source] || "#ccc",
                        }}
                        title={`${p.source} – ${p.title} at ${new Date(p.t).toLocaleString()}`}
                        aria-hidden
                      />
                    );
                  })}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
