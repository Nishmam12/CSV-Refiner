# OSLTT Data Studio

A local-first tool for processing and refining OSLTT benchmark data.

## Features

- **OSLTT CSV processing** — drag & drop multiple OSLTT CSV exports with strict header validation and deterministic parsing
- **Configurable outlier detection** — clustering by latency population with adjustable threshold, deviation, and sensitivity settings
- **Latency population analysis** — automatic dominant population identification and statistical breakdown
- **Manual sample review** — inspect, include, or exclude individual samples before export
- **Statistical recalculation** — recomputes AVERAGE, MIN, and MAX across the refined sample set
- **Refined OSLTT export** — export per-file refined CSVs, a combined single CSV (renumbered `1..N`), or a batch ZIP with `summary.csv`
- **Batch processing** — process multiple OSLTT files simultaneously with history of last 20 batches stored locally
- **Local browser processing** — runs entirely in-browser or as a desktop Electron app; no server required
- **No benchmark data uploaded** — all files are processed on your machine; nothing leaves your device

## Quick Start

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest unit tests
npm run build      # next build (web)
npm run build:export  # static export to out/
```

## Desktop Build

```bash
npm run dist           # both Portable + NSIS installer
npm run dist:portable  # release/OSLTT-Data-Studio-Portable-0.1.0.exe
npm run dist:nsis      # release/OSLTT Data Studio Setup 0.1.0.exe
```

**Outputs:**

| Path | Description |
|---|---|
| `out/` | Static export served by Electron |
| `release/win-unpacked/` | Unpacked Electron app (debug) |
| `release/OSLTT-Data-Studio-Portable-0.1.0.exe` | Portable executable |
| `release/OSLTT Data Studio Setup 0.1.0.exe` | NSIS installer |

## Project Structure

```
src/
  app/           # Next.js App Router (page.tsx, layout.tsx)
  lib/
    osltt/       # parser, constants
    outliers/    # clustering, detector, classifier
    statistics/  # stats, validation
    export/      # csvExporter
    profiles/    # profileStore (localStorage)
    history/     # historyStore (localStorage, last 20 batches)
    filename/    # parseFilename
  types/         # osltt, analysis, profile
electron/
  main.js        # static server + BrowserWindow
  preload.js
out/             # generated, gitignored
release/         # generated, gitignored
```

## Scripts

| Script | Description |
|---|---|
| `dev` | `next dev` — local dev server |
| `build` | `next build` |
| `build:export` | `ELECTRON=true next build` (static output) |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run` |
| `electron` | `electron .` (requires `out/`) |
| `electron:dev` | build + launch Electron |
| `dist` | Full installer + portable |
| `dist:portable` | Portable `.exe` only |
| `dist:nsis` | NSIS installer only |

## Privacy

All files are processed locally in the browser or Electron app. No benchmark data is ever uploaded or transmitted.
