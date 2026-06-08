// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type Mode = "archive" | "restore";

/**
 * Sprint 7 — same modal style as DeleteProjectControl but in a softer
 * neutral tone, since archive/restore is reversible. Used by:
 *   - ProjectSettingsForm   (variant="button", mode follows current status)
 *   - /projects archived card footer (variant="link", mode="restore")
 *   - /projects active card footer    (variant="link", mode="archive") — optional
 */
export function ArchiveProjectControl({
  projectId,
  projectName,
  mode,
  variant = "button",
  disabled = false,
}: {
  projectId: string;
  projectName: string;
  mode: Mode;
  variant?: "button" | "link";
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const labels = mode === "archive"
    ? {
        action: "Archive",
        actionLong: "Archive project…",
        actionShort: "Archive",
        confirm: "Archive project",
        title: `Archive “${projectName}”?`,
        body: "It will move to the Archived section. All asks, agents, and sources are preserved — you can restore the project any time.",
        busy: "Archiving…",
      }
    : {
        action: "Restore",
        actionLong: "Restore project",
        actionShort: "Restore",
        confirm: "Restore project",
        title: `Restore “${projectName}”?`,
        body: "It will return to your active projects with every past ask, agent, and source intact.",
        busy: "Restoring…",
      };

  async function commit() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? `Could not ${mode}.`);
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {variant === "button" ? (
        <Button
          variant={mode === "restore" ? "primary" : "secondary"}
          size="md"
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          {labels.actionLong}
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="text-ink-500 hover:text-ink-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {labels.actionShort}
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-ink-900/60 backdrop-blur-sm flex items-center justify-center px-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <div className="bg-canvas border border-ink-100 rounded-lg p-5 max-w-md w-full shadow-xl">
            <h3 className="text-[16px] font-bold text-ink-900 mb-2">
              {labels.title}
            </h3>
            <p className="text-[13px] text-ink-700 leading-relaxed mb-4">
              {labels.body}
            </p>
            {err && (
              <p
                role="alert"
                className="text-[12px] text-verdict-fail bg-verdict-fail/10 px-3 py-2 rounded-md mb-3"
              >
                {err}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="text"
                size="md"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                variant={mode === "restore" ? "primary" : "secondary"}
                size="md"
                onClick={commit}
                disabled={busy}
              >
                {busy ? labels.busy : labels.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
