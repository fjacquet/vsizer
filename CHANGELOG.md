# Changelog

All notable changes to vsizer are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.8.0] — 2026-05-16

### Security

- **Removed unused curl/libcurl from the container runtime image**
  (ADR-0019). The upstream nginx-unprivileged Alpine base ships
  `curl` as a DNS-SD convenience vsizer never uses (the healthcheck
  uses `wget`; nginx core does not link libcurl). `apk del curl
  libcurl` in the runtime stage purges 8 packages and eliminates all
  7 curl/libcurl Trivy advisories at the root rather than waiving
  them — independent of Alpine's patch cadence. Also shrinks the
  image attack surface.

## [1.7.0] — 2026-05-16

### Added

- **Installable PWA + offline app-shell** (ADR-0018). vsizer now ships
  a web app manifest (full icon set: SVG + 192/512 PNG + maskable +
  iOS apple-touch) and a Workbox service worker via `vite-plugin-pwa`
  that precaches only static app-shell assets — hashed JS/CSS,
  `index.html`, icons, and the anonymized sample workbook — so the app
  installs and runs fully offline after first load. No `runtimeCaching`
  is configured: uploaded workbooks and derived state are never cached
  or intercepted, so privacy invariants ADR-0001 / ADR-0004 are
  preserved. Service-worker updates prompt to reload via a toast
  (`registerType: 'prompt'`) rather than force-reloading, so an
  in-memory dataset is never silently destroyed. The SW is disabled in
  the dev server. Base path is derived from Vite's resolved `base`, so
  both the GitHub Pages (`/vsizer/`) and container (`/`) builds are
  correct.

## [1.6.0] — 2026-05-14

### Added

- **Multi-file import** (ADR-0017, issue #7). The dropzone now accepts
  N workbooks in a single drop or click-to-browse. Each file is parsed
  independently through the existing pipeline (RVTools, Live Optics
  classic + modern, `.zip` bundles), and one bad file in a batch
  doesn't abort the others. Cluster names that appear in more than
  one file's host rows are disambiguated as `<name> (<filename>)`
  for every contributing file; names that appear in exactly one file
  are left untouched. Mixed RVTools + Live Optics in the same batch
  is allowed — the existing per-row nullable CPU Ready field
  (ADR-0012) handles the asymmetry. Imported workbooks are surfaced
  beneath the dropzone as a chip list (filename + source format + row
  counts). The PPTX header label reads the single filename for
  one-file imports or `vsizer estate (N files)` for multi-file ones.
  Privacy invariants from ADR-0001 / ADR-0004 are preserved: bytes
  drop after parse, nothing persists, nothing leaves the browser.

### Changed

- `datasetStore` shape: `file: File | null` is replaced by
  `sources: SourceFile[]` carrying per-file display metadata. The
  raw `File` is no longer retained — parsing happens upstream and
  the metadata is what the UI needs. `setDataset` is renamed
  `setMergedDataset`. The store's `parseErrors` entries now carry a
  `file` field so per-file row errors stay attributable across
  multi-source imports.

## [1.5.1] — 2026-05-14

### Fixed

- **`package.json` version bump folded in.** The v1.5.0 release commit
  picked up `CHANGELOG.md` + `package-lock.json` but lost
  `package.json` from staging due to a linter race, so the v1.5.0 tag
  shipped with `package.json` reporting `1.4.0`. v1.5.1 is otherwise
  identical to v1.5.0 — no code change, no Trivy/CI behaviour change,
  no runtime impact (vsizer doesn't surface `package.json#version` at
  runtime). The v1.5.0 tag is left in place as honest history; v1.5.1
  is the version whose SBOM correctly reads `vsizer@1.5.1`.

## [1.5.0] — 2026-05-14

### Security

- **Trivy container scan promoted from warn-only to gate** (ADR-0015 §6
  update). v1.4.0's base-image bump dropped the Security-tab Trivy
  count from ~88 to 0; with the baseline clean, any new HIGH/CRITICAL
  with a fix available now fails the container build. `ignore-unfixed:
  true` is kept so fix-less advisories surface in the Security tab
  without freezing CI — those are handled via ADR-0016 Waivers if the
  wait becomes long.

## [1.4.0] — 2026-05-14

### Security

- **Container base image bumped** to drop nginx-alpine OS CVEs that
  the ADR-0015 Trivy scan surfaced (~88 findings in the Security tab,
  mostly transitive openssl/libpng/libexpat/curl/busybox advisories).
  - `node:24-alpine` → `node:26-alpine` (builder stage, not shipped)
  - `nginxinc/nginx-unprivileged:1.27-alpine` →
    `nginxinc/nginx-unprivileged:1.29-alpine` (runtime, shipped)
  These bumps obsolete Dependabot PRs #9 and #10.

### Changed

- **Audit gates tightened** (ADR-0016, supersedes ADR-0015's gating
  clause). `npm audit` and `osv-scanner` now gate CI on **LOW+
  severity across all dependencies** (production + dev) — previously
  gated at Moderate+ on production only. The SBOM, CodeQL, Dependabot,
  action SHA-pinning, Trivy and SECURITY.md infrastructure from
  ADR-0015 are unchanged. Waivers (if needed) are recorded in
  ADR-0016, expire within 90 days, and re-block CI automatically.

- **xlsx OSV waivers** (ADR-0016 §Waivers W-001, W-002). The
  SheetJS CDN tarball `xlsx@0.20.3` (ADR-0002) trips two GHSA
  advisories whose OSV.dev structured ranges encode the entire
  package as vulnerable (`introduced: 0`, no `first_patched` event)
  because SheetJS distributes outside npm. The GHSA *summary* text
  confirms we're past the fix on both: 0.20.3 ≥ the fix ranges
  `< 0.19.3` and `< 0.20.2`. Waived for 90 days via
  `osv-scanner.toml`.

## [1.3.0] — 2026-05-14

### Added

- **Security audit & supply-chain policy** (ADR-0015) — every build
  now emits a CycloneDX 1.6 JSON SBOM (`sbom.cdx.json`, prod-deps
  scope) as a workflow artefact, attached to GitHub Releases on
  `v*` tags. CI gates on `npm audit --audit-level=moderate --omit=dev`
  and `osv-scanner` (Moderate+). A CodeQL workflow scans the TS source
  weekly and on every PR. All GitHub Actions are pinned to commit
  SHAs. Dependabot manages weekly grouped updates for npm,
  github-actions, and docker (`xlsx` excluded — ADR-0002 mandates the
  SheetJS tarball). The container workflow gained a Trivy CVE scan
  (warn-only initially; gate promotion tracked as a follow-up).
  `SECURITY.md` documents the private GitHub advisory disclosure
  path.

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
