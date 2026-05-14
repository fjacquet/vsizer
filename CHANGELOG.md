# Changelog

All notable changes to vsizer are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] — 2026-05-14

### Added

- **Container image distribution** (ADR-0013) — multi-arch (amd64/arm64)
  OCI image published to `ghcr.io/fjacquet/vsizer` from a new GitHub
  Actions workflow. Image serves the SPA from a hardened
  `nginxinc/nginx-unprivileged` base with a strict Content-Security-Policy
  (`connect-src 'self'`, no third-party connections; see ADR-0013 update
  2026-05-14) enforcing the privacy invariant (ADR-0001) at the HTTP
  layer. Tags: `:edge` on `main`, `:latest` + semver on `v*` releases.
- **Orphan-host bucketing** (ADR-0014) — RVTools / Live Optics
  workbooks where ESXi hosts have no assigned cluster now import
  successfully (#4). Each standalone host appears in the dashboard
  and PPTX as `(no cluster) <hostName>` — a separate logical entity
  per the user's intent. VMs running on those hosts are attributed
  via the new `VInfoRow.host` field (RVTools' `vInfo.Host` column,
  previously discarded). Live Optics is forward-compatible if a
  future build exposes a Host column on the VM sheet; today's
  workbooks have no per-VM host info on that side, so Live Optics
  orphan VMs are dropped as before — no regression. The
  stretched-cluster (DR) toggle is hidden for orphan rows — a
  single standalone host cannot be a 2-site stretched pair.

### Changed

- **Externalised the dark-mode FOUC script** from inline in `index.html`
  to `public/theme-init.js` so the container's strict
  `script-src 'self'` Content-Security-Policy can hold. Behavior is
  unchanged on Pages.

### Fixed

- **"Load a sample" now works inside the container image** (#2). The
  pre-release CSP shipped `connect-src 'none'`, which the browser also
  enforces against same-origin `fetch()` calls — silently blocking the
  bundled sample workbook from being loaded. Relaxed to
  `connect-src 'self'`; third-party connections remain fully blocked
  (see ADR-0013 update 2026-05-14 for the rationale).
- **Standalone-host card no longer reads as "all zero"** (#4
  follow-up).
  - Adaptive GHz precision: cluster cards now show one decimal of
    precision for sub-10-GHz values, so a 5 %-busy 5-GHz standalone
    host displays `0,2 GHz consommés sur 5 GHz` instead of
    `0 GHz consommés sur 5 GHz`. Large clusters still render at
    integer-GHz granularity (`230 GHz`).
  - `MHz par vCPU alloué` and the `Capacité réservée
    (vCPU × clock host)` tile show `—` instead of `0` when no VM
    is powered on — `vcpuAllocated === 0` is a "not applicable"
    sentinel, not a real measurement (same convention as
    `fmtRatio`).

## [1.1.0] — 2026-05-10

### Added

- **CPU Ready contention surface** (ADR-0012) — RVTools' per-VM
  `vInfo.Overall Cpu Readiness` is now parsed, aggregated per cluster
  (mean / max / count of VMs above the configurable warning threshold,
  default 5 %), and surfaced on each cluster card and slide as a
  single factual line with VMware-standard color thresholds (<5 %
  green / 5–10 % orange / >10 % red). For clusters with at least one
  VM above the warning threshold, a conditional annex slide listing
  the top 10 VMs is appended right after the cluster slide. Live
  Optics inputs render `"CPU Ready : non disponible (source : Live
  Optics)"` — the workbook does not expose the metric; the source
  label is wired from the actual `SourceFormat` so an RVTools file
  whose readiness column is missing reads as `(source : RVTools)`
  rather than mis-attributing the absence. New shared module
  `engines/aggregation/contention.ts` centralizes thresholds (warning
  5 %, serious 10 %); new helper `contentionColor` mirrors the
  existing `usageColor`. Top-N defaults to 10. Estate-level rollup
  `vmsAboveReadinessWarning` is wired through `GlobalSummary` but
  intentionally not surfaced on the dashboard or title slide in this
  iteration (V2).

### Engineering

- **Strict CPU Ready cell parser** — the new
  `parseReadinessCell` helper rejects Excel error sentinels
  (`#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#NUM!`, `#ERROR!`),
  manual placeholders (`N/A`, `NA`, `-`, `--`), and non-finite
  numbers as `null` rather than collapsing them to `0` like the
  shared `readNumber` helper. Inverts ADR-0012's "absence ≠ healthy"
  contract that the generic helper would have broken (a corrupted
  column would have read as "all VMs healthy, no annex slide").
- **265 tests green** (was 227 in 1.0.1), coverage 98.36 % on
  `engines/**` + `utils/**` (gate 75 %). New tests cover parser
  strictness (Excel sentinels, locale variants, non-finite),
  aggregator readiness statistics (no reporters / partial reporters /
  explicit zero / strict count above warning / powered-off
  excluded), top-N helper (sort desc, custom topN, skip
  unreported), schema bounds [0, 200] for readiness, the new
  `contentionColor` palette mapping, the deck builder smoke for
  mixed RVTools-hot / RVTools-healthy / Live Optics datasets, and
  both `fmtPercentValue` (UI) / `fmtPercentOneDecimal` (PPTX)
  format helpers including locale variants.

## [1.0.1] — 2026-05-09

### Fixed

- **Empty-state "Charger un exemple" / "Load a sample" button** — the
  landing page advertised a sample loader but `public/samples/` only ever
  shipped a `.gitkeep`, so clicking the button silently failed. A 40-VM /
  9-host / 3-cluster synthetic RVTools workbook (~26 KB) is now generated
  and committed at `public/samples/rvtools-sample.xlsx`. Hostnames, cluster
  names, and VM names are fabricated — no real estate data.

### Added

- **`scripts/generate-sample.mjs`** — Node ESM generator for the sample
  workbook (uses the same SheetJS dependency as the runtime). Re-run with
  `npm run generate-sample`.

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
