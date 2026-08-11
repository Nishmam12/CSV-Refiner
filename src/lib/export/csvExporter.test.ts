import { describe, it, expect } from "vitest";
import { parseOSLTT } from "../osltt/parser";
import { computeAllStats } from "../statistics/stats";
import { exportOSLTT } from "./csvExporter";
import { OSLTT_HEADER } from "../osltt/constants";

function csv(lines: string[]) { return lines.join("\n"); }

describe("csvExporter", () => {
  it("exports with correct header and 3-decimal rounding", () => {
    const text = csv([OSLTT_HEADER, "1,0,0,0,2.1024", "2,0,0,0,2.0831"]);
    const p = parseOSLTT(text);
    const stats = computeAllStats(p.samples);
    const out = exportOSLTT(p.samples, stats);
    const lines = out.trim().split("\n");
    expect(lines[0]).toBe(OSLTT_HEADER);
    // rows sorted
    expect(lines[1]).toBe("1,0.000,0.000,0.000,2.102");
    expect(lines[2]).toBe("2,0.000,0.000,0.000,2.083");
    expect(lines[lines.length - 3].startsWith("AVERAGE")).toBe(true);
    expect(lines[lines.length - 2].startsWith("MINIMUM")).toBe(true);
    expect(lines[lines.length - 1].startsWith("MAXIMUM")).toBe(true);
  });

  it("preserves Shot Numbers and does not renumber", () => {
    const text = csv([OSLTT_HEADER, "157,0,0,0,2.1", "159,0,0,0,2.2", "160,0,0,0,2.0"]);
    const p = parseOSLTT(text);
    const stats = computeAllStats(p.samples);
    const out = exportOSLTT(p.samples, stats);
    expect(out).toContain("157,");
    expect(out).toContain("159,");
    expect(out).toContain("160,");
    expect(out).not.toContain("\n158,");
  });

  it("round-trip: export → parse retains samples", () => {
    const text = csv([OSLTT_HEADER, "1,0,0,0,2.102", "2,0,0,0,2.083", "4,0,0,0,2.094"]);
    const p = parseOSLTT(text);
    const stats = computeAllStats(p.samples);
    const exported = exportOSLTT(p.samples, stats);
    const reparsed = parseOSLTT(exported);
    expect(reparsed.samples.length).toBe(p.samples.length);
    for (let i = 0; i < p.samples.length; i++) {
      expect(reparsed.samples[i].shotNumber).toBe(p.samples[i].shotNumber);
      expect(reparsed.samples[i].totalSystemInputLagMs).toBeCloseTo(p.samples[i].totalSystemInputLagMs, 3);
    }
  });

  it("statistics recalculated, not copied", () => {
    const text = csv([OSLTT_HEADER, "1,0,0,0,2.0", "2,0,0,0,4.0", "AVERAGE,0,0,0,999.0"]);
    const p = parseOSLTT(text);
    const stats = computeAllStats(p.samples);
    const out = exportOSLTT(p.samples, stats);
    // average should be 3.0, not 999
    expect(out).toContain("AVERAGE,0.000,0.000,0.000,3.000");
    expect(out).not.toContain("999");
  });

  it("byte-identical for same input+config", () => {
    const text = csv([OSLTT_HEADER, "1,0,0,0,2.1", "2,0,0,0,2.2"]);
    const p = parseOSLTT(text);
    const stats = computeAllStats(p.samples);
    const a = exportOSLTT(p.samples, stats);
    const b = exportOSLTT(p.samples, stats);
    expect(a).toBe(b);
  });
});
