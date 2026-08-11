import type { HandlingMode, Sensitivity } from "./analysis";

export type Profile = {
  id: string;
  name: string;
  thresholdPct: number;
  minDeviationMs: number;
  sensitivity: Sensitivity;
  handling: HandlingMode;
  isDefault: boolean;
  createdAt: number;
};
