import type { AllColumnStats, ColumnStats, OSLTTSample } from "@/types/osltt";

function meanValue(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}

function minValue(arr: number[]): number {
  if (arr.length === 0) return 0;
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i];
  return m;
}

function maxValue(arr: number[]): number {
  if (arr.length === 0) return 0;
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}

function medianValue(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDevValue(arr: number[], meanVal?: number): number {
  if (arr.length === 0) return 0;
  const m = meanVal ?? meanValue(arr);
  let sumSq = 0;
  for (const v of arr) sumSq += (v - m) * (v - m);
  return Math.sqrt(sumSq / arr.length);
}

export function computeStatsForColumn(values: number[]): ColumnStats {
  if (values.length === 0) return { count: 0, mean: 0, min: 0, max: 0, median: 0, stdDev: 0 };
  const mean = meanValue(values);
  return {
    count: values.length,
    mean,
    min: minValue(values),
    max: maxValue(values),
    median: medianValue(values),
    stdDev: stdDevValue(values, mean),
  };
}

export function computeAllStats(samples: OSLTTSample[]): AllColumnStats {
  const click = samples.map((s) => s.clickTimeMs);
  const proc = samples.map((s) => s.processingLatencyMs);
  const disp = samples.map((s) => s.displayLatencyMs);
  const total = samples.map((s) => s.totalSystemInputLagMs);
  return {
    clickTime: computeStatsForColumn(click),
    processingLatency: computeStatsForColumn(proc),
    displayLatency: computeStatsForColumn(disp),
    totalSystemInputLag: computeStatsForColumn(total),
  };
}

/** percentile via linear interpolation, p in [0,100] */
export function percentileValue(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (p <= 0) return sortedAsc[0];
  if (p >= 100) return sortedAsc[sortedAsc.length - 1];
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

/** Round only at export/display boundary to 3 decimals */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function format3(n: number): string {
  return n.toFixed(3);
}
