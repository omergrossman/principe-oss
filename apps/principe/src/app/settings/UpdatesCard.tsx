// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";

interface CheckResponse {
  mode: "remote" | "local" | "disabled";
  installedVersion: string | null;
  installedAt: string | null;
  workspaceCreatedAt: string | null;
  latestVersion: string | null;
  latestPublishedAt: string | null;
  changelog: string | null;
  latestEntryCount: number | null;
  updateAvailable: boolean;
  autoUpdate: boolean;
  error?: string;
}

interface InstallResponse {
  ok: boolean;
  installedVersion?: string;
  diffSummary?: {
    knowledge: { new: number; updated: number; skipped: number; removed: number };
    failed: { id: string; reason: string }[];
  };
  error?: string;
}

export function UpdatesCard() {
  const [check, setCheck] = useState<CheckResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<InstallResponse | null>(null);
  const [progress, setProgress] = useState(0);
  const [savingMode, setSavingMode] = useState(false);

  async function runCheck() {
    setChecking(true);
    try {
      const res = await fetch("/api/updates/check", { cache: "no-store" });
      const data = (await res.json()) as CheckResponse;
      setCheck(data);
      // Automatic mode: an available update installs itself (consent was
      // given by enabling auto). Manual mode never auto-installs.
      if (data.mode === "remote" && data.autoUpdate && data.updateAvailable && !installing) {
        void runInstall(true);
      }
    } catch {
      setCheck({
        mode: "remote",
        installedVersion: null,
        installedAt: null,
        workspaceCreatedAt: null,
        latestVersion: null,
        latestPublishedAt: null,
        changelog: null,
        latestEntryCount: null,
        updateAvailable: false,
        autoUpdate: false,
        error: "Network error — couldn't reach the local API.",
      });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void runCheck();
  }, []);

  async function runInstall(auto = false) {
    if (!auto && !confirm("Install the latest knowledge bundle? Signature is verified before apply.")) return;
    setInstalling(true);
    setInstallResult(null);
    // Animated download/apply progress. The bundle is small, so this ramps
    // toward 90% then completes — enough to show the operation is live.
    setProgress(8);
    const ramp = setInterval(
      () => setProgress((p) => (p < 90 ? p + Math.max(1, (90 - p) * 0.18) : p)),
      180,
    );
    try {
      const res = await fetch("/api/updates/install", { method: "POST" });
      const data = (await res.json()) as InstallResponse;
      setProgress(100);
      setInstallResult(data);
      if (data.ok) {
        await runCheck(); // refresh installedVersion / updateAvailable
      }
    } catch {
      setInstallResult({ ok: false, error: "Network error during install." });
    } finally {
      clearInterval(ramp);
      setInstalling(false);
      setTimeout(() => setProgress(0), 700);
    }
  }

  async function setMode(autoUpdate: boolean) {
    setSavingMode(true);
    setCheck((c) => (c ? { ...c, autoUpdate } : c)); // optimistic
    try {
      await fetch("/api/updates/mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ autoUpdate }),
      });
      // Turning auto ON with a pending update = consent to install it now.
      if (autoUpdate && check?.mode === "remote" && check?.updateAvailable && !installing) {
        await runInstall(true);
      }
    } catch {
      setCheck((c) => (c ? { ...c, autoUpdate: !autoUpdate } : c)); // revert
    } finally {
      setSavingMode(false);
    }
  }

  if (check?.mode === "disabled") {
    return null; // UI hides itself when updates are disabled.
  }

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[16px] font-semibold text-ink-900">Knowledge updates</h2>
        {check?.mode === "local" && <Pill tone="default">local mode</Pill>}
        {check?.mode === "remote" && <Pill tone="accent">remote</Pill>}
      </div>

      {checking && (
        <p className="text-[13px] text-ink-500 font-mono">Checking…</p>
      )}

      {!checking && check && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-[13px]">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-300 font-medium mb-1">
                Last update
              </p>
              <p className="text-ink-900 font-mono">
                {check.installedVersion ?? "Shipped with install"}
              </p>
              <p className="text-[11px] text-ink-300 font-mono mt-0.5">
                {check.installedAt
                  ? new Date(check.installedAt).toLocaleDateString()
                  : check.workspaceCreatedAt
                    ? new Date(check.workspaceCreatedAt).toLocaleDateString()
                    : ""}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-300 font-medium mb-1">
                Latest available
              </p>
              <p className="text-ink-900 font-mono">
                {check.mode === "local"
                  ? "bundled with install"
                  : check.latestVersion ?? "—"}
              </p>
              {check.latestPublishedAt && (
                <p className="text-[11px] text-ink-300 font-mono mt-0.5">
                  {new Date(check.latestPublishedAt).toLocaleDateString()}
                  {check.updateAvailable && check.latestEntryCount != null
                    ? ` · ${check.latestEntryCount} items`
                    : ""}
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
            <p className="text-[12px] text-ink-500 leading-relaxed mb-3">
              Your panel is running on the knowledge corpus shipped with
              this install. Connect an update source to receive new
              knowledge — you&apos;ll choose whether it installs manually
              (the default) or automatically.
            </p>
          )}

          {check.mode === "remote" && (
            <div className="space-y-3">
              {/* Manual vs automatic — default manual so nothing installs
                  without explicit consent. */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-ink-900">Update mode</p>
                  <p className="text-[11px] text-ink-500">
                    {check.autoUpdate
                      ? "Updates install automatically when available."
                      : "Updates install only when you click Update now."}
                  </p>
                </div>
                <div
                  role="group"
                  aria-label="Update mode"
                  className="inline-flex shrink-0 rounded-md border border-ink-300 p-0.5 text-[12px] font-medium"
                >
                  <button
                    type="button"
                    onClick={() => setMode(false)}
                    disabled={savingMode || installing}
                    aria-pressed={!check.autoUpdate}
                    className={`px-3 py-1 rounded ${!check.autoUpdate ? "bg-ink-900 text-white" : "text-ink-500"}`}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode(true)}
                    disabled={savingMode || installing}
                    aria-pressed={check.autoUpdate}
                    className={`px-3 py-1 rounded ${check.autoUpdate ? "bg-ink-900 text-white" : "text-ink-500"}`}
                  >
                    Automatic
                  </button>
                </div>
              </div>

              {/* Download/apply progress. */}
              {installing && (
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-flare-100"
                  role="progressbar"
                  aria-valuenow={Math.round(progress)}
                >
                  <div
                    className="h-full rounded-full bg-flare-600 transition-all duration-200 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => runInstall(false)}
                  disabled={check.autoUpdate || installing || !check.updateAvailable}
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

          {installResult && (
            <div
              className={`mt-4 p-3 rounded-md text-[13px] ${
                installResult.ok
                  ? "bg-verdict-pass/10 text-verdict-pass"
                  : "bg-verdict-fail/10 text-verdict-fail"
              }`}
            >
              {installResult.ok && installResult.diffSummary && (
                <>
                  <p className="font-semibold mb-1">
                    Installed {installResult.installedVersion}
                  </p>
                  <p className="font-mono text-[12px]">
                    knowledge — {installResult.diffSummary.knowledge.new} new ·{" "}
                    {installResult.diffSummary.knowledge.updated} updated ·{" "}
                    {installResult.diffSummary.knowledge.skipped} skipped
                    {installResult.diffSummary.knowledge.removed > 0 &&
                      ` · ${installResult.diffSummary.knowledge.removed} removed`}
                    {installResult.diffSummary.failed.length > 0 &&
                      ` · ${installResult.diffSummary.failed.length} failed`}
                  </p>
                </>
              )}
              {!installResult.ok && (
                <>
                  <p className="font-semibold mb-1">Install failed</p>
                  <p>{installResult.error}</p>
                </>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
