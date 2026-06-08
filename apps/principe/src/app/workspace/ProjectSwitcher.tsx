"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Project {
  id: string;
  name: string;
  isDefault: boolean;
}

export function ProjectSwitcher({
  currentId,
  projects,
}: {
  currentId: string;
  projects: Project[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const current = projects.find((p) => p.id === currentId) ?? projects[0];

  async function switchTo(projectId: string) {
    if (projectId === currentId) {
      setOpen(false);
      return;
    }
    setSwitching(projectId);
    try {
      const res = await fetch("/api/projects/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setSwitching(null);
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-7 px-3 rounded-md border border-ink-100 bg-elevated hover:border-ink-300 transition-colors text-[13px]"
      >
        <span className="text-ink-500 font-mono text-[11px] uppercase tracking-wide">
          project
        </span>
        <span className="font-semibold text-ink-900 max-w-[200px] truncate">
          {current?.name ?? "Default project"}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className="text-ink-300"
        >
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 right-0 min-w-[260px] rounded-md border border-ink-100 bg-elevated shadow-md overflow-hidden">
          <div className="max-h-[260px] overflow-y-auto py-1">
            {projects.map((p) => {
              const isCurrent = p.id === currentId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => switchTo(p.id)}
                  className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-subtle flex items-baseline justify-between gap-2 ${
                    isCurrent ? "bg-flare-100/40" : ""
                  }`}
                  disabled={switching === p.id}
                >
                  <span className="truncate text-ink-900 font-medium">
                    {p.name}
                  </span>
                  {p.isDefault && (
                    <span className="text-[10px] font-mono uppercase text-ink-300">
                      default
                    </span>
                  )}
                  {isCurrent && !p.isDefault && (
                    <span className="text-[10px] font-mono text-flare-600">
                      current
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="border-t border-ink-100 py-1">
            <a
              href={`/projects/${currentId}/history`}
              className="block px-3 py-1.5 text-[12px] text-ink-500 hover:bg-subtle"
            >
              History for this project
            </a>
            <a
              href={`/projects/${currentId}/sources`}
              className="block px-3 py-1.5 text-[12px] text-ink-500 hover:bg-subtle"
            >
              Project sources
            </a>
            <a
              href={`/projects/${currentId}/settings`}
              className="block px-3 py-1.5 text-[12px] text-ink-500 hover:bg-subtle"
            >
              Project settings
            </a>
            <a
              href="/projects"
              className="block px-3 py-1.5 text-[12px] text-ink-500 hover:bg-subtle"
            >
              All projects →
            </a>
            <a
              href="/projects/new"
              className="block px-3 py-1.5 text-[12px] text-flare-600 hover:bg-subtle font-semibold"
            >
              + New project
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
