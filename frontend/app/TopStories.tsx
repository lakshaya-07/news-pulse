"use client";

import type { TimelineCluster } from "./api";

type Props = {
  clusters: TimelineCluster[];
  onSelect: (id: number) => void;
};

export function TopStories({ clusters, onSelect }: Props) {
  const top = [...clusters]
    .sort((a, b) => b.articleCount - a.articleCount)
    .slice(0, 3);

  if (top.length === 0) return null;

  return (
    <section className="fade-up" aria-label="Top stories">
      <div className="mb-5 flex items-end justify-between border-b border-[var(--line)] pb-3">
        <h2 className="display-condensed text-4xl leading-none sm:text-5xl">Top stories.</h2>
        <span className="pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Most covered · current window</span>
      </div>
      <ul className="grid gap-0 border border-[var(--ink)] md:grid-cols-3">
        {top.map((c, idx) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className="group flex h-full min-h-[270px] w-full flex-col items-start border-b border-[var(--ink)] bg-[var(--paper-light)] p-6 text-left transition-colors hover:bg-white md:min-h-[300px] md:border-r md:border-b-0 last:md:border-r-0"
              aria-label={`Open cluster: ${c.label}, ${c.articleCount} articles`}
            >
              <div className="mb-7 flex w-full items-start justify-between">
                <span
                  className="display-condensed text-5xl leading-none text-[var(--accent-amber)]"
                  aria-hidden
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="border border-[var(--line)] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                  {c.articleCount} articles
                </span>
              </div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                {c.sources.slice(0, 3).join(" · ")}
              </p>
              <p className="font-[family-name:var(--font-brand)] text-2xl leading-snug text-[var(--ink)] group-hover:underline decoration-[var(--accent-amber)] underline-offset-4 sm:text-3xl">
                {c.latestTitle}
              </p>
              <p className="mt-auto pt-7 text-[10px] font-bold uppercase tracking-wide">Track story <span className="ml-1 text-base" aria-hidden>↗</span></p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
