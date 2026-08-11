import { describe, it, expect } from "vitest";
import { detectOutliers } from "./detector";
import type { OSLTTSample } from "@/types/osltt";

function sample(n: number, v: number): OSLTTSample {
  return { shotNumber: n, clickTimeMs: 0, processingLatencyMs: 0, displayLatencyMs: 0, totalSystemInputLagMs: v };
}

describe("performance", () => {
  it("handles thousands of samples quickly (<500ms)", () => {
    const samples: OSLTTSample[] = [];
    for (let i = 1; i <= 5000; i++) {
      const lat = 2 + Math.random() * 0.5 + (i % 500 === 0 ? 20 : 0);
      samples.push(sample(i, lat));
    }
    const start = Date.now();
    const det = detectOutliers(samples, { thresholdPct: 10, minDeviationMs: 2, sensitivity: "balanced", handling: "remove" });
    const elapsed = Date.now() - start;
    expect(det.populations.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });
});
