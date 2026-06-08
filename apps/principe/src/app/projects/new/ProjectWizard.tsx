"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PRESETS } from "@/lib/projects/presets";
import {
  DEFAULT_COMPOSITION,
  REGION_KEYS,
  SIZE_BANDS,
  STANCE_KEYS,
  type PanelComposition,
  type RegionKey,
  type SizeBand,
  type StanceKey,
} from "@/lib/projects/composition";

// The 24 industries — sourced from lib/personas/generate100.ts.
const ALL_INDUSTRIES = [
  "Banks",
  "Insurance",
  "Financial Services",
  "Fintech & Payments",
  "B2B SaaS",
  "Consumer Internet & E-commerce",
  "Tech Hardware & Devices",
  "Semiconductors",
  "Healthcare Providers",
  "Pharmaceuticals & Biotech",
  "Medical Devices & Health-tech",
  "Telecommunications",
  "Media & Entertainment",
  "Manufacturing",
  "Aerospace & Defense",
  "Transportation & Logistics",
  "Automotive",
  "Energy (Oil, Gas, Renewables)",
  "Utilities (Power & Water)",
  "Materials & Chemicals",
  "Retail & Consumer Goods",
  "Hospitality & Travel",
  "Real Estate & Construction",
  "Government, Public Sector & Education",
];

// Stance distribution from a chosen median + decay rule:
// selected = 0.50, adjacent (±1 on the 4-stop track) = 0.20, opposite = 0.10.
function distributionFromMedian(median: StanceKey): Record<StanceKey, number> {
  const order = STANCE_KEYS;
  const idx = order.indexOf(median);
  const weights: Record<StanceKey, number> = {
    cautious: 0,
    balanced: 0,
    aggressive: 0,
    contrarian: 0,
  };
  order.forEach((k, i) => {
    const d = Math.abs(i - idx);
    weights[k] = d === 0 ? 0.5 : d === 1 ? 0.2 : 0.1;
  });
  // Normalize (sum should already be ~1).
  const sum = order.reduce((a, k) => a + weights[k], 0);
  for (const k of order) weights[k] = weights[k] / sum;
  return weights;
}

function medianFromDistribution(d: Record<StanceKey, number>): StanceKey {
  let best: StanceKey = "balanced";
  let bestVal = -1;
  for (const k of STANCE_KEYS) {
    if ((d[k] ?? 0) > bestVal) {
      bestVal = d[k];
      best = k;
    }
  }
  return best;
}

interface FormState {
  name: string;
  presetKey: string | null;
  regions: Record<RegionKey, boolean>;
  industries: Record<string, boolean>;
  medianStance: StanceKey;
  sizeMin: SizeBand;
  sizeMax: SizeBand;
  // Sprint 7 — variable panel size + inline source upload.
  panelSize: number;
  // Attached sources — grown via explicit Add buttons inside SourcesCard.
  // Each entry is either a URL string or a File object; both get POSTed
  // to /api/projects/{id}/sources(/upload) on submit.
  attachedSources: AttachedSource[];
}

export type AttachedSource =
  | { kind: "url"; value: string }
  | { kind: "file"; file: File };

function defaultFormState(): FormState {
  return {
    name: "",
    presetKey: "global-default",
    regions: REGION_KEYS.reduce(
      (a, k) => {
        a[k] = true;
        return a;
      },
      {} as Record<RegionKey, boolean>,
    ),
    industries: ALL_INDUSTRIES.reduce(
      (a, k) => {
        a[k] = true;
        return a;
      },
      {} as Record<string, boolean>,
    ),
    medianStance: "balanced",
    sizeMin: SIZE_BANDS[0],
    sizeMax: SIZE_BANDS[4],
    panelSize: 100,
    attachedSources: [],
  };
}

function applyPreset(state: FormState, presetKey: string): FormState {
  const preset = PRESETS.find((p) => p.key === presetKey);
  if (!preset) return state;
  const c = preset.composition;
  const regions = REGION_KEYS.reduce(
    (a, k) => {
      a[k] = (c.regionWeights[k] ?? 0) > 0;
      return a;
    },
    {} as Record<RegionKey, boolean>,
  );
  const industries = ALL_INDUSTRIES.reduce(
    (a, k) => {
      a[k] = c.industries.length === 0 || c.industries.includes(k);
      return a;
    },
    {} as Record<string, boolean>,
  );
  return {
    ...state,
    presetKey,
    regions,
    industries,
    medianStance: medianFromDistribution(c.stanceWeights),
    sizeMin: c.sizeMin,
    sizeMax: c.sizeMax,
  };
}

function buildComposition(state: FormState): PanelComposition {
  const selectedRegions = REGION_KEYS.filter((k) => state.regions[k]);
  const regionWeights: Partial<Record<RegionKey, number>> = {};
  if (selectedRegions.length > 0) {
    const per = Math.floor(100 / selectedRegions.length);
    const remainder = 100 - per * selectedRegions.length;
    selectedRegions.forEach((k, i) => {
      regionWeights[k] = per + (i < remainder ? 1 : 0);
    });
  }
  const industries = ALL_INDUSTRIES.filter((k) => state.industries[k]);
  const stanceWeights = distributionFromMedian(state.medianStance);

  return {
    regionWeights,
    industries: industries.length === ALL_INDUSTRIES.length ? [] : industries,
    stanceWeights,
    sizeMin: state.sizeMin,
    sizeMax: state.sizeMax,
    presetKey: state.presetKey,
  };
}

export function ProjectWizard() {
  const router = useRouter();
  const [state, setState] = useState<FormState>(defaultFormState());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const composition = useMemo(() => buildComposition(state), [state]);

  const stanceDistribution = composition.stanceWeights;
  const regionsCount = REGION_KEYS.filter((k) => state.regions[k]).length;
  const industriesCount = ALL_INDUSTRIES.filter((k) => state.industries[k]).length;
  const isCustom = state.presetKey === null || state.presetKey === "custom";

  function pickPreset(key: string) {
    if (key === "custom") {
      setState((s) => ({ ...s, presetKey: "custom" }));
    } else {
      setState((s) => applyPreset(s, key));
    }
  }

  function toggleRegion(k: RegionKey) {
    setState((s) => ({
      ...s,
      presetKey: "custom",
      regions: { ...s.regions, [k]: !s.regions[k] },
    }));
  }

  function toggleIndustry(k: string) {
    setState((s) => ({
      ...s,
      presetKey: "custom",
      industries: { ...s.industries, [k]: !s.industries[k] },
    }));
  }

  function setMedianStance(k: StanceKey) {
    setState((s) => ({ ...s, presetKey: "custom", medianStance: k }));
  }

  function setSizeRange(min: SizeBand, max: SizeBand) {
    const minIdx = SIZE_BANDS.indexOf(min);
    const maxIdx = SIZE_BANDS.indexOf(max);
    const lo = SIZE_BANDS[Math.min(minIdx, maxIdx)];
    const hi = SIZE_BANDS[Math.max(minIdx, maxIdx)];
    setState((s) => ({ ...s, presetKey: "custom", sizeMin: lo, sizeMax: hi }));
  }

  async function handleCreate() {
    setError("");
    if (state.name.trim().length < 2) {
      setError("Give your project a name (2-80 characters).");
      return;
    }
    if (regionsCount === 0) {
      setError("Pick at least one region.");
      return;
    }
    if (industriesCount === 0) {
      setError("Pick at least one industry.");
      return;
    }
    setSubmitting(true);
    try {
      // 1. Create project (materialises agents at chosen panelSize)
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: state.name.trim(),
          composition,
          panelSize: state.panelSize,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create the project.");
        return;
      }
      const projectId = data.project.id;

      // 2. Sprint 7 — upload attached sources inline. Mixed URLs +
      // files; iteration order preserves the order the user added them.
      // Failures here are non-fatal — the project is created, the user
      // can add missing sources from /projects/[id]/sources later.
      for (const src of state.attachedSources) {
        try {
          if (src.kind === "url") {
            await fetch(`/api/projects/${projectId}/sources`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ url: src.value }),
            });
          } else {
            const form = new FormData();
            form.append("file", src.file);
            await fetch(`/api/projects/${projectId}/sources/upload`, {
              method: "POST",
              body: form,
            });
          }
        } catch {
          // swallow — user can retry from the sources page
        }
      }

      // 3. Switch to the new project so /workspace lands inside it.
      await fetch("/api/projects/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      router.push("/workspace");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <label className="block">
          <span className="text-[13px] font-semibold text-ink-700 mb-2 block">
            Project name
          </span>
          <input
            type="text"
            value={state.name}
            onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
            placeholder="e.g. EU Banking validation — Series A"
            maxLength={80}
            className="w-full h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20"
          />
        </label>
      </Card>

      <Card>
        <h2 className="text-[13px] font-semibold text-ink-700 mb-3">
          Pick a preset
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <PresetChip
              key={p.key}
              name={p.name}
              description={p.description}
              active={state.presetKey === p.key}
              onClick={() => pickPreset(p.key)}
            />
          ))}
          <PresetChip
            name="Custom"
            description="Pick regions, industries, stance, and company size yourself. Opens the dimension controls below."
            active={isCustom}
            onClick={() => pickPreset("custom")}
          />
        </div>
      </Card>

      {isCustom && (
        <>
          <Card>
            <h2 className="text-[13px] font-semibold text-ink-700 mb-3">
              Regions ({regionsCount} / 7)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {REGION_KEYS.map((k) => (
                <RegionToggle
                  key={k}
                  region={k}
                  active={state.regions[k]}
                  onToggle={() => toggleRegion(k)}
                />
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-[13px] font-semibold text-ink-700 mb-3">
              Industries ({industriesCount} / {ALL_INDUSTRIES.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
              {ALL_INDUSTRIES.map((k) => (
                <IndustryToggle
                  key={k}
                  industry={k}
                  active={state.industries[k]}
                  onToggle={() => toggleIndustry(k)}
                />
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-[13px] font-semibold text-ink-700 mb-1">
              Stance — median
            </h2>
            <p className="text-[12px] text-ink-500 mb-3">
              Pick the centre of mass. Distribution: median 50% · adjacent 20% each · opposite 10%.
            </p>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {STANCE_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMedianStance(k)}
                  className={`h-10 rounded-md text-[12px] font-medium transition-colors border ${
                    state.medianStance === k
                      ? "bg-ink-900 text-canvas border-ink-900"
                      : "bg-elevated text-ink-700 border-ink-100 hover:border-ink-300"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="flex gap-3 text-[11px] font-mono text-ink-500">
              {STANCE_KEYS.map((k) => (
                <span key={k} className="tabular-nums">
                  {k} {Math.round((stanceDistribution[k] ?? 0) * 100)}%
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-[13px] font-semibold text-ink-700 mb-3">
              Company size range
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide font-medium text-ink-500 mb-1 block">
                  Min
                </span>
                <select
                  value={state.sizeMin}
                  onChange={(e) =>
                    setSizeRange(e.target.value as SizeBand, state.sizeMax)
                  }
                  className="w-full h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[13px] text-ink-900"
                >
                  {SIZE_BANDS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide font-medium text-ink-500 mb-1 block">
                  Max
                </span>
                <select
                  value={state.sizeMax}
                  onChange={(e) =>
                    setSizeRange(state.sizeMin, e.target.value as SizeBand)
                  }
                  className="w-full h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[13px] text-ink-900"
                >
                  {SIZE_BANDS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>
        </>
      )}

      <PanelSizeCard
        value={state.panelSize}
        onChange={(n) =>
          setState((s) => ({ ...s, panelSize: Math.max(30, Math.min(200, n)) }))
        }
      />

      <SourcesCard
        attached={state.attachedSources}
        onAttachedChange={(items) =>
          setState((s) => ({ ...s, attachedSources: items }))
        }
      />

      <PreviewCard
        regionsCount={regionsCount}
        industriesCount={industriesCount}
        medianStance={state.medianStance}
        sizeMin={state.sizeMin}
        sizeMax={state.sizeMax}
        panelSize={state.panelSize}
        sourceCount={state.attachedSources.length}
      />

      {error && (
        <p
          role="alert"
          className="text-[13px] text-verdict-fail bg-verdict-fail/10 px-3 py-2 rounded-md"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button href="/projects" variant="text" size="md">
          Cancel
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={handleCreate}
          disabled={submitting || state.name.trim().length < 2}
        >
          {submitting ? `Materialising ${state.panelSize} agents…` : "Create project"}
        </Button>
      </div>
    </div>
  );
}

function PresetChip({
  name,
  description,
  active,
  onClick,
}: {
  name: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-md border transition-colors ${
        active
          ? "bg-flare-100/40 border-flare-600"
          : "bg-elevated border-ink-100 hover:border-ink-300"
      }`}
    >
      <p className="text-[14px] font-semibold text-ink-900 mb-1">{name}</p>
      <p className="text-[12px] text-ink-500 leading-snug">{description}</p>
    </button>
  );
}

const REGION_LABELS: Record<RegionKey, string> = {
  us: "US",
  "eu-west": "EU-West",
  uk: "UK",
  "eu-central": "EU-Central",
  apac: "APAC",
  anz: "ANZ",
  mea: "MEA",
};

function RegionToggle({
  region,
  active,
  onToggle,
}: {
  region: RegionKey;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`h-9 px-3 rounded-md text-[12px] font-medium transition-colors border flex items-center justify-between ${
        active
          ? "bg-flare-100/40 border-flare-600 text-ink-900"
          : "bg-elevated border-ink-100 text-ink-300 hover:border-ink-300"
      }`}
    >
      <span>{REGION_LABELS[region]}</span>
      {active && <span className="text-flare-600 font-bold text-[14px]">✓</span>}
    </button>
  );
}

function IndustryToggle({
  industry,
  active,
  onToggle,
}: {
  industry: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`h-8 px-2.5 rounded-md text-[11px] text-left font-medium transition-colors border truncate ${
        active
          ? "bg-flare-100/40 border-flare-600 text-ink-900"
          : "bg-elevated border-ink-100 text-ink-300 hover:border-ink-300"
      }`}
      title={industry}
    >
      {industry}
    </button>
  );
}

function PreviewCard({
  regionsCount,
  industriesCount,
  medianStance,
  sizeMin,
  sizeMax,
  panelSize,
  sourceCount,
}: {
  regionsCount: number;
  industriesCount: number;
  medianStance: StanceKey;
  sizeMin: SizeBand;
  sizeMax: SizeBand;
  panelSize: number;
  sourceCount: number;
}) {
  return (
    <div className="rounded-md border border-ink-100 bg-flare-100/20 p-4">
      <p className="text-[12px] uppercase tracking-wide font-semibold text-ink-500 mb-2">
        Preview
      </p>
      <p className="text-[14px] text-ink-900 leading-relaxed">
        Your panel will be <strong>{panelSize} agents</strong> across{" "}
        <strong>{regionsCount} regions</strong>,{" "}
        <strong>{industriesCount} industries</strong>, median stance{" "}
        <strong>{medianStance}</strong>, company size{" "}
        <strong className="font-mono text-[12px]">
          {sizeMin === sizeMax ? sizeMin : `${sizeMin} → ${sizeMax}`}
        </strong>
        .{sourceCount > 0 && (
          <>
            {" "}
            <strong>{sourceCount} source{sourceCount === 1 ? "" : "s"}</strong>{" "}
            will attach to the project on create.
          </>
        )}
      </p>
    </div>
  );
}

function PanelSizeCard({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Card>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-[13px] font-semibold text-ink-700">
          Panel size
        </h2>
        <span className="text-[14px] font-mono font-semibold text-ink-900 tabular-nums">
          {value} agents
        </span>
      </div>
      <p className="text-[12px] text-ink-500 mb-3 leading-relaxed">
        How many synthetic CISOs make up your panel. Fixed at create time —
        choose wisely. <strong>30</strong> minimum, <strong>200</strong>{" "}
        maximum. Most users stay at <strong>100</strong>. Higher
        ≈ tighter credible intervals, lower ≈ faster + cheaper.
      </p>
      <input
        type="range"
        min={30}
        max={200}
        step={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-flare-600 h-1.5"
      />
      <div className="flex justify-between mt-2 text-[10px] text-ink-300 font-mono">
        <PanelSizeLabel label="30" sub="quick" />
        <PanelSizeLabel label="100" sub="default" />
        <PanelSizeLabel label="150" sub="high confidence" />
        <PanelSizeLabel label="200" sub="max" />
      </div>
    </Card>
  );
}

function PanelSizeLabel({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-ink-500 tabular-nums">{label}</span>
      <span className="text-ink-300 mt-0.5">{sub}</span>
    </div>
  );
}

function SourcesCard({
  attached,
  onAttachedChange,
}: {
  attached: AttachedSource[];
  onAttachedChange: (items: AttachedSource[]) => void;
}) {
  const [urlStaging, setUrlStaging] = useState("");
  const [fileStaging, setFileStaging] = useState<File[]>([]);
  const [ack, setAck] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function flashAck(message: string) {
    setAck(message);
    setTimeout(() => setAck(null), 3000);
  }

  function addUrls() {
    const urls = urlStaging
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    if (urls.length === 0) return;
    const newItems: AttachedSource[] = urls.map((value) => ({ kind: "url", value }));
    onAttachedChange([...attached, ...newItems]);
    setUrlStaging("");
    flashAck(
      urls.length === 1 ? `✓ Added 1 URL` : `✓ Added ${urls.length} URLs`,
    );
  }

  function addFiles() {
    if (fileStaging.length === 0) return;
    const newItems: AttachedSource[] = fileStaging.map((file) => ({ kind: "file", file }));
    onAttachedChange([...attached, ...newItems]);
    setFileStaging([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    flashAck(
      fileStaging.length === 1
        ? `✓ Added 1 file`
        : `✓ Added ${fileStaging.length} files`,
    );
  }

  function removeAttached(index: number) {
    const next = attached.slice();
    next.splice(index, 1);
    onAttachedChange(next);
  }

  return (
    <Card>
      <h2 className="text-[13px] font-semibold text-ink-700 mb-1">
        Sources <span className="text-ink-300 font-normal">— optional</span>
      </h2>
      <p className="text-[12px] text-ink-500 mb-3 leading-relaxed">
        Attach the founder&apos;s deck, threat reports, or any URLs the panel
        should treat as authoritative about this project. Add URLs and files
        in batches — they accumulate below and attach when you create the
        project. You can also add more later from the project&apos;s sources page.
      </p>

      {/* URL staging */}
      <div className="mb-4">
        <span className="text-[11px] uppercase tracking-wide font-medium text-ink-500 mb-1 block">
          Add URLs
        </span>
        <textarea
          value={urlStaging}
          onChange={(e) => setUrlStaging(e.target.value)}
          placeholder="One URL per line — https://docs.foo.com/whitepaper.pdf"
          rows={2}
          className="w-full px-3 py-2 rounded-md border border-ink-100 bg-elevated text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20 font-mono"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={addUrls}
          disabled={urlStaging.trim().length === 0}
          className="mt-2"
        >
          Add URL{urlStaging.split("\n").filter((u) => u.trim().length > 0).length === 1 ? "" : "s"}
        </Button>
      </div>

      {/* File staging */}
      <div className="mb-3">
        <span className="text-[11px] uppercase tracking-wide font-medium text-ink-500 mb-1 block">
          Add files
        </span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.json,.csv,.html"
          onChange={(e) => setFileStaging(Array.from(e.target.files ?? []))}
          className="w-full text-[12px] text-ink-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-ink-100 file:bg-elevated file:text-[12px] file:font-medium file:text-ink-700 hover:file:bg-flare-100/40"
        />
        {fileStaging.length > 0 && (
          <>
            <div className="mt-2 space-y-0.5 text-[11px] font-mono text-ink-500">
              {fileStaging.map((f, i) => (
                <p key={i} className="truncate">
                  — {f.name} ({Math.round(f.size / 1024)}KB)
                </p>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={addFiles} className="mt-2">
              Add file{fileStaging.length === 1 ? "" : "s"}
            </Button>
          </>
        )}
      </div>

      {/* Inline acknowledgment */}
      {ack && (
        <p
          role="status"
          className="text-[12px] text-verdict-pass bg-verdict-pass/10 border border-verdict-pass/30 rounded-md px-3 py-2 mb-3 transition-opacity"
        >
          {ack}
        </p>
      )}

      {/* Attached list */}
      {attached.length > 0 && (
        <div className="border-t border-ink-100 pt-3">
          <p className="text-[11px] uppercase tracking-wide font-medium text-ink-500 mb-2">
            Attached to this project ({attached.length})
          </p>
          <ul className="space-y-1.5">
            {attached.map((s, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 text-[12px] font-mono text-ink-700 bg-elevated px-3 py-1.5 rounded-md border border-ink-100"
              >
                <span className="truncate flex-1" title={s.kind === "url" ? s.value : s.file.name}>
                  <span className="text-ink-300 mr-2">
                    {s.kind === "url" ? "URL" : "FILE"}
                  </span>
                  {s.kind === "url" ? s.value : s.file.name}
                  {s.kind === "file" && (
                    <span className="text-ink-300 ml-2">
                      ({Math.round(s.file.size / 1024)}KB)
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttached(i)}
                  className="text-[11px] text-ink-300 hover:text-verdict-fail shrink-0"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
