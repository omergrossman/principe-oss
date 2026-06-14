// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import {
  fitCorrections,
  applyCorrection,
  calibrate,
  CORRECTIONS,
  type PairedPoint,
} from "../calibration-map";

describe("fitCorrections", () => {
  it("computes a per-type shrunk offset and residual", () => {
    const pts: PairedPoint[] = [
      { type: "PRIORITY", raw: 80, real: 50 },
      { type: "PRIORITY", raw: 70, real: 40 },
    ];
    const c = fitCorrections(pts).PRIORITY;
    expect(c.n).toBe(2);
    expect(c.offset).toBe(-30); // mean(real - raw)
    // shrunk toward 0 by n/(n+k): -30 * 2/7 ≈ -8.57
    expect(c.shrunkOffset).toBeCloseTo(-8.57, 1);
  });
});

describe("applyCorrection — honest band", () => {
  it("is identity with a wide band when there's no/insufficient data", () => {
    const r = applyCorrection(undefined, 90);
    expect(r.calibratedPct).toBe(90);
    expect(r.calibrated).toBe(false);
    expect(r.bandHalfWidthPp).toBeGreaterThanOrEqual(25);
  });

  it("clean, plentiful data → calibrated=true with a tight band", () => {
    // 8 points where the panel is consistently +20 over real (low residual).
    const raws = [70, 60, 50, 80, 40, 75, 65, 55];
    const pts: PairedPoint[] = raws.map((raw) => ({ type: "STRATEGY", raw, real: raw - 20 }));
    const c = fitCorrections(pts).STRATEGY;
    const r = applyCorrection(c, 70);
    expect(r.calibrated).toBe(true);
    expect(r.bandHalfWidthPp).toBeLessThanOrEqual(18);
    expect(r.calibratedPct).toBeLessThan(70); // corrected downward
  });

  it("noisy data → correction applies but the band stays wide and NOT calibrated", () => {
    // High within-type variance (the real PRIORITY situation).
    const pts: PairedPoint[] = [
      { type: "PRIORITY", raw: 100, real: 48 },
      { type: "PRIORITY", raw: 26, real: 56 },
      { type: "PRIORITY", raw: 82, real: 51 },
      { type: "PRIORITY", raw: 32, real: 41 },
    ];
    const c = fitCorrections(pts).PRIORITY;
    const r = applyCorrection(c, 80);
    expect(r.calibrated).toBe(false); // band too wide to trust
    expect(r.bandHalfWidthPp).toBeGreaterThan(18);
  });
});

describe("seed corrections (current state)", () => {
  it("PRIORITY is present but NOT yet trustworthy (wide band) — the honest GA signal", () => {
    const r = calibrate("PRIORITY", 90);
    expect(CORRECTIONS.PRIORITY).toBeDefined();
    expect(r.calibrated).toBe(false);
  });

  it("PITCH has no global paired data yet → identity, uncalibrated", () => {
    const r = calibrate("PITCH", 40);
    expect(r.calibratedPct).toBe(40);
    expect(r.calibrated).toBe(false);
  });
});
