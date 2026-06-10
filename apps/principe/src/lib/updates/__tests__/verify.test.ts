import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import {
  verifyManifestSignature,
  sha256Hex,
  InvalidSignatureError,
} from "@/lib/updates/verify";

// Generate a throwaway ed25519 keypair and point the verifier's configured
// public key at it, so we exercise the REAL crypto.verify path.
let privateKey: crypto.KeyObject;

beforeAll(() => {
  const { publicKey, privateKey: priv } = crypto.generateKeyPairSync("ed25519");
  privateKey = priv;
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  // ed25519 SPKI = 12-byte prefix + 32 raw bytes.
  process.env.PRINCIPE_UPDATES_PUBLIC_KEY = spki.subarray(12).toString("hex");
});

describe("verifyManifestSignature", () => {
  it("accepts a valid signature", () => {
    const msg = Buffer.from(JSON.stringify({ version: "2026-06-10-1200" }));
    const sig = crypto.sign(null, msg, privateKey);
    expect(verifyManifestSignature(msg, sig)).toBe(true);
  });

  it("rejects a tampered manifest", () => {
    const msg = Buffer.from("original manifest bytes");
    const sig = crypto.sign(null, msg, privateKey);
    expect(() =>
      verifyManifestSignature(Buffer.from("tampered manifest bytes"), sig),
    ).toThrow(InvalidSignatureError);
  });

  it("rejects a signature from a different key", () => {
    const other = crypto.generateKeyPairSync("ed25519").privateKey;
    const msg = Buffer.from("hello");
    const badSig = crypto.sign(null, msg, other);
    expect(() => verifyManifestSignature(msg, badSig)).toThrow(InvalidSignatureError);
  });

  it("rejects a wrong-length signature", () => {
    expect(() => verifyManifestSignature(Buffer.from("x"), Buffer.alloc(10))).toThrow(
      InvalidSignatureError,
    );
  });
});

describe("sha256Hex", () => {
  it("matches Node's crypto digest", () => {
    const b = Buffer.from("principe");
    expect(sha256Hex(b)).toBe(crypto.createHash("sha256").update(b).digest("hex"));
  });
});
