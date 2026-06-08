"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * Sprint 7 — shared delete-project control. Used on both:
 *   - the per-project settings page (variant="button")
 *   - the /projects list card footer (variant="link")
 *
 * Simple confirm popup — no typed-name verification (it just got in the
 * way). Server still blocks the Default project and cascades dependents.
 */
export function DeleteProjectControl({
  projectId,
  projectName,
  variant = "button",
  disabled = false,
}: {
  projectId: string;
  projectName: string;
  variant?: "button" | "link";
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function confirmDelete() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Could not delete project.");
        return;
      }
      // From /settings → bounce to /projects. From /projects list →
      // refresh the list (the row vanishes).
      router.push("/projects");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {variant === "button" ? (
        <Button
          variant="destructive"
          size="md"
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          Delete project…
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="text-ink-500 hover:text-verdict-fail transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Delete
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-ink-900/60 backdrop-blur-sm flex items-center justify-center px-4 z-50"
          onClick={(e) => {
            // Close on backdrop click (but not on click inside the panel)
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <div className="bg-canvas border border-ink-100 rounded-lg p-5 max-w-md w-full shadow-xl">
            <h3 className="text-[16px] font-bold text-verdict-fail mb-2">
              Delete &ldquo;{projectName}&rdquo;?
            </h3>
            <p className="text-[13px] text-ink-700 leading-relaxed mb-4">
              Are you sure? The project will be permanently deleted along
              with every past ask, every materialised agent, and every
              project-scoped source. This action cannot be undone.
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
                variant="destructive"
                size="md"
                onClick={confirmDelete}
                disabled={busy}
              >
                {busy ? "Deleting…" : "Yes, delete forever"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
