import { describe, it, expect } from "vitest";
import { computeStatsForColumn, computeAllStats, percentileValue, round3 } from "./stats";
import type { OSLTTSample } from "@/types/osltt";

function sample(n: number, total: number): OSLTTSample {
  return { shotNumber: n, clickTimeMs: 0, processingLatencyMs: 0, displayLatencyMs: 0, totalSystemInputLagMs: total };
}

describe("statistics", () => {
  it("computes mean/min/max/median/stdDev correctly", () => {
    const vals = [1, 2, 3, 4, 5];
    const s = computeStatsForColumn(vals);
    expect(s.mean).toBeCloseTo(3);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    expect(s.median).toBe(3);
    expect(s.count).toBe(5);
    expect(s.stdDev).toBeCloseTo(Math.sqrt(2)); // population stddev of 1..5 is sqrt(2)
  });

  it("computes median for even count", () => {
    const s = computeStatsForColumn([1, 2, 3, 4]);
    expect(s.median).toBeCloseTo(2.5);
  });

  it("handles empty array as zeros", () => {
    const s = computeStatsForColumn([]);
    expect(s.mean).toBe(0);
    expect(s.min).toBe(0);
    expect(s.max).toBe(0);
    expect(s.count).toBe(0);
  });

  it("computes all columns stats", () => {
    const samples: OSLTTSample[] = [sample(1, 2.0), sample(2, 4.0), sample(3, 6.0)];
    const all = computeAllStats(samples);
    expect(all.totalSystemInputLag.mean).toBeCloseTo(4.0);
    expect(all.totalSystemInputLag.min).toBeCloseTo(2.0);
    expect(all.totalSystemInputLag.max).toBeCloseTo(6.0);
    expect(all.clickTime.mean).toBe(0); // all zeros should summarize to zero
  });

  it("zero column naturally summarizes to zero", () => {
    const samples: OSLTTSample[] = [sample(1, 2.0), sample(2, 2.5)];
    // clickTime all zero
    const all = computeAllStats(samples);
    expect(all.clickTime.mean).toBe(0);
    expect(all.clickTime.min).toBe(0);
    expect(all.clickTime.max).toBe(0);
  });

  it("round3 only at boundary", () => {
    expect(round3(2.709293)).toBe(2.709);
    expect(round3(2.7095)).toBe(2.71); // check rounding
  });

  it("percentile interpolation", () => {
    const sorted = [1, 2, 3, 4, 5];
    expect(percentileValue(sorted, 0)).toBe(1);
    expect(percentileValue(sorted, 100)).toBe(5);
    expect(percentileValue(sorted, 50)).toBe(3);
  });

  it("deterministic sort not mutated input", () => {
    const vals = [5, 1, 3];
    const s = computeStatsForColumn(vals);
    expect(vals).toEqual([5, 1, 3]); // not mutated
    expect(s.median).toBe(3);
  });
});
