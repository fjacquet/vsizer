# vsizer — Product Requirements (V1)

**Status**: Active development
**Version**: 1.1.x
**Owner**: Frédéric Jacquet
**Last updated**: 2026-05-10

---

## 1. Mission

Turn an RVTools or Live Optics VMware-estate export into a **factual** cluster-utilization
PowerPoint deck — 100 % client-side, in under 30 seconds, with zero brand or vendor
dependencies. The deck reports numbers; the speaker tells the story.

## 2. Users

| Persona              | Scenario                                                    |
| -------------------- | ----------------------------------------------------------- |
| Presales engineer    | Drops a customer's RVTools export, screen-shares the deck   |
| Account executive    | Generates a deck before a discovery call, no engineering    |
| Channel partner      | Uses the public URL on their own laptop with no Dell SSO    |
| End customer (read)  | Receives the PPTX, opens in PowerPoint or Keynote           |

The web app must work for someone whose IT forbids file uploads to third-party SaaS — a
hard constraint that drives many architectural decisions (see ADR-0001).

## 3. Privacy guarantee (hard product invariant)

The dropped workbook **must never leave the user's browser**. No fetches that ship
workbook bytes, no telemetry of parsed contents, no `localStorage` or URL-fragment
persistence of dataset rows. Refreshing the page is expected to drop the dataset; the
user re-drops the file. This is the single most important constraint and overrides
convenience features that would compromise it.

The deployment is a single static site (GitHub Pages). The only network activity after
load is fetching the static assets that ship the app. Open DevTools → Network and a
user can verify this themselves — that's a feature.

**Container image (since v1.2)**: vsizer is additionally published as a hardened OCI
image at `ghcr.io/fjacquet/vsizer`. Users who cannot or will not use the public Pages
deploy can `docker run` the image locally; the privacy invariant holds identically
because the image still serves only static files and the runtime CSP forbids outbound
fetches (`connect-src 'none'`). See ADR-0013.

## 4. Scope (V1)

### 4.1 In scope

- **Input**: drag-and-drop a `.xlsx` (RVTools `vInfo` + `vHost`, or Live Optics
  `VM Inventory` + `Host Inventory`). A "Load sample" button fetches an anonymized
  dataset bundled at `public/samples/`.
- **Source detection**: automatic, by sheet-name fingerprint. When detection fails, a
  manual mapping panel lets the user nominate sheets and columns.
- **Standalone (clusterless) hosts** (ADR-0014): RVTools / Live Optics exports where
  some or all ESXi hosts have no cluster assigned are accepted. Each clusterless host
  is rendered as its own row labelled `(no cluster) <hostName>`, attributed to the
  VMs that run on it. The user controls inclusion in the deck via the same per-cluster
  selection panel.
- **Aggregation**: per-cluster CPU/RAM ratios (mean/max/min), physical and consumed
  GHz, available GHz, vCPU/vRAM allocated (powered-on VMs), MHz-per-vCPU. Plus an
  estate-wide rollup with capacity-weighted CPU.
- **Dashboard**: preview-only, mirrors the deck. Global KPI bar, overview table (one
  row per cluster), per-cluster cards. **No drill-down**, no filters, no sort, no
  expansion. The single allowed interaction is a checkbox per cluster to include or
  exclude it from the export.
- **Export**: one-click PPTX (16:9, Midnight Executive palette). Title slide + overview
  slide + N cluster slides where N is the number of selected clusters.
- **i18n**: French (default) + English, runtime-switchable.

### 4.2 Out of scope (V1)

- Multi-file ingestion / merging across vCenters.
- Historical comparison or time-series.
- Saving / restoring previous sessions.
- Editing parsed values or aggregates.
- Custom branding (logos, footers, customer name on slides).
- Editorial / recommendation slides — user delivers narrative orally.
- Server-side anything.

## 5. Functional requirements

### 5.1 Input layer

- Accept `.xlsx`, `.xlsm`, `.xlsb`, `.csv`, `.ods` via drag-and-drop **or** file picker.
- File size ceiling not enforced in V1; very large workbooks (> 50 MB) may freeze the
  UI thread — accept that for V1, revisit with a Web Worker if a real customer hits it.
- Detection rule: source is `rvtools` if both `vinfo*` and `vhost*` sheets exist
  (case-insensitive, prefix-matching); `liveoptics` if `vm inventory` and `host
  inventory` exist; otherwise `unknown` and the manual mapping panel surfaces.
- Locale tolerance: column-name aliases for English, French and German RVTools builds.
  Live Optics is English-only by current observation.

### 5.2 Aggregation

- Cluster set is taken from `VHostRow.cluster`. VMs whose cluster has no host are
  silently dropped (orphans).
- Powered-off VMs are **excluded** from VM-side rollups (they don't contend for
  capacity).
- `mhzPerVcpu` is computed from consumed GHz and **allocated** vCPU (not deployed),
  capped at 0 when no vCPU is allocated.
- Active memory aggregates to `null` (not `0`) when no VM in the cluster reports it —
  that's the typical RVTools-only case; we don't fabricate the figure.
- The estate-wide `meanCpuRatio` is **capacity-weighted** (`consumedGhz / physicalGhz`)
  so a small idle cluster doesn't drag the headline number down.
- **CPU Ready (contention)** is parsed from RVTools' `vInfo.Overall Cpu Readiness`
  per VM (instantaneous %), aggregated per cluster as mean / max / count of VMs
  above the 5 % warning threshold, and exposed through `readinessAvailable`.
  Live Optics workbooks do not expose this metric; aggregates report `null` and
  the dashboard / deck render a factual "non disponible" line. See ADR-0012.

### 5.3 Dashboard

- One global KPI bar at the top: hosts, powered-on VMs, physical GHz, mean CPU %.
- One overview table: one row per cluster with cluster name, host count / VM count,
  CPU bar (mean + peak marker), RAM bar (mean + peak marker), available GHz.
- One card per cluster with the same fields the cluster slide will carry.
- Three threshold colors (status only, **no judgment**):
  green < 40 % · orange 40–70 % · red ≥ 70 %.
- A per-cluster checkbox in the sidebar lets the user toggle inclusion in the export.
  Default is "all included".

### 5.4 PPTX export — factual mode

The output is a 16:9 deck (13.333 × 7.5 inches) with the Midnight Executive palette.
Layout differences vs. the legacy Python script (see `.reference/build_pptx.py`):

| Legacy slide | V1 action |
| --- | --- |
| Hero "Vos serveurs ronronnent" | **Removed** — replaced with a neutral title slide showing the app name, date, and source filename. |
| "Le constat : sizing en vCPU ≠ consommation réelle" | **Removed entirely** — that's editorial framing, not data. |
| Overview | **Kept** with a neutral header ("Utilisation CPU & RAM par cluster"). The "Marge libérable" judgment column becomes "GHz disponibles" — same number, no value-laden adjective. |
| Cluster slide | **Kept** — but the bottom navy banner loses the "💡 RESIZE EN GHZ — POTENTIEL" framing, the "Ce cluster ronronne à X %" line, and the "Marge libérable" column. The four data tiles become: `vCPU alloués · Capacité réservée (vCPU × clock host) · GHz consommés · GHz disponibles`. |
| "Du sizing vCPU au sizing GHz" + 4 recommendations | **Removed entirely** — narrative belongs on the speaker, not the page. |

The GHz math is unchanged — that's data. Only language and conclusions disappear.

## 6. Non-functional requirements

### 6.1 Performance

- Cold load (production bundle): < 3 s on a typical broadband connection. Currently
  ~280 KB gzipped before the parser/PPTX vendors are wired in.
- Parse + aggregate + render dashboard for an 18-cluster / 300-host estate: < 5 s.
- PPTX generation for the same: < 5 s.
- Total drop-to-download time target: **under 30 s for 80 % of inputs**.

### 6.2 Security

- All input is parsed in the browser. SheetJS is the only library that touches user
  bytes; pinned to the official tarball (see ADR-0002). No raw-HTML injection sinks,
  no runtime code generation, no dynamic module loading.
- No localStorage of dataset rows. The i18n language preference is the only key
  (`vsizer-lang`).
- CSP-friendly: no inline scripts beyond Vite's modulepreload entries.

### 6.3 Compatibility

- Browsers: latest two versions of Chrome, Firefox, Safari, Edge. No IE11.
- OS: any with a modern browser (no native dependencies).
- Output PPTX: opens in PowerPoint 2019+, LibreOffice Impress 7+, Keynote 14+, Google
  Slides.

### 6.4 Accessibility

- Keyboard-navigable file dropzone (Enter / Space activate).
- Color-coded statuses must also carry an explicit text label (e.g. "44 % ·
  élevé") — colorblind-safe.
- Targeted contrast ratios: WCAG AA for body text, AAA for KPI numbers where feasible.

### 6.5 Internationalization

- French (fallback) and English at launch. New strings go through `t()`, never
  hard-coded. Five namespaces today: `common`, `upload`, `dashboard`, `pptx`,
  `validation`. PPTX-rendered strings live in the `pptx` namespace so a translator
  can review the deck in one file.

## 7. Success criteria

- A presales engineer drops a real customer RVTools file at
  `https://fjacquet.github.io/vsizer/`, gets a deck whose figures match the legacy
  Python tool ± rounding, and the deck contains **zero** editorial language.
- DevTools → Network shows no outbound requests beyond the static asset bundle.
- All four CI gates green on `main` (typecheck, lint, test:run, build) with engines
  + utils coverage ≥ 75 %.

## 8. Risks (V1)

| Risk | Mitigation |
| --- | --- |
| Real RVTools / Live Optics column names don't match our aliases | Manual mapping panel; growing alias list as users hit edge cases |
| Massive workbook (> 200 MB) freezes the UI thread | Document the cap in the README; later move parsing to a Web Worker |
| Browser memory pressure on 1000+ host estates | Same — Worker is the answer if it becomes real |
| `pptxgenjs` produces a deck that looks subtly different from the Python reference | Visual QA against `.reference/slide-*.jpg` images; pixel parity is **not** required, brand parity is |
| Translator hands back invalid JSON | Biome formats JSON as part of `lint:fix`; tests assert all namespaces parse |
