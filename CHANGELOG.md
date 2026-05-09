# Changelog

All notable changes to vsizer are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-05-09

First public release. The pipeline is feature-complete for the original
"factual deck from an RVTools / Live Optics export, 100 % in the browser"
goal, and every layer is exercised by tests.

### Added

- **Parser** (`engines/parser/`) — RVTools and Live Optics workbooks ingested
  via SheetJS, source auto-detected, columns normalized to canonical names,
  and Zod-validated at the trust boundary.
- **Aggregation** (`engines/aggregation/`) — per-cluster physical/consumed
  GHz, mean CPU%/RAM%, vCPU allocation, host & VM counts; estate-wide
  rollups; vInfo/vHost merge; MHz↔GHz helper.
- **Stretched-cluster DR reservation** (ADR-0007) — N/2 hosts of CPU and
  RAM headroom subtracted from available capacity for stretched clusters.
- **vCPU/pCPU consolidation ratio** (ADR-0009) — DR-aware, computed against
  post-reservation pCPU.
- **PPTX export** (`engines/export/pptx/`) — `pptxgenjs` deck builder: title
  slide, overview slide, one slide per selected cluster. Factual-only copy
  (ADR-0003); Midnight Executive palette locked regardless of dashboard
  theme (ADR-0008).
- **Dashboard** — two-state, single-column layout with fixed sidebar
  (ADR-0006). Cluster filter panel for export selection. No drill-down,
  no filters beyond inclusion checkboxes.
- **Auto dark mode** — three-state toggle (light / dark / system), FOUC-safe
  bootstrap script in `index.html`, `useTheme()` at runtime (ADR-0008).
- **i18n** — react-i18next with FR + EN across five namespaces (`common`,
  `upload`, `dashboard`, `pptx`, `validation`).
- **Privacy guarantee** — memory-only state (ADR-0004), no telemetry, no
  workbook bytes leaving the client (ADR-0001). Single static site served
  from GitHub Pages.

### Engineering

- React 19, TypeScript strict (`noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`, `erasableSyntaxOnly`), Vite 8, Tailwind v4,
  Zustand 5, Zod 4.
- SheetJS pinned to the official tarball (ADR-0002) — the npm package is
  CVE-affected.
- Biome 2 for lint + format. Vitest 4 for tests; coverage gated at 75 % on
  `engines/**` and `utils/**` (ADR-0005).
- CI on `actions/checkout@v6`, `actions/setup-node@v6` (Node 24 LTS),
  `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`,
  `actions/deploy-pages@v5`. Pipeline: `typecheck → lint → test:run → build`,
  artifact published to GitHub Pages on push to `main`.
