import { describe, it, expect } from "vitest";
import { parseStructured } from "@/lib/ciso-panel/ask";

// The defensive parser is what stops raw/garbled model output from leaking
// into the UI fields. These pin its happy + salvage paths.
describe("parseStructured", () => {
  it("parses clean JSON", () => {
    const r = parseStructured(
      JSON.stringify({ verdict: "pro", sentiment: 8, headline: "Strong", reasoning: "Because." }),
    );
    expect(r.parseError).toBe(false);
    expect(r.verdict).toBe("pro");
    expect(r.sentiment).toBe(8);
    expect(r.headline).toBe("Strong");
    expect(r.reasoning).toBe("Because.");
  });

  it("strips a ```json code fence", () => {
    const r = parseStructured('```json\n{"verdict":"con","sentiment":3,"headline":"H","reasoning":"R"}\n```');
    expect(r.parseError).toBe(false);
    expect(r.verdict).toBe("con");
  });

  it("extracts a JSON object embedded after prose", () => {
    const r = parseStructured('Sure, here it is: {"verdict":"neutral","sentiment":5,"headline":"H","reasoning":"R"} done');
    expect(r.parseError).toBe(false);
    expect(r.verdict).toBe("neutral");
  });

  it("clamps an out-of-range sentiment to 5", () => {
    const r = parseStructured(JSON.stringify({ verdict: "pro", sentiment: 99, headline: "H", reasoning: "R" }));
    expect(r.sentiment).toBe(5);
  });

  it("flags unparseable / non-JSON text as a parse error", () => {
    const r = parseStructured("I only evaluate founder pitches, sorry.");
    expect(r.parseError).toBe(true);
  });

  it("never throws on truncated JSON", () => {
    expect(() =>
      parseStructured('{"verdict":"pro","sentiment":8,"headline":"H","reasoning":"this got cut off mid-str'),
    ).not.toThrow();
  });
});
