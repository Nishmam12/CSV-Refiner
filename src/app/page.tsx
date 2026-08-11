"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { parseOSLTT } from "@/lib/osltt/parser";
import { computeAllStats } from "@/lib/statistics/stats";
import { exportOSLTT } from "@/lib/export/csvExporter";
import { validateAverageTotal } from "@/lib/statistics/validation";
import { parseFilename } from "@/lib/filename/parseFilename";
import { detectOutliers } from "@/lib/outliers/detector";
import {
  loadProfiles,
  loadProfilesAsync,
  saveProfiles,
  getDefaultProfile,
  duplicateProfile,
  deleteProfile,
  setDefaultProfile as setDefaultInStore,
} from "@/lib/profiles/profileStore";
import {
  loadHistory,
  loadHistoryAsync,
  appendHistory,
  clearHistory as clearHistoryStore,
  deleteHistoryEntry as deleteHistoryEntryStore,
} from "@/lib/history/historyStore";
import type { BatchHistoryEntry } from "@/lib/history/historyStore";
import type { Profile } from "@/types/profile";
import type { ManualOverride, ProfileConfig } from "@/types/analysis";
import type { ParsedFile } from "@/types/osltt";

type FileState = {
  id: string;
  filename: string;
  csvText: string;
  parsed: ParsedFile;
  meta: ReturnType<typeof parseFilename>;
  editableProduct: string;
};

function formatNum(n: number): string {
  return n.toFixed(3);
}

function histogramData(values: number[], bins = 12) {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor(((v - min) / range) * bins));
    counts[idx]++;
  }
  const maxCount = Math.max(...counts) || 1;
  return counts.map((c, i) => ({
    bin: i,
    count: c,
    heightPct: (c / maxCount) * 100,
    rangeLabel: `${(min + (range / bins) * i).toFixed(1)}–${(min + (range / bins) * (i + 1)).toFixed(1)}`,
  }));
}

export default function Home() {
  const [files, setFiles] = useState<FileState[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("");
  const [overridesByFile, setOverridesByFile] = useState<Map<string, Map<number, ManualOverride>>>(new Map());
  const [processingIdx, setProcessingIdx] = useState<number>(-1);
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [historyEntries, setHistoryEntries] = useState<BatchHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(true);

  useEffect(() => {
    const p = loadProfiles();
    setProfiles(p);
    setActiveProfileId(getDefaultProfile(p).id);
    setHistoryEntries(loadHistory());
    // In Electron, hydrate from file-backed store (fixes random-port localStorage loss)
    loadProfilesAsync()
      .then((p2) => {
        // Only update if file gave us different data (e.g. survived a port change)
        if (JSON.stringify(p2) !== JSON.stringify(p)) {
          setProfiles(p2);
          setActiveProfileId((cur) => (p2.some((x) => x.id === cur) ? cur : getDefaultProfile(p2).id));
        }
      })
      .catch(() => {});
    loadHistoryAsync()
      .then((h) => {
        if (h.length > 0) setHistoryEntries(h);
      })
      .catch(() => {});
  }, []);

  const activeProfile = useMemo(() => profiles.find((p) => p.id === activeProfileId) ?? profiles[0], [profiles, activeProfileId]);
  const config: ProfileConfig | null = activeProfile
    ? { thresholdPct: activeProfile.thresholdPct, minDeviationMs: activeProfile.minDeviationMs, sensitivity: activeProfile.sensitivity, handling: activeProfile.handling }
    : null;

  const batchGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of files) {
      const key = f.editableProduct || f.meta.product || "Unidentified";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [files]);

  const lastBatch = historyEntries[0] ?? null;

  const saveCurrentBatchToHistory = useCallback(
    (trigger: BatchHistoryEntry["trigger"]) => {
      if (files.length === 0 || !config || !activeProfile) return;
      const fileRecords = files.map((file) => {
        const overrides = overridesByFile.get(file.id) ?? new Map();
        const det = detectOutliers(file.parsed.samples, config, overrides);
        const before = computeAllStats(file.parsed.samples);
        const after = computeAllStats(det.filtered);
        const dom = det.populations.find((p) => p.isDominant)?.central ?? null;
        return {
          filename: file.filename,
          product: file.editableProduct || file.meta.product || "Unidentified",
          stage: file.meta.stage ?? null,
          clickNumber: file.meta.clickNumber ?? null,
          originalCount: file.parsed.samples.length,
          retained: det.filtered.length,
          removed: det.removed.length,
          dominantMs: dom,
          meanBefore: before.totalSystemInputLag.mean,
          meanAfter: after.totalSystemInputLag.mean,
        };
      });
      const totals = fileRecords.reduce(
        (acc, r) => {
          acc.totalSamples += r.originalCount;
          acc.totalRetained += r.retained;
          acc.totalRemoved += r.removed;
          return acc;
        },
        { totalSamples: 0, totalRetained: 0, totalRemoved: 0 }
      );
      const combinedBefore =
        fileRecords.length > 0 ? fileRecords.reduce((s, r) => s + r.meanBefore, 0) / fileRecords.length : 0;
      const combinedAfter =
        fileRecords.length > 0 ? fileRecords.reduce((s, r) => s + r.meanAfter, 0) / fileRecords.length : 0;
      const entry: BatchHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: Date.now(),
        profileName: activeProfile.name,
        profileId: activeProfile.id,
        config: { ...config },
        trigger,
        files: fileRecords,
        batchGroups: [...batchGroups],
        totals: {
          fileCount: files.length,
          totalSamples: totals.totalSamples,
          totalRetained: totals.totalRetained,
          totalRemoved: totals.totalRemoved,
          combinedMeanBefore: combinedBefore,
          combinedMeanAfter: combinedAfter,
        },
        snapshot: files.map((f) => ({ filename: f.filename, csvText: f.csvText, editableProduct: f.editableProduct })),
      };
      const next = appendHistory(entry);
      setHistoryEntries(next);
    },
    [files, config, activeProfile, batchGroups, overridesByFile]
  );

  const restoreEntry = useCallback((entry: BatchHistoryEntry) => {
    if (!entry.snapshot || entry.snapshot.length === 0) return;
    const restored: FileState[] = entry.snapshot.map((s, i) => {
      const parsed = parseOSLTT(s.csvText, s.filename);
      const meta = parseFilename(s.filename);
      return {
        id: `${s.filename}-restore-${Date.now()}-${i}`,
        filename: s.filename,
        csvText: s.csvText,
        parsed,
        meta,
        editableProduct: s.editableProduct || meta.product || "",
      };
    });
    setFiles(restored);
    setOverridesByFile(new Map());
    // scroll to top to show restored batch
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const restoreLastBatch = useCallback(() => {
    if (!lastBatch?.snapshot || lastBatch.snapshot.length === 0) return;
    restoreEntry(lastBatch);
  }, [lastBatch, restoreEntry]);

  const onFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return;
    const arr = Array.from(fileList);
    const next: FileState[] = [];
    for (let i = 0; i < arr.length; i++) {
      setProcessingIdx(i);
      const f = arr[i];
      const text = await f.text();
      const parsed = parseOSLTT(text, f.name);
      const meta = parseFilename(f.name);
      next.push({ id: `${f.name}-${Date.now()}-${i}`, filename: f.name, csvText: text, parsed, meta, editableProduct: meta.product ?? "" });
      await new Promise((r) => setTimeout(r, 0));
    }
    setProcessingIdx(-1);
    setFiles((prev) => [...prev, ...next]);
  }, []);

  const toggleOverride = (fileId: string, shotNumber: number, keep: boolean) => {
    setOverridesByFile((prev) => {
      const next = new Map(prev);
      const m = new Map(next.get(fileId) ?? []);
      if (m.has(shotNumber) && m.get(shotNumber)!.keep === keep) {
        m.delete(shotNumber);
      } else {
        m.set(shotNumber, { shotNumber, keep, reason: "Manual exclusion" });
      }
      next.set(fileId, m);
      return next;
    });
  };

  const updateProfile = (patch: Partial<Profile>) => {
    if (!activeProfile) return;
    const updated = { ...activeProfile, ...patch } as Profile;
    const next = profiles.map((p) => (p.id === updated.id ? updated : p));
    setProfiles(next);
    saveProfiles(next);
  };

  const handleCreateProfile = () => {
    if (!newProfileName.trim()) return;
    const base = activeProfile ?? profiles[0];
    const newP: Profile = {
      id: `custom-${Date.now()}`,
      name: newProfileName.trim(),
      thresholdPct: base.thresholdPct,
      minDeviationMs: base.minDeviationMs,
      sensitivity: base.sensitivity,
      handling: base.handling,
      isDefault: false,
      createdAt: Date.now(),
    };
    const next = [...profiles, newP];
    setProfiles(next);
    saveProfiles(next);
    setActiveProfileId(newP.id);
    setNewProfileName("");
    setShowNewProfile(false);
  };

  const handleDuplicate = () => {
    if (!activeProfile) return;
    const next = duplicateProfile(profiles, activeProfile.id);
    setProfiles(next);
    saveProfiles(next);
  };
  const handleDelete = () => {
    if (!activeProfile) return;
    if (profiles.length <= 1) return;
    const next = deleteProfile(profiles, activeProfile.id);
    setProfiles(next);
    saveProfiles(next);
    setActiveProfileId(next.find((p) => p.isDefault)?.id ?? next[0].id);
  };
  const handleSetDefault = () => {
    if (!activeProfile) return;
    const next = setDefaultInStore(profiles, activeProfile.id);
    setProfiles(next);
    saveProfiles(next);
  };

  const handleExportAllZip = async () => {
    if (files.length === 0 || !config) return;
    saveCurrentBatchToHistory("export-zip");
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const file of files) {
      const overrides = overridesByFile.get(file.id) ?? new Map();
      const detection = detectOutliers(file.parsed.samples, config, overrides);
      const statsAfter = computeAllStats(detection.filtered);
      const csv = exportOSLTT(detection.filtered, statsAfter);
      const outName = file.filename.replace(/\.csv$/i, "") + "-REFINED-OSLTT.csv";
      zip.file(outName, csv);
    }
    // summary csv
    const summaryLines = ["filename,original_count,retained,removed,dominant_ms,mean_before,mean_after"];
    for (const file of files) {
      const overrides = overridesByFile.get(file.id) ?? new Map();
      const det = detectOutliers(file.parsed.samples, config, overrides);
      const before = computeAllStats(file.parsed.samples);
      const after = computeAllStats(det.filtered);
      const dom = det.populations.find((p) => p.isDominant)?.central ?? 0;
      summaryLines.push(
        `${file.filename},${file.parsed.samples.length},${det.filtered.length},${det.removed.length},${dom.toFixed(3)},${before.totalSystemInputLag.mean.toFixed(3)},${after.totalSystemInputLag.mean.toFixed(3)}`
      );
    }
    zip.file("summary.csv", summaryLines.join("\n"));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "osltt-batch-export.zip";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCombinedCsv = () => {
    if (files.length === 0 || !config) return;
    saveCurrentBatchToHistory("export-combined");
    // Collect all retained samples across files in current display order
    const allFiltered = files.flatMap((file) => {
      const overrides = overridesByFile.get(file.id) ?? new Map();
      const detection = detectOutliers(file.parsed.samples, config, overrides);
      return detection.filtered;
    });
    if (allFiltered.length === 0) return;
    // Renumber sequentially 1..N to avoid duplicate Shot Numbers (which parser would deduplicate on re-import)
    // Preserves file order then shot order within each file; keeps CSV valid.
    const renumbered = allFiltered.map((s, idx) => ({ ...s, shotNumber: idx + 1 }));
    const statsCombined = computeAllStats(renumbered);
    const csv = exportOSLTT(renumbered, statsCombined);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Name reflects products if single product, else generic
    const productPrefix = batchGroups.length === 1 ? batchGroups[0].name.replace(/\s+/g, "-") : "combined";
    a.download = `${productPrefix}-COMBINED-REFINED-OSLTT.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-500 text-sm font-bold text-zinc-950">OS</div>
            <div>
              <div className="flex items-baseline gap-2">
                <h1 className="text-sm font-semibold tracking-widest text-zinc-100">OSLTT DATA STUDIO</h1>
                <a href="https://notsonabil.com" target="_blank" rel="noopener noreferrer" className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium tracking-widest text-cyan-400 hover:bg-zinc-700 hover:text-cyan-300 transition-colors">by notsonabil</a>
              </div>
              <p className="text-[11px] text-zinc-500">Local-first latency refinement — deterministic, in-browser · crafted by <a href="https://notsonabil.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400/70 hover:text-cyan-400 hover:underline">notsonabil</a></p>
            </div>
          </div>
          <div className="max-w-[420px] text-right text-[11px] text-zinc-500">Your files are processed locally in your browser. They are not uploaded to a server.</div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] grid-cols-12 gap-6 px-6 py-6">
        <div className="col-span-12 space-y-4 lg:col-span-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFiles(e.dataTransfer.files);
            }}
            className="rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-900/50 p-6 text-center"
          >
            <p className="text-sm font-medium text-zinc-200">Drop OSLTT CSV files here</p>
            <p className="mt-1 text-xs text-zinc-500">or click to browse — multi-file supported</p>
            <label className="mt-3 inline-flex cursor-pointer rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700 focus-within:ring-2 focus-within:ring-cyan-500">
              Browse files
              <input type="file" multiple accept=".csv" className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </label>
            {processingIdx >= 0 && <p className="mt-2 text-xs text-cyan-400">Processing {processingIdx + 1} …</p>}
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-xs font-semibold tracking-widest text-zinc-400">PROFILES</h2>
            <select
              value={activeProfileId}
              onChange={(e) => setActiveProfileId(e.target.value)}
              className="mt-2 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              aria-label="Select profile"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isDefault ? "★" : ""}
                </option>
              ))}
            </select>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button onClick={() => setShowNewProfile((v) => !v)} className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-1 focus:ring-cyan-500">
                New
              </button>
              <button onClick={handleDuplicate} className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-1 focus:ring-cyan-500">
                Duplicate
              </button>
              <button onClick={handleDelete} className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-1 focus:ring-cyan-500">
                Delete
              </button>
              <button onClick={handleSetDefault} className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-1 focus:ring-cyan-500">
                Set default
              </button>
            </div>
            {showNewProfile && (
              <div className="mt-3 flex gap-2">
                <input
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="Profile name"
                  className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
                <button onClick={handleCreateProfile} className="rounded bg-cyan-600 px-2 py-1 text-xs font-medium text-white hover:bg-cyan-500">
                  Create
                </button>
              </div>
            )}
            <div className="mt-3 text-xs text-zinc-500">Profiles persist in localStorage. No data leaves the browser.</div>
          </div>

          {activeProfile && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="text-xs font-semibold tracking-widest text-zinc-400">OUTLIER DETECTION</h2>
              <div className="mt-3 space-y-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-300">Recurring population threshold (%)</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    step={1}
                    value={activeProfile.thresholdPct}
                    onChange={(e) => updateProfile({ thresholdPct: Number(e.target.value) })}
                    className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-300">Minimum deviation from dominant (ms)</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={activeProfile.minDeviationMs}
                    onChange={(e) => updateProfile({ minDeviationMs: Number(e.target.value) })}
                    className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </label>
                <fieldset>
                  <legend className="text-xs text-zinc-300">Sensitivity</legend>
                  <div className="mt-1 flex gap-3 text-xs">
                    {(["conservative", "balanced", "aggressive"] as const).map((s) => (
                      <label key={s} className="flex cursor-pointer items-center gap-1">
                        <input type="radio" name="sensitivity" checked={activeProfile.sensitivity === s} onChange={() => updateProfile({ sensitivity: s })} className="accent-cyan-500" />
                        <span className="capitalize text-zinc-300">{s}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-xs text-zinc-300">Automatic handling</legend>
                  <div className="mt-1 flex gap-3 text-xs">
                    <label className="flex cursor-pointer items-center gap-1">
                      <input type="radio" name="handling" checked={activeProfile.handling === "flag"} onChange={() => updateProfile({ handling: "flag" })} className="accent-cyan-500" />
                      <span className="text-zinc-300">Flag for review</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-1">
                      <input type="radio" name="handling" checked={activeProfile.handling === "remove"} onChange={() => updateProfile({ handling: "remove" })} className="accent-cyan-500" />
                      <span className="text-zinc-300">Remove automatically</span>
                    </label>
                  </div>
                </fieldset>
              </div>
            </div>
          )}

          {files.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-400">
              <div className="font-medium text-zinc-300">{files.length} file(s) detected</div>
              <div className="mt-2 space-y-1">
                {batchGroups.map((g) => (
                  <div key={g.name} className="flex justify-between">
                    <span className="truncate pr-2">{g.name}</span>
                    <span className="font-mono text-zinc-300">{g.count} files</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={handleExportCombinedCsv} className="rounded bg-cyan-600 px-2 py-1 text-xs font-medium text-white hover:bg-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-400">
                  Export Combined CSV
                </button>
                <button onClick={handleExportAllZip} className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-1 focus:ring-cyan-400">
                  Export batch ZIP
                </button>
                <button
                  onClick={() => {
                    saveCurrentBatchToHistory("clear");
                    setFiles([]);
                    setOverridesByFile(new Map());
                  }}
                  className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
                >
                  Clear all
                </button>
                <button
                  onClick={() => saveCurrentBatchToHistory("manual")}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                  title="Save current batch to history without exporting"
                >
                  Save to History
                </button>
              </div>
              <div className="mt-2 text-[11px] leading-4 text-zinc-500">Combined CSV merges all refined samples into one file (renumbered 1..N, recalculated AVERAGE/MIN/MAX). ZIP keeps individual files. Exports auto-save to History.</div>
              {processingIdx >= 0 && <div className="mt-2 font-mono text-cyan-400">Processing {processingIdx + 1} / {files.length}</div>}
            </div>
          )}

          {/* HISTORY — memory of last batches */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold tracking-widest text-zinc-400">HISTORY — LAST BATCHES</h2>
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-700"
              >
                {showHistory ? "Hide" : "Show"}
              </button>
            </div>
            {!showHistory ? (
              <div className="mt-2 text-xs text-zinc-500">{historyEntries.length} batch(es) in memory · {lastBatch ? `Last: ${new Date(lastBatch.createdAt).toLocaleString()}` : "No history yet"}</div>
            ) : historyEntries.length === 0 ? (
              <div className="mt-3 rounded border border-dashed border-zinc-700 bg-zinc-950 p-3 text-center text-xs text-zinc-500">
                No batches yet. Exports and Clear automatically save here.
                <div className="mt-1 text-[11px] text-zinc-600">Persists in localStorage. No data leaves the browser.</div>
              </div>
            ) : (
              <>
                {/* Last batch highlight */}
                {lastBatch && (
                  <div className="mt-3 rounded border border-cyan-900/50 bg-cyan-950/20 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-cyan-300">Last batch — {new Date(lastBatch.createdAt).toLocaleString()}</div>
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">{lastBatch.trigger}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-300">
                      {lastBatch.totals.fileCount} files · {lastBatch.totals.totalRetained}/{lastBatch.totals.totalSamples} retained · {lastBatch.totals.totalRemoved} removed
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-400">
                      Profile: {lastBatch.profileName} · Groups: {lastBatch.batchGroups.map((g) => `${g.name} (${g.count})`).join(", ")}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-zinc-400">
                      Mean: {lastBatch.totals.combinedMeanBefore.toFixed(2)} → {lastBatch.totals.combinedMeanAfter.toFixed(2)} ms
                    </div>
                    {lastBatch.snapshot && lastBatch.snapshot.length > 0 && (
                      <button
                        onClick={restoreLastBatch}
                        className="mt-2 rounded bg-cyan-600 px-2 py-1 text-xs font-medium text-white hover:bg-cyan-500"
                        title={files.length > 0 ? "Replace current files with last batch" : "Restore last batch"}
                      >
                        {files.length > 0 ? "Load last batch (replace)" : "Restore last batch"}
                      </button>
                    )}
                    <div className="mt-2 max-h-24 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[11px] leading-4 text-zinc-400">
                      {lastBatch.files.map((f) => (
                        <div key={f.filename} className="flex justify-between gap-2">
                          <span className="truncate">{f.filename}</span>
                          <span className="shrink-0">{f.retained}/{f.originalCount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full history list */}
                <div className="mt-3 max-h-[280px] space-y-2 overflow-auto pr-1">
                  {historyEntries.map((h) => (
                    <div key={h.id} className="rounded border border-zinc-800 bg-zinc-950 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-zinc-300">{new Date(h.createdAt).toLocaleString()}</div>
                          <div className="text-[11px] text-zinc-500">
                            {h.totals.fileCount} files · {h.totals.totalRetained}/{h.totals.totalSamples} kept · {h.trigger} · {h.profileName}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {h.batchGroups.map((g) => (
                              <span key={g.name} className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-400">
                                {g.name}: {g.count}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {h.snapshot && h.snapshot.length > 0 ? (
                            <button
                              onClick={() => restoreEntry(h)}
                              className="rounded bg-cyan-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                              title="Load this batch (replaces current files)"
                            >
                              Load
                            </button>
                          ) : (
                            <span className="px-2 py-1 text-[10px] text-zinc-600" title="No snapshot — storage limit">
                              No data
                            </span>
                          )}
                          <button
                            onClick={() => {
                              const next = deleteHistoryEntryStore(h.id);
                              setHistoryEntries(next);
                            }}
                            className="rounded bg-zinc-800 px-1.5 py-1 text-[11px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                            aria-label={`Remove history ${h.id}`}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-zinc-500">
                        {h.files.slice(0, 3).map((f) => f.filename).join(" · ")}
                        {h.files.length > 3 ? ` +${h.files.length - 3} more` : ""}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      clearHistoryStore();
                      setHistoryEntries([]);
                    }}
                    className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                  >
                    Clear history
                  </button>
                  <div className="flex-1 text-right text-[11px] leading-4 text-zinc-600">Stored locally ({historyEntries.length}/{20})</div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="col-span-12 space-y-6 lg:col-span-9">
          {files.length === 0 && (
            <>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-12 text-center text-sm text-zinc-500">
                No files yet. Drop OSLTT CSV exports to begin.
                <div className="mt-2 text-xs text-zinc-600">Header must be: {`Shot Number,Click Time (ms),Processing Latency (ms),Display Latency(ms),Total System Input Lag (ms)`}</div>
                {lastBatch && lastBatch.snapshot && lastBatch.snapshot.length > 0 && (
                  <div className="mx-auto mt-4 max-w-md rounded border border-cyan-900/50 bg-cyan-950/20 p-3 text-left">
                    <div className="text-xs font-medium text-cyan-300">History memory — last batch available</div>
                    <div className="mt-1 text-xs text-zinc-400">{lastBatch.totals.fileCount} files · {new Date(lastBatch.createdAt).toLocaleString()} · {lastBatch.profileName}</div>
                    <button onClick={restoreLastBatch} className="mt-2 rounded bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500">
                      Restore last batch ({lastBatch.totals.fileCount} files)
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {files.map((file) => {
            const overrides = overridesByFile.get(file.id) ?? new Map();
            const cfg = config!;
            const detection = config ? detectOutliers(file.parsed.samples, cfg, overrides) : null;
            const statsBefore = computeAllStats(file.parsed.samples);
            const statsAfter = detection ? computeAllStats(detection.filtered) : statsBefore;
            const validation = validateAverageTotal(file.parsed);
            const histBefore = histogramData(file.parsed.samples.map((s) => s.totalSystemInputLagMs), 16);
            const histAfter = detection ? histogramData(detection.filtered.map((s) => s.totalSystemInputLagMs), 16) : [];
            return (
              <div key={file.id} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800 bg-zinc-900 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-100">{file.filename}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <label className="flex items-center gap-1 text-zinc-500">
                        Product:
                        <input
                          value={file.editableProduct}
                          onChange={(e) => setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, editableProduct: e.target.value } : f)))}
                          className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                          placeholder="Unidentified"
                          aria-label="Edit product"
                        />
                      </label>
                      <span className="text-zinc-600">· Stage: {file.meta.stage ?? "—"}</span>
                      <span className="text-zinc-600">· Click: {file.meta.clickNumber ?? "—"}</span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      Samples: {file.parsed.samples.length} · Raw rows: {file.parsed.rawRowCount} · Warnings: {file.parsed.warnings.length} · Errors: {file.parsed.errors.length}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (!detection) return;
                        const csv = exportOSLTT(detection.filtered, statsAfter);
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = file.filename.replace(/\.csv$/i, "") + "-REFINED-OSLTT.csv";
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="rounded bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    >
                      Export Refined CSV
                    </button>
                    <button onClick={() => setFiles((prev) => prev.filter((f) => f.id !== file.id))} className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700">
                      Remove
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-4 p-4">
                  <div className="col-span-12 rounded border border-zinc-800 bg-zinc-950 p-3 lg:col-span-5">
                    <h3 className="text-xs font-semibold tracking-widest text-zinc-400">ORIGINAL vs CALCULATED</h3>
                    {validation ? (
                      validation.status === "MATCH" ? (
                        <div className="mt-2 font-mono text-xs leading-5">
                          <div className="text-zinc-300">OSLTT original average: {formatNum(validation.original!)}</div>
                          <div className="text-zinc-300">Calculated average: {formatNum(validation.calculated)}</div>
                          <div className="text-emerald-400">Status: ✓ MATCH</div>
                        </div>
                      ) : validation.status === "MISMATCH" ? (
                        <div className="mt-2 font-mono text-xs leading-5">
                          <div className="text-amber-400">⚠ OSLTT summary mismatch</div>
                          <div className="text-zinc-300">Original OSLTT average: {formatNum(validation.original!)}</div>
                          <div className="text-zinc-300">Calculated average: {formatNum(validation.calculated)}</div>
                          <div className="text-amber-400">Difference: {formatNum(validation.difference!)}</div>
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-zinc-500">No original summary row found — stats calculated from samples.</div>
                      )
                    ) : (
                      <div className="mt-2 text-xs text-zinc-500">No validation data.</div>
                    )}
                    {file.parsed.warnings.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-medium text-amber-400">Warnings</div>
                        <ul className="mt-1 list-inside list-disc text-xs text-zinc-400">
                          {file.parsed.warnings.slice(0, 5).map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                          {file.parsed.warnings.length > 5 && <li>+{file.parsed.warnings.length - 5} more</li>}
                        </ul>
                      </div>
                    )}
                    {file.parsed.errors.length > 0 && <div className="mt-2 text-xs text-red-400">{file.parsed.errors.join("; ")}</div>}
                  </div>

                  <div className="col-span-12 rounded border border-zinc-800 bg-zinc-950 p-3 lg:col-span-7">
                    <h3 className="text-xs font-semibold tracking-widest text-zinc-400">BEFORE / AFTER</h3>
                    <div className="mt-2 grid grid-cols-2 gap-4 font-mono text-xs">
                      <div>
                        <div className="text-zinc-500">BEFORE</div>
                        <div className="text-zinc-200">Samples: {file.parsed.samples.length}</div>
                        <div className="text-zinc-300">Mean: {formatNum(statsBefore.totalSystemInputLag.mean)} ms</div>
                        <div className="text-zinc-300">Min: {formatNum(statsBefore.totalSystemInputLag.min)} ms</div>
                        <div className="text-zinc-300">Max: {formatNum(statsBefore.totalSystemInputLag.max)} ms</div>
                      </div>
                      <div>
                        <div className="text-zinc-500">AFTER</div>
                        <div className="text-zinc-200">Samples: {detection ? detection.filtered.length : statsBefore.totalSystemInputLag.count}</div>
                        <div className="text-zinc-300">Mean: {formatNum(statsAfter.totalSystemInputLag.mean)} ms</div>
                        <div className="text-zinc-300">Min: {formatNum(statsAfter.totalSystemInputLag.min)} ms</div>
                        <div className="text-zinc-300">Max: {formatNum(statsAfter.totalSystemInputLag.max)} ms</div>
                        {detection && <div className="mt-1 text-cyan-400">{detection.removed.length} samples removed</div>}
                      </div>
                    </div>
                    {detection && (
                      <div className="mt-2 text-xs text-zinc-500">
                        Original: {file.parsed.samples.length} · Retained: {detection.filtered.length} · Removed: {detection.removed.length} · Populations: {detection.populations.length} · Dominant:{" "}
                        {detection.populations.find((p) => p.isDominant)?.central.toFixed(2) ?? "—"} ms
                      </div>
                    )}
                  </div>
                </div>

                {/* Distribution histograms */}
                <div className="grid grid-cols-12 gap-4 px-4 pb-3">
                  <div className="col-span-12 lg:col-span-6">
                    <h3 className="text-xs font-semibold tracking-widest text-zinc-400">DISTRIBUTION — BEFORE</h3>
                    <div className="mt-2 flex h-[80px] items-end gap-[2px] rounded border border-zinc-800 bg-zinc-950 p-2">
                      {histBefore.map((b) => (
                        <div key={b.bin} title={`${b.rangeLabel}: ${b.count}`} className="flex-1 rounded-sm bg-zinc-600" style={{ height: `${Math.max(4, b.heightPct)}%` }} />
                      ))}
                    </div>
                  </div>
                  <div className="col-span-12 lg:col-span-6">
                    <h3 className="text-xs font-semibold tracking-widest text-zinc-400">DISTRIBUTION — AFTER</h3>
                    <div className="mt-2 flex h-[80px] items-end gap-[2px] rounded border border-zinc-800 bg-zinc-950 p-2">
                      {histAfter.length ? (
                        histAfter.map((b) => <div key={b.bin} title={`${b.rangeLabel}: ${b.count}`} className="flex-1 rounded-sm bg-cyan-600" style={{ height: `${Math.max(4, b.heightPct)}%` }} />)
                      ) : (
                        <div className="text-xs text-zinc-600">No data</div>
                      )}
                    </div>
                  </div>
                </div>

                {detection && detection.populations.length > 0 && (
                  <div className="px-4 pb-3">
                    <h3 className="text-xs font-semibold tracking-widest text-zinc-400">POPULATIONS</h3>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-500">
                            <th className="px-2 py-1 text-left">ID</th>
                            <th className="px-2 py-1 text-left">Central</th>
                            <th className="px-2 py-1 text-left">Count</th>
                            <th className="px-2 py-1 text-left">%</th>
                            <th className="px-2 py-1 text-left">Spread</th>
                            <th className="px-2 py-1 text-left">Deviation</th>
                            <th className="px-2 py-1 text-left">Decision</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detection.populations.map((p) => {
                            const dec = detection.decisions.find((d) => d.populationId === p.id);
                            const kind = dec?.kind ?? "valid";
                            return (
                              <tr key={p.id} className={`border-b border-zinc-800/50 ${p.isDominant ? "bg-cyan-950/30" : ""}`}>
                                <td className="px-2 py-1 font-mono text-zinc-300">
                                  {p.id} {p.isDominant ? "(dominant)" : ""}
                                </td>
                                <td className="px-2 py-1 font-mono text-zinc-200">{formatNum(p.central)} ms</td>
                                <td className="px-2 py-1 font-mono text-zinc-300">{p.count}</td>
                                <td className="px-2 py-1 font-mono text-zinc-300">{p.percentage.toFixed(1)}%</td>
                                <td className="px-2 py-1 font-mono text-zinc-400">{formatNum(p.spread)} ms</td>
                                <td className="px-2 py-1 font-mono text-zinc-400">{formatNum(p.deviationFromDominant)} ms</td>
                                <td className="px-2 py-1">
                                  <span className={kind === "valid" ? "text-emerald-400" : kind === "review" ? "text-amber-400" : "text-red-400"}>{kind}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {detection && detection.decisions.length > 0 && (
                  <div className="px-4 pb-4">
                    <h3 className="text-xs font-semibold tracking-widest text-zinc-400">REVIEW — FLAGGED SAMPLES</h3>
                    <div className="mt-2 max-h-[320px] overflow-auto rounded border border-zinc-800">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-zinc-950">
                          <tr className="border-b border-zinc-800 text-zinc-500">
                            <th className="px-2 py-1.5 text-left">Shot</th>
                            <th className="px-2 py-1.5 text-left">Latency</th>
                            <th className="px-2 py-1.5 text-left">Frequency</th>
                            <th className="px-2 py-1.5 text-left">Deviation</th>
                            <th className="px-2 py-1.5 text-left">Decision</th>
                            <th className="px-2 py-1.5 text-left">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detection.decisions
                            .filter((d) => d.kind !== "valid" || overrides.has(d.shotNumber))
                            .map((d) => {
                              const ov = overrides.get(d.shotNumber);
                              const willExclude = ov ? !ov.keep : d.autoShouldExclude;
                              const displayDecision = ov ? (ov.keep ? "KEEP (manual)" : "REMOVE (manual)") : willExclude ? "REMOVE" : "KEEP";
                              return (
                                <tr key={d.shotNumber} className="border-b border-zinc-800/50 hover:bg-zinc-800/40">
                                  <td className="px-2 py-1 font-mono text-zinc-300">{d.shotNumber}</td>
                                  <td className="px-2 py-1 font-mono text-zinc-200">{formatNum(d.latency)} ms</td>
                                  <td className="px-2 py-1 font-mono text-zinc-400">{d.frequencyPct.toFixed(1)}%</td>
                                  <td className="px-2 py-1 font-mono text-zinc-400">+{formatNum(d.deviationMs)} ms</td>
                                  <td className="px-2 py-1">
                                    <span className={d.kind === "review" ? "text-amber-400" : d.kind === "strong-outlier" ? "text-red-400" : "text-zinc-400"}>{d.kind}</span>{" "}
                                    <span className="text-[11px] text-zinc-500">{displayDecision}</span>
                                  </td>
                                  <td className="flex gap-1 px-2 py-1">
                                    <button
                                      onClick={() => toggleOverride(file.id, d.shotNumber, true)}
                                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${ov?.keep ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"} focus:outline-none focus:ring-1 focus:ring-cyan-500`}
                                      aria-label={`Keep shot ${d.shotNumber}`}
                                    >
                                      Keep
                                    </button>
                                    <button
                                      onClick={() => toggleOverride(file.id, d.shotNumber, false)}
                                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${ov && !ov.keep ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"} focus:outline-none focus:ring-1 focus:ring-cyan-500`}
                                      aria-label={`Remove shot ${d.shotNumber}`}
                                    >
                                      Remove
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          {detection.decisions.filter((d) => d.kind !== "valid").length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-zinc-500">
                                No flagged samples — all populations meet the recurring threshold.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {detection && (
                  <div className="px-4 pb-4">
                    <h3 className="text-xs font-semibold tracking-widest text-zinc-400">TIMELINE (Shot vs Latency)</h3>
                    <div className="mt-2 h-[120px] w-full overflow-hidden rounded border border-zinc-800 bg-zinc-950 p-2">
                      <div className="flex h-full w-full items-end gap-[1px]">
                        {(() => {
                          const all = file.parsed.samples;
                          if (all.length === 0) return null;
                          const maxL = Math.max(...all.map((s) => s.totalSystemInputLagMs));
                          const minL = Math.min(...all.map((s) => s.totalSystemInputLagMs));
                          const range = maxL - minL || 1;
                          const removedSet = new Set(detection.removed.map((s) => s.shotNumber));
                          return all.map((s) => {
                            const h = ((s.totalSystemInputLagMs - minL) / range) * 100;
                            const isRemoved = removedSet.has(s.shotNumber);
                            return (
                              <div
                                key={s.shotNumber}
                                title={`Shot ${s.shotNumber}: ${formatNum(s.totalSystemInputLagMs)} ms ${isRemoved ? "(removed)" : ""}`}
                                className={`flex-1 rounded-sm ${isRemoved ? "bg-red-500/80" : "bg-cyan-500/80"}`}
                                style={{ height: `${Math.max(4, h)}%` }}
                              />
                            );
                          });
                        })()}
                      </div>
                    </div>
                    <div className="mt-1 flex gap-4 text-[11px] text-zinc-500">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-sm bg-cyan-500/80" /> retained
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-sm bg-red-500/80" /> removed
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      <footer className="border-t border-zinc-800 bg-zinc-950 py-4">
        <div className="mx-auto flex max-w-[1600px] items-center justify-center gap-2 px-6 text-xs text-zinc-500">
          <span>© {new Date().getFullYear()} Crafted with precision by</span>
          <a href="https://notsonabil.com" target="_blank" rel="noopener noreferrer" className="font-semibold tracking-widest text-cyan-400 hover:text-cyan-300 hover:underline">notsonabil</a>
          <span className="text-zinc-600">·</span>
          <span className="text-[11px] text-zinc-600">OSLTT Data Studio</span>
        </div>
      </footer>

      {/* Floating watermark — clickable to notsonabil.com, opens externally via Electron shell */}
      <a href="https://notsonabil.com" target="_blank" rel="noopener noreferrer" className="fixed bottom-3 right-3 z-50 select-none rounded bg-zinc-900/80 px-2 py-1 text-[10px] font-medium tracking-widest text-zinc-500 backdrop-blur border border-zinc-800/50 hover:bg-zinc-800 hover:text-cyan-400 hover:border-zinc-700 transition-colors">notsonabil</a>
    </div>
  );
}
