export const OSLTT_HEADER =
  "Shot Number,Click Time (ms),Processing Latency (ms),Display Latency(ms),Total System Input Lag (ms)";

export const OSLTT_COLUMNS = [
  "Shot Number",
  "Click Time (ms)",
  "Processing Latency (ms)",
  "Display Latency(ms)",
  "Total System Input Lag (ms)",
] as const;

export type OSLTTColumn = (typeof OSLTT_COLUMNS)[number];

export const SUMMARY_LABELS = ["AVERAGE", "MINIMUM", "MAXIMUM"] as const;
export type SummaryLabel = (typeof SUMMARY_LABELS)[number];
