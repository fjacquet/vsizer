# vsizer

[![Deploy to GitHub Pages](https://github.com/fjacquet/vsizer/actions/workflows/static.yml/badge.svg?branch=main)](https://github.com/fjacquet/vsizer/actions/workflows/static.yml)
[![Live app](https://img.shields.io/badge/live-fjacquet.github.io%2Fvsizer-2563eb)](https://fjacquet.github.io/vsizer/)
[![Release](https://img.shields.io/github/v/release/fjacquet/vsizer?display_name=tag&sort=semver)](https://github.com/fjacquet/vsizer/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![React 19](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)](https://vite.dev/)
[![Tested with Vitest](https://img.shields.io/badge/tested%20with-vitest-6e9f18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Code style: Biome](https://img.shields.io/badge/code%20style-biome-60a5fa?logo=biome&logoColor=white)](https://biomejs.dev/)
[![Client-side only](https://img.shields.io/badge/processing-100%25%20client--side-22c55e)](#privacy-guarantee)
[![CodeQL](https://github.com/fjacquet/vsizer/actions/workflows/codeql.yml/badge.svg)](https://github.com/fjacquet/vsizer/actions/workflows/codeql.yml)
[![SBOM](https://img.shields.io/badge/SBOM-CycloneDX-blue)](https://github.com/fjacquet/vsizer/releases/latest)

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
  exports — classic and modern, including `.zip` bundles — also supported).
- **Parses in the browser** with SheetJS — nothing is uploaded, nothing is
  cached in `localStorage`. Refresh the page and the data is gone.
- **Aggregates per cluster**: physical GHz, consumed GHz, mean CPU%/RAM%
  (capacity-weighted, DR-aware), vCPU allocation, host & VM counts.
- **Surfaces CPU Ready (contention)** when the source supplies it (RVTools'
  `vInfo.Overall Cpu Readiness`): per-cluster mean / max / count of VMs above
  the VMware-standard 5 % warning threshold, plus a conditional top-10 annex
  slide for clusters with contended VMs. Live Optics inputs render a factual
  "non disponible" line — the workbook does not export the metric.
- **Stretched-cluster DR reservation** (CPU and RAM) when you toggle the
  "Étendu / Stretched" pill on a cluster.
- **Previews** the deck content as a static dashboard — no drill-down, no
  filters, no editing knobs. Only interaction: tick which clusters to include
  in the export.
- **Exports** a PPTX (Midnight Executive palette, neutral title slide, one
  overview slide, one slide per cluster, conditional CPU Ready annex) via
  `pptxgenjs`.

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

### Run with Docker

A hardened multi-arch image is published to GHCR with every release:

```bash
docker run --rm -p 8080:8080 ghcr.io/fjacquet/vsizer:latest
```

Open <http://localhost:8080/>. The image is built from a non-root nginx
base, ships a strict CSP (`connect-src 'self'` — third-party
connections are blocked at the browser, and the container serves only
static assets so there is no endpoint that could receive workbook
bytes), and runs entirely client-side just like the public deploy.
Tags:

- `:latest`, `:1.2`, `:1`, `:1.2.0` — semver releases
- `:edge` — built from `main` on every push
- `:sha-<short>` — pinpoint a specific commit

See [ADR-0013](docs/adr/0013-container-image-distribution.md) for the
design.

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

## Documentation

This README is intentionally thin — it gets you to the right doc.

| Doc                                                  | Audience                       | Covers                                                                  |
| ---------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| [**`docs/USER-GUIDE.md`**](docs/USER-GUIDE.md)       | end users, presales, partners  | How to use the web app, what each metric means, how to read the deck, source coverage, threshold semantics, caveats |
| [**`docs/PRD.md`**](docs/PRD.md)                     | product / engineering          | Requirements, in-scope / out-of-scope, success criteria, non-functional targets |
| [**`docs/adr/`**](docs/adr/README.md)                | engineering, AI assistants     | Architecture Decision Records (Nygard format, append-only). Read the relevant ADR **before** changing non-trivial behaviour — several encode product invariants and domain math (privacy, factual-only deck, DR reservation, DR-aware ratios, asymmetric source for CPU Ready, …) |
| [**`CHANGELOG.md`**](CHANGELOG.md)                   | everyone                       | What changed in each release (Keep a Changelog format, SemVer)          |
| [**`CONTRIBUTING.md`**](CONTRIBUTING.md)             | contributors                   | Branch / commit conventions, CI gates, how to file a PR                 |
| [**`CLAUDE.md`**](CLAUDE.md)                         | AI coding assistants           | Quick tour of layering, conventions, gotchas, MCP usage rules           |

### ADR cheat sheet

| ADR                                                                                  | Encodes                                       |
| ------------------------------------------------------------------------------------ | --------------------------------------------- |
| [0001](docs/adr/0001-client-side-only-processing.md)                                 | 100 % client-side processing (privacy hard invariant) |
| [0002](docs/adr/0002-sheetjs-via-official-tarball.md)                                | SheetJS via the official tarball, not the CVE-affected npm pkg |
| [0003](docs/adr/0003-factual-only-pptx-output.md)                                    | Factual-only PPTX (strip editorial language)  |
| [0004](docs/adr/0004-memory-only-state.md)                                           | Memory-only state (no `localStorage` of dataset rows) |
| [0005](docs/adr/0005-coverage-gated-engines-and-utils.md)                            | 75 % coverage gate scoped to `engines/` + `utils/` only |
| [0006](docs/adr/0006-dashboard-layout.md)                                            | Two-state, single-column dashboard with fixed sidebar |
| [0007](docs/adr/0007-stretched-cluster-dr-reservation.md)                            | Stretched-cluster DR reservation (50 % CPU + RAM) |
| [0008](docs/adr/0008-auto-dark-mode.md)                                              | Auto dark mode (3-state toggle), PPTX palette locked |
| [0009](docs/adr/0009-vcpu-pcpu-consolidation-ratio.md)                               | DR-aware vCPU/pCPU consolidation ratio        |
| [0010](docs/adr/0010-extended-import-formats.md)                                     | RVTools `RVTools_tab*`, modern Live Optics, `.zip` bundles |
| [0011](docs/adr/0011-dr-aware-utilization-ratios.md)                                 | DR-aware, capacity-weighted utilization ratios |
| [0012](docs/adr/0012-cpu-ready-contention-asymmetric-source.md)                      | CPU Ready (contention) from RVTools, asymmetric source |

## Security

vsizer is 100 % client-side ([ADR-0001](docs/adr/0001-client-side-only-processing.md))
and runs under a strict Content-Security-Policy on the container image
([ADR-0013](docs/adr/0013-container-image-distribution.md)).

- **SBOM:** every build produces a CycloneDX 1.6 JSON SBOM. Static
  builds attach it to GitHub Releases on `v*` tags; container builds
  embed it as an OCI attestation alongside SLSA provenance.
- **Dependency audits:** `npm audit` and `osv-scanner` gate CI at
  Moderate+ for production dependencies.
- **Static analysis:** CodeQL runs on every PR and weekly.
- **Disclosure:** see [SECURITY.md](SECURITY.md).
- **Policy:** see [ADR-0015](docs/adr/0015-security-audit-and-supply-chain-policy.md).

## License

[MIT](LICENSE) © Frédéric Jacquet
