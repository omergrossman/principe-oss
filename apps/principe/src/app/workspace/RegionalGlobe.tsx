"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import type { PanelResponseRow } from "./AllResponses";

/**
 * Rectangular world map with sentiment pins per region.
 *
 * The base layer is /public/world-map.jpg (820×571, gold-on-white
 * world outline). A CSS filter chain desaturates the gold, drops the
 * white background, and tints the remaining contour to a light gray
 * so the data layer (sentiment pins + tooltip) reads on top of a
 * soft, recognisable map.
 *
 * Pins are positioned in % of the container so they scale responsively.
 */

const MAP_ASPECT = "820 / 571"; // matches the source image exactly

interface RegionGeom {
  key: string;
  label: string;
  // Position as % of the container (left, top).
  left: number;
  top: number;
}

const REGIONS: RegionGeom[] = [
  { key: "us", label: "United States", left: 22, top: 40 },
  { key: "uk", label: "United Kingdom", left: 47, top: 23 },
  { key: "eu-west", label: "EU West", left: 47, top: 38 },
  { key: "eu-central", label: "EU Central", left: 60, top: 35 },
  { key: "mea", label: "Middle East & Africa", left: 56, top: 55 },
  { key: "apac", label: "Asia-Pacific", left: 77, top: 42 },
  { key: "anz", label: "Australia & NZ", left: 85, top: 78 },
];

export function RegionalGlobe({
  responses,
}: {
  responses: PanelResponseRow[];
}) {
  const stats = new Map<string, { sum: number; n: number }>();
  for (const r of responses) {
    if (r.apiError) continue;
    const acc = stats.get(r.region) ?? { sum: 0, n: 0 };
    acc.sum += r.sentiment;
    acc.n += 1;
    stats.set(r.region, acc);
  }

  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <Card>
      <h3 className="text-[12px] uppercase tracking-wide font-semibold text-ink-500 mb-3">
        Regional sentiment
      </h3>
      <p className="text-[12px] text-ink-500 mb-3 leading-relaxed">
        Hover a region for details. Greens = positive, reds = negative,
        slate = no responses.
      </p>

      <div
        className="relative mx-auto"
        style={{ maxWidth: 560, aspectRatio: MAP_ASPECT }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Continent outline. Filter chain:
              - grayscale: strip the gold tone
              - brightness/contrast: push the existing lines toward a
                uniform mid-gray
              - mix-blend-mode multiply: drop the white background so
                the parchment shows through; only the lines remain
              - opacity: soften further so the data layer stands out
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/world-map.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
          style={{
            filter: "grayscale(1) brightness(1.05) contrast(0.85)",
            mixBlendMode: "multiply",
            opacity: 0.45,
          }}
        />

        {/* Sentiment pins */}
        {REGIONS.map((geom) => {
          const s = stats.get(geom.key);
          const mean = s && s.n > 0 ? s.sum / s.n : null;
          const fill = colorForSentiment(mean);
          const isHovered = hovered === geom.key;
          return (
            <button
              key={geom.key}
              type="button"
              onMouseEnter={() => setHovered(geom.key)}
              onFocus={() => setHovered(geom.key)}
              onBlur={() => setHovered(null)}
              aria-label={`${geom.label} sentiment ${mean === null ? "no responses" : mean.toFixed(1)}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center transition-all"
              style={{
                left: `${geom.left}%`,
                top: `${geom.top}%`,
                width: isHovered ? 56 : 48,
                height: isHovered ? 56 : 48,
                background: fill,
                opacity: mean === null ? 0.55 : isHovered ? 0.92 : 0.78,
                color: "white",
                border: "1.5px solid rgba(255,255,255,0.4)",
                boxShadow: isHovered
                  ? "0 0 0 4px rgba(255,255,255,0.18), 0 8px 24px rgba(10,20,48,0.25)"
                  : "0 2px 8px rgba(10,20,48,0.12)",
                fontFamily: "Inter, system-ui, sans-serif",
                fontSize: 14,
                fontWeight: 600,
                cursor: "default",
              }}
            >
              {mean === null ? "—" : mean.toFixed(1)}
            </button>
          );
        })}

        {hovered && (
          <RegionTooltip region={hovered} stats={stats.get(hovered)} />
        )}
      </div>

      <SentimentLegend />
    </Card>
  );
}

function RegionTooltip({
  region,
  stats,
}: {
  region: string;
  stats: { sum: number; n: number } | undefined;
}) {
  const mean = stats && stats.n > 0 ? stats.sum / stats.n : null;
  const fill = colorForSentiment(mean);
  const label = REGIONS.find((r) => r.key === region)?.label ?? region;
  const verbal = mean === null ? "no responses" : sentimentLabel(mean);

  return (
    <div
      role="status"
      className="absolute top-3 right-3 bg-elevated border border-ink-100 rounded-md px-3 py-2 shadow-sm pointer-events-none"
      style={{ minWidth: 160 }}
    >
      <p className="text-[11px] uppercase tracking-wide font-semibold text-ink-500 mb-0.5">
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <span
          className="text-[22px] font-bold tabular-nums leading-none"
          style={{ color: fill }}
        >
          {mean === null ? "—" : mean.toFixed(1)}
        </span>
        <span className="text-[11px] text-ink-300 font-mono">/ 10</span>
      </div>
      <p
        className="text-[11px] mt-1 capitalize font-medium"
        style={{ color: fill }}
      >
        {verbal} · n={stats?.n ?? 0}
      </p>
    </div>
  );
}

function SentimentLegend() {
  const stops = [{ value: 2.5 }, { value: 5 }, { value: 7 }, { value: 9 }];
  return (
    <div className="mt-3 flex items-center gap-2 text-[11px] font-mono text-ink-300 max-w-[560px] mx-auto">
      <span>1</span>
      <div className="flex h-1.5 flex-1 overflow-hidden rounded-pill">
        {stops.map((s) => (
          <div
            key={s.value}
            className="flex-1"
            style={{ background: colorForSentiment(s.value) }}
          />
        ))}
      </div>
      <span>10</span>
    </div>
  );
}

function colorForSentiment(mean: number | null): string {
  if (mean === null) return "#7B86A6"; // ink-300 — no data
  if (mean >= 8) return "#2E8B57"; // strong positive
  if (mean >= 6.5) return "#4FA678"; // positive
  if (mean >= 5) return "#C49A3F"; // lukewarm
  if (mean >= 3.5) return "#BF6B4B"; // negative
  return "#A8413F"; // strong negative
}

function sentimentLabel(mean: number): string {
  if (mean >= 8) return "strongly positive";
  if (mean >= 6.5) return "positive";
  if (mean >= 5) return "lukewarm";
  if (mean >= 3.5) return "negative";
  return "strongly negative";
}
