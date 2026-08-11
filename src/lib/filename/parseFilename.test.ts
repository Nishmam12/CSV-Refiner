import { describe, it, expect } from "vitest";
import { parseFilename } from "./parseFilename";

describe("parseFilename", () => {
  it("parses ATK example", () => {
    const m = parseFilename("ATK zero extreme wireless - Mic -CLICK-001-PROCESSED-OSLTT.csv");
    expect(m.product).toBe("ATK zero extreme wireless");
    expect(m.stage).toBe("PROCESSED");
    expect(m.clickNumber).toBe("CLICK-001");
  });
  it("parses dk678 example", () => {
    const m = parseFilename("dk678_tap-CLICK-001-REFINED-OSLTT.csv");
    expect(m.product).toContain("dk678");
    expect(m.stage).toBe("REFINED");
  });
  it("handles unicode", () => {
    const m = parseFilename("Mysz_测试-CLICK-002-PROCESSED-OSLTT.csv");
    expect(m.product).toBeDefined();
  });
  it("handles extremely long filename", () => {
    const long = "A".repeat(200) + "-CLICK-001-PROCESSED-OSLTT.csv";
    const m = parseFilename(long);
    expect(m.clickNumber).toBe("CLICK-001");
  });
});
