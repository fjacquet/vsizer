# vsizer — User Guide

**Audience**: presales engineer, account executive, channel partner, or
end customer using vsizer to turn a VMware estate export into a factual
cluster utilization deck.

**Version**: 1.1.0 — see [`CHANGELOG.md`](../CHANGELOG.md) for what
changed in each release.

> 🔒 **Privacy first.** vsizer runs entirely in your browser. The file
> you drop **never leaves your machine** — no uploads, no telemetry,
> no `localStorage` of your dataset. Refresh the page and the data is
> gone. See [ADR-0001](adr/0001-client-side-only-processing.md) for the
> full guarantee.

---

## 1. Quick start

1. Open <https://fjacquet.github.io/vsizer/>.
2. Drop your `.xlsx`, `.xlsm`, `.xlsb`, `.csv`, `.ods` — or the entire
   Live Optics `.zip` bundle — onto the dropzone, or click to pick the
   file.
3. The dashboard appears with a global KPI bar, an overview table, and
   one card per cluster.
4. (Optional) Toggle which clusters to include in the export via the
   sidebar checkboxes. Default: all included.
5. Click **Exporter PPTX / Export PPTX** in the header. The deck
   downloads to your usual browser download folder.

That's the whole flow. Everything that follows is detail on what the
numbers mean and how to read the deck.

---

## 2. What the dashboard shows

The dashboard is a **preview-only** mirror of the PPTX deck. Whatever
you see on screen is what shows up in the file (with one exception: the
deck's bottom banner is laid out vertically; the dashboard inlines it).
There is **no drill-down, no filter, no sort, no editing**. The single
allowed interaction is the cluster-inclusion checkbox in the sidebar.
This is intentional — see [ADR-0006](adr/0006-dashboard-layout.md).

### 2.1 Global KPI bar

Five tiles at the top:

| Tile             | Meaning                                                     |
| ---------------- | ----------------------------------------------------------- |
| Hôtes / Hosts    | Σ ESXi hosts across the parsed estate                       |
| VMs allumées     | Σ powered-on VMs (powered-off are excluded — see §2.5)      |
| Capacité physique| Σ physical GHz (cores × clock per host)                     |
| RAM physique     | Σ host memory in MB → rendered as MB / GB / TB              |
| CPU moyen utilisé| Capacity-weighted mean of host CPU %, **DR-aware**          |

The CPU mean is `Σ consumedGhz / Σ usableGhz` — see
[ADR-0011](adr/0011-dr-aware-utilization-ratios.md) for why this differs
from a simple host-count average and why the value rises when a
stretched cluster is in the mix.

### 2.2 Overview table

One row per cluster: name, hosts/VMs count, CPU bar (mean + peak
marker), RAM bar (mean + peak marker), GHz available. Three threshold
colors are used as **status only**, not value judgments — see
[ADR-0003](adr/0003-factual-only-pptx-output.md):

| Color  | Range       | Meaning                |
| ------ | ----------- | ---------------------- |
| Green  | < 40 %      | Low utilization        |
| Orange | 40–70 %     | Moderate utilization   |
| Red    | ≥ 70 %      | High utilization       |

### 2.3 Cluster card

One card per cluster with:

- **Header**: cluster name, optional `Étendu / Stretched` pill, sub-info
  line (hosts, VMs, total cores, GHz/core, RAM, optional DR reservation)
- **CPU Ready line** (since 1.1.0 — see §3)
- **Row 1 — five KPI tiles**:
  - Mean CPU %
  - Mean RAM %
  - GHz used / physical
  - MHz per allocated vCPU
  - vCPU per physical core (DR-aware consolidation ratio,
    [ADR-0009](adr/0009-vcpu-pcpu-consolidation-ratio.md))
- **Row 2 — utilization blocks**: CPU and RAM bars with min / mean / max
- **Row 3 — factual data banner**: vCPU allocated, reserved capacity
  (vCPU × clock host), GHz consumed, GHz available
- **RAM disponible line**: turns red when negative (overcommitted DR)
- **CPU Ready annex sub-section** (conditional — see §3)

### 2.4 Stretched-cluster toggle

Each cluster has a **DR pill** in the sidebar that marks it as a
stretched 2-site cluster. Toggling it on:

- Reserves **50 % of CPU and RAM** as site-failover headroom
- Subtracts that reservation from `availableGhz` and `availableRamMb`
- Doubles `vcpuPerPcpu` (the consolidation ratio uses the
  post-reservation cores)
- Scales every utilization ratio by the DR factor — *the same volume of
  water in half the bucket reads higher*

A cluster consumed past 50 % when stretched will surface a **negative
"GHz disponibles"** — that's the intended *DR at risk* signal, in red.
The math is documented in [ADR-0007](adr/0007-stretched-cluster-dr-reservation.md).

### 2.5 Powered-off VMs

VMs whose Power State is anything other than `poweredOn` / `powered on`
/ `on` / `running` are **excluded** from VM-side rollups. They don't
contend for capacity, so counting them would distort the mhz-per-vCPU
and overcommit ratios.

---

## 3. CPU Ready (contention) — new in 1.1.0

**TL;DR**: CPU Ready is the percentage of time a VM is *ready to run
but waiting* for a physical core. Healthy is < 5 %. Above 10 % means
the host scheduler is saturated — VMs are starving even when raw CPU %
looks fine. This metric exists because a cluster can show **50 %
consumed CPU** (plenty of "headroom" by capacity math) while a fraction
of its VMs sit above **15 % CPU Ready**, and the capacity-only
headline misleads the speaker into recommending workload growth on a
saturated cluster.

See [ADR-0012](adr/0012-cpu-ready-contention-asymmetric-source.md) for
the full design rationale.

### 3.1 Where it appears

- **Each cluster card** carries a single line under the header:
  - When the source supplies it:
    `CPU Ready : 6.2 % (moy.) · 14.8 % (max) · 7 VM(s) au-dessus de 5 %`
    Mean and max are color-coded green / orange / red on the VMware
    standard 5 % / 10 % thresholds.
  - When the source does **not** supply it:
    `CPU Ready : non disponible (source : Live Optics)`
    or `(source : RVTools)` if the column is missing from your RVTools
    build.
- **Each cluster slide** in the exported PPTX carries the same line.
- **Conditional annex slide** is appended right after each cluster
  slide whenever ≥ 1 VM crosses the 5 % warning threshold:
  *"VMs avec CPU Ready le plus élevé — {{cluster}}"* — top 10 VMs
  sorted by readiness, with the same color coding.
- **Conditional annex sub-section** mirrors that table on the dashboard
  inside each cluster card.

### 3.2 Source coverage

| Source                | CPU Ready exposed?           | Where                                       |
| --------------------- | ---------------------------- | ------------------------------------------- |
| **RVTools 4.x**       | ✅ Yes                       | `vInfo.Overall Cpu Readiness` column        |
| **Live Optics 2025+** | ❌ No                        | Workbook does not include the metric        |
| **Older RVTools**     | ⚠️ Sometimes (column-dependent) | Falls back to "non disponible (source : RVTools)" |

The asymmetry is structural — Live Optics' modern workbook layout
simply doesn't ship the metric. vsizer surfaces this honestly: it
**never collapses absence into "0 % healthy"**.

### 3.3 Threshold semantics (status, not verdict)

| Color  | Range       | Convention                  |
| ------ | ----------- | --------------------------- |
| Green  | < 5 %       | No notable scheduling pressure |
| Orange | 5 % – 10 %  | Worth surfacing             |
| Red    | > 10 %      | Sustained scheduling pressure |
| Grey   | unavailable | Source did not report       |

A VM at *exactly* 5 % is colored orange (5 is the *threshold*, not a
*violation*) but is **not counted** in `VM(s) au-dessus de 5 %` (that
count uses strict `>`). This convention matches every Broadcom / VMware
sizing guide we surveyed.

### 3.4 Caveats and what the number does not say

- **Snapshot, not a window**. RVTools fetches `summary.quickStats.OverallCpuReadiness`
  at extraction time — it's the last ~20-second sample, not a 24-hour
  average. A cluster with episodic contention can show 0 % at extraction
  time. Run RVTools during a representative load window, or cross-check
  with vRealize Operations / Aria Operations for a windowed view.
- **Per-VM, not per-host**. The metric is summed across the VM's
  vCPUs by VMware's API; we don't currently roll it up per host.
- **Corrupted cells**. Excel error sentinels (`#REF!`, `#DIV/0!`, …)
  and manual placeholders (`N/A`, `-`, …) all collapse to *"no
  reporter"* — never to *"reporter at 0 %, healthy"*. If your RVTools
  export has a damaged readiness column, the slide will read
  *"non disponible"* rather than silently mis-attributing the cluster
  as healthy.

---

## 4. Supported formats

### 4.1 RVTools

- Sheet names recognized: `vInfo`, `vHost`, plus the
  `RVTools_tabvInfo` / `RVTools_tabvHost` table-name prefix used by
  some builds and post-processed combined exports — see
  [ADR-0010](adr/0010-extended-import-formats.md).
- Locale-tolerant: column-name aliases for English, French, and
  German. The localized French build (`Nom de la VM`, `Grappe`,
  `Cœurs`, `Mémoire`, etc.) parses out of the box.
- Use a recent RVTools 4.x build to get the `Overall Cpu Readiness`
  column on `vInfo`. Older builds will still parse — the contention
  surface degrades gracefully to *"non disponible"*.

### 4.2 Live Optics

Both layouts are auto-detected:

- **Classic**: sheets `VM Inventory` + `Host Inventory`.
- **Modern (Dell, 2025+)**: sheets `VMs` + `ESX Hosts` + optional
  `ESX Performance` (joined by host name for utilization). The
  `VM Performance` sheet is intentionally not joined — `VMs.Used Memory
  (active) (MiB)` already supplies the active memory we need.

You can also drop the entire Live Optics `.zip` bundle — vsizer
extracts it in-browser with `fflate` and routes to the
`*_VMWARE_*.xlsx` file. The `.pptx` and other files in the bundle are
ignored.

### 4.3 If detection fails

A manual mapping panel surfaces when neither RVTools nor Live Optics
fingerprints match. Pick the sheet for VMs and the sheet for hosts,
then map the canonical columns onto your headers. Save the mapping for
the session — it's not persisted across reloads (privacy, ADR-0004).

---

## 5. Reading the exported deck

The deck is **factual only** — see
[ADR-0003](adr/0003-factual-only-pptx-output.md). No editorial
language, no recommendations, no "this cluster is purring at X %". The
narrative belongs to you, the speaker. Slide order:

1. **Title slide** — neutral title, source filename, date, estate-wide
   KPI strip
2. **Overview slide** — one row per cluster with CPU/RAM bars + a
   "GHz disponibles" column
3. **Per cluster** (in alphabetical order):
   - **Cluster slide** — header, contention line, 5 KPI tiles, CPU/RAM
     blocks, factual data banner, RAM-available line, footer source
     attribution
   - *(conditional)* **CPU Ready annex slide** — only when ≥ 1 VM
     crosses the warning threshold, top-10 sorted by readiness

Theme is locked to the Midnight Executive palette regardless of
dashboard light/dark mode — see [ADR-0008](adr/0008-auto-dark-mode.md).
The deck opens in PowerPoint 2019+, LibreOffice Impress 7+, Keynote
14+, and Google Slides.

---

## 6. Languages and theme

- **Languages**: French (default) and English. Switch with
  `?lang=en` / `?lang=fr` in the URL, or via the language toggle in
  the header. The choice is remembered in `localStorage` under
  `vsizer-lang` — *the only `localStorage` key vsizer ever writes;
  no dataset rows are ever persisted*.
- **Theme**: light / dark / system, three-state toggle in the header.
  The PPTX deck stays Midnight Executive regardless. See
  [ADR-0008](adr/0008-auto-dark-mode.md).

---

## 7. Limitations and known caveats

- **No drill-down on the dashboard** — by design (ADR-0006). The
  dashboard mirrors the deck; it is not an interactive analytics tool.
- **Memory-only state** — refreshing the page wipes the dataset. By
  design (ADR-0004). Re-drop the file.
- **Single workbook per session** — multi-vCenter merging across
  files is out of scope for V1 (PRD §4.2).
- **Large workbooks (> 50 MB)** may briefly freeze the UI thread
  during parsing. This is a known V1 limit; if you hit it, we'll move
  parsing to a Web Worker.
- **CPU Ready is a snapshot** — see §3.4 above.
- **i18n**: untranslated keys silently fall through (no missing-key
  gate yet). Eyeball the FR view if you've added new strings.

---

## 8. Where to file feedback

- **Bugs / feature requests**: <https://github.com/fjacquet/vsizer/issues>
- **Architecture questions**: read the relevant ADR first
  ([`docs/adr/`](adr/README.md)). They encode the *why* behind every
  non-obvious behavior.
- **Want to contribute?** See [`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## 9. Companion docs

| Doc                                       | What it covers                                              |
| ----------------------------------------- | ----------------------------------------------------------- |
| [`README.md`](../README.md)               | Project intro, install/dev scripts, repo tour               |
| [`docs/PRD.md`](PRD.md)                   | Product requirements, scope (in / out), success criteria    |
| [`docs/adr/`](adr/README.md)              | Architecture decision records (Nygard format, append-only)  |
| [`CHANGELOG.md`](../CHANGELOG.md)         | What changed in each release (Keep a Changelog)             |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md)   | How to contribute, branch / commit conventions, CI gates    |
| [`CLAUDE.md`](../CLAUDE.md)               | Guidance for AI coding assistants and a contributor's tour  |
