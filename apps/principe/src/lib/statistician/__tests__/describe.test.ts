import { describe, it, expect } from "vitest";
import {
  describeStatisticianError,
  StatisticianUnavailable,
  StatisticianContractViolation,
  StatisticianBadRequest,
  PayloadTooLargeError,
} from "@/lib/statistician/client";

describe("describeStatisticianError", () => {
  it("explains an unreachable service without leaking network noise", () => {
    const msg = describeStatisticianError(
      new StatisticianUnavailable("fetch failed: ECONNREFUSED 127.0.0.1:8000", 5),
    );
    expect(msg).toContain("isn't responding");
    expect(msg).toContain("verdicts are unaffected");
    expect(msg).not.toContain("ECONNREFUSED");
  });

  it("explains a contract violation", () => {
    const msg = describeStatisticianError(
      new StatisticianContractViolation("401 from Statistician — shared secret mismatch"),
    );
    expect(msg).toContain("configuration mismatch");
    expect(msg).not.toContain("shared secret");
  });

  it("explains payload / bad-request failures", () => {
    expect(describeStatisticianError(new PayloadTooLargeError(999999))).toContain("couldn't process");
    expect(describeStatisticianError(new StatisticianBadRequest("400", {}))).toContain("couldn't process");
  });

  it("falls back to the raw message for unknown errors", () => {
    expect(describeStatisticianError(new Error("boom"))).toBe("boom");
  });
});
