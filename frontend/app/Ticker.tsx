"use client";

import type { ArticleBrief } from "./api";
import { SOURCE_COLORS } from "./api";

type Props = {
  articles: ArticleBrief[];
  onOpenCluster: (clusterId: number | null, articleUrl: string) => void;
};

export function Ticker({ articles, onOpenCluster }: Props) {
  if (articles.length === 0) {
    return (
      <div
        className="flex items-center gap-3 bg-[var(--accent-amber)] px-4 py-2 text-sm text-[var(--ink)]"
        role="status"
        aria-label="Breaking news ticker"
      >
        <span className="shrink-0 font-bold tracking-wider">
          LIVE
        </span>
        <span>Waiting for headlines…</span>
      </div>
    );
  }

  const loop = [...articles, ...articles];

  return (
    <div
      className="relative overflow-hidden border-t border-black/15 bg-[var(--accent-amber)] text-[var(--ink)]"
      role="region"
      aria-label="Breaking news ticker"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center bg-[var(--accent-amber)] px-4 font-bold tracking-[0.2em]">
        LIVE
      </div>
      <div className="ticker-track flex w-max gap-8 py-2 pl-20 whitespace-nowrap">
        {loop.map((a, i) => (
          <button
            key={`${a.id}-${i}`}
            type="button"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase hover:underline sm:text-sm"
            onClick={() => onOpenCluster(a.clusterId, a.url)}
            aria-label={`${a.source}: ${a.title}`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: SOURCE_COLORS[a.source] || "#9aa" }}
              aria-hidden
            />
            <span className="opacity-75">{a.source}</span>
            <span>{a.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
