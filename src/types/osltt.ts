export type OSLTTSample = {
  shotNumber: number;
  clickTimeMs: number;
  processingLatencyMs: number;
  displayLatencyMs: number;
  totalSystemInputLagMs: number;
};

export type OriginalSummary = {
  average: Record<string, number> | null; // keyed by column header, but typed as sample-like
  minimum: Record<string, number> | null;
  maximum: Record<string, number> | null;
  // raw string values for display
  rawAverage?: Record<string, string>;
  rawMinimum?: Record<string, string>;
  rawMaximum?: Record<string, string>;
};

export type ParsedFile = {
  filename: string;
  samples: OSLTTSample[];
  originalSummary: OriginalSummary;
  warnings: string[];
  errors: string[];
  rawRowCount: number;
};

export type ColumnStats = {
  count: number;
  mean: number;
  min: number;
  max: number;
  median: number;
  stdDev: number;
};

export type AllColumnStats = {
  clickTime: ColumnStats;
  processingLatency: ColumnStats;
  displayLatency: ColumnStats;
  totalSystemInputLag: ColumnStats;
};

export type ValidationComparison = {
  column: string;
  original: number | null;
  calculated: number;
  difference: number | null;
  status: "MATCH" | "MISMATCH" | "NO_ORIGINAL";
};
