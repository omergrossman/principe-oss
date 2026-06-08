/**
 * Add a new tenant (org + first admin) to the local Principe instance.
 *
 * Usage:
 *   pnpm tsx scripts/add-tenant.ts \
 *     --org "Acme Capital" \
 *     --email founder@acme.com \
 *     --name "Jamie Chen" \
 *     [--region us]
 *
 * Idempotent: re-running with the same email + org reuses existing rows.
 * Use this for "give a design partner their own org" while you're not
 * paying the DP-master automation. Once you flip the meter, real signups
 * flow through DP master's Stripe checkout instead of this script.
 */

import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error(
    "DATABASE_URL not set. Run from apps/principe so .env.local resolves.",
  );
  process.exit(1);
}

// ─── arg parsing ─────────────────────────────────────────────────────

interface Args {
  org: string;
  email: string;
  name: string;
  region: string;
}

function parseArgs(): Args {
  const out: Partial<Args> = { region: "us" };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--org") out.org = v;
    else if (k === "--email") out.email = v;
    else if (k === "--name") out.name = v;
    else if (k === "--region") out.region = v;
    if (k.startsWith("--")) i += 1;
  }
  if (!out.org || !out.email || !out.name) {
    console.error(
      "Usage: pnpm tsx scripts/add-tenant.ts --org NAME --email EMAIL --name FULL_NAME [--region us]",
    );
    process.exit(2);
  }
  return out as Args;
}

// ─── helpers ─────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /[^a-z0-9]+/g;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(SLUG_RE, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "org"
  );
}

function randomTail(len = 4): string {
  return randomBytes(8).toString("hex").slice(0, len);
}

async function uniqueSlug(
  pg: Client,
  base: string,
  email: string,
): Promise<string> {
  // If an org with this slug already exists AND its admin email matches,
  // we treat it as the same tenant — return the existing slug so the
  // script is idempotent.
  for (let i = 0; i < 8; i++) {
    const candidate = i === 0 ? base : `${base}-${randomTail(4)}`;
    const existing = await pg.query<{ id: string }>(
      'SELECT id FROM "VCFirm" WHERE slug = $1',
      [candidate],
    );
    if (existing.rowCount === 0) return candidate;
    // Collision: check if it's the same tenant we're re-adding
    const sameTenant = await pg.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM "Membership" m
         JOIN "User" u ON u.id = m."userId"
        WHERE m."vcFirmId" = $1 AND u.email = $2`,
      [existing.rows[0].id, email],
    );
    if (parseInt(sameTenant.rows[0].count, 10) > 0) return candidate;
  }
  return `${base}-${randomTail(8)}`;
}

// ─── main ────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const email = args.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    console.error(`Invalid email: ${email}`);
    process.exit(2);
  }
  const orgName = args.org.trim();
  const displayName = args.name.trim();
  const region = args.region.trim() || "us";

  const pg = new Client({ connectionString: DB_URL });
  await pg.connect();

  try {
    await pg.query("BEGIN");

    const baseSlug = slugify(orgName);
    const slug = await uniqueSlug(pg, baseSlug, email);

    // Upsert Firm
    const firm = await pg.query<{ id: string; created: boolean }>(
      `INSERT INTO "VCFirm" (id, name, slug, status, region, "updatedAt")
       VALUES (
         'firm_' || substr(md5(random()::text || clock_timestamp()::text), 1, 18),
         $1, $2, 'ACTIVE', $3, now()
       )
       ON CONFLICT (slug) DO UPDATE
         SET name = excluded.name, region = excluded.region, "updatedAt" = now()
       RETURNING id, (xmax = 0) AS created`,
      [orgName, slug, region],
    );
    const firmId = firm.rows[0].id;
    const firmCreated = firm.rows[0].created;

    // Upsert User
    const user = await pg.query<{ id: string; created: boolean }>(
      `INSERT INTO "User" (id, email, name, "updatedAt")
       VALUES (
         'user_' || substr(md5(random()::text || clock_timestamp()::text), 1, 18),
         $1, $2, now()
       )
       ON CONFLICT (email) DO UPDATE
         SET name = COALESCE(excluded.name, "User".name), "updatedAt" = now()
       RETURNING id, (xmax = 0) AS created`,
      [email, displayName],
    );
    const userId = user.rows[0].id;
    const userCreated = user.rows[0].created;

    // Upsert Membership — Membership has @@unique([userId, firmId, portcoId])
    // but portcoId is nullable and Postgres treats NULLs as distinct under
    // unique constraints. Find first, then create.
    const existingMembership = await pg.query<{ id: string; role: string }>(
      `SELECT id, role FROM "Membership"
        WHERE "userId" = $1 AND "vcFirmId" = $2 AND "portcoId" IS NULL`,
      [userId, firmId],
    );
    let membershipCreated = false;
    if (existingMembership.rowCount === 0) {
      await pg.query(
        `INSERT INTO "Membership" (id, "userId", "vcFirmId", role)
         VALUES (
           'mem_' || substr(md5(random()::text || clock_timestamp()::text), 1, 18),
           $1, $2, 'VC_ADMIN'
         )`,
        [userId, firmId],
      );
      membershipCreated = true;
    } else if (existingMembership.rows[0].role !== "VC_ADMIN") {
      await pg.query(
        'UPDATE "Membership" SET role = $1 WHERE id = $2',
        ["VC_ADMIN", existingMembership.rows[0].id],
      );
    }

    await pg.query("COMMIT");

    // ── output ────────────────────────────────────────────────────────
    const url = process.env.PUBLIC_PRINCIPE_URL?.trim() || "http://localhost:3000";
    console.log("");
    console.log("┌─────────────────────────────────────────────────────────┐");
    console.log("│  Tenant ready                                           │");
    console.log("└─────────────────────────────────────────────────────────┘");
    console.log("");
    console.log(`  Org:          ${orgName}  ${firmCreated ? "(new)" : "(updated)"}`);
    console.log(`  Slug:         ${slug}`);
    console.log(`  Region:       ${region}`);
    console.log(`  Admin:        ${displayName} <${email}>  ${userCreated ? "(new user)" : "(existing user)"}`);
    console.log(`  Membership:   VC_ADMIN  ${membershipCreated ? "(new)" : "(already linked)"}`);
    console.log("");
    console.log("  Send them this URL:");
    console.log(`    ${url}/login`);
    console.log("");
    console.log("  On first sign-in they'll enroll a passkey and land in their org.");
    console.log("");
    console.log("  If your Principe is on localhost and you want them to reach it remotely:");
    console.log("    ngrok http 3000      # gives you a public https URL");
    console.log("    Update WEBAUTHN_RP_ID + WEBAUTHN_ORIGIN in .env.local to match,");
    console.log("    then restart pnpm dev so passkey enrollment works on that host.");
    console.log("");
  } catch (e) {
    await pg.query("ROLLBACK").catch(() => undefined);
    console.error("Tenant create failed:", e);
    process.exit(1);
  } finally {
    await pg.end();
  }
}

main();
