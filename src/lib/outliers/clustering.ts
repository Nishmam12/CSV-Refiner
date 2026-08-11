import type { OSLTTSample } from "@/types/osltt";
import type { Population } from "@/types/analysis";

/**
 * 1D sorted-gap clustering for latency values.
 * Groups noisy float latencies into populations.
 * Deterministic: stable sort, fixed epsilon logic.
 */
export function clusterByLatency(samples: OSLTTSample[], epsilonMs: number | null = null): Population[] {
  if (samples.length === 0) return [];
  if (samples.length === 1) {
    const s = samples[0];
    return [
      {
        id: 0,
        count: 1,
        percentage: 100,
        central: s.totalSystemInputLagMs,
        spread: 0,
        deviationFromDominant: 0,
        isDominant: true,
        shotNumbers: [s.shotNumber],
        minLatency: s.totalSystemInputLagMs,
        maxLatency: s.totalSystemInputLagMs,
      },
    ];
  }

  // Adaptive epsilon if not provided
  let eps = epsilonMs;
  if (eps == null) {
    // Use median gap * 4 clamped to [0.3, 1.0]
    const sortedVals = [...samples].map((s) => s.totalSystemInputLagMs).sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < sortedVals.length; i++) gaps.push(Math.abs(sortedVals[i] - sortedVals[i - 1]));
    gaps.sort((a, b) => a - b);
    const medianGap = gaps[Math.floor(gaps.length / 2)] ?? 0.2;
    eps = Math.min(1.0, Math.max(0.3, medianGap * 4 + 0.1));
    // For very tight clusters (all identical), medianGap=0 -> eps=0.1 -> clamp to 0.3 handles, but ensure small epsilon still groups identical
    if (!Number.isFinite(eps) || eps <= 0) eps = 0.3;
  }

  // Sort by latency ascending, stable by shotNumber
  const sorted = [...samples].sort((a, b) => {
    const d = a.totalSystemInputLagMs - b.totalSystemInputLagMs;
    if (d !== 0) return d;
    return a.shotNumber - b.shotNumber;
  });

  const clusters: OSLTTSample[][] = [];
  let cur: OSLTTSample[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = Math.abs(sorted[i].totalSystemInputLagMs - sorted[i - 1].totalSystemInputLagMs);
    if (gap > eps!) {
      clusters.push(cur);
      cur = [sorted[i]];
    } else {
      cur.push(sorted[i]);
    }
  }
  clusters.push(cur);

  // Build Population metrics
  // Find dominant (largest count)
  let dominantCentral = 0;
  let maxCount = -1;
  let dominantIdx = 0;
  const pops: Population[] = clusters.map((cl, idx) => {
    const vals = cl.map((s) => s.totalSystemInputLagMs).sort((a, b) => a - b);
    const count = cl.length;
    const median = vals.length % 2 === 1 ? vals[Math.floor(vals.length / 2)] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
    const minL = vals[0];
    const maxL = vals[vals.length - 1];
    const pop: Population = {
      id: idx,
      count,
      percentage: (count / samples.length) * 100,
      central: median,
      spread: maxL - minL,
      deviationFromDominant: 0, // fill after dominant known
      isDominant: false,
      shotNumbers: cl.map((s) => s.shotNumber).sort((a, b) => a - b),
      minLatency: minL,
      maxLatency: maxL,
    };
    if (count > maxCount) {
      maxCount = count;
      dominantIdx = idx;
      dominantCentral = median;
    }
    return pop;
  });

  for (let i = 0; i < pops.length; i++) {
    pops[i].deviationFromDominant = Math.abs(pops[i].central - dominantCentral);
    pops[i].isDominant = i === dominantIdx;
  }

  // Sort populations by central ascending for deterministic order
  pops.sort((a, b) => a.central - b.central);
  // Reassign ids after sort to keep id deterministic with order
  pops.forEach((p, i) => (p.id = i));
  // Re-find dominant after sort (isDominant already set correctly, but keep)
  return pops;
}
