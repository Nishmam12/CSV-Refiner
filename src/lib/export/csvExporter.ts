import { OSLTT_HEADER } from "../osltt/constants";
import type { OSLTTSample } from "@/types/osltt";
import { format3 } from "../statistics/stats";
import type { AllColumnStats } from "@/types/osltt";

/**
 * Deterministic OSLTT exporter.
 * - Header exactly OSLTT_HEADER
 * - Rows sorted by shotNumber ascending
 * - 3-decimal formatting at boundary
 * - Summary rows (AVERAGE/MIN/MX) recalculated from retained samples, never copied
 * - Uses \n line ending consistently for byte-identical guarantee
 */
export function exportOSLTT(samples: OSLTTSample[], stats: AllColumnStats): string {
  const lines: string[] = [];
  lines.push(OSLTT_HEADER);
  const sorted = [...samples].sort((a, b) => a.shotNumber - b.shotNumber);
  for (const s of sorted) {
    lines.push(
      [
        String(s.shotNumber),
        format3(s.clickTimeMs),
        format3(s.processingLatencyMs),
        format3(s.displayLatencyMs),
        format3(s.totalSystemInputLagMs),
      ].join(",")
    );
  }
  // Summary rows
  lines.push(["AVERAGE", format3(stats.clickTime.mean), format3(stats.processingLatency.mean), format3(stats.displayLatency.mean), format3(stats.totalSystemInputLag.mean)].join(","));
  lines.push(["MINIMUM", format3(stats.clickTime.min), format3(stats.processingLatency.min), format3(stats.displayLatency.min), format3(stats.totalSystemInputLag.min)].join(","));
  lines.push(["MAXIMUM", format3(stats.clickTime.max), format3(stats.processingLatency.max), format3(stats.displayLatency.max), format3(stats.totalSystemInputLag.max)].join(","));
  return lines.join("\n") + "\n";
}
