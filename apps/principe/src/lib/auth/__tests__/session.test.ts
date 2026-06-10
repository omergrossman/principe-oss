import { describe, it, expect } from "vitest";
import { encodeSession, decodeSession, type BaseSessionPayload } from "@principe/rbac";

interface S extends BaseSessionPayload {
  userId: string;
  role: string;
}
const isS = (v: unknown): v is S =>
  typeof v === "object" && v !== null && typeof (v as S).userId === "string";

const SECRET = "test-secret";

// The session cookie is HMAC-signed: a client can't forge or escalate it.
describe("session encode/decode", () => {
  it("round-trips a valid signed cookie", () => {
    const cookie = encodeSession<S>({ createdAt: 1000, userId: "u1", role: "admin" }, SECRET);
    const out = decodeSession<S>(cookie, { validate: isS, secret: SECRET, now: () => 2000 });
    expect(out?.userId).toBe("u1");
    expect(out?.role).toBe("admin");
  });

  it("rejects a tampered payload", () => {
    const cookie = encodeSession<S>({ createdAt: 1000, userId: "u1", role: "member" }, SECRET);
    const [payload, sig] = cookie.split(".");
    const last = payload.slice(-1);
    const tampered = `${payload.slice(0, -1)}${last === "A" ? "B" : "A"}.${sig}`;
    expect(decodeSession<S>(tampered, { validate: isS, secret: SECRET, now: () => 2000 })).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const cookie = encodeSession<S>({ createdAt: 1000, userId: "u1", role: "admin" }, SECRET);
    expect(
      decodeSession<S>(cookie, { validate: isS, secret: "other-secret", now: () => 2000 }),
    ).toBeNull();
  });

  it("rejects an expired session", () => {
    const cookie = encodeSession<S>({ createdAt: 0, userId: "u1", role: "admin" }, SECRET);
    const out = decodeSession<S>(cookie, {
      validate: isS,
      secret: SECRET,
      maxAgeSec: 10,
      now: () => 20_000, // 20s later, cap is 10s
    });
    expect(out).toBeNull();
  });

  it("rejects a payload that fails the validate predicate", () => {
    const cookie = encodeSession({ createdAt: 1000 }, SECRET); // no userId
    expect(decodeSession<S>(cookie, { validate: isS, secret: SECRET, now: () => 2000 })).toBeNull();
  });

  it("rejects a legacy unsigned cookie", () => {
    expect(decodeSession<S>("justsomevalue", { validate: isS, secret: SECRET })).toBeNull();
  });
});
