// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Principe local dev seed
 *
 * Run with: pnpm prisma db seed
 *
 * Creates:
 *  - 1 Firm (Sentinel Ventures)
 *  - 2 Portcos under it (Sentinel Labs, Watchtower)
 *  - 1 founder user per portco + 1 VC admin user
 *  - 1 active CISOPanel (ciso-v1.2) with 8 PersonaDefinitions covering all 6 regions
 *  - 1 sample completed cycle on Sentinel Labs (matches the mock-cycle.ts data)
 *  - 4 calibration datasets ingested from calibration/datasets/*.json
 *
 * Re-runnable: upserts by stable keys. Wiping the DB between runs is optional.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set; cannot seed.");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
const CALIBRATION_DIR = join(__dirname, "..", "..", "..", "calibration", "datasets");

async function main() {
  console.log("→ seeding identity + tenancy");

  const firm = await prisma.firm.upsert({
    where: { slug: "sentinel-ventures" },
    update: {},
    create: {
      name: "Sentinel Ventures",
      slug: "sentinel-ventures",
      region: "us",
    },
  });

  const sentinelLabs = await prisma.portco.upsert({
    where: { firmId_slug: { firmId: firm.id, slug: "sentinel-labs" } },
    update: {},
    create: { firmId: firm.id, name: "Sentinel Labs", slug: "sentinel-labs" },
  });

  const watchtower = await prisma.portco.upsert({
    where: { firmId_slug: { firmId: firm.id, slug: "watchtower" } },
    update: {},
    create: { firmId: firm.id, name: "Watchtower", slug: "watchtower" },
  });

  const vcAdmin = await prisma.user.upsert({
    where: { email: "partner@sentinel-ventures.test" },
    update: {},
    create: { email: "partner@sentinel-ventures.test", name: "David VC" },
  });

  const labsFounder = await prisma.user.upsert({
    where: { email: "sarah@sentinel-labs.test" },
    update: {},
    create: { email: "sarah@sentinel-labs.test", name: "Sarah Founder" },
  });

  const towerFounder = await prisma.user.upsert({
    where: { email: "mike@watchtower.test" },
    update: {},
    create: { email: "mike@watchtower.test", name: "Mike Founder" },
  });

  await prisma.membership.upsert({
    where: { userId_firmId_portcoId: { userId: vcAdmin.id, firmId: firm.id, portcoId: null as unknown as string } },
    update: {},
    create: { userId: vcAdmin.id, firmId: firm.id, role: "VC_ADMIN" },
  }).catch(() => null); // unique constraint with nulls behaves oddly; best-effort

  await prisma.membership.upsert({
    where: { userId_firmId_portcoId: { userId: labsFounder.id, firmId: null as unknown as string, portcoId: sentinelLabs.id } },
    update: {},
    create: { userId: labsFounder.id, portcoId: sentinelLabs.id, role: "PORTCO_FOUNDER" },
  }).catch(() => null);

  await prisma.membership.upsert({
    where: { userId_firmId_portcoId: { userId: towerFounder.id, firmId: null as unknown as string, portcoId: watchtower.id } },
    update: {},
    create: { userId: towerFounder.id, portcoId: watchtower.id, role: "PORTCO_FOUNDER" },
  }).catch(() => null);

  console.log("→ seeding CISO panel + personas");

  const panel = await prisma.cISOPanel.upsert({
    where: { version: "ciso-v1.2" },
    update: { isActive: true },
    create: {
      version: "ciso-v1.2",
      isActive: true,
      populationFrame:
        "Global CISOs at orgs 100+ employees with a defined security function, across all industries.",
      defaultPanelSize: 30,
      maxPanelSize: 50,
      diversitySpec: {
        dimensions: {
          region: { strata: ["us", "eu-west", "eu-central", "uk", "apac", "anz"], minPerStratum: 1, usMinimum: 2 },
          industry: { strata: ["fintech", "healthcare", "retail", "manufacturing", "saas-tech", "govt-defense", "other"], minPerStratum: 2 },
          companySize: { strata: ["startup", "smb", "mid", "enterprise"], minPerStratum: 2 },
          tenure: { strata: ["<2yr", "2-5yr", "5-10yr", "10+yr"], minPerStratum: 1 },
          background: { strata: ["technical", "business", "govt", "academic"], minPerStratum: 1 },
          reportingLine: { strata: ["cio", "ceo", "board"], minPerStratum: 1 },
          compliance: { strata: ["soc2", "iso27001", "hipaa", "pci-dss", "fedramp", "gdpr-heavy", "multi"], minPerStratum: 1 },
        },
      },
    },
  });

  const personas: Array<Omit<Prisma.PersonaDefinitionCreateInput, "panel">> = [
    {
      key: "sarah-chen",
      name: "Sarah Chen",
      region: "us",
      industry: "Fintech",
      companySize: "700 (Series C)",
      tenure: "18 months",
      background: "Big-4 advisory → CISO",
      reportsTo: "CTO",
      budget: "$2.4M/yr",
      markdown:
        "Mid-market fintech CISO. Cost-conscious, compliance-driven. Fast to evaluate, slow to commit. Hates vendor BS. Treats tools as force multipliers.",
    },
    {
      key: "mike-reyes",
      name: "Mike Reyes",
      region: "us",
      industry: "Retail",
      companySize: "50,000 (F500)",
      tenure: "6 years",
      background: "Internal promotion from infosec director",
      reportsTo: "CIO",
      budget: "$40M+/yr",
      markdown:
        "Enterprise retail CISO. Vendor-fatigued, peer-influence driven. Will only meet vendors via warm intro from a CISO peer. Buys carefully, deploys slowly.",
    },
    {
      key: "aisha-kapoor",
      name: "Aisha Kapoor",
      region: "us",
      industry: "Multiple (vCISO)",
      companySize: "5 portfolio clients",
      tenure: "4 years vCISO",
      background: "Former unicorn CISO",
      reportsTo: "Client CEOs",
      budget: "$50k–$200k/yr per client",
      markdown:
        "Fractional CISO across 5 startups. Speed-of-deployment focused, hates onboarding friction. Will trial fast if free; will champion across clients if it works.",
    },
    {
      key: "helena-voss",
      name: "Helena Voss",
      region: "eu-west",
      industry: "Banking",
      companySize: "3,200 (mid-market)",
      tenure: "5 years",
      background: "ENISA → CISO",
      reportsTo: "Risk Committee",
      budget: "€1.8M/yr",
      markdown:
        "EU banking CISO. GDPR + DSGVO drives every procurement gate. Privacy-by-design baseline. Demands data-residency stories before value props.",
    },
    {
      key: "kenji-tan",
      name: "Kenji Tan",
      region: "apac",
      industry: "E-commerce",
      companySize: "8,000 (APAC regional)",
      tenure: "2 years",
      background: "Pen-tester → red team lead → CISO",
      reportsTo: "Group CTO",
      budget: "S$1.4M/yr",
      markdown:
        "APAC e-commerce CISO. Concerned with regional threat actors and ASEAN regulator incident formats. Skeptical of US-generalized claims.",
    },
    {
      key: "james-okafor",
      name: "James Okafor",
      region: "uk",
      industry: "Health-tech",
      companySize: "1,400 (Series D)",
      tenure: "3 years",
      background: "NCSC → CISO",
      reportsTo: "CEO",
      budget: "£900k/yr",
      markdown:
        "UK health-tech CISO. Evaluates tools against NHS-DSPT and ISO 27001 sub-control evidence; not industry-averaged benchmarks.",
    },
    {
      key: "lukas-pawlik",
      name: "Lukas Pawlik",
      region: "eu-central",
      industry: "Manufacturing",
      companySize: "12,000 (enterprise)",
      tenure: "8 years",
      background: "Government infosec → enterprise CISO",
      reportsTo: "CIO",
      budget: "€6M/yr",
      markdown:
        "EU manufacturing CISO. OT/IT convergence is the actual problem. Distinguishes OT IR (different team, different SLA) from IT IR.",
    },
    {
      key: "aaron-walsh",
      name: "Aaron Walsh",
      region: "anz",
      industry: "EdTech",
      companySize: "600 (Series B)",
      tenure: "14 months",
      background: "AWS solutions architect → CISO",
      reportsTo: "CTO",
      budget: "A$1.1M/yr",
      markdown:
        "ANZ EdTech CISO. Cloud-native posture. Will trial today if integration with AWS GuardDuty is clean. Wants time-saved visible in the first week.",
    },
  ];

  for (const p of personas) {
    await prisma.personaDefinition.upsert({
      where: { panelId_key: { panelId: panel.id, key: p.key } },
      update: {},
      create: { ...p, panel: { connect: { id: panel.id } } },
    });
  }

  console.log("→ ingesting calibration datasets from", CALIBRATION_DIR);

  let datasetCount = 0;
  for (const file of readdirSync(CALIBRATION_DIR).filter((f) => f.endsWith(".json"))) {
    const raw = JSON.parse(readFileSync(join(CALIBRATION_DIR, file), "utf8"));
    await prisma.calibrationDataset.upsert({
      where: { datasetId: raw.dataset_id },
      update: {
        distributions: raw.distributions,
        sampleSize: raw.sample_size,
      },
      create: {
        datasetId: raw.dataset_id,
        name: raw.source.name,
        publisher: raw.source.publisher,
        year: raw.year,
        publicationDate: raw.source.publication_date ? new Date(raw.source.publication_date) : null,
        sampleSize: raw.sample_size,
        regionCoverage: raw.region_coverage,
        licenseStatus: raw.license_status,
        methodologyNotes: raw.methodology_notes,
        distributions: raw.distributions,
      },
    });
    datasetCount++;
  }
  console.log(`  ${datasetCount} datasets ingested`);

  console.log("→ seeding one sample completed cycle on Sentinel Labs");

  const hypothesis = await prisma.hypothesis.create({
    data: {
      portcoId: sentinelLabs.id,
      createdById: labsFounder.id,
      mode: "TEST",
      content: `# Hypothesis

## Claim
CISOs at mid-market fintech will pay $50k/year for a SOC automation tool
that reduces incident response time by 30%.

## Variants
- Same product at $25k/year (test price elasticity)
- Same price but framed as "incident dwell time" not "response time"
- Same product but positioned for compliance teams instead of SOC

## Target outcome
Decide whether to build at this price point, or pivot pricing/positioning.`,
      draftSavedAt: new Date(),
    },
  });

  const cycle = await prisma.cycle.create({
    data: {
      hypothesisId: hypothesis.id,
      panelVersion: "ciso-v1.2",
      createdById: labsFounder.id,
      status: "COMPLETE",
      totalPersonas: 30,
      llmCostUsd: "1.42" as unknown as Prisma.Decimal,
      durationSec: 268,
      completedAt: new Date(),
    },
  });

  await prisma.statisticianVerdict.create({
    data: {
      cycleId: cycle.id,
      kind: "PASS",
      confidenceScore: 72,
      klDivergence: 0.08,
      bciLow: 0.41,
      bciHigh: 0.53,
      reasoning: {
        diversityFloors: "all met",
        n: 30,
        recommendedN: 30,
        notes: "Statistician PASS — diversity floors met across all 7 dimensions; KL alignment strong against Panorays 2026 baseline.",
      },
    },
  });

  console.log("✓ seed complete");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
