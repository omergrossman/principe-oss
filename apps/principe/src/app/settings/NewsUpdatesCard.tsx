// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";

interface NewsCheck {
  mode: "remote" | "local" | "disabled";
  installedVersion: string | null;
  latestVersion: string | null;
  latestGeneratedAt: string | null;
  latestCount: number | null;
  updateAvailable: boolean;
  autoNews: boolean;
  error?: string;
}

interface NewsInstall {
  ok: boolean;
  version?: string;
  diff?: { new: number; updated: number; skipped: number; removed: number };
  error?: string;
}

/**
 * News-feed updates — the in-app "What's New" counterpart of the knowledge
 * UpdatesCard. Same manual/automatic model, default automatic. News rides
 * the same signed channel (PRINCIPE_UPDATES_URL) as a separate artifact,
 * so it updates on its own cadence.
 */
export function NewsUpdatesCard() {
  const [check, setCheck] = useState<NewsCheck | null>(null);
  const [checking, setChecking] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<NewsInstall | null>(null);
  const [savingMode, setSavingMode] = useState(false);

  async function runCheck() {
    setChecking(true);
    try {
      const res = await fetch("/api/news/check", { cache: "no-store" });
      const data = (await res.json()) as NewsCheck;
      setCheck(data);
      if (data.mode === "remote" && data.autoNews && data.updateAvailable && !installing) {
        void runInstall(true);
      }
    } catch {
      setCheck({
        mode: "remote",
        installedVersion: null,
        latestVersion: null,
        latestGeneratedAt: null,
        latestCount: null,
        updateAvailable: false,
        autoNews: true,
        error: "Network error — couldn't reach the local API.",
      });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runInstall(auto = false) {
    setInstalling(true);
    setResult(null);
    try {
      const res = await fetch("/api/news/install", { method: "POST" });
      const data = (await res.json()) as NewsInstall;
      setResult(data);
      if (data.ok) await runCheck();
    } catch {
      setResult({ ok: false, error: "Network error during install." });
    } finally {
      setInstalling(false);
      void auto;
    }
  }

  async function setMode(autoNews: boolean) {
    setSavingMode(true);
    setCheck((c) => (c ? { ...c, autoNews } : c));
    try {
      await fetch("/api/news/mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ autoNews }),
      });
      if (autoNews && check?.mode === "remote" && check?.updateAvailable && !installing) {
        await runInstall(true);
      }
    } catch {
      setCheck((c) => (c ? { ...c, autoNews: !autoNews } : c));
    } finally {
      setSavingMode(false);
    }
  }

  if (check?.mode === "disabled") return null;

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[16px] font-semibold text-ink-900">News updates</h2>
        {check?.mode === "local" && <Pill tone="default">local mode</Pill>}
        {check?.mode === "remote" && <Pill tone="accent">remote</Pill>}
      </div>

      <p className="text-[12px] text-ink-500 leading-relaxed mb-3 max-w-md">
        Product updates shown in the “What’s new” megaphone. Delivered over
        the same signed channel as knowledge updates, as its own feed.
      </p>

      {checking && <p className="text-[13px] text-ink-500 font-mono">Checking…</p>}

      {!checking && check && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-[13px]">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-300 font-medium mb-1">
                Installed
              </p>
              <p className="text-ink-900 font-mono">
                {check.installedVersion ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-300 font-medium mb-1">
                Latest available
              </p>
              <p className="text-ink-900 font-mono">
                {check.mode === "local" ? "bundled" : check.latestVersion ?? "—"}
              </p>
              {check.latestGeneratedAt && (
                <p className="text-[11px] text-ink-300 font-mono mt-0.5">
                  {new Date(check.latestGeneratedAt).toLocaleDateString()}
                  {check.latestCount != null ? ` · ${check.latestCount} items` : ""}
                </p>
              )}
            </div>
          </div>

          {check.error && (
            <p
              role="alert"
              className="text-[12px] text-verdict-fail bg-verdict-fail/10 px-2 py-1.5 rounded-md mb-3"
            >
              {check.error}
            </p>
          )}

          {check.mode === "local" && (
            <p className="text-[12px] text-ink-500 leading-relaxed">
              No update source configured — the app shows whatever news
              shipped with this install.
            </p>
          )}

          {check.mode === "remote" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-ink-900">Update mode</p>
                  <p className="text-[11px] text-ink-500">
                    {check.autoNews
                      ? "News installs automatically when available."
                      : "News installs only when you click Update now."}
                  </p>
                </div>
                <div
                  role="group"
                  aria-label="News update mode"
                  className="inline-flex shrink-0 rounded-md border border-ink-300 p-0.5 text-[12px] font-medium"
                >
                  <button
                    type="button"
                    onClick={() => setMode(false)}
                    disabled={savingMode || installing}
                    aria-pressed={!check.autoNews}
                    className={`px-3 py-1 rounded ${!check.autoNews ? "bg-ink-900 text-white" : "text-ink-500"}`}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode(true)}
                    disabled={savingMode || installing}
                    aria-pressed={check.autoNews}
                    className={`px-3 py-1 rounded ${check.autoNews ? "bg-ink-900 text-white" : "text-ink-500"}`}
                  >
                    Automatic
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => runInstall(false)}
                  disabled={check.autoNews || installing || !check.updateAvailable}
                >
                  {installing
                    ? "Verifying + installing…"
                    : check.updateAvailable
                      ? `Update now${check.latestVersion ? ` (${check.latestVersion})` : ""}`
                      : "Up to date"}
                </Button>
                <Button
                  type="button"
                  variant="text"
                  size="md"
                  onClick={runCheck}
                  disabled={checking || installing}
                >
                  Re-check
                </Button>
              </div>
            </div>
          )}

          {result && (
            <div
              className={`mt-4 p-3 rounded-md text-[13px] ${
                result.ok
                  ? "bg-verdict-pass/10 text-verdict-pass"
                  : "bg-verdict-fail/10 text-verdict-fail"
              }`}
            >
              {result.ok && result.diff ? (
                <>
                  <p className="font-semibold mb-1">Installed {result.version}</p>
                  <p className="font-mono text-[12px]">
                    news — {result.diff.new} new · {result.diff.updated} updated ·{" "}
                    {result.diff.skipped} skipped
                    {result.diff.removed > 0 && ` · ${result.diff.removed} removed`}
                  </p>
                </>
              ) : (
                !result.ok && (
                  <>
                    <p className="font-semibold mb-1">Install failed</p>
                    <p>{result.error}</p>
                  </>
                )
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
