import type { OSLTTSample } from "@/types/osltt";
import type { ClassifierDecision, ManualOverride, ProfileConfig } from "@/types/analysis";
import { clusterByLatency } from "./clustering";
import { classifyPopulations } from "./classifier";
import type { Population } from "@/types/analysis";

export type DetectionResult = {
  populations: Population[];
  decisions: ClassifierDecision[];
  filtered: OSLTTSample[];
  removed: OSLTTSample[];
};

export function detectOutliers(
  samples: OSLTTSample[],
  config: ProfileConfig,
  manualOverrides: Map<number, ManualOverride> = new Map(),
  epsilonMs: number | null = null
): DetectionResult {
  if (samples.length === 0) return { populations: [], decisions: [], filtered: [], removed: [] };

  const populations = clusterByLatency(samples, epsilonMs);
  const popByShot = new Map<number, number>();
  // Build reverse index: shotNumber -> popId
  for (const pop of populations) {
    for (const sn of pop.shotNumbers) popByShot.set(sn, pop.id);
  }

  const popDecisions = classifyPopulations(populations, config);
  const popById = new Map(populations.map((p) => [p.id, p]));

  const decisions: ClassifierDecision[] = [];
  const sampleByShot = new Map(samples.map((s) => [s.shotNumber, s]));

  for (const s of samples) {
    const popId = popByShot.get(s.shotNumber)!;
    const pop = popById.get(popId)!;
    const pd = popDecisions.get(popId)!;
    decisions.push({
      shotNumber: s.shotNumber,
      latency: s.totalSystemInputLagMs,
      populationId: popId,
      frequencyPct: pop.percentage,
      deviationMs: pop.deviationFromDominant,
      kind: pd.kind,
      autoShouldExclude: pd.autoShouldExclude,
      reason: pd.reason,
    });
  }

  // Apply manual overrides: they persist and are not reverted by classifier
  const filtered: OSLTTSample[] = [];
  const removed: OSLTTSample[] = [];

  for (const s of samples) {
    const dec = decisions.find((d) => d.shotNumber === s.shotNumber)!;
    const override = manualOverrides.get(s.shotNumber);
    const shouldExclude = override ? !override.keep : dec.autoShouldExclude;
    if (shouldExclude) removed.push(s);
    else filtered.push(s);
  }

  // Deterministic order
  decisions.sort((a, b) => a.shotNumber - b.shotNumber);
  filtered.sort((a, b) => a.shotNumber - b.shotNumber);
  removed.sort((a, b) => a.shotNumber - b.shotNumber);

  return { populations, decisions, filtered, removed };
}
