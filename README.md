# OSLTT Data Studio

Local-first latency refinement for OSLTT CSV exports — deterministic, in-browser. Drag & drop multiple OSLTT files, auto-detect outliers by population, export refined CSVs individually, as a combined single CSV, or as a batch ZIP. History of last batches is stored locally.

## Features
- **Deterministic parsing** — strict header validation, PapaParse, summary rows separated from samples
- **Outlier detection** — clustering by latency, dominant population, configurable threshold / deviation / sensitivity
- **Profiles** — localStorage-persisted (8K, Mouse Default, etc.)
- **Exports** — per-file refined CSV, **Export Combined CSV** (single file `1..N` renumbered, recomputed AVERAGE/MIN/MAX), batch ZIP + `summary.csv`
- **History** — last 20 batches in `localStorage` (`osltt:history`), with snapshot restore (`Load` per entry, `Restore last batch`)
- **Electron desktop** — static export + Electron wrapper, offline, no upload

## Quick Start
```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest 66 tests
npm run build      # next build (web)
npm run build:export  # static export to out/
```

## Desktop Build
```bash
npm run dist           # both Portable + NSIS installer
npm run dist:portable  # release/OSLTT-Data-Studio-Portable-0.1.0.exe
npm run dist:nsis      # release/OSLTT Data Studio Setup 0.1.0.exe
# unpacked for debugging
# release/win-unpacked/OSLTT Data Studio.exe
```

Outputs:
- `out/` — static export (served by Electron via http://127.0.0.1)
- `release/win-unpacked/` — unpacked Electron app
- `release/OSLTT-Data-Studio-Portable-0.1.0.exe` — portable
- `release/OSLTT Data Studio Setup 0.1.0.exe` — NSIS installer

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
| script | description |
|---|---|
| `dev` | next dev |
| `build` | next build |
| `build:export` | `ELECTRON=true next build` (output export) |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run` |
| `electron` | `electron .` (requires `out/`) |
| `electron:dev` | build+electron |
| `dist` | full installer + portable |

## Git Repo Ready
- `.gitignore` ignores `node_modules/`, `.next/`, `out/`, `release/`, caches, env, OS files
- No build artifacts committed — run `npm run dist` locally to regenerate
- Conventional `package.json` with `appId` `com.osltt.datastudio`

## Privacy
All files processed locally in browser/Electron. No upload.
