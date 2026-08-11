import type { ProfileConfig } from "@/types/analysis";

export type BatchFileRecord = {
  filename: string;
  product: string;
  stage?: string | null;
  clickNumber?: string | null;
  originalCount: number;
  retained: number;
  removed: number;
  dominantMs: number | null;
  meanBefore: number;
  meanAfter: number;
};

export type BatchHistoryEntry = {
  id: string;
  createdAt: number; // epoch ms
  profileName: string;
  profileId: string;
  config: ProfileConfig;
  trigger: "export-combined" | "export-zip" | "clear" | "manual";
  files: BatchFileRecord[];
  batchGroups: { name: string; count: number }[];
  totals: {
    fileCount: number;
    totalSamples: number;
    totalRetained: number;
    totalRemoved: number;
    combinedMeanBefore: number;
    combinedMeanAfter: number;
  };
  // Optional lightweight restore snapshot — only kept for last N to avoid quota blow-up
  // Stores csvText for each file to allow one-click restore of last batch
  snapshot?: { filename: string; csvText: string; editableProduct: string }[];
};

const STORAGE_KEY = "osltt:history";
const MAX_ENTRIES = 20;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadHistory(): BatchHistoryEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BatchHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    // basic validation + sort newest first
    return parsed
      .filter((e) => e && typeof e.id === "string" && typeof e.createdAt === "number" && Array.isArray(e.files))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function saveHistory(entries: BatchHistoryEntry[]): void {
  if (!isBrowser()) return;
  try {
    // keep only MAX_ENTRIES, newest first
    const pruned = entries.slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch (e) {
    // Quota exceeded — try dropping snapshots from oldest entries then retry
    try {
      const stripped = entries.map((entry, idx) => (idx > 2 ? { ...entry, snapshot: undefined } : entry));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped.slice(0, MAX_ENTRIES)));
    } catch {
      // final fallback: keep only metadata, drop all snapshots
      try {
        const noSnapshots = entries.map((entry) => ({ ...entry, snapshot: undefined }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(noSnapshots.slice(0, MAX_ENTRIES)));
      } catch {
        // give up silently
      }
    }
  }
}

export function appendHistory(entry: BatchHistoryEntry): BatchHistoryEntry[] {
  const existing = loadHistory();
  const next = [entry, ...existing].slice(0, MAX_ENTRIES);
  saveHistory(next);
  return next;
}

export function clearHistory(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
}

export function deleteHistoryEntry(id: string): BatchHistoryEntry[] {
  const existing = loadHistory();
  const next = existing.filter((e) => e.id !== id);
  saveHistory(next);
  return next;
}

export function getLastBatch(): BatchHistoryEntry | null {
  const h = loadHistory();
  return h[0] ?? null;
}
