# ADR-0009 — vCPU/pCPU consolidation ratio (DR-aware)

**Status**: Accepted
**Date**: 2026-05-09
**Builds on**: ADR-0007 (DR-aware single-field semantics for stretched
clusters)

## Context

vsizer reports per-cluster CPU%, RAM%, GHz used/phys, and MHz/vCPU on every
cluster card and slide. The one piece missing for sizing-room conversations
is the **vCPU consolidation ratio** — how many virtual CPUs are stacked on
each physical core. Industry rule of thumb is 4:1 to 8:1 in production;
anything beyond signals overcommit risk.

Critically, **this number is stretched-cluster-sensitive**: when a 2-site
stretched vSAN cluster reserves 50 % of capacity for site-failover headroom
(ADR-0007), only half the physical cores are usable for workload, so the
effective consolidation ratio doubles. A non-stretched 4:1 cluster looks
healthy; the same workload on a stretched cluster is effectively 8:1 — a
yellow flag a presales engineer needs to surface, not bury.

## Decision

### 1. Single DR-aware field, mirroring ADR-0007

Add three fields to `ClusterAggregate` (and their rollup mirrors on
`GlobalSummary`):

```ts
physicalCores: number          // Σ host.cores
usablePhysicalCores: number    // stretched ? 0.5 × physicalCores : physicalCores
vcpuPerPcpu: number             // vcpuAllocated / usablePhysicalCores, 0 when divisor is 0
```

`vcpuPerPcpu` is the **DR-aware** figure. We don't keep a parallel "raw"
number — same precedent as `availableGhz` / `availableRamMb` (ADR-0007 §2).
The dashboard and the deck show one number; making it the honest number
keeps users from having to remember which version they're looking at.

`usablePhysicalCores` is surfaced explicitly (not derived on the fly) so
the global rollup in `aggregateGlobals` can sum without re-deriving the
stretched flag per cluster:

```ts
const physicalCores       = Σ cluster.physicalCores
const usablePhysicalCores = Σ cluster.usablePhysicalCores
const vcpuPerPcpu         = vcpuAllocated / usablePhysicalCores  (capped at 0)
```

### 2. No new sidebar interaction

Reuses the existing `stretched: Set<string>` and the DR pill in the
sidebar (ADR-0007). The stretched-cluster toggle that already drives
`availableGhz` / `availableRamMb` now also drives `vcpuPerPcpu`. The
mirror property of ADR-0006 holds: dashboard and deck show the same
number for the same toggle state.

### 3. Display: 5th KPI card on cluster card + cluster slide

- **Dashboard `ClusterCard`**: row 1 grid `lg:grid-cols-4` →
  `lg:grid-cols-5`; the new card uses `THEME.teal` accent (consistent
  with the existing MHz/vCPU card — both are per-vCPU sizing metrics).
- **PPTX cluster slide**: 5 cards in the same horizontal span (0.7 →
  12.95 inches). Card width recomputes from
  `(12.25 − 4 × 0.15) / 5 = 2.33`. Same `THEME.teal` accent.
- **Skipped** (V1): GlobalKpiBar, OverviewTable, PPTX overview slide,
  PPTX title slide. The metric is per-cluster by nature; estate-wide
  views stay lean.

### 4. Format: `"X.X : 1"`

`fmtRatio(n, locale)` returns `"X,X : 1"` (fr-FR) / `"X.X : 1"` (en-US)
with one decimal. `fmtRatioPptx(n)` mirrors with U+202F narrow no-break
spaces around the colon so the figure never wraps in a PowerPoint cell.
Em-dash for non-finite or zero ratios — `"5 vCPU on 0 cores"` isn't
meaningful, surface it as `—` rather than `Infinity` / `NaN`.

## Consequences

**Positive**

- Sizing-room conversations gain a first-class metric. Stretched-cluster
  overcommit risk is now visible at a glance instead of requiring mental
  arithmetic.
- Same DR semantics as the other capacity numbers — no new mental model
  for the user.

**Negative**

- ClusterAggregate grew three fields and GlobalSummary three fields. Every
  test that builds a literal needs updating, but the pattern is mechanical.
- Extending the cluster-card row from 4 to 5 KPI cards shrinks each card
  ~25 %. At typical 1280-px main-pane widths the cards still fit
  comfortably; tighter than before but readable.

## Alternatives considered

- **Two-field model** (`vcpuPerPcpu` raw + `vcpuPerPcpuEffective` DR-aware)
  — rejected: same trade-off as ADR-0007, two numbers invite confusion.
- **Add the metric to GlobalKpiBar and OverviewTable too** — rejected
  for V1 (consolidation ratio is a per-cluster sizing tool, not an
  estate KPI). Easy to revisit if a customer asks.
- **Don't add a new field; compute on the fly in components** — rejected
  for testability and for the global rollup, which would have to
  re-derive the stretched flag per cluster.

## Related

- ADR-0006 — dashboard mirrors deck; preserved here
- ADR-0007 — DR-aware single-field semantics; this ADR uses the same shape
- `src/types/cluster.ts`, `src/types/global.ts`
- `src/engines/aggregation/aggregateClusters.ts` (math)
- `src/engines/aggregation/perCluster.ts` (`physicalCores` rollup)
- `src/engines/aggregation/globals.ts` (estate rollup)
- `src/utils/format.ts` (`fmtRatio`)
- `src/engines/export/pptx/format.ts` (`fmtRatioPptx`)
- `src/components/outputs/ClusterCard.tsx` (5th KPI card)
- `src/engines/export/pptx/slides/clusterSlide.ts` (5th deck card)
