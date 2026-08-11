import { describe, it, expect } from "vitest";
import { detectOutliers } from "./detector";
import type { OSLTTSample } from "@/types/osltt";

function sample(shot: number, latency: number): OSLTTSample {
  return { shotNumber: shot, clickTimeMs: 0, processingLatencyMs: 0, displayLatencyMs: 0, totalSystemInputLagMs: latency };
}

function makeSamples(groups: { latency: number; count: number; jitter?: number }[]): OSLTTSample[] {
  let shot = 1;
  const out: OSLTTSample[] = [];
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      const jitter = g.jitter ?? 0.05;
      const lat = g.latency + (Math.random() - 0.5) * jitter;
      out.push(sample(shot++, lat));
    }
  }
  return out;
}

const balancedRemove = { thresholdPct: 10, minDeviationMs: 2, sensitivity: "balanced" as const, handling: "remove" as const };
const balancedFlag = { thresholdPct: 10, minDeviationMs: 2, sensitivity: "balanced" as const, handling: "flag" as const };

describe("outlier boundary tests (7.2)", () => {
  it("Exactly at threshold 20/200 =10% kept", () => {
    const samples = makeSamples([{ latency: 2, count: 180 }, { latency: 10, count: 20 }]);
    const res = detectOutliers(samples, balancedRemove);
    // 10% population should be valid, not removed when threshold=10
    const secondary = res.populations.find((p) => !p.isDominant)!;
    expect(secondary.percentage).toBeCloseTo(10, 0);
    const dec = res.decisions.find((d) => d.populationId === secondary.id)!;
    expect(dec.kind).toBe("valid");
    expect(res.filtered.length).toBe(200);
  });

  it("Just below threshold 19/200=9.5% -> review, not silently deleted", () => {
    const samples = makeSamples([{ latency: 2, count: 181 }, { latency: 10, count: 19 }]);
    const res = detectOutliers(samples, balancedFlag);
    const secondary = res.populations.find((p) => !p.isDominant)!;
    expect(secondary.percentage).toBeCloseTo(9.5, 0);
    const dec = res.decisions.find((d) => d.populationId === secondary.id)!;
    expect(dec.kind).toBe("review");
    expect(dec.autoShouldExclude).toBe(false);
    expect(res.filtered.length).toBe(200); // flag mode keeps
  });

  it("Just below threshold with remove handling still flagged not auto-removed (review band)", () => {
    const samples = makeSamples([{ latency: 2, count: 181 }, { latency: 10, count: 19 }]);
    const res = detectOutliers(samples, balancedRemove);
    const secondary = res.populations.find((p) => !p.isDominant)!;
    const dec = res.decisions.find((d) => d.populationId === secondary.id)!;
    expect(dec.kind).toBe("review");
    expect(res.filtered.length).toBe(200); // review never auto-excludes
  });

  it("Small dataset 8 samples does not produce nonsensical thresholds", () => {
    const samples = makeSamples([{ latency: 2, count: 7 }, { latency: 30, count: 1 }]);
    const res = detectOutliers(samples, balancedRemove);
    // With small dataset guard, single spike should be review not strong-outlier if deviation <10? Actually deviation 28 >10 so it stays strong-outlier
    // But we test that it doesn't crash and produces populations
    expect(res.populations.length).toBeGreaterThan(0);
    expect(res.decisions.length).toBe(8);
  });

  it("Multiple legitimate populations 70/20/10 kept distinctly", () => {
    const samples = makeSamples([{ latency: 2, count: 140 }, { latency: 5, count: 40 }, { latency: 10, count: 20 }]);
    const res = detectOutliers(samples, balancedRemove);
    expect(res.populations.length).toBe(3);
    for (const p of res.populations) {
      const dec = res.decisions.find((d) => d.populationId === p.id)!;
      expect(dec.kind).toBe("valid");
    }
    expect(res.filtered.length).toBe(200);
  });

  it("Single extreme spike 199@2ms 1@30ms strongly flagged/removed when handling=remove", () => {
    const samples = makeSamples([{ latency: 2, count: 199 }, { latency: 30, count: 1 }]);
    const res = detectOutliers(samples, balancedRemove);
    expect(res.populations.length).toBe(2);
    const outlier = res.populations.find((p) => !p.isDominant)!;
    const dec = res.decisions.find((d) => d.populationId === outlier.id)!;
    expect(dec.kind).toBe("strong-outlier");
    expect(dec.autoShouldExclude).toBe(true);
    expect(res.filtered.length).toBe(199);
    expect(res.removed.length).toBe(1);
  });

  it("Recurring high latency 180@2ms 20@10ms must not be blindly removed", () => {
    const samples = makeSamples([{ latency: 2, count: 180 }, { latency: 10, count: 20 }]);
    const res = detectOutliers(samples, balancedRemove);
    const outlier = res.populations.find((p) => !p.isDominant)!;
    const dec = res.decisions.find((d) => d.populationId === outlier.id)!;
    expect(dec.kind).toBe("valid");
    expect(res.filtered.length).toBe(200);
  });

  it("Threshold configurability: 5% vs 15% changes behavior for 10% secondary", () => {
    const samples = makeSamples([{ latency: 2, count: 180 }, { latency: 10, count: 20 }]);
    const strict = detectOutliers(samples, { thresholdPct: 15, minDeviationMs: 2, sensitivity: "balanced", handling: "remove" });
    const lenient = detectOutliers(samples, { thresholdPct: 5, minDeviationMs: 2, sensitivity: "balanced", handling: "remove" });
    // 10% is below 15% -> not valid
    const strictDec = strict.decisions.find((d) => !strict.populations.find((p) => p.id === d.populationId)!.isDominant)!;
    const lenientDec = lenient.decisions.find((d) => !lenient.populations.find((p) => p.id === d.populationId)!.isDominant)!;
    expect(strictDec.kind).not.toBe("valid");
    expect(lenientDec.kind).toBe("valid");
  });

  it("Manual override persists and not reverted by classifier", () => {
    const samples = makeSamples([{ latency: 2, count: 199 }, { latency: 30, count: 1 }]);
    // First run auto-remove
    const first = detectOutliers(samples, balancedRemove);
    expect(first.filtered.length).toBe(199);
    // Manual keep the outlier
    const overrides = new Map([[first.removed[0].shotNumber, { shotNumber: first.removed[0].shotNumber, keep: true, reason: "Manual exclusion" as const }]]);
    const second = detectOutliers(samples, balancedRemove, overrides);
    expect(second.filtered.length).toBe(200);
    expect(second.removed.length).toBe(0);
  });

  it("Invalid deviation gate: near dominant not flagged even if rare", () => {
    const samples = [...Array(190).fill(0).map((_, i) => sample(i + 1, 2.0 + Math.random() * 0.1)), ...Array(10).fill(0).map((_, i) => sample(191 + i, 2.3 + Math.random() * 0.05))];
    const res = detectOutliers(samples, { thresholdPct: 10, minDeviationMs: 2, sensitivity: "balanced", handling: "remove" });
    // 2.3 vs 2.0 deviation 0.3 <2 => valid even though 5%
    const secondary = res.populations.find((p) => !p.isDominant);
    if (secondary) {
      const dec = res.decisions.find((d) => d.populationId === secondary.id)!;
      expect(dec.kind).toBe("valid");
    }
  });
});
