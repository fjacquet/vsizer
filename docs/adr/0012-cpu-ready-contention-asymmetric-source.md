# ADR-0012 — Surface CPU Ready (contention) from RVTools, with asymmetric source support

**Status**: Accepted
**Date**: 2026-05-10
**Builds on**: ADR-0003 (factual-only PPTX), ADR-0010 (extended import formats)

## Context

vsizer's V1 metrics describe **capacity** (physical / consumed / available
GHz and RAM) and **mean utilization** (capacity-weighted CPU%/RAM% per
cluster, per ADR-0011). They are silent on **contention**: the share of
runtime a VM spends *ready to execute* but unable to obtain a physical
core. VMware exposes this as `summary.quickStats.OverallCpuReadiness`
and the vSphere PerfManager counter `cpu.ready.summation` (called %RDY
in `esxtop`).

The defect this ADR closes: a cluster can show **50 % consumed CPU**
(plenty of "headroom" by capacity math) while a sizeable fraction of its
VMs are above **15 % CPU Ready**. That signature means the host
scheduler is saturated — wide VMs straddling NUMA nodes, oversubscribed
HT, sticky DRS — and the capacity-only headline misleads the speaker
into recommending workload growth on a cluster that is already starving
its current VMs.

A factual inspection of two real exports the team uses regularly
established what each source actually exposes:

| Source                    | CPU Ready exposed | Sheet (already parsed)         | Column header                  | Granularity                                |
| ------------------------- | ----------------- | ------------------------------ | ------------------------------ | ------------------------------------------ |
| RVTools 4.x XLSX          | ✅ yes            | `vInfo`                        | **`Overall Cpu Readiness`**    | per-VM, instantaneous (last ~20 s sample)  |
| Live Optics 2025+ XLSX    | ❌ no             | `VM Performance` / `ESX Performance` | none — only Peak/Avg utilization, IOPS, latency | n/a                                        |

RVTools fetches the value via the vSphere `PropertyCollector` from each
VM's `summary.quickStats` — same code path that already populates
`vHost.CPU usage %`. It is a snapshot at extraction time, not a window
average; for sizing conversations the snapshot is still meaningfully
different from zero when the cluster is contended (the saturation
pattern persists across samples). Live Optics, despite running a
24 h–7 day collector, does not include a Ready column in the exported
workbook — only utilization and storage performance. The asymmetry is
structural, not a sampling artifact.

## Decision

### 1. Add `cpuReadinessPercent` as a per-VM, nullable percent (0–100)

`VInfoRow` gains:

```ts
/** Percentage of time this VM was ready to run but could not get
 *  scheduled on a pCPU. Source: RVTools `vInfo.Overall Cpu Readiness`
 *  (= summary.quickStats.OverallCpuReadiness). Always null for Live
 *  Optics inputs (the workbook does not expose it). */
cpuReadinessPercent: number | null
```

Units stay **percent** (0–100), distinct from the existing `*Ratio`
fields (`cpuRatio`, `ramRatio`) that are 0..1. This mirrors VMware's
own API, keeps the value human-readable in dev tools, and makes the
threshold constants (`5`, `10`) read naturally rather than as obscure
fractions.

The Zod schema bound is `[0, 200]` nullable. The 200 ceiling absorbs
source-side overshoot the same way ADR-0011 raised the ratio cap to
3.0 — `OverallCpuReadiness` is theoretically the sum of per-vCPU
readiness so a 4-vCPU VM at 60 % each can briefly read above 100 %.
If a real export ever exceeds 200, the value surfaces as a `parseError`
and we revisit.

### 2. Asymmetric source contract: never lie about absence

The Live Optics adapter **always** sets `cpuReadinessPercent: null`,
not 0. Aggregators distinguish "no reporters" (returns `null`) from
"all reporters at zero" (returns `0`). The slide and dashboard branch
on a single `readinessAvailable: boolean` flag computed once per
cluster:

- `readinessAvailable === true` → render the metric (mean / max /
  count above warning) with color coding.
- `readinessAvailable === false` → render a factual one-liner
  `"CPU Ready : non disponible (source : Live Optics)"`. Never imply
  that absence equals zero contention.

This mirrors the `activeMemMb: number | null` precedent already in
place for RVTools-only inputs (RVTools doesn't expose active memory).
Same null-propagation contract end-to-end (parser → aggregator →
schema → renderer). No new architectural pattern — only a new field
that follows it.

### 3. Per-cluster aggregate: mean, max, count above warning

`ClusterAggregate` gains four fields:

```ts
meanCpuReadinessPercent: number | null  // arithmetic mean over reporters
maxCpuReadinessPercent:  number | null  // largest reported value
vmsAboveReadinessWarning: number        // count of reporters > 5 %
readinessAvailable:       boolean       // ≥1 powered-on VM reported
```

The arithmetic mean (not vCPU-weighted) is intentional: the cluster
slide already shows capacity-weighted CPU%, and a vCPU-weighted Ready
mean would dilute the signal in clusters with a few small but very-
contended VMs — exactly the cohort the metric exists to surface. The
max + count pair restores the distribution shape the mean hides.

Powered-off VMs are excluded by the existing `groupByCluster` filter
in `vinfoMerge.ts:19` — Ready is undefined for non-running VMs.

### 4. Top-N annex slide, conditional, factually titled

For each cluster where `readinessAvailable && vmsAboveReadinessWarning
> 0`, append **one** annex slide immediately after the cluster slide.
Layout: header rail (mirrors `clusterSlide.ts:82-101`), title
**`"VMs avec CPU Ready le plus élevé — {{cluster}}"`** (FR) /
`"VMs with the highest CPU Ready — {{cluster}}"` (EN), subtitle
`"Source : RVTools vInfo · Overall Cpu Readiness · seuil de référence : 5 %"`,
manual table (alternating-stripe `addShape` + `addText` per the
`overviewSlide.ts:140-148` idiom — there is no `addTable` usage in the
codebase). Columns: `#`, `VM`, `vCPU`, `CPU Ready`, `Cluster`. Top-10
sorted descending by Ready %. Footer reference legend with three color
swatches (`<5 % · 5–10 % · >10 %`) — these are status colors, not
verdicts (see §6 below).

The annex slide is **never inserted** when readiness is unavailable
(Live Optics) or when no VM crosses the warning threshold. A cluster
with a healthy distribution adds zero pages to the deck.

### 5. Cluster slide: one factual line under the KPI row

The existing 5-card KPI row stays untouched. A new single-line strip
sits between the KPI cards (y=2.40) and the utilization blocks (was
y=2.60, now y=3.00). The 0.4 in shift cascades to `bannerY` and
`footerY`; the slide is 7.5 in tall and the new footer Y of 6.85
leaves the same ~0.05 in safety margin as before.

```
readinessAvailable === true:
  "CPU Ready : 6.2 % (moy.) · 14.8 % (max) · 7 VM(s) au-dessus de 5 %"
                ^orange or red,         ^red,         ^count
                via contentionColor()

readinessAvailable === false:
  "CPU Ready : non disponible (source : Live Optics)"
                ^grey
```

### 6. VMware-standard thresholds, used as status colors not verdicts

Color palette tokens (`THEME.green / THEME.orange / THEME.red /
THEME.grey`) reused from `usageColor`. New helper `contentionColor`
mapping percent → token with VMware's standard cutoffs:

```ts
export const CONTENTION_THRESHOLDS = { warning: 5, serious: 10 } as const
//  < 5  → green   (no scheduling pressure)
//  5–10 → orange  (notable scheduling pressure)
//  > 10 → red     (sustained scheduling pressure)
//  NaN  → grey    (no value)
```

Per ADR-0003, no editorial text accompanies the color. The annex
slide's footer legend renders three swatches with the bare cutoffs
(`<5 %`, `5–10 %`, `>10 %`) and no adjectives. The cluster line uses
the same three colors, no `⚠️`, no "warning", no "contention" word
(the term is technically correct but reads as a verdict to a customer
without VMware fluency). The annex slide title says "highest CPU
Ready" rather than "contention" for the same reason.

### 7. Estate-level: opt-in deferred to V2

`GlobalSummary` gains `vmsAboveReadinessWarning: number | null` (sum
of reporting clusters, null when zero clusters report). The field is
present so the schema is stable, but no current dashboard or slide
surface consumes it in this iteration. Surfacing it on the title
slide or `GlobalKpiBar` is a lightweight V2 follow-up and intentionally
out of scope here.

## Consequences

**Positive**

- The cluster card and the deck stop being silent about scheduling
  pressure when the source can supply the data. The factual mention
  on Live Optics inputs prevents the absence from reading as "all
  green".
- The annex slide pattern (conditional, top-N, sorted desc,
  source-attributed in the subtitle) is reusable for any future
  metric we surface via top-N with a reference threshold —
  e.g. memory ballooning, swap, oversized VMs.
- The new `cpuReadinessPercent` follows the established
  `activeMemMb: number | null` shape end-to-end. No new architectural
  pattern was introduced; the asymmetric-source contract is just a
  second instance of one we already shipped.
- The threshold constants (5 / 10) live in one module
  (`engines/aggregation/contention.ts`) and are reused by the
  aggregator, the PPTX color helper, and the dashboard. Changing them
  later is a single-file edit.

**Negative**

- Asymmetry between RVTools and Live Optics is now user-visible.
  Speakers using Live Optics will see "non disponible" on every
  cluster card and may infer a vsizer bug. Mitigated by the
  source-name parenthetical in the line text and a one-line note in
  the README.
- The cluster slide grows by 0.4 in vertical density. The geometry
  is still inside the 7.5 in slide; future additions to that slide
  will need to consider the new `blockY = 3.00` baseline.
- Adding up to one annex slide per affected cluster grows the deck.
  Acceptable: the annex is conditional, and a healthy estate adds
  nothing.
- RVTools' Ready value is a snapshot, not a windowed mean. A cluster
  with episodic contention could show 0 % at extraction time and pass
  silently. There is no fix on our side without changing the source.
  Documented in the annex slide's subtitle ("instantaneous") and in
  the cluster line via the mean/max/count tuple, which lets the
  reader spot the spread.

## Alternatives considered

- **Block the feature until Live Optics also exports Ready**.
  Rejected: punishes RVTools users for a Live Optics omission we
  cannot fix; the asymmetric-source contract from ADR-0010 §3
  (silent-zero on missing perf sheets) already establishes the
  precedent that we surface what's available.
- **Editorial verdict text** ("⚠️ contention détectée"). Rejected
  per ADR-0003. The color and the number are enough; the speaker
  interprets.
- **vCPU-weighted mean instead of arithmetic**. Rejected: dilutes
  the signal exactly when the metric exists to detect a small set of
  contended VMs. The max + count pair makes the distribution
  visible without weighting.
- **Per-host mean inside the cluster aggregate**. Rejected: would
  require joining VInfoRow rows back to their host (already in
  RVTools data), but the slide layer never asks "which host?" — and
  the top-N table includes the VM's host implicitly. Lower marginal
  value than the table.
- **Configurable thresholds in the UI**. Deferred. The 5/10 default
  matches every VMware sizing guide we surveyed. We will revisit if
  field reports show the defaults are wrong for a domain.
- **Stand-alone "Performance" deck instead of inline annex**.
  Rejected: breaks the one-deck UX the product is built around;
  the conditional inline annex keeps context with the cluster.

## Related

- ADR-0001 — 100 % client-side processing (preserved; the new column
  flows through the same in-browser parser path).
- ADR-0003 — Factual-only PPTX (the annex slide and the cluster line
  are constrained by this ADR; no editorial framing).
- ADR-0010 — Extended import formats (precedent for source-asymmetric
  data: the Live Optics modern adapter also tolerates a missing perf
  sheet by surfacing zero rather than failing).
- ADR-0011 — DR-aware utilization ratios (precedent for the schema
  cap raise; ADR-0012 reuses the "absorb source overshoot" rationale
  for the [0, 200] readiness bound).
- `src/types/vinfo.ts` (new `cpuReadinessPercent` field).
- `src/types/cluster.ts` (new `meanCpuReadinessPercent`,
  `maxCpuReadinessPercent`, `vmsAboveReadinessWarning`,
  `readinessAvailable`).
- `src/types/global.ts` (new `vmsAboveReadinessWarning`).
- `src/engines/aggregation/contention.ts` (thresholds and `TOP_N_DEFAULT`).
- `src/engines/aggregation/vinfoMerge.ts` (`readinessStats` helper,
  `topReadinessVmsByCluster` exported helper, `TopReadinessVm` type).
- `src/engines/parser/adapters/rvtools.ts` (column alias
  `Overall Cpu Readiness`).
- `src/engines/parser/adapters/liveoptics.ts` (forces null).
- `src/engines/parser/schemas.ts` (bound `[0, 200]` nullable).
- `src/engines/export/pptx/primitives/colors.ts` (`contentionColor`).
- `src/engines/export/pptx/slides/clusterSlide.ts` (cluster line +
  geometry shift).
- `src/engines/export/pptx/slides/contentionAnnex.ts` (new annex slide).
- `src/engines/export/pptx/builder.ts` (conditional injection,
  `topReadinessByCluster` map input).
- `src/components/outputs/ClusterCard.tsx` (mirror line on dashboard).
- `src/components/outputs/ContentionAnnex.tsx` (new dashboard
  sub-section, conditional).

### Future work tracked here

- A future Live Optics build that ships a Ready column should update
  `adaptLiveOpticsModernVInfo` (and the classic adapter, if Dell
  ever back-ports) to populate `cpuReadinessPercent`. The asymmetric
  contract collapses cleanly; no schema change required.
- `vmsAboveReadinessWarning` on `GlobalSummary` is wired but
  unsurfaced. A V2 iteration can add an estate KPI tile once we have
  feedback on how the per-cluster line lands.
