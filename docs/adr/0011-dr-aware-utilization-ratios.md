# ADR-0011 — DR-aware utilization ratios (capacity-weighted)

**Status**: Accepted
**Date**: 2026-05-09
**Builds on**: ADR-0007 (DR-aware single-field semantics for stretched
clusters), ADR-0009 (DR-aware vCPU/pCPU consolidation ratio)

## Context

V1 already shipped two DR-aware metrics — `availableGhz` /
`availableRamMb` (ADR-0007) and `vcpuPerPcpu` (ADR-0009). The CPU% and
RAM% headlines on the cluster card and the deck stayed **non-DR-aware**:
they were the arithmetic mean of per-host ratios from the workbook.

Concretely, on a 16-host stretched vSAN cluster running at 30 % mean
CPU, the dashboard reported "30 %" whether the DR pill was lit or not.
The user's mental model — and the right planning model — is the bucket
analogy: "the same volume of water in half the bucket is a higher fill
percentage". The hosts are running the workload they're running; the
moment we tell ourselves "half of these hosts must stay free for site
failover", the *effective* utilization against the planning-eligible
capacity doubles.

A second, related defect surfaced while planning this work: the
per-cluster `meanCpuRatio` was computed as `mean(host.cpuRatio)`, not as
`consumedGhz / physicalGhz`. For homogeneous clusters (all hosts of one
model — the typical vSAN case) the two formulas converge mathematically.
For heterogeneous clusters they diverge: a small idle host can pull the
mean down even when the bulk of the GHz are oversubscribed. Same defect
in `meanRamRatio` (host-equal mean of `host.ramRatio`) and in
`consumedRamMb` (`physicalRamMb × meanRamRatio` — i.e. the cluster's
average ratio applied uniformly to every host's bytes).

## Decision

### 1. Capacity-weighted, not host-equal

`meanCpuRatio` and `meanRamRatio` shift to **capacity-weighted**:

```
meanCpuRatio = consumedGhz / physicalGhz                                 (in perCluster)
meanRamRatio = consumedRamMb / physicalRamMb                             (in perCluster)
consumedRamMb = Σ (host.memoryMb × host.ramRatio)                        (now honest)
```

For homogeneous clusters this is mathematically identical to the old
formula — no visible change for the typical vSAN deployment. For
heterogeneous clusters the new number is the right one for capacity
planning.

When `physicalRamMb === 0` (older RVTools build with no `# Memory`
column), `meanRamRatio` falls back to `mean(host.ramRatio)` so the
dashboard still has a number to show. CPU never hits this fallback
because `physicalGhz = Σ (cores × speedMhz)` is always available from
the parser.

### 2. DR-aware single-field shift, mirroring ADR-0007 §2

In stretched clusters, all six per-cluster ratios scale by a single
DR factor:

```
drFactor   = physicalGhz / (physicalGhz − drReservedGhz)        (= 2 for V1's 50 % reservation)
meanCpuRatio (cluster) = perCluster.meanCpuRatio × drFactor
maxCpuRatio  (cluster) = perCluster.maxCpuRatio  × drFactor
minCpuRatio  (cluster) = perCluster.minCpuRatio  × drFactor
```

…and the same shape for RAM, with its own factor based on
`physicalRamMb`. Per-host max/min are scaled by the same factor so the
bar chart at the bottom of `ClusterCard` stays coherent with the
headline KPI tile at the top — a cluster cannot show "Mean 60 %, Max
35 %".

We do **not** keep parallel raw + DR-aware fields. ADR-0007 §2 already
established the precedent: one number per concept, the honest number.
Two numbers invite confusion about which one to read.

### 3. Estate-level rollups also DR-aware and capacity-weighted

`aggregateGlobals` switches both:

```
estate.meanCpuRatio = Σ consumedGhz   / Σ usableGhz             (was: / Σ physicalGhz)
estate.meanRamRatio = Σ consumedRamMb / Σ usableRamMb           (was: host-count-weighted)
```

The previous estate `meanRamRatio` was host-count-weighted, which
silently mixed unrelated cluster sizes. The new formula is unambiguous
and parallels the CPU calculation — both are capacity-weighted ratios
of summed flows over summed usable capacity.

### 4. Schema cap raised from 1.5 to 3.0

Pre-ADR, `meanCpuRatio` / `maxCpuRatio` / `minCpuRatio` (and RAM
counterparts) were Zod-bounded at `[0, 1.5]` — the 1.5 absorbed up to
~5 % source-side overshoot above 100 %. With a `drFactor` of 2 in
stretched clusters, a host running near 100 % raw becomes ~200 % of
usable, so the cap rises to `[0, 3]` to keep the same overshoot margin.
Both `ClusterAggregateSchema` and `GlobalSummarySchema` are updated.

### 5. No UI changes; formatters already tolerate >100 %

`fmtPercentWhole` / `fmtPercent` use `Intl.NumberFormat`'s `style:
'percent'`, which renders any finite number — `1.6` becomes `"160 %"`.
The `usageColor` helper in the cluster card already drives the orange/
red transition near 70 %/85 %, which works as intended on the new
DR-aware values (a cluster at 60 % effective is correctly orange).

### 6. Format reads correctly across both languages

Already i18n-ed via `t()` and the existing `fmtPercentWhole` formatter.
No new strings needed — the labels stay `Mean CPU` / `Mean RAM`.

## Consequences

**Positive**

- The `30 %` → `60 %` jump on toggling DR is now coherent with the
  bucket analogy and with `vcpuPerPcpu` (ADR-0009) doubling on the same
  toggle.
- A presales engineer reading a stretched cluster's deck sees one
  consistent story: "the cluster runs at 60 % of usable capacity, which
  is why availableGhz is tight and vcpuPerPcpu is 8:1". Today the deck
  said "30 %" alongside "8:1" and required mental gymnastics to
  reconcile.
- Heterogeneous clusters get more accurate numbers for free —
  `consumedRamMb` is now an honest sum, not a derived approximation.
- Estate-level `meanRamRatio` is capacity-weighted, removing the
  silent host-count weighting bias.

**Negative**

- **Behavior change visible to existing users.** Anyone already using
  vsizer with a stretched-cluster toggle will see their CPU% and RAM%
  numbers double. Documented as the headline of this ADR's commit
  message; the toggle pill itself signals the shift.
- Heterogeneous clusters get *slightly different* numbers in
  non-stretched mode too (capacity-weighted vs host-equal mean). For
  homogeneous fixtures, no visible change. For real-world heterogeneous
  estates, the difference is typically <2 % absolute.
- Schema cap doubled. If a future feature needs to enforce "ratio
  <= 1.0", it has to clamp explicitly; the schema no longer rejects
  >100 %.

## Alternatives considered

- **Two-field model** (`meanCpuRatio` raw + `effectiveMeanCpuRatio`
  DR-aware) — rejected, same reason as ADR-0007 §2.
- **Scale only the headline tile, leave min/max raw** — rejected: the
  cluster card would show "Mean 60 %, Max 35 %" which reads as broken.
- **Apply the multiplier at display time only, leave engine raw** —
  rejected: the PPTX generator and the dashboard would have to share
  presentation-layer DR logic, opening room for them to drift.
- **Keep host-equal mean (don't fix the heterogeneous-cluster issue)** —
  rejected once we were touching the formula anyway; capacity-weighted
  is the right number for any sizing conversation.

## Related

- ADR-0007 — DR reservation single-field semantics; this ADR extends
  the same shape to `meanCpuRatio` / `meanRamRatio` / min / max
- ADR-0009 — DR-aware consolidation ratio; the multiplier story here
  is conceptually the same
- `src/engines/aggregation/perCluster.ts` (`consumedRamMb` field,
  capacity-weighted mean ratios)
- `src/engines/aggregation/aggregateClusters.ts`
  (`cpuDrFactor` / `ramDrFactor` scaling)
- `src/engines/aggregation/globals.ts` (capacity-weighted, DR-aware
  `meanCpuRatio` / `meanRamRatio`)
- `src/engines/parser/schemas.ts` (cap 1.5 → 3.0)
