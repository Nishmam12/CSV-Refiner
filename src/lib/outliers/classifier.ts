import type { Population, ProfileConfig, ClassifierDecision, DecisionKind, ExclusionReason, Sensitivity } from "@/types/analysis";

const SENSITIVITY_MARGIN: Record<Sensitivity, number> = {
  conservative: 2.0,
  balanced: 1.0,
  aggressive: 0.5,
};

export function classifyPopulations(
  populations: Population[],
  config: ProfileConfig
): Map<number, { kind: DecisionKind; autoShouldExclude: boolean; reason: ExclusionReason }> {
  const result = new Map<number, { kind: DecisionKind; autoShouldExclude: boolean; reason: ExclusionReason }>();
  if (populations.length === 0) return result;

  const threshold = config.thresholdPct;
  const margin = SENSITIVITY_MARGIN[config.sensitivity];
  const minDeviation = config.minDeviationMs;
  const handling = config.handling;

  for (const pop of populations) {
    // Dominant always valid
    if (pop.isDominant) {
      result.set(pop.id, { kind: "valid", autoShouldExclude: false, reason: "Statistical outlier" });
      continue;
    }

    // If deviation is small, it's not an outlier regardless of frequency
    if (pop.deviationFromDominant < minDeviation) {
      result.set(pop.id, { kind: "valid", autoShouldExclude: false, reason: "Statistical outlier" });
      continue;
    }

    const pct = pop.percentage;

    let kind: DecisionKind;
    let autoShouldExclude: boolean;

    if (pct >= threshold) {
      kind = "valid";
      autoShouldExclude = false;
    } else if (pct >= threshold - margin) {
      kind = "review";
      // review never auto-excludes regardless of handling; flagged for manual
      autoShouldExclude = false;
    } else {
      kind = "strong-outlier";
      autoShouldExclude = handling === "remove";
    }

    const reason: ExclusionReason = kind === "strong-outlier" ? "Rare deviation" : "Statistical outlier";
    result.set(pop.id, { kind, autoShouldExclude, reason });
  }

  // Small dataset guard: if total samples < 10, never strong-outlier unless extreme deviation > 10ms
  const total = populations.reduce((sum, p) => sum + p.count, 0);
  if (total < 10) {
    for (const pop of populations) {
      if (pop.isDominant) continue;
      const cur = result.get(pop.id)!;
      if (cur.kind === "strong-outlier" && pop.deviationFromDominant < 10) {
        result.set(pop.id, { kind: "review", autoShouldExclude: false, reason: "Statistical outlier" });
      }
    }
  }

  return result;
}

export function classifySamples(
  populations: Population[],
  config: ProfileConfig,
  sampleToPop: Map<number, number> // shotNumber -> popId
): ClassifierDecision[] {
  const popDecisions = classifyPopulations(populations, config);
  const popById = new Map(populations.map((p) => [p.id, p]));
  const out: ClassifierDecision[] = [];

  for (const [shotNumber, popId] of sampleToPop.entries()) {
    const pop = popById.get(popId)!;
    const dec = popDecisions.get(popId)!;
    // Find latency for this shot (approx via population central if needed, but we have map)
    // We need latency value — look up from pop's range? Better pass actual sample map, but for now use central deviation
    // The caller will provide latency separately; we store frequency/deviation from population
    out.push({
      shotNumber,
      latency: pop.central, // placeholder, caller overrides with actual sample latency
      populationId: popId,
      frequencyPct: pop.percentage,
      deviationMs: pop.deviationFromDominant,
      kind: dec.kind,
      autoShouldExclude: dec.autoShouldExclude,
      reason: dec.reason,
    });
  }
  return out;
}
