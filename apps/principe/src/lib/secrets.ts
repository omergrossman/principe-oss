import crypto from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.PRINCIPE_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "PRINCIPE_ENCRYPTION_KEY is not set. Generate one with: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      `PRINCIPE_ENCRYPTION_KEY must be 32 bytes (64 hex chars); got ${key.length}.`,
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptSecret(ciphertext: string): string {
  const [ivB64, ctB64, tagB64] = ciphertext.split(":");
  if (!ivB64 || !ctB64 || !tagB64) {
    throw new Error("Malformed ciphertext — expected iv:ct:tag tuple.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

export function last4(plaintext: string): string {
  return plaintext.slice(-4);
}
