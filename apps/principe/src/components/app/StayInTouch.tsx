// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * StayInTouch — a quiet, editorial "stay in touch" card.
 *
 * ZERO CALL-HOME. This component captures nothing and POSTs nothing. Every
 * action is a pure external `<a href>` (opens a new tab, `rel="noopener
 * noreferrer"`) or a `mailto:`. There is no `fetch`, no form submit, and no
 * email infrastructure here — that was deliberately stripped in Sprint 9 and
 * must stay out of the OSS distribution. The inbound update channel remains
 * the in-app News feed (`NewsBell`); this card does not duplicate it.
 *
 * SEAM FOR THE FUTURE HOSTED SaaS:
 * The `variant` prop is the single swap point. Today only "link-out" exists
 * (and is the default). When the hosted SaaS lands, add a "form" variant here
 * that renders an in-app capture form posting to a central endpoint — no other
 * call site needs to change. Do NOT build that variant, a feature flag, or any
 * form/POST machinery now; this is just the seam.
 */

const NEWSLETTER_URL = "https://www.principe.cloud/#newsletter";
const FEEDBACK_URL = "https://www.principe.cloud/#feedback";
const SUPPORT_MAILTO =
  "mailto:support@principe.cloud?subject=Pr%C3%ADncipe%20feedback";

/** Reuse of the TopBar diamond-ring eclipse mark — the brand's visual anchor. */
function EclipseMark({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10.5" stroke="#0A1430" strokeWidth="1.2" opacity="0.55" />
      <circle cx="12" cy="12" r="7.5" fill="#0A1430" />
      <circle cx="17.3" cy="6.7" r="3.6" fill="#E0671E" opacity="0.18" />
      <circle cx="17.3" cy="6.7" r="2.4" fill="#E0671E" />
    </svg>
  );
}

interface StayInTouchProps {
  /**
   * The only intended swap point. "link-out" is the OSS behaviour: pure
   * external links, nothing captured locally. A future "form" variant would
   * render the hosted SaaS's in-app capture — not built here.
   */
  variant?: "link-out";
  className?: string;
}

export function StayInTouch({ variant = "link-out", className = "" }: StayInTouchProps) {
  // Single-variant today. Kept explicit so the SaaS seam reads as intentional.
  void variant;

  return (
    <section
      className={`rounded-lg bg-elevated shadow-sm border border-ink-100/60 p-6 ${className}`}
      aria-labelledby="stay-in-touch-heading"
    >
      <div className="flex items-center gap-2 mb-2">
        <EclipseMark className="w-5 h-5" />
        <h2
          id="stay-in-touch-heading"
          className="text-[16px] font-semibold text-ink-900 tracking-tight"
        >
          Stay in touch
        </h2>
      </div>

      <p className="text-[13px] text-ink-500 leading-relaxed max-w-md mb-5">
        Príncipe keeps to itself — it captures nothing and never phones home.
        If you&apos;d like the occasional note on where the work is heading, or
        you&apos;ve found a rough edge, these open on the website. Nothing here
        sends anything from your install.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={NEWSLETTER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors h-10 px-4 text-[15px] no-underline bg-elevated text-ink-700 border border-ink-100 hover:border-ink-300 hover:bg-subtle"
        >
          Get monthly updates
        </a>
        <a
          href={FEEDBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors h-10 px-4 text-[15px] no-underline bg-flare-600 text-white shadow-sm hover:bg-flare-500"
        >
          Share an idea or report a bug
        </a>
      </div>

      <p className="text-[12px] text-ink-300 mt-4">
        Prefer email?{" "}
        <a
          href={SUPPORT_MAILTO}
          className="text-ink-500 underline underline-offset-2 hover:text-ink-700"
        >
          support@principe.cloud
        </a>
      </p>
    </section>
  );
}
