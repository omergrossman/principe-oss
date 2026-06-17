// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

interface Source {
  id: string;
  kind: "URL" | "FILE";
  url: string | null;
  filename: string | null;
  title: string;
  description: string | null;
  category: string | null;
  region: string | null;
  isCurated: boolean;
  enabled: boolean;
  publishedAt: string | null;
  lastFetchedAt: string | null;
  lastFetchError: string | null;
  contentHash: string | null;
  addedAt: string;
}

const REGIONS = ["global", "us", "uk", "eu-west", "eu-central", "apac", "anz", "mea"];
const CATEGORIES = ["analyst", "threat-intel", "framework", "news", "regulator", "cert", "custom"];

// A source is "still fetching" if it has neither content nor an error
// recorded yet. Two states qualify:
//   1. Never tried (lastFetchedAt is null) — the row was just seeded.
//   2. In-flight (lastFetchedAt set but no contentHash and no error) —
//      bulk-fetch marked it started, the HTTP call is in progress.
function isStillFetching(s: Source): boolean {
  if (s.lastFetchError) return false;
  if (s.contentHash) return false;
  return true;
}

export function KnowledgeSources() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/knowledge");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load.");
      setSources(data.sources);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while any URL source is still in-flight (lastFetchedAt set
  // recently but content still null, AND no recorded error) — bulk
  // fetch is running in the background.
  const fetching = sources?.filter(isStillFetching) ?? [];
  useEffect(() => {
    if (fetching.length === 0) return;
    const id = setInterval(() => {
      void load();
    }, 3000);
    return () => clearInterval(id);
  }, [fetching.length, load]);

  function markBusy(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function toggle(s: Source) {
    markBusy(s.id, true);
    try {
      const res = await fetch(`/api/admin/knowledge/${s.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !s.enabled }),
      });
      if (res.ok) {
        setSources((prev) =>
          prev ? prev.map((x) => (x.id === s.id ? { ...x, enabled: !s.enabled } : x)) : prev,
        );
      }
    } finally {
      markBusy(s.id, false);
    }
  }

  async function refresh(s: Source) {
    if (s.kind !== "URL") return;
    markBusy(s.id, true);
    try {
      const res = await fetch(`/api/admin/knowledge/${s.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      await load();
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Refresh failed.");
      }
    } finally {
      markBusy(s.id, false);
    }
  }

  async function remove(s: Source) {
    const msg = s.isCurated
      ? `Remove "${s.title}" from the curated catalog for your firm? It won't be re-seeded on future visits.`
      : `Remove "${s.title}" from your sources?`;
    if (!confirm(msg)) return;
    markBusy(s.id, true);
    try {
      const res = await fetch(`/api/admin/knowledge/${s.id}`, { method: "DELETE" });
      if (res.ok) {
        setSources((prev) => (prev ? prev.filter((x) => x.id !== s.id) : prev));
      }
    } finally {
      markBusy(s.id, false);
    }
  }

  async function saveEdit(
    s: Source,
    updates: { title: string; url: string; category: string; region: string },
  ): Promise<string | null> {
    markBusy(s.id, true);
    try {
      const res = await fetch(`/api/admin/knowledge/${s.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data.error ?? "Update failed.";
      setSources((prev) =>
        prev ? prev.map((x) => (x.id === s.id ? { ...x, ...data.source } : x)) : prev,
      );
      return null;
    } finally {
      markBusy(s.id, false);
    }
  }

  const curated = useMemo(() => (sources ?? []).filter((s) => s.isCurated), [sources]);
  const user = useMemo(() => (sources ?? []).filter((s) => !s.isCurated), [sources]);
  const enabledCount = (sources ?? []).filter((s) => s.enabled).length;
  const withContentCount = (sources ?? []).filter((s) => s.contentHash).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-500 leading-relaxed max-w-2xl">
          The CISO panel reads these sources as briefing material on every
          question. <strong className="text-ink-700">Most recent first</strong> —
          when sources conflict, the panel is instructed to prefer newer
          intelligence.
        </p>
        <div className="text-[11px] font-mono text-ink-300 text-right shrink-0 ml-4">
          <div>{enabledCount} / {sources?.length ?? 0} enabled</div>
          <div>{withContentCount} with content</div>
          {fetching.length > 0 && (
            <div className="text-flare-600">
              fetching {fetching.length}…
            </div>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[12px] text-verdict-fail bg-verdict-fail/10 px-3 py-2 rounded-md">
          {error}
        </p>
      )}

      <RefreshAllButton onStarted={load} hasContent={withContentCount > 0} />

      <AddUrlForm onAdded={load} />
      <UploadZone onUploaded={load} />

      {loading && <p className="text-[12px] text-ink-300 font-mono">loading sources…</p>}

      {user.length > 0 && (
        <SourceList
          title="Your sources"
          sources={user}
          busy={busy}
          onToggle={toggle}
          onRefresh={refresh}
          onRemove={remove}
          onSaveEdit={saveEdit}
        />
      )}

      <SourceList
        title="Curated"
        sources={curated}
        busy={busy}
        onToggle={toggle}
        onRefresh={refresh}
        onRemove={remove}
        onSaveEdit={saveEdit}
      />
    </div>
  );
}

function RefreshAllButton({
  onStarted,
  hasContent,
}: {
  onStarted: () => Promise<void>;
  hasContent: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    if (
      hasContent &&
      !confirm(
        "Re-fetch every URL source? Existing content will be replaced when each fetch completes.",
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      await fetch("/api/admin/knowledge/refresh-all", { method: "POST" });
      await onStarted();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 border border-ink-100 rounded-md bg-elevated px-4 py-3">
      <div className="flex items-start gap-3 min-w-0">
        <span
          aria-hidden
          className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full bg-flare-100 text-flare-600"
        >
          <RefreshIcon className="h-4 w-4" />
        </span>
        <p className="text-[13px] text-ink-500 leading-relaxed">
          Re-fetch <strong className="text-ink-700">every URL source</strong>{" "}
          right now. Otherwise sources refresh automatically on the launch page
          when they&apos;re older than 7 days.
        </p>
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="shrink-0 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink-100 bg-canvas h-9 px-4 min-w-[148px] text-[13px] font-medium text-ink-700 transition-colors hover:border-flare-600 hover:text-flare-600 hover:bg-flare-100/40 active:bg-flare-100/60 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-ink-100 disabled:hover:text-ink-700 disabled:hover:bg-canvas"
      >
        <RefreshIcon className={`h-3.5 w-3.5 ${submitting ? "animate-spin" : ""}`} />
        {submitting ? "Refreshing" : "Refresh all"}
      </button>
    </div>
  );
}

function RefreshIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function AddUrlForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("custom");
  const [region, setRegion] = useState("global");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!/^https?:\/\//i.test(url.trim())) {
      setError("URL must start with http(s)://");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim(), title: title.trim(), category, region }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add.");
        return;
      }
      setSuccess(`Added "${data.source.title}".`);
      setUrl("");
      setTitle("");
      await onAdded();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-ink-100 rounded-md p-4 bg-elevated">
      <p className="text-[13px] font-semibold text-ink-900 mb-3">Add a URL</p>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 mb-2">
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/threat-report-2026"
          className="h-9 px-3 rounded-md border border-ink-100 bg-canvas text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20 font-mono"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 px-2 rounded-md border border-ink-100 bg-canvas text-[12px] text-ink-700 font-mono"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="h-9 px-2 rounded-md border border-ink-100 bg-canvas text-[12px] text-ink-700 font-mono"
        >
          {REGIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Optional title (we'll extract from the page if blank)"
        className="w-full h-9 px-3 rounded-md border border-ink-100 bg-canvas text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20 mb-3"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-ink-300 leading-relaxed">
          We fetch and extract text on add. Refresh anytime to pull fresh content.
        </p>
        <Button type="submit" variant="primary" size="sm" disabled={submitting || !url}>
          {submitting ? "Fetching…" : "Add source"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-verdict-fail bg-verdict-fail/10 px-2 py-1 rounded">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-2 text-[12px] text-verdict-pass bg-verdict-pass/10 px-2 py-1 rounded font-mono">
          {success}
        </p>
      )}
    </form>
  );
}

function UploadZone({ onUploaded }: { onUploaded: () => Promise<void> }) {
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<Array<{ name: string; state: "pending" | "ok" | "error"; msg?: string }>>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const batch = Array.from(files);
    // Reset the status list when a new upload starts, so a stale error from a
    // previous attempt clears the moment a new file is dropped/selected.
    setUploads(batch.map((f) => ({ name: f.name, state: "pending" as const })));
    for (const f of batch) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/admin/knowledge/upload", { method: "POST", body: fd });
        const data = await res.json();
        setUploads((u) =>
          u.map((x) =>
            x.name === f.name
              ? res.ok
                ? { ...x, state: "ok" }
                : { ...x, state: "error", msg: data.error ?? "upload failed" }
              : x,
          ),
        );
        if (res.ok) await onUploaded();
      } catch (e) {
        setUploads((u) =>
          u.map((x) =>
            x.name === f.name
              ? { ...x, state: "error", msg: e instanceof Error ? e.message : "upload failed" }
              : x,
          ),
        );
      }
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-flare-600 bg-flare-100/30"
            : "border-ink-100 hover:border-ink-300 bg-elevated"
        }`}
      >
        <p className="text-[13px] font-semibold text-ink-900 mb-1">
          Drop files here, or click to browse
        </p>
        <p className="text-[12px] text-ink-500">
          .pdf · .md · .txt · up to 8 MB each. Text is extracted; the binary is not stored.
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.md,.markdown,.txt,.csv,.log"
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>
      {uploads.length > 0 && (
        <div className="mt-2 space-y-1">
          {uploads.map((u, i) => (
            <div key={`${u.name}-${i}`} className="flex items-center gap-2 text-[12px] font-mono">
              <span className="text-ink-500">{u.name}</span>
              <span
                className={
                  u.state === "ok"
                    ? "text-verdict-pass"
                    : u.state === "error"
                      ? "text-verdict-fail"
                      : "text-ink-300"
                }
              >
                {u.state === "ok" ? "ok" : u.state === "error" ? `error: ${u.msg}` : "uploading…"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceList({
  title,
  sources,
  busy,
  onToggle,
  onRefresh,
  onRemove,
  onSaveEdit,
}: {
  title: string;
  sources: Source[];
  busy: Set<string>;
  onToggle: (s: Source) => void;
  onRefresh: (s: Source) => void;
  onRemove: (s: Source) => void;
  onSaveEdit: (
    s: Source,
    updates: { title: string; url: string; category: string; region: string },
  ) => Promise<string | null>;
}) {
  // Group by category for curated; user sources stay flat.
  const grouped = useMemo(() => {
    const m = new Map<string, Source[]>();
    for (const s of sources) {
      const k = s.category ?? "custom";
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sources]);

  return (
    <div>
      <h4 className="text-[13px] font-semibold text-ink-900 mb-2 pt-3 border-t border-ink-100">
        {title} ({sources.length})
      </h4>
      <div className="space-y-3">
        {grouped.map(([cat, list]) => (
          <div key={cat}>
            <p className="text-[10px] uppercase tracking-wide font-medium text-ink-300 mb-1 font-mono">
              {cat}
            </p>
            <div className="space-y-1">
              {list.map((s) => (
                <SourceRow
                  key={s.id}
                  source={s}
                  busy={busy.has(s.id)}
                  onToggle={() => onToggle(s)}
                  onRefresh={() => onRefresh(s)}
                  onRemove={() => onRemove(s)}
                  onSaveEdit={(updates) => onSaveEdit(s, updates)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceRow({
  source,
  busy,
  onToggle,
  onRefresh,
  onRemove,
  onSaveEdit,
}: {
  source: Source;
  busy: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  onRemove: () => void;
  onSaveEdit: (updates: {
    title: string;
    url: string;
    category: string;
    region: string;
  }) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const ref = source.url ?? source.filename ?? "";
  const pending = isStillFetching(source);
  const fetchInfo = pending
    ? "fetching…"
    : source.lastFetchedAt
      ? new Date(source.lastFetchedAt).toISOString().slice(0, 10)
      : "never";
  const published = source.publishedAt
    ? new Date(source.publishedAt).toISOString().slice(0, 10)
    : null;
  const canEdit = !source.isCurated && source.kind === "URL";

  if (editing) {
    return (
      <SourceEditForm
        source={source}
        busy={busy}
        onCancel={() => setEditing(false)}
        onSave={async (updates) => {
          const err = await onSaveEdit(updates);
          if (!err) setEditing(false);
          return err;
        }}
      />
    );
  }

  return (
    <div className={`flex items-start gap-3 px-2 py-2 rounded-md hover:bg-subtle ${busy ? "opacity-60" : ""}`}>
      <input
        type="checkbox"
        checked={source.enabled}
        onChange={onToggle}
        disabled={busy}
        className="mt-1 shrink-0 h-4 w-4 accent-flare-600"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-[13px] font-semibold text-ink-900 truncate">
            {source.title}
          </p>
          {source.region && (
            <span className="text-[10px] font-mono text-ink-300 uppercase">
              {source.region}
            </span>
          )}
          {source.kind === "FILE" && (
            <span className="text-[10px] font-mono uppercase border border-ink-100 px-1 rounded-pill text-ink-500">
              file
            </span>
          )}
          {pending && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-flare-600">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-flare-600 animate-pulse" />
              fetching
            </span>
          )}
        </div>
        {ref && (
          <p className="text-[11px] font-mono text-ink-300 truncate">{ref}</p>
        )}
        <p className="text-[11px] font-mono text-ink-300 mt-0.5">
          {pending ? "" : `fetched ${fetchInfo}`}
          {published ? ` · published ${published}` : ""}
          {source.lastFetchError ? (
            <span className="text-verdict-fail"> · {source.lastFetchError.slice(0, 80)}</span>
          ) : null}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {source.kind === "URL" && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="text-[11px] text-ink-500 hover:text-ink-900 font-mono px-2 h-6 rounded hover:bg-ink-100/30"
            title="Re-fetch this source"
          >
            refresh
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={busy}
            className="text-[11px] text-ink-500 hover:text-ink-900 font-mono px-2 h-6 rounded hover:bg-ink-100/30"
            title="Edit this source"
          >
            edit
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="text-[11px] text-verdict-fail/80 hover:text-verdict-fail font-mono px-2 h-6 rounded hover:bg-verdict-fail/10"
          title={
            source.isCurated
              ? "Remove from your curated catalog (won't be re-seeded)"
              : "Remove this source"
          }
        >
          remove
        </button>
      </div>
    </div>
  );
}

function SourceEditForm({
  source,
  busy,
  onCancel,
  onSave,
}: {
  source: Source;
  busy: boolean;
  onCancel: () => void;
  onSave: (updates: {
    title: string;
    url: string;
    category: string;
    region: string;
  }) => Promise<string | null>;
}) {
  const [title, setTitle] = useState(source.title);
  const [url, setUrl] = useState(source.url ?? "");
  const [category, setCategory] = useState(source.category ?? "custom");
  const [region, setRegion] = useState(source.region ?? "global");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty =
    title.trim() !== source.title ||
    url.trim() !== (source.url ?? "") ||
    category !== (source.category ?? "custom") ||
    region !== (source.region ?? "global");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title cannot be empty.");
      return;
    }
    if (!/^https?:\/\//i.test(url.trim())) {
      setError("URL must start with http(s)://");
      return;
    }
    setSaving(true);
    const err = await onSave({
      title: title.trim(),
      url: url.trim(),
      category,
      region,
    });
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <form
      onSubmit={handleSave}
      className="px-3 py-3 rounded-md border border-flare-600/40 bg-flare-100/20"
    >
      <p className="text-[11px] font-mono uppercase tracking-wide text-flare-600 mb-2">
        editing source
      </p>
      <div className="space-y-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full h-9 px-3 rounded-md border border-ink-100 bg-canvas text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20"
        />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="w-full h-9 px-3 rounded-md border border-ink-100 bg-canvas text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20 font-mono"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 px-2 rounded-md border border-ink-100 bg-canvas text-[12px] text-ink-700 font-mono"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="h-9 px-2 rounded-md border border-ink-100 bg-canvas text-[12px] text-ink-700 font-mono"
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-verdict-fail bg-verdict-fail/10 px-2 py-1 rounded">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 mt-3">
        <p className="text-[11px] text-ink-300 leading-relaxed">
          {url.trim() !== (source.url ?? "")
            ? "URL change will re-fetch content on save."
            : "Metadata-only changes won't re-fetch content."}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="text"
            size="sm"
            onClick={onCancel}
            disabled={saving || busy}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={saving || busy || !dirty}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
