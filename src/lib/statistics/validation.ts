import type { ParsedFile, ValidationComparison } from "@/types/osltt";
import { computeAllStats, round3 } from "./stats";
import { OSLTT_COLUMNS } from "../osltt/constants";

function getColumnValue(stats: ReturnType<typeof computeAllStats>, col: string, field: "mean" | "min" | "max"): number {
  if (col === "Click Time (ms)") return stats.clickTime[field];
  if (col === "Processing Latency (ms)") return stats.processingLatency[field];
  if (col === "Display Latency(ms)") return stats.displayLatency[field];
  if (col === "Total System Input Lag (ms)") return stats.totalSystemInputLag[field];
  return 0;
}

export function validateOriginalSummary(parsed: ParsedFile): ValidationComparison[] {
  const stats = computeAllStats(parsed.samples);
  const out: ValidationComparison[] = [];

  const summaryMap: Record<string, Record<string, number> | null> = {
    AVERAGE: parsed.originalSummary.average,
    MINIMUM: parsed.originalSummary.minimum,
    MAXIMUM: parsed.originalSummary.maximum,
  };
  const fieldMap: Record<string, "mean" | "min" | "max"> = {
    AVERAGE: "mean",
    MINIMUM: "min",
    MAXIMUM: "max",
  };

  // Spec shows comparison for average; we do it for all summary types + primary column (Total System Input Lag)
  // But cover all columns for completeness
  for (const label of ["AVERAGE", "MINIMUM", "MAXIMUM"] as const) {
    const orig = summaryMap[label];
    const field = fieldMap[label];
    for (const col of OSLTT_COLUMNS.slice(1)) {
      const calculated = getColumnValue(stats, col, field);
      const originalRaw = orig ? (orig[col] as number) : null;
      const original = originalRaw !== null && Number.isFinite(originalRaw as number) ? (originalRaw as number) : null;
      if (original === null || !Number.isFinite(original)) {
        out.push({ column: `${label} / ${col}`, original: null, calculated: round3(calculated), difference: null, status: "NO_ORIGINAL" });
        continue;
      }
      const diff = round3(calculated) - round3(original);
      const isMatch = Math.abs(diff) < 0.0005; // within rounding epsilon
      out.push({
        column: `${label} / ${col}`,
        original: round3(original),
        calculated: round3(calculated),
        difference: isMatch ? 0 : round3(diff),
        status: isMatch ? "MATCH" : "MISMATCH",
      });
    }
  }
  return out;
}

/** Focused check for Total System Input Lag average — as shown in spec example */
export function validateAverageTotal(parsed: ParsedFile): ValidationComparison | null {
  const all = validateOriginalSummary(parsed);
  return all.find((v) => v.column === "AVERAGE / Total System Input Lag (ms)") ?? null;
}
