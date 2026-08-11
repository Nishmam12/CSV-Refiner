import { describe, it, expect } from "vitest";
import { parseOSLTT } from "./parser";
import { computeAllStats } from "../statistics/stats";
import { exportOSLTT } from "../export/csvExporter";
import { detectOutliers } from "../outliers/detector";
import { OSLTT_HEADER } from "./constants";

function csv(lines: string[]) { return lines.join("\n"); }

describe("adversarial fuzz", () => {
  it("handles empty CSVs", () => {
    const p = parseOSLTT("");
    expect(p.samples.length).toBe(0);
  });
  it("handles all-identical values", () => {
    const lines = [OSLTT_HEADER, ...Array(10).fill(0).map((_, i) => `${i + 1},0,0,0,2.500`)];
    const p = parseOSLTT(csv(lines));
    expect(p.samples.length).toBe(10);
    const det = detectOutliers(p.samples, { thresholdPct: 10, minDeviationMs: 2, sensitivity: "balanced", handling: "remove" });
    expect(det.populations.length).toBe(1);
    expect(det.filtered.length).toBe(10);
  });
  it("handles all-unique values", () => {
    const lines = [OSLTT_HEADER, ...Array(20).fill(0).map((_, i) => `${i + 1},0,0,0,${(i * 2).toFixed(3)}`)];
    const p = parseOSLTT(csv(lines));
    const det = detectOutliers(p.samples, { thresholdPct: 10, minDeviationMs: 2, sensitivity: "balanced", handling: "remove" });
    expect(det.populations.length).toBeGreaterThan(1);
  });
  it("handles single sample", () => {
    const p = parseOSLTT(csv([OSLTT_HEADER, "1,0,0,0,2.102"]));
    expect(p.samples.length).toBe(1);
    const stats = computeAllStats(p.samples);
    const out = exportOSLTT(p.samples, stats);
    expect(out).toContain("1,0.000,0.000,0.000,2.102");
  });
  it("handles exactly 8 samples", () => {
    const lines = [OSLTT_HEADER, ...Array(8).fill(0).map((_, i) => `${i + 1},0,0,0,${(2 + i * 0.01).toFixed(3)}`)];
    const p = parseOSLTT(csv(lines));
    expect(p.samples.length).toBe(8);
    const det = detectOutliers(p.samples, { thresholdPct: 10, minDeviationMs: 2, sensitivity: "balanced", handling: "remove" });
    expect(det.decisions.length).toBe(8);
  });
  it("handles negative / NaN / Infinity values as invalid", () => {
    const lines = [OSLTT_HEADER, "1,0,0,0,-2.0", "2,0,0,0,NaN", "3,0,0,0,Infinity", "4,0,0,0,2.0"];
    const p = parseOSLTT(csv(lines));
    // -2.0 is finite, so kept; NaN/Infinity excluded
    expect(p.samples.some((s) => s.shotNumber === 1)).toBe(true);
    expect(p.samples.some((s) => s.shotNumber === 2)).toBe(false);
    expect(p.samples.some((s) => s.shotNumber === 3)).toBe(false);
  });
  it("handles missing or duplicated summary rows", () => {
    const missing = parseOSLTT(csv([OSLTT_HEADER, "1,0,0,0,2.0"]));
    expect(missing.originalSummary.average).toBeNull();
    const dup = parseOSLTT(csv([OSLTT_HEADER, "1,0,0,0,2.0", "AVERAGE,0,0,0,2.0", "AVERAGE,0,0,0,5.0"]));
    expect(dup.originalSummary.average!["Total System Input Lag (ms)"]).toBe(5.0);
  });
  it("handles reordered columns as error", () => {
    const p = parseOSLTT(csv(["Click Time (ms),Shot Number,Processing Latency (ms),Display Latency(ms),Total System Input Lag (ms)", "0,1,0,0,2.0"]));
    expect(p.errors.length).toBeGreaterThan(0);
  });
  it("handles duplicate filenames conceptually (batch grouping)", () => {
    const p1 = parseOSLTT(csv([OSLTT_HEADER, "1,0,0,0,2.0"]), "file.csv");
    const p2 = parseOSLTT(csv([OSLTT_HEADER, "1,0,0,0,2.1"]), "file.csv");
    expect(p1.filename).toBe("file.csv");
    expect(p2.filename).toBe("file.csv");
  });
  it("export round-trip preserves data", () => {
    const lines = [OSLTT_HEADER, "10,0,0,0,2.102", "20,0,0,0,2.083"];
    const p = parseOSLTT(csv(lines));
    const stats = computeAllStats(p.samples);
    const out = exportOSLTT(p.samples, stats);
    const rp = parseOSLTT(out);
    expect(rp.samples.map((s) => s.shotNumber)).toEqual([10, 20]);
  });
});
