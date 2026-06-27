import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../password";

// scrypt password hashing for the optional password credential. Passwords are
// stored as `scrypt$<saltHex>$<hashHex>` and verified in constant time.
describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(
      true,
    );
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("Aa1234567!");
    expect(await verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("produces the `scrypt$salt$hash` format with a random salt", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    // Random per-hash salt → identical inputs hash to different strings.
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("returns false for a null/empty/malformed stored hash", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", undefined)).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "not-a-valid-hash")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$aa$bb")).toBe(false);
  });
});
