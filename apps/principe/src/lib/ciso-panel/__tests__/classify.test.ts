import { describe, it, expect } from "vitest";
import { classifyAnthropicError, PanelAbortedError } from "@/lib/ciso-panel/ask";

function apiErr(status: number, message: string): Error {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

describe("classifyAnthropicError", () => {
  it("flags no-credit (400) as fatal credit → 402", () => {
    const c = classifyAnthropicError(
      apiErr(400, "Your credit balance is too low to access the Anthropic API."),
    );
    expect(c).toMatchObject({ fatal: true, code: "credit", httpStatus: 402 });
  });

  it("flags no-credit by message even when surfaced as 403", () => {
    expect(classifyAnthropicError(apiErr(403, "Your credit balance is too low")).code).toBe("credit");
  });

  it("flags a bad key (401) as fatal auth", () => {
    const c = classifyAnthropicError(apiErr(401, "authentication_error: invalid x-api-key"));
    expect(c.fatal).toBe(true);
    expect(c.code).toBe("auth");
  });

  it("flags a permission error (403) as fatal", () => {
    const c = classifyAnthropicError(apiErr(403, "permission_error: not allowed"));
    expect(c.fatal).toBe(true);
    expect(c.code).toBe("permission");
  });

  it("treats 429 rate-limit as transient (not fatal)", () => {
    expect(classifyAnthropicError(apiErr(429, "rate_limit_error")).fatal).toBe(false);
  });

  it("treats 5xx as transient", () => {
    expect(classifyAnthropicError(apiErr(503, "service unavailable")).fatal).toBe(false);
  });

  it("treats a network error (no status) as transient", () => {
    expect(classifyAnthropicError(new Error("ECONNRESET fetch failed")).code).toBe("network");
  });
});

describe("PanelAbortedError", () => {
  it("carries the classified message + attempt count", () => {
    const cls = classifyAnthropicError(apiErr(401, "invalid x-api-key"));
    const e = new PanelAbortedError(cls, 3);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe(cls.userMessage);
    expect(e.attempted).toBe(3);
    expect(e.classified.code).toBe("auth");
  });
});
