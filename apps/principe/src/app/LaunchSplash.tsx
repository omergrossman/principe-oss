"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Step =
  | { kind: "creating"; current: number }
  | { kind: "verifying" }
  | { kind: "refreshing-sources"; pending: number }
  | { kind: "ready"; anthropic: "ok" | "skipped" | "error"; anthropicError?: string }
  | { kind: "error"; message: string };

// Sprint 7 — the eclipse animation runs 3.8s (SVG buildup + cross-dissolve
// to the 1919 plate). The creating phase holds for COUNTER_DURATION_MS so
// the user sees the full animation plus a few seconds of the totality
// photo on its own before init starts winding down. Status text cycles
// through phase-appropriate messages across this whole window.
const COUNTER_DURATION_MS = 6500;
const VERIFYING_BEAT_MS = 800;
const READY_HOLD_MS = 1500;

export function LaunchSplash() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "creating", current: 0 });
  const [fading, setFading] = useState(false);
  const initResultRef = useRef<{
    destination: "/projects" | "/login" | "/setup";
    anthropic: "ok" | "skipped" | "error";
    anthropicError?: string;
  } | null>(null);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNTER_DURATION_MS);
      const value = Math.floor(t * 100);
      setStep((prev) =>
        prev.kind === "creating" ? { kind: "creating", current: value } : prev,
      );
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initOnce = async () => {
      const res = await fetch("/api/launch/init", { method: "POST" });
      if (!res.ok) throw new Error(`init ${res.status}`);
      const data = await res.json();
      initResultRef.current = {
        destination: data.destination,
        anthropic:
          data.anthropic.state === "ok"
            ? "ok"
            : data.anthropic.state === "error"
              ? "error"
              : "skipped",
        anthropicError: data.anthropic.error,
      };
      return data as {
        sources: { refreshing: boolean; pending: number };
        anthropic: { state: string };
      };
    };

    const minCounterPromise = new Promise<void>((res) =>
      setTimeout(res, COUNTER_DURATION_MS),
    );

    (async () => {
      try {
        const [first] = await Promise.all([initOnce(), minCounterPromise]);
        if (cancelled) return;

        setStep({ kind: "verifying" });
        await new Promise((r) => setTimeout(r, VERIFYING_BEAT_MS));
        if (cancelled) return;

        // If the sources are still being scraped (weekly refresh OR first-fill),
        // sit on the splash and poll the status until they're done.
        if (first.sources.refreshing) {
          await pollUntilRefreshComplete(
            (pending) => {
              if (!cancelled) setStep({ kind: "refreshing-sources", pending });
            },
            () => cancelled,
          );
          if (cancelled) return;
        }

        const init = initResultRef.current!;
        setStep({
          kind: "ready",
          anthropic: init.anthropic,
          anthropicError: init.anthropicError,
        });
        await new Promise((r) => setTimeout(r, READY_HOLD_MS));
        if (cancelled) return;

        setFading(true);
        await new Promise((r) => setTimeout(r, 320));
        if (cancelled) return;

        router.push(init.destination);
      } catch (e) {
        if (cancelled) return;
        setStep({
          kind: "error",
          message: e instanceof Error ? e.message : "Unknown error.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main
      className={`h-screen overflow-hidden flex flex-col items-center justify-center px-6 py-6 transition-opacity duration-300 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      style={{
        // Background fades from white to dark in sync with the SVG →
        // photo cross-dissolve (3.8s total).
        animation: "bg-fade-to-dark 3.8s ease-out forwards",
        backgroundColor: "#000000",
      }}
    >
      <style>{`
        @keyframes bg-fade-to-dark {
          0%   { background-color: #ffffff; }
          74%  { background-color: #f5e6d0; }
          100% { background-color: #000000; }
        }
      `}</style>
      <EclipsePhoto />
      <h1
        className="mt-5 font-bold text-canvas tracking-tight leading-none text-center"
        style={{
          letterSpacing: "-0.02em",
          fontSize: "clamp(48px, 8vh, 84px)",
        }}
      >
        Príncipe
      </h1>
      <p
        className="mt-2 text-canvas/60 font-mono tracking-wide text-center"
        style={{ fontSize: "clamp(11px, 1.5vh, 14px)" }}
      >
        prove what&apos;s coming before reality runs the experiment
      </p>

      <div className="mt-6 w-full max-w-md space-y-2">
        <StatusLine step={step} />
        <Progress step={step} />
      </div>
    </main>
  );
}

function EclipsePhoto() {
  // Sprint 7 — two-layer eclipse: SVG buildup → cross-dissolve to the
  // real 1919 photo at totality.
  //
  // Timeline (all forwards, no loop):
  //   0.0s  Page bg starts white. SVG eclipse visible: sun + corona
  //         rays glowing, moon offscreen-left, starting to enter.
  //   0.0-2.0s  Moon slides smoothly across, reaching the sun's center
  //         (totality) at t=2.0s.
  //   1.6-2.6s  Cross-dissolve: SVG fades out, 1919 photo fades in.
  //         Background simultaneously fades white → ink-900.
  //   2.6s+ Photo holds with the existing corona-breath pulse.
  //
  // The result feels like watching the eclipse approach totality, then
  // seeing the actual observation Eddington recorded in 1919.
  return (
    <div
      className="relative flex-shrink-0 aspect-square"
      style={{ height: "min(50vh, 520px)", width: "min(50vh, 520px)" }}
    >
      <style>{`
        @keyframes moon-transit {
          /* Smooth slide from offscreen left to totality position. The
             moon starts well outside the SVG viewBox (overflow: visible
             on the SVG ensures it glides in cleanly with no border
             effect). Settles aligned with the 1919 photo's disc at
             totality. Slower transit (2.8s ease-out) gives a deliberate
             approach to the morph. */
          0%   { transform: translateX(-480px); }
          100% { transform: translateX(0px); }
        }
        @keyframes corona-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes svg-fade-out {
          /* SVG holds until t=2.8s (after moon settles into totality),
             cross-dissolves to the photo by t=3.8s. */
          0%, 74%  { opacity: 1; }
          100%     { opacity: 0; }
        }
        @keyframes photo-fade-in {
          0%, 74%  { opacity: 0; }
          100%     { opacity: 1; }
        }
        @keyframes corona-breath {
          0%, 100% { opacity: 0.92; transform: scale(1); filter: brightness(1) drop-shadow(0 0 24px rgba(255, 232, 213, 0.18)); }
          50%      { opacity: 1.00; transform: scale(1.015); filter: brightness(1.06) drop-shadow(0 0 44px rgba(255, 232, 213, 0.32)); }
        }

        .eclipse-svg-layer {
          position: absolute;
          inset: 0;
          animation: svg-fade-out 3.8s ease-out forwards;
        }
        .eclipse-photo-layer {
          position: absolute;
          inset: 0;
          animation: photo-fade-in 3.8s ease-out forwards;
        }
        .eclipse-svg { width: 100%; height: 100%; overflow: visible; }
        .moon-orbit { animation: moon-transit 2.8s ease-out forwards; transform-origin: center; }
        .eclipse-rays { transform-origin: 176px 176px; animation: corona-spin 60s linear infinite; opacity: 0.55; }
        .eclipse-photo-img { animation: corona-breath 3.6s ease-in-out infinite; transform-origin: center; }
      `}</style>

      {/* Layer 1 — SVG eclipse with moon transit.
          Measured pixel-by-pixel from the 1919 plate (1280×763) by
          isolating the dark disc bounded by the bright corona on every
          row:
            - Source disc center: (594, 336), radius 146 px.
            - object-cover into the 520×520 container (scale 0.681,
              horizontal crop 176 px) lands the disc almost dead centre.
            - In our 400×400 SVG viewBox that's cx=176, cy=176, r=77.
          The corona, sun layers, moon, and ray transform-origin all use
          those exact coordinates so the cross-dissolve at totality reads
          as one continuous observation. */}
      <div className="eclipse-svg-layer">
        <svg viewBox="0 0 400 400" className="eclipse-svg" aria-hidden>
          <defs>
            <radialGradient id="sunGradient" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#FFF6E5" />
              <stop offset="65%" stopColor="#FFD49A" />
              <stop offset="100%" stopColor="#E0671E" stopOpacity="0.5" />
            </radialGradient>
            <radialGradient id="coronaGradient" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#FFE8D5" stopOpacity="0.85" />
              <stop offset="60%" stopColor="#FFB880" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#E0671E" stopOpacity="0" />
            </radialGradient>
            <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
            </filter>
          </defs>

          {/* Corona aura — matches the bright halo around the photo's disc */}
          <circle cx="176" cy="176" r="195" fill="url(#coronaGradient)" />

          {/* Corona rays radiating from the disc center */}
          <g className="eclipse-rays">
            {Array.from({ length: 24 }).map((_, i) => {
              const angle = (i * 360) / 24;
              const long = i % 3 === 0;
              return (
                <line
                  key={i}
                  x1="176"
                  y1="176"
                  x2="176"
                  y2={long ? "11" : "41"}
                  stroke="#FFE8D5"
                  strokeWidth={long ? 1.6 : 0.9}
                  strokeLinecap="round"
                  opacity={long ? 0.45 : 0.25}
                  transform={`rotate(${angle} 176 176)`}
                  filter="url(#softGlow)"
                />
              );
            })}
          </g>

          {/* Sun — sized to match the photo's disc (r=77 in the 400-unit viewBox).
              At totality the moon fully overlays it; before transit completes
              the user sees the bright disc with the corona spreading around. */}
          <circle cx="176" cy="176" r="80" fill="url(#sunGradient)" filter="url(#softGlow)" opacity="0.9" />
          <circle cx="176" cy="176" r="77" fill="#FFF6E5" />

          {/* Moon — starts offscreen-left, slides to overlay the sun.
              Same radius as the sun for an exact totality fit; the corona
              continues to glow around it just like the photo. */}
          <g className="moon-orbit">
            <circle cx="176" cy="176" r="77" fill="#0A1430" />
          </g>
        </svg>
      </div>

      {/* Layer 2 — 1919 plate fading in at totality */}
      <div className="eclipse-photo-layer">
        <img
          src="/eclipse-1919.jpg"
          alt="1919 Príncipe eclipse — Eddington's proof of general relativity"
          className="eclipse-photo-img w-full h-full object-cover"
          style={{
            objectPosition: "center center",
            maskImage:
              "radial-gradient(circle at center, #000 58%, rgba(0,0,0,0.85) 76%, transparent 96%)",
            WebkitMaskImage:
              "radial-gradient(circle at center, #000 58%, rgba(0,0,0,0.85) 76%, transparent 96%)",
          }}
        />
      </div>
    </div>
  );
}

function StatusLine({ step }: { step: Step }) {
  if (step.kind === "creating") {
    // Sprint 7 — drop the "X / 100" framing; panels are variable now.
    // The line cycles through launch-phase messages across the full
    // COUNTER_DURATION_MS window (currently ~6.5s), giving each message
    // ~1s of screen time. Independent of the eclipse animation itself.
    const messages = [
      "Launching workspace…",
      "Building agentic panel…",
      "Initialising knowledge sources…",
      "Calibrating Statistician…",
      "Aligning observatory…",
      "Verifying panel coverage…",
    ];
    const idx = Math.min(
      messages.length - 1,
      Math.floor((step.current / 100) * messages.length),
    );
    return (
      <p className="text-canvas/85 text-[15px] font-mono text-center">
        {messages[idx]}
      </p>
    );
  }
  if (step.kind === "verifying") {
    return (
      <p className="text-canvas/85 text-[15px] font-mono text-center">
        Verifying panel alignment…
      </p>
    );
  }
  if (step.kind === "refreshing-sources") {
    return (
      <p className="text-canvas/85 text-[15px] font-mono text-center">
        Refreshing intelligence sources… {step.pending > 0 ? `${step.pending} pending` : ""}
      </p>
    );
  }
  if (step.kind === "ready") {
    const tail =
      step.anthropic === "ok"
        ? " · AI configuration set"
        : step.anthropic === "error"
          ? " · AI configuration unreachable"
          : "";
    return (
      <p className="text-canvas/95 text-[15px] font-mono text-center">
        Panel ready{tail}
      </p>
    );
  }
  return (
    <p className="text-verdict-fail text-[14px] font-mono text-center">
      {step.message} — refresh to retry.
    </p>
  );
}

async function pollUntilRefreshComplete(
  onTick: (pending: number) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const POLL_MS = 1800;
  const MAX_MS = 75_000;
  const start = Date.now();
  while (!isCancelled() && Date.now() - start < MAX_MS) {
    try {
      const res = await fetch("/api/settings/sources/refresh-all", { method: "GET" });
      if (res.ok) {
        const data = (await res.json()) as { active: boolean; pending: number };
        if (!data.active) return;
        onTick(data.pending);
      }
    } catch {
      // ignore — retry next tick
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function Progress({ step }: { step: Step }) {
  const pct =
    step.kind === "creating"
      ? step.current
      : step.kind === "verifying"
        ? 100
        : step.kind === "ready"
          ? 100
          : 0;
  return (
    <div className="h-[2px] w-full bg-canvas/15 rounded-full overflow-hidden">
      <div
        className="h-full bg-flare-600 transition-all duration-200 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
