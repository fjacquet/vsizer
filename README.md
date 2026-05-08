# vsizer

> Drop your RVTools / Live Optics export, get a factual cluster utilization deck.
> 100 % client-side — your file never leaves your browser.

🌐 **Live app**: <https://fjacquet.github.io/vsizer/>

vsizer turns a VMware estate export (`.xlsx` from RVTools or Live Optics) into a
neutral, brand-free PowerPoint deck — one cluster per slide, identical figures
to the reference Python tooling, **without** the editorial commentary or
recommendations. The narrative stays with you, the speaker; the deck just
carries the numbers.

## What it does

- **Drag & drop** an RVTools `vInfo` + `vHost` workbook (Live Optics inventory
  exports also supported).
- **Parses in the browser** with SheetJS — nothing is uploaded, nothing is
  cached in `localStorage`. Refresh the page and the data is gone.
- **Aggregates per cluster**: physical GHz, consumed GHz, mean CPU%/RAM%,
  vCPU allocation, host & VM counts.
- **Previews** the deck content as a static dashboard — no drill-down, no
  filters, no editing knobs. Only interaction: tick which clusters to include
  in the export.
- **Exports** a PPTX (Midnight Executive palette, neutral title slide, one
  overview slide, one slide per cluster) via `pptxgenjs`.

## Stack

React 19 · TypeScript (strict) · Vite 8 · Tailwind v4 · Zustand 5 ·
react-i18next (FR + EN) · Zod · SheetJS (`xlsx@0.20.3` from the official
tarball, **not** the CVE-affected npm package) · pptxgenjs 4 · Biome ·
Vitest + @testing-library/react.

## Getting started

```bash
npm install            # uses the SheetJS tarball pinned in package.json
npm run dev            # http://localhost:5173/vsizer/
```

## Scripts

| Command                  | Purpose                                          |
| ------------------------ | ------------------------------------------------ |
| `npm run dev`            | Vite dev server                                  |
| `npm run build`          | `tsc -b && vite build` — production bundle       |
| `npm run preview`        | Serve the built bundle locally                   |
| `npm run typecheck`      | `tsc --noEmit` (strict, app-only)                |
| `npm run lint`           | `biome check .`                                  |
| `npm run lint:fix`       | `biome check --write .`                          |
| `npm run format`         | `biome format --write .`                         |
| `npm run test`           | `vitest` (watch)                                 |
| `npm run test:run`       | `vitest run` (CI mode)                           |
| `npm run test:coverage`  | `vitest run --coverage` (75 % gate on `engines/` and `utils/`) |

Run a single test file or pattern:

```bash
npx vitest run src/utils/format.test.ts
npx vitest run -t "physicalGhz"
```

## Architecture

```
src/
├── App.tsx                      # ErrorBoundary + Toaster shell
├── main.tsx                     # mounts <App /> + boots i18n
├── i18n/                        # react-i18next, FR + EN, 5 namespaces
│   └── locales/{en,fr}/{common,upload,dashboard,pptx,validation}.json
├── engines/                     # ⚖️  pure logic — coverage-gated (75 %)
│   ├── parser/                  # xlsx → canonical rows (RVTools + Live Optics adapters)
│   ├── aggregation/             # per-cluster + global GHz math
│   └── export/pptx/             # pptxgenjs deck builder
├── utils/                       # ⚖️  formatters, csv export, validators (coverage-gated)
├── store/datasetStore.ts        # Zustand: file, vinfo, vhost, selection, aggregates
├── hooks/                       # useDatasetUpload, useAggregations, useExport
├── components/
│   ├── layout/                  # Cockpit, Header, UploadSidebar, ClusterDashboard
│   ├── inputs/                  # FileDropzone, ManualMappingPanel, ClusterFilterPanel
│   ├── outputs/                 # GlobalKpiBar, OverviewTable, ClusterCard, …
│   └── common/                  # buttons, accordions, icons
└── types/                       # canonical row + aggregate shapes
```

Path aliases (matching `tsconfig.app.json` and `vite.config.ts`):
`@/`, `@engines/`, `@components/`, `@store/`, `@types/`, `@utils/`, `@hooks/`.

## Privacy guarantee

vsizer is a single static site served from GitHub Pages. The only network
requests are the static assets needed to load the app. Once it's loaded:

- the dropped file is read with `FileReader` into an in-memory `ArrayBuffer`,
- SheetJS parses it on the main thread,
- aggregates are computed by pure functions in `src/engines/`,
- the resulting PPTX is assembled and downloaded directly to your machine.

Nothing is uploaded, persisted, or telemetered. Open DevTools → Network and
verify if you're suspicious — that's a feature, not a bug.

## Deployment

`.github/workflows/static.yml` runs `typecheck → lint → test:run → build`
on every push to `main` and publishes `dist/` to GitHub Pages.

## License

TBD.
