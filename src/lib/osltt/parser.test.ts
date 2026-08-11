import { describe, it, expect } from "vitest";
import { parseOSLTT } from "./parser";
import { OSLTT_HEADER } from "./constants";

function csv(lines: string[]): string {
  return lines.join("\n");
}

describe("parseOSLTT", () => {
  it("parses valid OSLTT CSV with summary rows", () => {
    const text = csv([
      OSLTT_HEADER,
      "1,0,0,0,2.102",
      "2,0,0,0,2.083",
      "3,0,0,0,2.094",
      "AVERAGE,0,0,0,2.093",
      "MINIMUM,0,0,0,2.083",
      "MAXIMUM,0,0,0,2.102",
    ]);
    const p = parseOSLTT(text, "test.csv");
    expect(p.errors.length).toBe(0);
    expect(p.samples.length).toBe(3);
    expect(p.samples[0].shotNumber).toBe(1);
    expect(p.samples[0].totalSystemInputLagMs).toBeCloseTo(2.102);
    expect(p.originalSummary.average).not.toBeNull();
    expect(p.originalSummary.minimum).not.toBeNull();
    expect(p.originalSummary.maximum).not.toBeNull();
    expect(p.rawRowCount).toBe(6); // 3 samples +3 summary in raw count? Actually rawRowCount counts non-empty rows after header
  });

  it("separates summary rows regardless of position", () => {
    const text = csv([OSLTT_HEADER, "AVERAGE,0,0,0,2.0", "1,0,0,0,2.1", "2,0,0,0,2.2", "MINIMUM,0,0,0,2.1"]);
    const p = parseOSLTT(text);
    expect(p.samples.length).toBe(2);
    expect(p.originalSummary.average).not.toBeNull();
    expect(p.originalSummary.minimum).not.toBeNull();
    expect(p.samples.map((s) => s.shotNumber)).toEqual([1, 2]);
  });

  it("excludes invalid numeric rows with warning", () => {
    const text = csv([OSLTT_HEADER, "1,0,0,0,2.1", "2,0,0,0,NaN", "3,0,0,0,Infinity", "4,0,0,,2.3", "5,0,0,0,2.0"]);
    const p = parseOSLTT(text);
    expect(p.samples.length).toBe(2);
    expect(p.samples.map((s) => s.shotNumber)).toEqual([1, 5]);
    expect(p.warnings.some((w) => w.includes("Invalid numeric"))).toBe(true);
  });

  it("handles duplicate Shot Numbers", () => {
    const text = csv([OSLTT_HEADER, "1,0,0,0,2.1", "1,0,0,0,2.2", "2,0,0,0,2.0"]);
    const p = parseOSLTT(text);
    expect(p.samples.length).toBe(2);
    expect(p.warnings.some((w) => w.includes("duplicate Shot"))).toBe(true);
  });

  it("preserves Shot Numbers and does not renumber", () => {
    const text = csv([OSLTT_HEADER, "157,0,0,0,2.1", "158,0,0,0,2.0", "159,0,0,0,2.2", "160,0,0,0,2.1"]);
    const p = parseOSLTT(text);
    expect(p.samples.map((s) => s.shotNumber)).toEqual([157, 158, 159, 160]);
  });

  it("reports missing columns", () => {
    const text = csv(["Shot Number,Click Time (ms)", "1,0"]);
    const p = parseOSLTT(text);
    expect(p.errors.length).toBeGreaterThan(0);
    expect(p.samples.length).toBe(0);
  });

  it("reports reordered columns", () => {
    const text = csv(["Click Time (ms),Shot Number,Processing Latency (ms),Display Latency(ms),Total System Input Lag (ms)", "0,1,0,0,2.1"]);
    const p = parseOSLTT(text);
    expect(p.errors.length).toBeGreaterThan(0);
  });

  it("handles duplicate columns", () => {
    const badHeader = "Shot Number,Click Time (ms),Click Time (ms),Display Latency(ms),Total System Input Lag (ms)";
    const text = csv([badHeader, "1,0,0,0,2.1"]);
    const p = parseOSLTT(text);
    expect(p.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("handles empty file", () => {
    const p = parseOSLTT("", "empty.csv");
    expect(p.errors.length).toBeGreaterThan(0);
    expect(p.samples.length).toBe(0);
  });

  it("handles header-only file", () => {
    const p = parseOSLTT(OSLTT_HEADER, "header.csv");
    expect(p.samples.length).toBe(0);
    expect(p.errors.length).toBe(0);
  });

  it("handles extra columns warning", () => {
    const text = csv([OSLTT_HEADER + ",Extra", "1,0,0,0,2.1,foo", "2,0,0,0,2.2,bar"]);
    const p = parseOSLTT(text);
    // Because we check column count, this should error
    expect(p.errors.length).toBeGreaterThan(0);
  });

  it("handles duplicate summary rows (last wins)", () => {
    const text = csv([OSLTT_HEADER, "1,0,0,0,2.1", "AVERAGE,0,0,0,2.1", "AVERAGE,0,0,0,2.5"]);
    const p = parseOSLTT(text);
    expect(p.warnings.some((w) => w.includes("Duplicate AVERAGE"))).toBe(true);
    expect(p.originalSummary.average!["Total System Input Lag (ms)"]).toBeCloseTo(2.5);
  });

  it("sorts samples by shotNumber deterministically", () => {
    const text = csv([OSLTT_HEADER, "3,0,0,0,2.1", "1,0,0,0,2.2", "2,0,0,0,2.0"]);
    const p = parseOSLTT(text);
    expect(p.samples.map((s) => s.shotNumber)).toEqual([1, 2, 3]);
  });

  it("handles malformed row with too few columns", () => {
    const text = csv([OSLTT_HEADER, "1,0,0", "2,0,0,0,2.1"]);
    const p = parseOSLTT(text);
    expect(p.samples.length).toBe(1);
    expect(p.warnings.some((w) => w.includes("expected 5"))).toBe(true);
  });
});
