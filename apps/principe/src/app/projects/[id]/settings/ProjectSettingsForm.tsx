// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DeleteProjectControl } from "@/app/projects/DeleteProjectControl";
import { ArchiveProjectControl } from "@/app/projects/ArchiveProjectControl";

export function ProjectSettingsForm({
  projectId,
  currentName,
  isDefault,
  isArchived,
}: {
  projectId: string;
  currentName: string;
  isDefault: boolean;
  isArchived: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function rename() {
    setError("");
    setSuccess("");
    if (name.trim() === currentName) {
      setSuccess("No change.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not rename.");
        return;
      }
      setSuccess("Renamed.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[14px] font-semibold text-ink-900 mb-1">
          Project name
        </h3>
        <p className="text-[12px] text-ink-500 mb-3">
          {isDefault
            ? "The Default project cannot be renamed."
            : "Visible in the project switcher and history."}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isDefault || busy}
            maxLength={80}
            className="flex-1 h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 disabled:opacity-50"
          />
          <Button
            variant="primary"
            size="md"
            onClick={rename}
            disabled={isDefault || busy || name.trim().length < 2}
          >
            Save name
          </Button>
        </div>
      </div>

      <div className="pt-5 border-t border-ink-100">
        <h3 className="text-[14px] font-semibold text-ink-900 mb-1">
          {isArchived ? "Restore" : "Archive"}
        </h3>
        <p className="text-[12px] text-ink-500 mb-3">
          {isDefault
            ? "The Default project cannot be archived."
            : isArchived
              ? "Restore this project to the active list."
              : "Hide this project from /projects. Ask history is preserved and the project can be restored any time."}
        </p>
        {!isDefault && (
          <ArchiveProjectControl
            projectId={projectId}
            projectName={currentName}
            mode={isArchived ? "restore" : "archive"}
            variant="button"
            disabled={busy}
          />
        )}
      </div>

      {!isDefault && (
        <div className="pt-5 border-t border-verdict-fail/40">
          <h3 className="text-[14px] font-semibold text-verdict-fail mb-1">
            Delete project
          </h3>
          <p className="text-[12px] text-ink-500 mb-3 leading-relaxed">
            Permanently delete this project and everything inside it — all
            past asks, panel agents, and project-scoped sources. This cannot
            be undone.
          </p>
          <DeleteProjectControl
            projectId={projectId}
            projectName={currentName}
            variant="button"
            disabled={busy}
          />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="text-[13px] text-verdict-fail bg-verdict-fail/10 px-3 py-2 rounded-md"
        >
          {error}
        </p>
      )}
      {success && (
        <p className="text-[13px] text-verdict-pass bg-verdict-pass/10 px-3 py-2 rounded-md">
          {success}
        </p>
      )}
    </div>
  );
}

