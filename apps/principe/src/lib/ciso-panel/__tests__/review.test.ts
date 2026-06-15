// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { reviewObjections, type PanelReview } from "../review";
import type { PanelAggregates } from "../ask";

const AGG = { proCount: 19, conCount: 22, neutralCount: 9 } as unknown as PanelAggregates;
const CONS = ["Objection one is long enough.", "Objection two text.", "Objection three text."];

// Stub Anthropic client: `create` returns the continuation AFTER the prefilled
// "{" (the real API omits the prefill), so the text must start mid-object.
function clientReturning(texts: string[]): Anthropic {
  let i = 0;
  const systems: string[] = [];
  const create = vi.fn(async (args: { system: string }) => {
    systems.push(args.system);
    const text = texts[i % texts.length];
    i++;
    return { content: [{ type: "text", text }], usage: { input_tokens: 1, output_tokens: 1 } };
  });
  // @ts-expect-error — minimal stub
  return { messages: { create }, __systems: systems };
}

describe("reviewObjections", () => {
  it("returns the three fields and re-ranks by reviewer 'strongest' votes", async () => {
    // All three reviewers pick objection #2 as strongest → it ranks first.
    const client = clientReturning([
      `"strongest": 2, "blindSpot": "Vendor lock-in on this control was never raised by anyone.", "minorityStronger": true}`,
    ]);
    const r: PanelReview = await reviewObjections("Q?", AGG, CONS, client);
    expect(r.objectionsRanked[0]).toBe(CONS[1]);
    expect(r.objectionsRanked).toHaveLength(3);
    expect(r.blindSpot).toMatch(/vendor lock-in/i);
    expect(r.minorityStronger).toBe(true); // 3/3 reviewers said so
  });

  it("uses THREE distinct reviewer lenses (diversity)", async () => {
    const client = clientReturning([`"strongest": 1, "blindSpot": "", "minorityStronger": false}`]);
    await reviewObjections("Q?", AGG, CONS, client);
    const systems: string[] = (client as unknown as { __systems: string[] }).__systems;
    expect(systems).toHaveLength(3);
    expect(new Set(systems).size).toBe(3);
  });

  it("degrades gracefully when every reviewer fails", async () => {
    const create = vi.fn(async () => {
      throw new Error("model down");
    });
    // @ts-expect-error — minimal stub
    const client: Anthropic = { messages: { create } };
    const r = await reviewObjections("Q?", AGG, CONS, client);
    expect(r.blindSpot).toBeNull();
    expect(r.objectionsRanked).toEqual(CONS); // original order preserved
    expect(r.minorityStronger).toBe(false);
  });

  it("no objections → empty review, no model calls", async () => {
    const create = vi.fn();
    // @ts-expect-error — minimal stub
    const client: Anthropic = { messages: { create } };
    const r = await reviewObjections("Q?", AGG, [], client);
    expect(r.objectionsRanked).toEqual([]);
    expect(r.blindSpot).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("minority flag needs a majority of reviewers", async () => {
    // 1 of 3 says minorityStronger → false.
    const client = clientReturning([
      `"strongest": 1, "blindSpot": "", "minorityStronger": true}`,
      `"strongest": 1, "blindSpot": "", "minorityStronger": false}`,
      `"strongest": 1, "blindSpot": "", "minorityStronger": false}`,
    ]);
    const r = await reviewObjections("Q?", AGG, CONS, client);
    expect(r.minorityStronger).toBe(false);
  });
});
