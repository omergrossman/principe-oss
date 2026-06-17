// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

interface Source {
  id: string;
  kind: "URL" | "FILE";
  url: string | null;
  filename: string | null;
  title: string;
  category: string | null;
  region: string | null;
  enabled: boolean;
  publishedAt: string | null;
  lastFetchedAt: string | null;
  lastFetchError: string | null;
  contentHash: string | null;
  addedAt: string;
}

const REGIONS = ["global", "us", "uk", "eu-west", "eu-central", "apac", "anz", "mea"];
const CATEGORIES = [
  "analyst",
  "threat-intel",
  "framework",
  "news",
  "regulator",
  "cert",
  "custom",
];

export function ProjectSources({ projectId }: { projectId: string }) {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const baseUrl = `/api/projects/${projectId}/sources`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(baseUrl);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load.");
      setSources(data.sources);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    void load();
  }, [load]);

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
      const res = await fetch(`${baseUrl}/${s.id}`, {
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
      const res = await fetch(`${baseUrl}/${s.id}`, {
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
    if (!confirm(`Remove "${s.title}" from this project's sources?`)) return;
    markBusy(s.id, true);
    try {
      const res = await fetch(`${baseUrl}/${s.id}`, { method: "DELETE" });
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
      const res = await fetch(`${baseUrl}/${s.id}`, {
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

  const enabledCount = (sources ?? []).filter((s) => s.enabled).length;
  const withContent = (sources ?? []).filter((s) => s.contentHash).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-500 leading-relaxed max-w-2xl">
          Sources added here apply only to this project&apos;s panel.
          Firm-wide sources from <strong className="text-ink-700">Settings</strong>{" "}
          continue to apply automatically.
        </p>
        <div className="text-[11px] font-mono text-ink-300 text-right shrink-0 ml-4">
          <div>
            {enabledCount} / {sources?.length ?? 0} enabled
          </div>
          <div>{withContent} with content</div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="text-[12px] text-verdict-fail bg-verdict-fail/10 px-3 py-2 rounded-md"
        >
          {error}
        </p>
      )}

      <AddUrlForm baseUrl={baseUrl} onAdded={load} />
      <UploadZone baseUrl={baseUrl} onUploaded={load} />

      {loading && (
        <p className="text-[12px] text-ink-300 font-mono">loading sources…</p>
      )}

      {sources && sources.length > 0 ? (
        <div className="space-y-1">
          {sources.map((s) => (
            <SourceRow
              key={s.id}
              source={s}
              busy={busy.has(s.id)}
              onToggle={() => toggle(s)}
              onRefresh={() => refresh(s)}
              onRemove={() => remove(s)}
              onSaveEdit={(updates) => saveEdit(s, updates)}
            />
          ))}
        </div>
      ) : (
        !loading && (
          <p className="text-[13px] text-ink-300 italic">
            No project-scoped sources yet. Add a URL or upload a file to
            attach intelligence specific to this project.
          </p>
        )
      )}
    </div>
  );
}

function AddUrlForm({
  baseUrl,
  onAdded,
}: {
  baseUrl: string;
  onAdded: () => Promise<void>;
}) {
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
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          title: title.trim(),
          category,
          region,
        }),
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
          placeholder="https://example.com/specific-threat-report"
          className="h-9 px-3 rounded-md border border-ink-100 bg-canvas text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20 font-mono"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 px-2 rounded-md border border-ink-100 bg-canvas text-[12px] text-ink-700 font-mono"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="h-9 px-2 rounded-md border border-ink-100 bg-canvas text-[12px] text-ink-700 font-mono"
        >
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Optional title"
        className="w-full h-9 px-3 rounded-md border border-ink-100 bg-canvas text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20 mb-3"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-ink-300 leading-relaxed">
          Fetched + extracted on add. Refresh anytime.
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

function UploadZone({
  baseUrl,
  onUploaded,
}: {
  baseUrl: string;
  onUploaded: () => Promise<void>;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<
    Array<{ name: string; state: "pending" | "ok" | "error"; msg?: string }>
  >([]);
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
        const res = await fetch(`${baseUrl}/upload`, { method: "POST", body: fd });
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
              ? {
                  ...x,
                  state: "error",
                  msg: e instanceof Error ? e.message : "upload failed",
                }
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
          Drop a file here, or click to browse
        </p>
        <p className="text-[12px] text-ink-500">
          .pdf · .md · .txt · up to 8 MB. Text is extracted; the binary is not stored.
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
  const fetchInfo = source.lastFetchedAt
    ? new Date(source.lastFetchedAt).toISOString().slice(0, 10)
    : "never";
  const published = source.publishedAt
    ? new Date(source.publishedAt).toISOString().slice(0, 10)
    : null;
  const canEdit = source.kind === "URL";

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
    <div
      className={`flex items-start gap-3 px-2 py-2 rounded-md hover:bg-subtle ${
        busy ? "opacity-60" : ""
      }`}
    >
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
        </div>
        {ref && (
          <p className="text-[11px] font-mono text-ink-300 truncate">{ref}</p>
        )}
        <p className="text-[11px] font-mono text-ink-300 mt-0.5">
          fetched {fetchInfo}
          {published ? ` · published ${published}` : ""}
          {source.lastFetchError ? (
            <span className="text-verdict-fail">
              {" "}
              · {source.lastFetchError.slice(0, 80)}
            </span>
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
          >
            edit
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="text-[11px] text-verdict-fail/80 hover:text-verdict-fail font-mono px-2 h-6 rounded hover:bg-verdict-fail/10"
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
            {saving ? "Saving" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
