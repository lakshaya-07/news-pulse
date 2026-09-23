"use client";

import { useEffect, useRef } from "react";
import type { ClusterDetail } from "./api";
import { SOURCE_COLORS } from "./api";

type Props = {
  open: boolean;
  loading: boolean;
  error: string | null;
  detail: ClusterDetail | null;
  onClose: () => void;
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(iso).toLocaleString();
}

export function ClusterDrawer({ open, loading, error, detail, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close cluster details"
        onClick={onClose}
      />
      <aside
        className="drawer-panel relative flex h-full w-full max-w-md flex-col border-l border-[var(--accent-amber)] bg-[var(--paper-light)] shadow-2xl md:max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cluster-drawer-title"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-[var(--ink-muted)] uppercase">
              Cluster
            </p>
            <h2
              id="cluster-drawer-title"
              className="mt-1 font-[family-name:var(--font-brand)] text-2xl leading-tight text-[var(--ink)]"
            >
              {detail?.label || (loading ? "Loading…" : "Story")}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-sm px-2 py-1 text-lg text-[var(--ink-muted)] hover:bg-black/5"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <p className="text-sm text-[var(--ink-muted)]" role="status">
              Loading articles…
            </p>
          )}
          {error && (
            <p className="text-sm text-[var(--accent-crimson)]" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && detail && (
            <ol className="space-y-5">
              {detail.articles.map((a) => (
                <li key={a.id} className="border-b border-[var(--line)] pb-4 last:border-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: SOURCE_COLORS[a.source] || "#999" }}
                      aria-hidden
                    />
                    <span className="font-semibold text-[var(--ink)]">{a.source}</span>
                    <time dateTime={a.publishedAt}>
                      {new Date(a.publishedAt).toLocaleString()} ·{" "}
                      {relativeTime(a.publishedAt)}
                    </time>
                    {a.hasFullText && (
                      <span className="text-[var(--accent-teal)]">full text</span>
                    )}
                  </div>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[var(--ink)] underline-offset-2 hover:underline"
                  >
                    {a.title}
                  </a>
                  {a.summary && (
                    <p className="mt-1 text-sm leading-relaxed text-[var(--ink-muted)]">
                      {a.summary.slice(0, 280)}
                      {a.summary.length > 280 ? "…" : ""}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
