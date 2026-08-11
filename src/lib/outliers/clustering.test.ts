import { describe, it, expect } from "vitest";
import { clusterByLatency } from "./clustering";
import type { OSLTTSample } from "@/types/osltt";

function sample(shot: number, latency: number): OSLTTSample {
  return { shotNumber: shot, clickTimeMs: 0, processingLatencyMs: 0, displayLatencyMs: 0, totalSystemInputLagMs: latency };
}

describe("clustering", () => {
  it("groups noisy floats into one population", () => {
    const samples = [2.01, 2.02, 2.05, 2.08].map((v, i) => sample(i + 1, v));
    const pops = clusterByLatency(samples, 0.5);
    expect(pops.length).toBe(1);
    expect(pops[0].count).toBe(4);
  });

  it("separates distinct modes", () => {
    const samples = [...Array(5).fill(2.0).map((v, i) => sample(i + 1, v + Math.random() * 0.05)), ...Array(5).fill(10.0).map((v, i) => sample(i + 6, v + Math.random() * 0.05))];
    const pops = clusterByLatency(samples, 0.5);
    expect(pops.length).toBe(2);
  });

  it("handles single sample", () => {
    const pops = clusterByLatency([sample(1, 2.0)]);
    expect(pops.length).toBe(1);
    expect(pops[0].percentage).toBe(100);
  });

  it("handles empty", () => {
    expect(clusterByLatency([]).length).toBe(0);
  });

  it("computes deviation from dominant", () => {
    const samples = [...Array(10).fill(0).map((_, i) => sample(i + 1, 2.0)), ...Array(2).fill(0).map((_, i) => sample(i + 11, 10.0))];
    const pops = clusterByLatency(samples, 0.5);
    const nonDominant = pops.find((p) => !p.isDominant)!;
    expect(nonDominant.deviationFromDominant).toBeCloseTo(8, 0);
  });

  it("adaptive epsilon groups without explicit value", () => {
    const samples = [2.01, 2.02, 2.03, 10.01, 10.02].map((v, i) => sample(i + 1, v));
    const pops = clusterByLatency(samples, null);
    expect(pops.length).toBe(2);
  });
});
