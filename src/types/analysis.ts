export type Population = {
  id: number;
  count: number;
  percentage: number;
  central: number; // median latency
  spread: number; // max-min
  deviationFromDominant: number;
  isDominant: boolean;
  // sample shotNumbers belonging to this population (for mapping)
  shotNumbers: number[];
  // representative latency range
  minLatency: number;
  maxLatency: number;
};

export type Sensitivity = "conservative" | "balanced" | "aggressive";
export type HandlingMode = "flag" | "remove";

export type ExclusionReason =
  | "Statistical outlier"
  | "Rare deviation"
  | "Manual exclusion"
  | "Invalid numeric value"
  | "Malformed row"
  | "Duplicate";

export type AutoDecision = "auto-excluded" | "auto-retained";
export type DecisionKind = "valid" | "review" | "strong-outlier";

export type ClassifierDecision = {
  shotNumber: number;
  latency: number;
  populationId: number;
  frequencyPct: number;
  deviationMs: number;
  kind: DecisionKind;
  autoShouldExclude: boolean;
  reason: ExclusionReason;
};

export type ManualOverride = {
  shotNumber: number;
  keep: boolean; // true = retain, false = exclude
  reason: ExclusionReason;
};

export type ProfileConfig = {
  thresholdPct: number; // default 10
  minDeviationMs: number; // default 2.0
  sensitivity: Sensitivity;
  handling: HandlingMode;
};
