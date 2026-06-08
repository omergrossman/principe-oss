// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { AppTopBar } from "@/components/app/AppTopBar";
import { AnthropicKeyForm } from "./AnthropicKeyForm";
import { UpdatesCard } from "./UpdatesCard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");

  const firm = await prisma.firm.findUnique({
    where: { id: session.firmId },
    select: {
      name: true,
      region: true,
      anthropicKeyLast4: true,
    },
  });

  return (
    <>
      <AppTopBar />
      <main className="max-w-3xl mx-auto px-8 py-10">
        <nav className="flex items-center gap-2 text-[13px] text-ink-300 mb-3 font-mono">
          <a href="/workspace" className="hover:text-ink-700">workspace</a>
          <span>›</span>
          <span className="text-ink-700">settings</span>
        </nav>
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Pill tone="accent">admin</Pill>
            <span className="text-[12px] text-ink-300 font-mono">
              {firm?.name} · region {firm?.region}
            </span>
          </div>
          <h1 className="text-[36px] font-bold text-ink-900 tracking-tight">
            Settings
          </h1>
          <p className="text-ink-500 mt-2">
            Organisation-level configuration. Keys are stored encrypted
            at rest.
          </p>
        </header>

        <Link href="/settings/members" className="block mb-6">
          <Card className="hover:border-flare-600/30 transition-colors">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold text-ink-900 mb-0.5">
                  Members
                </h2>
                <p className="text-[12px] text-ink-500">
                  Invite teammates, manage roles, and revoke pending invites.
                </p>
              </div>
              <span className="text-ink-300 font-mono text-[14px]">→</span>
            </div>
          </Card>
        </Link>

        <Card>
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-[18px] font-semibold text-ink-900 mb-1">
                Anthropic API key
              </h2>
              <p className="text-[13px] text-ink-500 leading-relaxed max-w-md">
                Powers the agentic CISO panel. Bring your own key — Principe
                never stores it in plaintext. Used to fan out 100 parallel
                agent calls per question.
              </p>
            </div>
            <KeyStatus last4={firm?.anthropicKeyLast4 ?? null} />
          </div>
          <AnthropicKeyForm
            connected={Boolean(firm?.anthropicKeyLast4)}
            last4={firm?.anthropicKeyLast4 ?? null}
          />
        </Card>

        <UpdatesCard />

        <MonthlyCostCard firmId={session.firmId} />
      </main>
    </>
  );
}

async function MonthlyCostCard({ firmId }: { firmId: string }) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await prisma.projectAsk.findMany({
    where: {
      project: { firmId },
      createdAt: { gte: start },
    },
    select: {
      costUsd: true,
      project: { select: { id: true, name: true, isDefault: true } },
    },
  });

  const byProject = new Map<
    string,
    { name: string; isDefault: boolean; total: number; count: number }
  >();
  let total = 0;
  for (const r of rows) {
    const cost = Number(r.costUsd);
    total += cost;
    const cur = byProject.get(r.project.id) ?? {
      name: r.project.name,
      isDefault: r.project.isDefault,
      total: 0,
      count: 0,
    };
    cur.total += cost;
    cur.count += 1;
    byProject.set(r.project.id, cur);
  }

  const breakdown = Array.from(byProject.entries()).sort(
    ([, a], [, b]) => b.total - a.total,
  );
  const monthLabel = now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <Card className="mt-6">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="text-[18px] font-semibold text-ink-900 mb-1">
            Spend this month
          </h2>
          <p className="text-[12px] text-ink-300 font-mono">{monthLabel}</p>
        </div>
        <p className="text-[30px] font-bold text-ink-900 leading-none tabular-nums">
          ${total.toFixed(2)}
        </p>
      </div>
      {breakdown.length === 0 ? (
        <p className="text-[13px] text-ink-300 italic">
          No asks this month yet.
        </p>
      ) : (
        <div className="space-y-2">
          {breakdown.map(([projectId, p]) => {
            const pct = total > 0 ? (p.total / total) * 100 : 0;
            return (
              <div
                key={projectId}
                className="flex items-center gap-3 text-[12px]"
              >
                <span className="text-ink-700 font-medium truncate w-44">
                  {p.name}
                  {p.isDefault && (
                    <span className="text-ink-300 ml-1 font-mono uppercase text-[10px]">
                      default
                    </span>
                  )}
                </span>
                <div className="flex-1 h-1 bg-ink-100/40 rounded-pill overflow-hidden">
                  <div
                    className="h-full bg-flare-600"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="font-mono text-ink-500 tabular-nums w-24 text-right">
                  ${p.total.toFixed(3)} · {p.count} ask{p.count === 1 ? "" : "s"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function KeyStatus({ last4 }: { last4: string | null }) {
  if (!last4) {
    return (
      <span className="inline-flex items-center h-6 px-2 rounded-pill text-[11px] font-medium border bg-ink-100/40 text-ink-500 border-ink-100">
        not connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center h-6 px-2 rounded-pill text-[11px] font-medium border bg-verdict-pass/12 text-verdict-pass border-verdict-pass/30 font-mono">
      connected · …{last4}
    </span>
  );
}
