import Papa from "papaparse";
import { OSLTT_COLUMNS, OSLTT_HEADER, SUMMARY_LABELS } from "./constants";
import type { ParsedFile, OSLTTSample } from "@/types/osltt";

function isSummaryLabel(v: string): boolean {
  const u = v.trim().toUpperCase();
  return (SUMMARY_LABELS as readonly string[]).includes(u);
}

function toSummaryKey(v: string): "average" | "minimum" | "maximum" {
  const u = v.trim().toUpperCase();
  if (u === "AVERAGE") return "average";
  if (u === "MINIMUM") return "minimum";
  return "maximum";
}

function parseFiniteNumber(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

export type ParseResult = ParsedFile;

/**
 * Deterministic OSLTT parser.
 * - Uses PapaParse (no hand-rolled CSV).
 * - Separates summary rows (AVERAGE/MINIMUM/MAXIMUM) from samples.
 * - Validates header exactly but tolerates whitespace/casing for detection.
 * - Full-row handling; invalid numeric rows are excluded with warning/provenance.
 */
export function parseOSLTT(csvText: string, filename = "unknown.csv"): ParsedFile {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!csvText || csvText.trim() === "") {
    return {
      filename,
      samples: [],
      originalSummary: { average: null, minimum: null, maximum: null },
      warnings: ["Empty file"],
      errors: ["Empty CSV"],
      rawRowCount: 0,
    };
  }

  const result = Papa.parse<string[]>(csvText.trim(), {
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  if (result.errors.length > 0) {
    for (const e of result.errors) warnings.push(`CSV parse warning: ${e.message} row ${e.row}`);
  }

  const rows = result.data as unknown as string[][];
  if (rows.length === 0) {
    return {
      filename,
      samples: [],
      originalSummary: { average: null, minimum: null, maximum: null },
      warnings,
      errors: ["No rows found"],
      rawRowCount: 0,
    };
  }

  const headerRow = rows[0].map((c) => (c ?? "").trim());

  // Validate header — strict count and order, but case/space tolerant for error message
  const normalizedHeader = headerRow.map((h) => h.replace(/\s+/g, " ").trim());
  const expectedNormalized = OSLTT_COLUMNS.map((h) => h.replace(/\s+/g, " ").trim());
  // Also check exact byte header for export fidelity warning
  const headerJoined = headerRow.join(",");
  // Use case-insensitive comparison for validation, but report exact
  const headerOk =
    normalizedHeader.length === expectedNormalized.length &&
    normalizedHeader.every((h, i) => h.toLowerCase() === expectedNormalized[i].toLowerCase());

  if (!headerOk) {
    // Check for specific issues
    if (headerRow.length !== OSLTT_COLUMNS.length) {
      errors.push(
        `Header column count mismatch: expected ${OSLTT_COLUMNS.length}, got ${headerRow.length}. Expected: ${OSLTT_HEADER}`
      );
    } else {
      const mismatches: string[] = [];
      for (let i = 0; i < expectedNormalized.length; i++) {
        if ((normalizedHeader[i] ?? "").toLowerCase() !== expectedNormalized[i].toLowerCase()) {
          mismatches.push(`col ${i + 1}: expected "${OSLTT_COLUMNS[i]}" got "${headerRow[i]}"`);
        }
      }
      if (mismatches.length) errors.push(`Header mismatch: ${mismatches.join("; ")}`);
    }
    // Still attempt to parse if column count matches
    if (headerRow.length !== OSLTT_COLUMNS.length) {
      return {
        filename,
        samples: [],
        originalSummary: { average: null, minimum: null, maximum: null },
        warnings,
        errors,
        rawRowCount: rows.length - 1,
      };
    }
  } else if (headerJoined !== OSLTT_HEADER) {
    // Header semantically correct but whitespace/casing differs — warning not error
    warnings.push(`Header formatting differs from canonical: "${headerJoined}"`);
  }

  // Detect duplicate header columns (case-insensitive)
  const lowerCounts = new Map<string, number>();
  for (const h of headerRow) {
    const k = h.trim().toLowerCase();
    lowerCounts.set(k, (lowerCounts.get(k) ?? 0) + 1);
  }
  for (const [k, v] of lowerCounts) {
    if (v > 1) errors.push(`Duplicate column: "${k}" appears ${v} times`);
  }
  if (errors.length > 0 && lowerCounts.size !== OSLTT_COLUMNS.length) {
    // already handled
  }

  const originalSummary: ParsedFile["originalSummary"] = {
    average: null,
    minimum: null,
    maximum: null,
    rawAverage: undefined,
    rawMinimum: undefined,
    rawMaximum: undefined,
  };

  const samples: OSLTTSample[] = [];
  const seenShotNumbers = new Set<number>();
  let rawRowCount = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // Skip entirely empty rows (papaparse greedy already, but guard)
    if (!row || row.every((c) => (c ?? "").trim() === "")) continue;
    rawRowCount++;

    // Pad/truncate to 5 cols
    if (row.length !== 5) {
      if (row.length < 5) {
        warnings.push(`Row ${r + 1}: expected 5 columns, got ${row.length} — treating as malformed`);
        continue;
      }
      if (row.length > 5) {
        warnings.push(`Row ${r + 1}: extra columns (${row.length}) — ignoring extras`);
      }
    }
    const cells = row.slice(0, 5).map((c) => (c ?? "").trim());
    const shotRaw = cells[0];

    if (isSummaryLabel(shotRaw)) {
      const key = toSummaryKey(shotRaw);
      // Parse summary numeric values — store for comparison; allow duplicates (last wins)
      const capKey = key === "average" ? "rawAverage" : key === "minimum" ? "rawMinimum" : "rawMaximum";
      const summaryVals: Record<string, number> = {};
      const rawVals: Record<string, string> = {};
      for (let i = 0; i < OSLTT_COLUMNS.length; i++) {
        const col = OSLTT_COLUMNS[i];
        const raw = (row[i] ?? "").trim();
        rawVals[col] = raw;
        if (i === 0) {
          summaryVals[col] = NaN; // label
        } else {
          const n = Number(raw);
          summaryVals[col] = Number.isFinite(n) ? n : NaN;
        }
      }
      // Check duplicate summary
      if (originalSummary[key] !== null) {
        warnings.push(`Duplicate ${shotRaw} row at line ${r + 1} — using last occurrence`);
      }
      originalSummary[key] = summaryVals;
      (originalSummary as unknown as Record<string, unknown>)[capKey] = rawVals;
      continue;
    }

    // Normal sample row — parse shot number
    const shotNum = Number(shotRaw);
    if (!Number.isFinite(shotNum) || !Number.isInteger(shotNum)) {
      warnings.push(`Row ${r + 1}: invalid Shot Number "${shotRaw}" — row excluded (Malformed row)`);
      continue;
    }
    if (seenShotNumbers.has(shotNum)) {
      warnings.push(`Row ${r + 1}: duplicate Shot Number ${shotNum} — row excluded (Duplicate)`);
      continue;
    }

    // Parse all 4 numeric columns — if any is non-finite, exclude whole row
    const numericCols = cells.slice(1); // 4 cols
    const nums: (number | null)[] = numericCols.map(parseFiniteNumber);
    const hasInvalid = nums.some((n) => n === null);
    if (hasInvalid) {
      const detail = numericCols.map((c, i) => `${OSLTT_COLUMNS[i + 1]}="${c}"`).join(", ");
      warnings.push(`Row ${r + 1} Shot ${shotNum}: invalid numeric value (${detail}) — row excluded (Invalid numeric value)`);
      continue;
    }

    seenShotNumbers.add(shotNum);
    samples.push({
      shotNumber: shotNum,
      clickTimeMs: nums[0]!,
      processingLatencyMs: nums[1]!,
      displayLatencyMs: nums[2]!,
      totalSystemInputLagMs: nums[3]!,
    });
  }

  // Sort samples by shotNumber for deterministic output (but parser preserves order otherwise)
  samples.sort((a, b) => a.shotNumber - b.shotNumber);

  return {
    filename,
    samples,
    originalSummary,
    warnings,
    errors,
    rawRowCount,
  };
}
