// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { initialsFor } from "@/lib/user/display";

interface TopBarProps {
  /** Resolved display name (never an email). */
  displayName: string;
}

export function TopBar({ displayName }: TopBarProps) {
  const initials = initialsFor(displayName);
  return (
    <div className="sticky top-0 z-10 bg-canvas/90 backdrop-blur-sm border-b border-ink-100">
      <div className="max-w-6xl mx-auto px-8 h-16 flex items-center justify-between">
        <Link
          href="/workspace"
          aria-label="Back to workspace"
          className="flex items-center gap-2 rounded-md -mx-1 px-1 py-1 hover:bg-ink-100/40 transition-colors"
        >
          {/* Sprint 6 — "Diamond ring" eclipse icon (Option A from the
             redesign mockup). Dark moon disc + asymmetric corona burst at
             upper-right, evoking the moment the sun's limb peeks past the
             moon's edge. The burst doubles as the í accent above the i. */}
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10.5" stroke="#0A1430" strokeWidth="1.2" opacity="0.55" />
            <circle cx="12" cy="12" r="7.5" fill="#0A1430" />
            <circle cx="17.3" cy="6.7" r="3.6" fill="#E0671E" opacity="0.18" />
            <circle cx="17.3" cy="6.7" r="2.4" fill="#E0671E" />
          </svg>
          <span className="font-semibold text-ink-900 text-[15px]">Príncipe</span>
        </Link>
        <div className="flex items-center gap-3">
          <Button href="/projects" variant="text" size="sm">
            Projects
          </Button>
          <Button href="/settings" variant="text" size="sm">
            Settings
          </Button>
          <Button href="/about" variant="text" size="sm">
            About
          </Button>
          <form action="/api/auth/logout" method="POST">
            <Button type="submit" variant="text" size="sm">
              Sign out
            </Button>
          </form>
          <Link
            href="/profile"
            title={`${displayName} — edit profile`}
            aria-label={`Signed in as ${displayName} — go to profile`}
            className="w-8 h-8 rounded-full bg-ink-700 text-white flex items-center justify-center text-[12px] font-semibold hover:bg-ink-900 transition-colors"
          >
            {initials}
          </Link>
        </div>
      </div>
    </div>
  );
}
