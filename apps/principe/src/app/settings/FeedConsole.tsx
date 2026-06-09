// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";

interface FeedState {
  urls: string[];
  files: { name: string; sha: string }[];
  liveCount: number;
  recentBuilds: { date: string; message: string; sha: string }[];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(((r.result as string) ?? "").split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function FeedConsole() {
  const [state, setState] = useState<FeedState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = (data: FeedState) =>
    setState({ urls: data.urls, files: data.files, liveCount: data.liveCount, recentBuilds: data.recentBuilds });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/feed", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load.");
      apply(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch
    void load();
  }, [load]);

  async function action(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/feed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed.");
      apply(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onAddUrl(e: FormEvent) {
    e.preventDefault();
    const u = url.trim();
    if (!u) return;
    await action({ action: "add-url", url: u });
    setUrl("");
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const contentBase64 = await fileToBase64(file);
    await action({ action: "add-file", name: file.name, contentBase64 });
    e.target.value = "";
  }

  const pending = state ? state.urls.length + state.files.length : 0;

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-[18px] font-semibold text-ink-900">Feed inputs</h2>
        <Pill tone="accent">publisher</Pill>
      </div>
      <p className="text-[13px] text-ink-500 leading-relaxed mb-4">
        Add your own URLs or files for the daily build to <strong>digest</strong>{" "}
        (key points, never verbatim) into the knowledge package. They ride the
        normal review flow before publishing.
        {state ? ` ${state.liveCount} live in the feed.` : ""}
      </p>

      {error && (
        <p role="alert" className="text-[12px] text-verdict-fail bg-verdict-fail/10 px-2 py-1.5 rounded-md mb-3">
          {error}
        </p>
      )}

      <form onSubmit={onAddUrl} className="flex items-center gap-2 mb-3">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…  a report or article to digest"
          className="flex-1 h-9 px-3 rounded-md border border-ink-200 bg-white text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 outline-none"
        />
        <Button type="submit" variant="primary" size="md" disabled={busy || !url.trim()}>
          Add URL
        </Button>
      </form>

      <label className="flex items-center gap-2 mb-5 text-[13px]">
        <span className="inline-flex items-center h-9 px-3 rounded-md border border-dashed border-ink-300 cursor-pointer hover:border-flare-600 text-ink-700">
          Upload file…
          <input
            type="file"
            accept=".pdf,.txt,.md,.markdown,.html,.htm"
            className="hidden"
            onChange={onFile}
            disabled={busy}
          />
        </span>
        <span className="text-[11px] text-ink-300 font-mono">PDF · TXT · MD · HTML</span>
      </label>

      {loading ? (
        <p className="text-[13px] text-ink-300 font-mono">Loading…</p>
      ) : pending > 0 ? (
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-wide text-ink-300 font-medium mb-2">
            Waiting for the next build
          </p>
          <ul className="space-y-1.5">
            {state!.urls.map((u) => (
              <li key={u} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="truncate text-ink-700 font-mono">🔗 {u}</span>
                <button
                  type="button"
                  onClick={() => action({ action: "remove-url", url: u })}
                  disabled={busy}
                  className="text-ink-300 hover:text-verdict-fail shrink-0"
                >
                  remove
                </button>
              </li>
            ))}
            {state!.files.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="truncate text-ink-700 font-mono">📄 {f.name}</span>
                <button
                  type="button"
                  onClick={() => action({ action: "remove-file", name: f.name, sha: f.sha })}
                  disabled={busy}
                  className="text-ink-300 hover:text-verdict-fail shrink-0"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[12px] text-ink-300 italic mb-5">
          No pending inputs — add a URL or file above.
        </p>
      )}

      {state && state.recentBuilds.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-300 font-medium mb-2">
            Recent builds
          </p>
          <ul className="space-y-1">
            {state.recentBuilds.map((b) => (
              <li key={b.sha} className="flex items-center gap-2 text-[12px] text-ink-500 font-mono">
                <span className="text-ink-300 shrink-0">{new Date(b.date).toLocaleDateString()}</span>
                <span className="truncate">{b.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
