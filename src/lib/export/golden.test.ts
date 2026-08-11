import { describe, it, expect } from "vitest";
import { parseOSLTT } from "../osltt/parser";
import { computeAllStats } from "../statistics/stats";
import { exportOSLTT } from "./csvExporter";
import { detectOutliers } from "../outliers/detector";
import { OSLTT_HEADER } from "../osltt/constants";

function csv(lines: string[]) { return lines.join("\n"); }

// Golden 1: simple 5 samples, one far outlier 30ms should be removed at threshold 10 with remove handling
describe("golden-file tests", () => {
  it("golden: simple outlier removal byte-identical", () => {
    // 20 samples at ~2.0x + 1 outlier at 30 -> outlier is ~4.7% so flagged
    const lines = [OSLTT_HEADER];
    const vals = [2.102, 2.083, 2.094, 2.11, 2.095, 2.101, 2.088, 2.092, 2.099, 2.103, 2.104, 2.086, 2.091, 2.098, 2.1, 2.089, 2.093, 2.107, 2.096, 2.105];
    vals.forEach((v, i) => lines.push(`${i + 1},0,0,0,${v.toFixed(3)}`));
    lines.push("21,0,0,0,30.000");
    lines.push("AVERAGE,0,0,0,7.678");
    lines.push("MINIMUM,0,0,0,2.083");
    lines.push("MAXIMUM,0,0,0,30.000");
    const input = csv(lines);
    const p = parseOSLTT(input, "golden-simple.csv");
    expect(p.samples.length).toBe(21);
    const config = { thresholdPct: 10, minDeviationMs: 2, sensitivity: "balanced" as const, handling: "remove" as const };
    const { filtered } = detectOutliers(p.samples, config);
    expect(filtered.length).toBe(20);
    expect(filtered.map((s) => s.shotNumber)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const stats = computeAllStats(filtered);
    const exported = exportOSLTT(filtered, stats);
    const linesOut = exported.trim().split("\n");
    expect(linesOut[0]).toBe(OSLTT_HEADER);
    expect(linesOut.length).toBe(1 + 20 + 3);
    expect(exported).not.toContain("30.000");
    // Recalculated average check
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const avgStr = avg.toFixed(3);
    expect(exported).toContain(`AVERAGE,0.000,0.000,0.000,${avgStr}`);
  });

  it("golden: dual population preserved", () => {
    // 9 files? Actually just one file with 10 samples at 2ms, 2 samples at 10ms (total 12) -> 16.6% secondary -> valid
    const lines = [OSLTT_HEADER];
    for (let i = 1; i <= 10; i++) lines.push(`${i},0,0,0,2.0${i % 3}`);
    lines.push("11,0,0,0,10.010");
    lines.push("12,0,0,0,10.020");
    const input = csv(lines);
    const p = parseOSLTT(input);
    const config = { thresholdPct: 10, minDeviationMs: 2, sensitivity: "balanced" as const, handling: "remove" as const };
    const { filtered } = detectOutliers(p.samples, config);
    expect(filtered.length).toBe(12); // kept
    const stats = computeAllStats(filtered);
    const exported = exportOSLTT(filtered, stats);
    const reparsed = parseOSLTT(exported);
    expect(reparsed.samples.length).toBe(12);
  });

  it("golden: all-zero column summarizes to zero", () => {
    const input = csv([OSLTT_HEADER, "1,0,0,0,2.0", "2,0,0,0,2.0", "3,0,0,0,2.0"]);
    const p = parseOSLTT(input);
    const stats = computeAllStats(p.samples);
    const exported = exportOSLTT(p.samples, stats);
    expect(exported).toContain("AVERAGE,0.000,0.000,0.000,2.000");
    expect(exported).toContain("MINIMUM,0.000,0.000,0.000,2.000");
  });

  it("golden: shot numbers immutable after filtering", () => {
    const lines = [OSLTT_HEADER];
    // 19 normal around 2ms + 1 outlier shot 159 at 30ms, but to make filtered correctly, need enough samples to make 1/20 =5% <10
    const shots: { shot: number; val: number }[] = [];
    for (let s = 157; s <= 176; s++) {
      if (s === 159) shots.push({ shot: s, val: 30.0 });
      else shots.push({ shot: s, val: 2.0 + (s % 3) * 0.05 });
    }
    for (const sh of shots) lines.push(`${sh.shot},0,0,0,${sh.val.toFixed(3)}`);
    const input = csv(lines);
    const p = parseOSLTT(input);
    const config = { thresholdPct: 10, minDeviationMs: 2, sensitivity: "balanced" as const, handling: "remove" as const };
    const { filtered } = detectOutliers(p.samples, config);
    const stats = computeAllStats(filtered);
    const exported = exportOSLTT(filtered, stats);
    expect(exported).toContain("157,");
    expect(exported).toContain("158,");
    expect(exported).toContain("160,");
    expect(exported).not.toMatch(/\n159,/);
    // Ensure no renumbering: 160 stays 160, not compacted
    expect(exported.split("\n").some((l) => l.startsWith("160,"))).toBe(true);
  });
});
