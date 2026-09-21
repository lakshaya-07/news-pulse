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
    <section className="fade-up px-4 md:px-8" aria-label="Top stories">
      <h2 className="mb-3 text-xs font-semibold tracking-[0.18em] text-[var(--ink-muted)] uppercase">
        Top stories
      </h2>
      <ul className="grid gap-3 md:grid-cols-3">
        {top.map((c, idx) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className="group w-full text-left transition-opacity hover:opacity-90"
              aria-label={`Open cluster: ${c.label}, ${c.articleCount} articles`}
            >
              <div className="mb-1 flex items-baseline gap-2">
                <span
                  className="font-[family-name:var(--font-brand)] text-3xl font-bold text-[var(--accent-teal)]"
                  aria-hidden
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="text-xs font-medium tracking-wide text-[var(--ink-muted)]">
                  {c.articleCount} outlets
                </span>
              </div>
              <p className="font-[family-name:var(--font-brand)] text-lg leading-snug text-[var(--ink)] group-hover:underline">
                {c.label}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--ink-muted)]">
                {c.latestTitle}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
