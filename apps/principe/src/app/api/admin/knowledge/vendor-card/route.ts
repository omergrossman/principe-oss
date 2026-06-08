import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { fireAndForgetDistill } from "@/lib/sources/distill";

// Sprint 4 — vendor card upload. Admin-only. Stores structured vendor
// metadata as a KnowledgeSource with kind=VENDOR_CARD. Idempotent per
// productName: posting the same productName twice returns 409 with the
// existing source id.
//
// The submitted text is concatenated into a markdown-ish blob and stored
// in `content` for the distiller to read; the distiller's vendor prompt
// then produces a structured vendor card via Anthropic.

interface VendorCardPayload {
  productName: string;
  category?: string;
  capabilities?: string[];
  pricingTier?: string;
  integrations?: string[];
  marketPosition?: string;
  primaryCritique?: string;
  alternativesToConsider?: string[];
}

function arr(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

function buildContent(p: VendorCardPayload): string {
  const lines: string[] = [`# ${p.productName}`];
  if (p.category) lines.push(`Category: ${p.category}`);
  if (p.pricingTier) lines.push(`Pricing tier: ${p.pricingTier}`);
  if (p.marketPosition) lines.push(`Market position: ${p.marketPosition}`);
  const caps = arr(p.capabilities);
  if (caps.length) {
    lines.push("Capabilities:");
    for (const c of caps) lines.push(`  - ${c}`);
  }
  const ints = arr(p.integrations);
  if (ints.length) {
    lines.push("Integrations:");
    for (const i of ints) lines.push(`  - ${i}`);
  }
  if (p.primaryCritique) lines.push(`Primary critique: ${p.primaryCritique}`);
  const alts = arr(p.alternativesToConsider);
  if (alts.length) {
    lines.push("Alternatives to consider:");
    for (const a of alts) lines.push(`  - ${a}`);
  }
  return lines.join("\n");
}

export async function POST(req: Request) {
  const session = await requireRole("PRINCIPE_ADMIN");
  const body = (await req.json().catch(() => ({}))) as Partial<VendorCardPayload>;
  const productName =
    typeof body.productName === "string" ? body.productName.trim() : "";
  if (!productName) {
    return NextResponse.json(
      { error: "productName is required." },
      { status: 400 },
    );
  }

  // Duplicate detection by title within this firm.
  const existing = await prisma.knowledgeSource.findFirst({
    where: {
      firmId: session.firmId,
      kind: "VENDOR_CARD",
      title: productName,
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: "Vendor card with this productName already exists.",
        existingId: existing.id,
      },
      { status: 409 },
    );
  }

  const content = buildContent({
    productName,
    category: typeof body.category === "string" ? body.category.trim() : undefined,
    capabilities: arr(body.capabilities),
    pricingTier:
      typeof body.pricingTier === "string" ? body.pricingTier.trim() : undefined,
    integrations: arr(body.integrations),
    marketPosition:
      typeof body.marketPosition === "string"
        ? body.marketPosition.trim()
        : undefined,
    primaryCritique:
      typeof body.primaryCritique === "string"
        ? body.primaryCritique.trim()
        : undefined,
    alternativesToConsider: arr(body.alternativesToConsider),
  });

  const source = await prisma.knowledgeSource.create({
    data: {
      firmId: session.firmId,
      kind: "VENDOR_CARD",
      url: null,
      title: productName,
      category: "vendor",
      region: "global",
      isCurated: false,
      enabled: true,
      content,
      lastFetchedAt: new Date(),
      fetchEnabled: false,
      // Tag fields stay undefined for vendor cards — vendor category
      // drives applicability via integrations + market position in the
      // distilled card; explicit industry/framework tagging is left to
      // admin overrides via a separate Sprint 5 surface if needed.
    } satisfies Prisma.KnowledgeSourceUncheckedCreateInput,
    select: { id: true, title: true },
  });

  fireAndForgetDistill(source.id);
  return NextResponse.json({ source });
}
