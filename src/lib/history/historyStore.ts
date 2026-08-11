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
const FILE_STORE_KEY = "history";
const MAX_ENTRIES = 20;

type DesktopBridge = {
  isDesktop?: boolean;
  storeLoad?: (name: string) => Promise<string | null>;
  storeSave?: (name: string, data: string) => Promise<boolean>;
  storeClear?: (name: string) => Promise<boolean>;
};

function getDesktop(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { oslttDesktop?: DesktopBridge };
  return w.oslttDesktop ?? null;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function mirrorToFile(entries: BatchHistoryEntry[]): void {
  const d = getDesktop();
  if (!d?.storeSave) return;
  try {
    const payload = JSON.stringify(entries.slice(0, MAX_ENTRIES));
    // fire-and-forget; don't block UI, ignore errors
    void d.storeSave(FILE_STORE_KEY, payload).catch(() => {});
  } catch {}
}

function parseEntries(raw: string | null): BatchHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as BatchHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.id === "string" && typeof e.createdAt === "number" && Array.isArray(e.files))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function loadHistory(): BatchHistoryEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return parseEntries(raw);
  } catch {
    return [];
  }
}

export async function loadHistoryAsync(): Promise<BatchHistoryEntry[]> {
  const local = loadHistory();
  const d = getDesktop();
  if (!d?.storeLoad) return local;
  try {
    const fileRaw = await d.storeLoad(FILE_STORE_KEY);
    const fileEntries = parseEntries(fileRaw);
    if (fileEntries.length === 0) {
      // nothing in file — mirror local to file if we have data
      if (local.length > 0) mirrorToFile(local);
      return local;
    }
    if (local.length === 0) {
      // local empty (e.g. first launch after fixing random-port bug) — hydrate from file
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fileEntries.slice(0, MAX_ENTRIES)));
      } catch {}
      return fileEntries;
    }
    // both have data — merge fileEntries that are missing locally (by id), keep newest first
    const ids = new Set(local.map((e) => e.id));
    const missing = fileEntries.filter((e) => !ids.has(e.id));
    if (missing.length > 0) {
      const merged = [...local, ...missing].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ENTRIES);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {}
      mirrorToFile(merged);
      return merged;
    }
    // local is superset — ensure file is updated
    if (local.length > fileEntries.length) mirrorToFile(local);
    return local;
  } catch {
    return local;
  }
}

export function saveHistory(entries: BatchHistoryEntry[]): void {
  if (!isBrowser()) return;
  const persist = (payload: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, payload);
      mirrorToFile(JSON.parse(payload) as BatchHistoryEntry[]);
    } catch {}
  };
  try {
    // keep only MAX_ENTRIES, newest first
    const pruned = entries.slice(0, MAX_ENTRIES);
    const payload = JSON.stringify(pruned);
    localStorage.setItem(STORAGE_KEY, payload);
    mirrorToFile(pruned);
  } catch (e) {
    // Quota exceeded — try dropping snapshots from oldest entries then retry
    try {
      const stripped = entries.map((entry, idx) => (idx > 2 ? { ...entry, snapshot: undefined } : entry));
      const payload = JSON.stringify(stripped.slice(0, MAX_ENTRIES));
      localStorage.setItem(STORAGE_KEY, payload);
      mirrorToFile(stripped.slice(0, MAX_ENTRIES));
    } catch {
      // final fallback: keep only metadata, drop all snapshots
      try {
        const noSnapshots = entries.map((entry) => ({ ...entry, snapshot: undefined }));
        const payload = JSON.stringify(noSnapshots.slice(0, MAX_ENTRIES));
        localStorage.setItem(STORAGE_KEY, payload);
        mirrorToFile(noSnapshots.slice(0, MAX_ENTRIES));
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
  const d = getDesktop();
  if (d?.storeClear) void d.storeClear(FILE_STORE_KEY).catch(() => {});
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
