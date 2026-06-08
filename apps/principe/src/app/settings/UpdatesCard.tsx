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
  updateAvailable: boolean;
  error?: string;
}

interface InstallResponse {
  ok: boolean;
  installedVersion?: string;
  diffSummary?: {
    knowledge: { new: number; updated: number; skipped: number };
    failed: { id: string; reason: string }[];
  };
  error?: string;
}

export function UpdatesCard() {
  const [check, setCheck] = useState<CheckResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<InstallResponse | null>(null);

  async function runCheck() {
    setChecking(true);
    try {
      const res = await fetch("/api/updates/check", { cache: "no-store" });
      const data = (await res.json()) as CheckResponse;
      setCheck(data);
    } catch {
      setCheck({
        mode: "remote",
        installedVersion: null,
        installedAt: null,
        workspaceCreatedAt: null,
        latestVersion: null,
        latestPublishedAt: null,
        changelog: null,
        updateAvailable: false,
        error: "Network error — couldn't reach the local API.",
      });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void runCheck();
  }, []);

  async function runInstall() {
    if (!confirm("Install the latest knowledge bundle? Signature is verified before apply.")) return;
    setInstalling(true);
    setInstallResult(null);
    try {
      const res = await fetch("/api/updates/install", { method: "POST" });
      const data = (await res.json()) as InstallResponse;
      setInstallResult(data);
      if (data.ok) {
        // Refresh the check so installedVersion updates.
        await runCheck();
      }
    } catch {
      setInstallResult({ ok: false, error: "Network error during install." });
    } finally {
      setInstalling(false);
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
                </p>
              )}
            </div>
          </div>

          {check.changelog && check.updateAvailable && (
            <div className="mb-4 p-3 rounded-md bg-flare-100/40 border border-flare-600/20">
              <p className="text-[11px] uppercase tracking-wide font-medium text-ink-500 mb-1">
                What changed
              </p>
              <p className="text-[13px] text-ink-700 whitespace-pre-line">
                {check.changelog}
              </p>
            </div>
          )}

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
              this install. Future updates will pull automatically when
              available.
            </p>
          )}

          {check.mode === "remote" && (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={runInstall}
                disabled={installing || !check.updateAvailable}
              >
                {installing
                  ? "Verifying + installing…"
                  : check.updateAvailable
                    ? `Install ${check.latestVersion}`
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
