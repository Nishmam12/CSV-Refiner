import { describe, it, expect } from "vitest";
import { parseOSLTT } from "../osltt/parser";
import { validateOriginalSummary, validateAverageTotal } from "./validation";
import { OSLTT_HEADER } from "../osltt/constants";

function csv(lines: string[]) { return lines.join("\n"); }

describe("validation", () => {
  it("MATCH when original summary matches calculated", () => {
    const text = csv([OSLTT_HEADER, "1,0,0,0,2.0", "2,0,0,0,2.0", "3,0,0,0,2.0", "AVERAGE,0,0,0,2.0", "MINIMUM,0,0,0,2.0", "MAXIMUM,0,0,0,2.0"]);
    const p = parseOSLTT(text);
    const v = validateAverageTotal(p);
    expect(v?.status).toBe("MATCH");
    expect(v?.original).toBeCloseTo(2.0);
    expect(v?.calculated).toBeCloseTo(2.0);
  });

  it("MISMATCH flagged", () => {
    const text = csv([OSLTT_HEADER, "1,0,0,0,2.0", "2,0,0,0,4.0", "AVERAGE,0,0,0,2.709", "MINIMUM,0,0,0,2.0", "MAXIMUM,0,0,0,4.0"]);
    const p = parseOSLTT(text);
    // calculated average = 3.0, original 2.709 -> mismatch
    const v = validateAverageTotal(p);
    expect(v?.status).toBe("MISMATCH");
    expect(v?.difference).not.toBe(0);
  });

  it("NO_ORIGINAL when no summary row", () => {
    const text = csv([OSLTT_HEADER, "1,0,0,0,2.0"]);
    const p = parseOSLTT(text);
    const all = validateOriginalSummary(p);
    const avg = all.find((x) => x.column === "AVERAGE / Total System Input Lag (ms)");
    expect(avg?.status).toBe("NO_ORIGINAL");
  });

  it("validates all columns separately", () => {
    const text = csv([OSLTT_HEADER, "1,1,2,3,4", "2,1,2,3,4", "AVERAGE,1,2,3,4", "MINIMUM,1,2,3,4", "MAXIMUM,1,2,3,4"]);
    const p = parseOSLTT(text);
    const all = validateOriginalSummary(p);
    // 3 summary types * 4 columns =12 entries
    expect(all.length).toBe(12);
    expect(all.every((x) => x.status === "MATCH")).toBe(true);
  });
});
