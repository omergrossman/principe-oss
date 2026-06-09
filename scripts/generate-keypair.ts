// SPDX-License-Identifier: AGPL-3.0-or-later
// Generate an ed25519 keypair for bundle publishing.
//
// Usage:
//   pnpm tsx scripts/generate-keypair.ts
//
// Writes two files in the current directory:
//   updates-public.hex   — 64-char hex string, embed as PRINCIPE_UPDATES_PUBLIC_KEY default
//   updates-private.pem  — PEM-encoded private key, KEEP SECRET; load via env in build-bundle.ts
//
// Only run this once per publisher identity. Rotate by generating a
// new pair and bumping the public-key default in lib/updates/verify.ts
// (or shipping the new public key in a documented release note so
// self-hosters can update PRINCIPE_UPDATES_PUBLIC_KEY).

import crypto from "node:crypto";
import { writeFileSync, chmodSync } from "node:fs";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

// Raw public key (32 bytes) → hex.
const spki = publicKey.export({ format: "der", type: "spki" });
// SPKI prefix for ed25519 is 12 bytes (302a300506032b6570032100), then 32 raw bytes.
const rawPublic = spki.subarray(12);
const hex = rawPublic.toString("hex");

const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

writeFileSync("updates-public.hex", hex + "\n");
writeFileSync("updates-private.pem", pem);
chmodSync("updates-private.pem", 0o600);

console.log("✓ Generated ed25519 keypair.");
console.log(`  Public key (hex):       updates-public.hex  ${hex.length} chars`);
console.log(`  Private key (PEM, 0600): updates-private.pem`);
console.log("");
console.log("Next steps:");
console.log("  1. Update apps/principe/src/lib/updates/verify.ts:");
console.log("     DEFAULT_PUBLIC_KEY_HEX = the contents of updates-public.hex");
console.log("  2. Store updates-private.pem somewhere safe (NOT in this repo).");
console.log("     Load it via PRINCIPE_UPDATES_PRIVATE_KEY_PATH env when building bundles.");
console.log("  3. Publish the public-key fingerprint outside the repo (release notes,");
console.log("     your project page) so self-hosters can verify provenance.");
