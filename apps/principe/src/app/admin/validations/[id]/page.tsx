// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { StatusPill } from "@/components/ui/StatusPill";

export const dynamic = "force-dynamic";

// Sprint 2 — Statistician trace viewer. Spec said /admin/cycles/[cycleId]/
// statistician, but pre-run validations attach to Hypothesis (Cycle is
// reshaped in Sprint 3), so the live route key is the validation id.

export default async function ValidationTracePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("PRINCIPE_ADMIN");
  const { id } = await params;

  const validation = await prisma.hypothesisValidation.findUnique({
    where: { id },
    include: {
      hypothesis: {
        select: {
          id: true,
          content: true,
          mode: true,
          createdById: true,
          projectId: true,
          createdAt: true,
        },
      },
    },
  });
  if (!validation) notFound();

  const reasoning = validation.reasoning as {
    reasoningTrace?: string;
    perStratumRepresentation?: Array<{
      stratum: string;
      observedCount: number;
      floor: number;
      meetsFloor: boolean;
    }>;
    panelComposition?: {
      personaCount: number;
      regions: string[];
      industries: string[];
    };
  } | null;

  return (
    <>
      <AppTopBar />
      <main className="max-w-4xl mx-auto px-8 py-10">
        <nav className="flex items-center gap-2 text-[13px] text-ink-300 mb-3 font-mono">
          <Link href="/admin" className="hover:text-ink-700">admin</Link>
          <span>›</span>
          <Link href="/admin/validations" className="hover:text-ink-700">validations</Link>
          <span>›</span>
          <span className="text-ink-700">{validation.id.slice(-8)}</span>
        </nav>

        <header className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Pill tone="default">Statistician trace</Pill>
            {validation.stubMode && (
              <Pill tone="accent">stub mode (Sprint 2)</Pill>
            )}
            <StatusPill
              variant={
                validation.kind === "PASS"
                  ? "pass"
                  : validation.kind === "WARN"
                    ? "warn"
                    : "fail"
              }
              size="sm"
            >
              {validation.kind}
            </StatusPill>
          </div>
          <h1 className="text-[32px] font-bold text-ink-900 tracking-tight">
            Validation {validation.id.slice(-8)}
          </h1>
          <p className="text-ink-500 mt-2 text-[13px]">
            Run {validation.createdAt.toISOString()} ·{" "}
            confidence {validation.confidenceScore}/100
            {validation.recommendedN !== null && (
              <> · recommended N = {validation.recommendedN}</>
            )}
          </p>
        </header>

        <Card>
          <h2 className="text-[14px] font-semibold text-ink-900 mb-3">Headline metrics</h2>
          <div className="space-y-1.5 font-mono text-[12px]">
            <MetricRow
              label="Verdict"
              value={validation.kind}
            />
            <MetricRow
              label="Confidence"
              value={`${validation.confidenceScore}/100`}
            />
            <MetricRow
              label="KL divergence"
              value={validation.klDivergence?.toFixed(3) ?? "—"}
            />
            <MetricRow
              label="BCI 95%"
              value={
                validation.bciLow !== null && validation.bciHigh !== null
                  ? `[${validation.bciLow.toFixed(2)}, ${validation.bciHigh.toFixed(2)}]`
                  : "—"
              }
            />
            <MetricRow
              label="Recommended N"
              value={validation.recommendedN?.toString() ?? "—"}
            />
            <MetricRow
              label="Force-overridden"
              value={validation.forceOverridden ? "yes" : "no"}
            />
          </div>
        </Card>

        <div className="mt-6">
          <Card>
            <h2 className="text-[14px] font-semibold text-ink-900 mb-3">Reasoning trace</h2>
            <p className="text-[13px] text-ink-700 leading-relaxed whitespace-pre-wrap">
              {reasoning?.reasoningTrace ?? "(no trace text)"}
            </p>
          </Card>
        </div>

        {reasoning?.perStratumRepresentation && reasoning.perStratumRepresentation.length > 0 && (
          <div className="mt-6">
            <Card>
              <h2 className="text-[14px] font-semibold text-ink-900 mb-3">
                Per-stratum representation
              </h2>
              <table className="w-full text-[12px] font-mono">
                <thead>
                  <tr className="text-ink-300 border-b border-ink-100">
                    <th className="text-left py-1 pr-4">Stratum</th>
                    <th className="text-right py-1 pr-4">Observed</th>
                    <th className="text-right py-1 pr-4">Floor</th>
                    <th className="text-right py-1">Meets floor</th>
                  </tr>
                </thead>
                <tbody>
                  {reasoning.perStratumRepresentation.map((s) => (
                    <tr key={s.stratum} className="border-b border-ink-100/50">
                      <td className="py-1 pr-4 text-ink-700">{s.stratum}</td>
                      <td className="py-1 pr-4 text-right text-ink-700">{s.observedCount}</td>
                      <td className="py-1 pr-4 text-right text-ink-500">{s.floor}</td>
                      <td className="py-1 text-right">
                        {s.meetsFloor ? (
                          <span className="text-verdict-pass">yes</span>
                        ) : (
                          <span className="text-verdict-fail">no</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {reasoning?.panelComposition && (
          <div className="mt-6">
            <Card>
              <h2 className="text-[14px] font-semibold text-ink-900 mb-3">
                Panel composition at run time
              </h2>
              <div className="space-y-1.5 font-mono text-[12px]">
                <MetricRow
                  label="Persona count"
                  value={reasoning.panelComposition.personaCount.toString()}
                />
                <MetricRow
                  label="Regions"
                  value={reasoning.panelComposition.regions.join(", ") || "—"}
                />
                <MetricRow
                  label="Industries"
                  value={reasoning.panelComposition.industries.join(", ") || "—"}
                />
              </div>
            </Card>
          </div>
        )}

        <p className="text-[12px] text-ink-300 mt-6 font-mono">
          Linked hypothesis: {validation.hypothesis.id.slice(-8)} · mode{" "}
          {validation.hypothesis.mode}
        </p>
      </main>
    </>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-300">{label}</span>
      <span className="text-ink-700">{value}</span>
    </div>
  );
}
