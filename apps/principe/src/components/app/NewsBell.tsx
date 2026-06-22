// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";

/**
 * In-app "What's New" center — a megaphone in the TopBar (so it's present
 * on every tab) with an unread badge, opening a right-hand slide-over of
 * news cards.
 *
 * Unread model (two layers, both per-user):
 *   - Server high-water `User.lastNewsSeenAt` → the cross-device baseline.
 *     /api/news/list returns each item's `unread` against it. "Mark all
 *     read" advances it via /api/news/seen.
 *   - Local read set (localStorage) → instant per-item dot clearing on
 *     this device when you open a single item, mirroring the marketing
 *     site. An item shows a dot only when it's server-unread AND not in
 *     the local read set.
 *
 * News refresh (feed → DB) is admin-only and rides the same cadence as the
 * knowledge updates: on first mount per session an admin triggers a check,
 * and in automatic mode (autoNews) an available feed installs itself. Then
 * everyone's list reflects the refreshed DB.
 */

interface NewsItem {
  id: string;
  date: string;
  tag: string;
  title: string;
  summary: string | null;
  body: string;
  link: string | null;
  kind: string | null;
  unread: boolean;
}

const TAG_LABEL: Record<string, string> = {
  feature: "Feature",
  calibration: "Calibration",
  security: "Security",
  release: "Release",
  research: "Research",
  tip: "Tip",
};

const TAG_CLASS: Record<string, string> = {
  feature: "bg-flare-600/12 text-flare-600",
  release: "bg-verdict-pass/12 text-verdict-pass",
  security: "bg-verdict-fail/12 text-verdict-fail",
  calibration: "bg-ink-700/10 text-ink-700",
  research: "bg-flare-600/10 text-flare-600",
  tip: "bg-ink-700/10 text-ink-700",
};

const LOCAL_READ = "principe_news_read_ids";
const SESSION_CHECK = "principe_news_checked";

function getLocalRead(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LOCAL_READ) || "[]"));
  } catch {
    return new Set();
  }
}
function setLocalRead(s: Set<string>) {
  try {
    localStorage.setItem(LOCAL_READ, JSON.stringify([...s]));
  } catch {
    /* storage disabled — dots just won't persist locally */
  }
}

/** Minimal, safe markdown for the signed feed body: escape first, then a
 *  small whitelist (bold, italic, code, links, bullets, line breaks). */
function renderMarkdown(md: string): string {
  const esc = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const lines = esc.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!inList) {
        out.push('<ul class="list-disc pl-5 my-1 space-y-0.5">');
        inList = true;
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (line === "") {
      out.push("<br/>");
    } else {
      out.push(`<p class="my-1">${inline(line)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}
function inline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+?)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+?)`/g, '<code class="font-mono text-[12px] bg-ink-100/50 px-1 rounded">$1</code>')
    .replace(
      /\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" class="text-flare-600 underline">$1</a>',
    );
}

/**
 * Defense-in-depth sanitize of the regex-rendered markdown before it reaches
 * the `dangerouslySetInnerHTML` sink. The body is ed25519-signed, but the
 * hand-rolled HTML re-injection in `inline()` is fragile, so we run the output
 * through DOMPurify with a tight whitelist matching ONLY what renderMarkdown
 * emits, and harden every anchor.
 *
 * DOMPurify only runs in the browser (needs a DOM). NewsBell is a client
 * component, so this is always invoked client-side. The hook is registered
 * once, guarded for the browser, so SSR import never touches a missing DOM.
 */
const ALLOWED_TAGS = [
  "a",
  "strong",
  "em",
  "code",
  "br",
  "p",
  "ul",
  "li",
];
const ALLOWED_ATTR = ["href", "target", "rel", "class"];

let hookRegistered = false;
function ensureHook() {
  if (hookRegistered || typeof window === "undefined") return;
  // Harden anchors: only http(s) hrefs survive, and every link opens in a new
  // tab with no window.opener / referrer leakage.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName !== "A") return;
    const href = node.getAttribute("href") ?? "";
    let safe = false;
    try {
      const proto = new URL(href, window.location.href).protocol;
      safe = proto === "http:" || proto === "https:";
    } catch {
      safe = false;
    }
    if (!safe) {
      node.removeAttribute("href");
      return;
    }
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  });
  hookRegistered = true;
}

function sanitizeMarkdown(md: string): string {
  ensureHook();
  return DOMPurify.sanitize(renderMarkdown(md), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}

function moreLabel(it: NewsItem): string {
  if (it.kind === "video") return "Watch ▸";
  if (it.kind === "external") return "Read at source ↗";
  if (it.kind === "blog") return "Read the piece →";
  return "";
}

export function NewsBell({ isAdmin = false }: { isAdmin?: boolean }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  // Portal target only exists client-side. The slide-over is rendered into
  // document.body (not here) because the TopBar's backdrop-blur makes it a
  // containing block for position:fixed — without the portal the overlay
  // would be clipped to the 64px top bar instead of filling the viewport.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Local per-device read set, layered on the server high-water mark for
  // instant per-item dot clearing. State (not a ref) so reads during render
  // are legit and updates re-render.
  const [readSet, setReadSet] = useState<Set<string>>(() => new Set());

  const isUnread = useCallback(
    (it: NewsItem) => it.unread && !readSet.has(it.id),
    [readSet],
  );
  const unreadCount = items.filter(isUnread).length;

  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/news/list", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: NewsItem[] };
      setItems(data.items ?? []);
    } catch {
      /* network — leave whatever we have */
    }
  }, []);

  useEffect(() => {
    setReadSet(getLocalRead());
    void (async () => {
      // Admin, automatic mode: refresh the feed once per session so news
      // stays current app-wide without visiting Settings.
      if (isAdmin && !sessionStorage.getItem(SESSION_CHECK)) {
        sessionStorage.setItem(SESSION_CHECK, "1");
        try {
          const c = await fetch("/api/news/check", { cache: "no-store" }).then((r) =>
            r.json(),
          );
          if (c?.mode === "remote" && c?.autoNews && c?.updateAvailable) {
            await fetch("/api/news/install", { method: "POST" });
          }
        } catch {
          /* ignore — the list still shows the current DB */
        }
      }
      await loadList();
    })();
  }, [isAdmin, loadList]);

  // Close the slide-over on Escape.
  useEffect(() => {
    if (!open && !video) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (video) setVideo(null);
      else setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, video]);

  function markItemRead(id: string) {
    setReadSet((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      setLocalRead(next);
      return next;
    });
  }

  async function markAllRead() {
    setReadSet((prev) => {
      const next = new Set(prev);
      items.forEach((it) => next.add(it.id));
      setLocalRead(next);
      return next;
    });
    try {
      await fetch("/api/news/seen", { method: "POST" });
    } catch {
      /* local dots already cleared; server catches up next time */
    }
  }

  function onCardClick(it: NewsItem) {
    markItemRead(it.id);
    if (it.link) {
      if (it.kind === "video") {
        setVideo(it.link);
      } else {
        window.open(it.link, "_blank", "noopener");
      }
      return;
    }
    setExpanded((cur) => (cur === it.id ? null : it.id));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void loadList(); // refresh on open so an open tab never goes stale
        }}
        aria-label={
          unreadCount > 0
            ? `What's new — ${unreadCount} unread`
            : "What's new"
        }
        className="relative w-8 h-8 rounded-md flex items-center justify-center text-ink-700 hover:bg-ink-100/40 transition-colors"
      >
        {/* Megaphone */}
        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" aria-hidden>
          <path
            d="M3 11v2a1 1 0 0 0 1 1h2l2.5 4.5a1 1 0 0 0 1.8-.4V14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6 14V10l10-5v14L6 14Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M19 9a3 3 0 0 1 0 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-flare-600 text-white text-[10px] font-bold leading-[15px] text-center"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {mounted &&
        open &&
        createPortal(
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-ink-900/30 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="What's new"
            className="absolute right-0 top-0 h-full w-full max-w-md bg-canvas border-l border-ink-100 shadow-xl flex flex-col"
          >
            <header className="flex items-center justify-between px-5 h-16 border-b border-ink-100 shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-semibold text-ink-900">What&apos;s new</h2>
                {unreadCount > 0 && (
                  <span className="text-[11px] font-medium text-flare-600 bg-flare-600/10 rounded-full px-2 py-0.5">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-[12px] text-ink-500 hover:text-ink-900 px-2 py-1 rounded transition-colors"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="w-8 h-8 rounded-md flex items-center justify-center text-ink-500 hover:bg-ink-100/40 transition-colors text-[18px]"
                >
                  ×
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {items.length === 0 && (
                <p className="text-[13px] text-ink-300 italic py-8 text-center">
                  Nothing new yet. Product updates will show up here.
                </p>
              )}
              {items.map((it) => {
                const unread = isUnread(it);
                const isOpen = expanded === it.id;
                return (
                  <article
                    key={it.id}
                    onClick={() => onCardClick(it)}
                    className={`group rounded-lg border p-3.5 cursor-pointer transition-colors ${
                      unread
                        ? "border-flare-600/30 bg-flare-600/[0.03]"
                        : "border-ink-100 hover:border-ink-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${
                          TAG_CLASS[it.tag] ?? "bg-ink-700/10 text-ink-700"
                        }`}
                      >
                        {TAG_LABEL[it.tag] ?? it.tag}
                      </span>
                      <span className="text-[11px] text-ink-300 font-mono">{it.date}</span>
                      {unread && (
                        <span
                          aria-label="unread"
                          className="ml-auto w-2 h-2 rounded-full bg-flare-600 shrink-0"
                        />
                      )}
                    </div>
                    <h3 className="text-[14px] font-semibold text-ink-900 leading-snug">
                      {it.title}
                    </h3>
                    {it.summary && (
                      <p className="text-[12.5px] text-ink-500 leading-relaxed mt-0.5">
                        {it.summary}
                      </p>
                    )}
                    {it.link ? (
                      <span className="inline-block mt-1.5 text-[12px] font-medium text-flare-600">
                        {moreLabel(it)}
                      </span>
                    ) : (
                      <>
                        {isOpen && (
                          <div
                            className="text-[12.5px] text-ink-700 leading-relaxed mt-2 news-md"
                            dangerouslySetInnerHTML={{ __html: sanitizeMarkdown(it.body) }}
                          />
                        )}
                        <span className="inline-block mt-1.5 text-[12px] font-medium text-ink-500 group-hover:text-ink-700">
                          {isOpen ? "Show less ↑" : "Read more ↓"}
                        </span>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </aside>
        </div>,
          document.body,
        )}

      {mounted &&
        video &&
        createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/70 p-6"
          onClick={() => setVideo(null)}
        >
          <video
            src={video}
            controls
            autoPlay
            className="max-h-full max-w-3xl w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
          document.body,
        )}
    </>
  );
}
