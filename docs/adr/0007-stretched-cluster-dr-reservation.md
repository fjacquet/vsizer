# ADR-0007 — Stretched-cluster DR reservation (CPU and RAM)

**Status**: Accepted
**Date**: 2026-05-09
**Amends**: ADR-0006 (relaxes the "single allowed interaction" rule for
metadata flags that drive the math)

## Context

vsizer reports a per-cluster "GHz disponibles" figure on every cluster
slide and overview row. The math is `availableGhz = physicalGhz −
consumedGhz` — correct for a normal cluster, **incorrect for a 2-site
stretched vSAN/vSphere cluster** where 50 % of physical capacity has to
sit reserved for site-failover. A presales engineer reading the deck on a
stretched cluster will quote a number that doesn't survive a DR review.
The same rule applies symmetrically to RAM: when a site fails, the
surviving site has to absorb the lost site's whole workload, both the
cycles and the bytes.

A second, related shortcoming surfaced while planning this work: the
parser tracks host CPU facts (`cores`, `speedMhz`, `cpuRatio`, `ramRatio`)
but **not** host memory. The cluster card's RAM block subtitle was
showing "X consumed of Y allocated" where Y was the sum of VM-allocated
memory (`vramAllocatedMb`) — a different number from physical host
capacity, and arguably misleading regardless of stretched-cluster
considerations.

## Decision

### 1. Manual stretched flag, 50 % reservation, applied uniformly

The user marks a cluster as stretched via a small "DR" pill in the
sidebar's `ClusterFilterPanel`. The flag persists in the Zustand store as
`stretchedClusters: Set<string>`, parallel to `selectedClusters`.

For each stretched cluster, the aggregation engine reserves **half the
physical capacity** on both axes:

```
drReservedGhz   = 0.5 × physicalGhz
drReservedRamMb = 0.5 × physicalRamMb
availableGhz    = physicalGhz − consumedGhz − drReservedGhz
availableRamMb  = physicalRamMb − consumedRamMb − drReservedRamMb
```

Either `available*` may go negative when the cluster is consumed past
50 % — that's the intended **"DR at risk"** signal, surfaced in red on
the dashboard and (for now, in V1) only on the dashboard for the deck —
the deck stays gold for visual consistency. We can revisit the deck
color cue if customers want it.

The 50 % reservation is hardcoded for V1. Asymmetric (3+1, 2+1) and
3-site stretched configurations are out of scope; they're rare and need
per-site weights we don't yet model.

### 2. Single field semantics shift, not parallel fields

`availableGhz` and `availableRamMb` **become the DR-aware figures**, not
the raw `physical − consumed` values. We don't keep both. Reasons:

- The dashboard and the deck show one number; making them the honest
  number keeps users from having to remember which version they're
  looking at.
- Non-stretched clusters are unaffected — `drReservedGhz` and
  `drReservedRamMb` default to 0, math reduces to the legacy formula.
- The Zod schemas already typed `availableGhz` as `z.number()` (not
  `.nonnegative()`), so the schema change for negative values was a
  no-op.

### 3. Host RAM joins `VHostRow`

The parser gains a `memoryMb` field on `VHostRow`. RVTools alias list:
`['# memory', 'memory', 'mémoire', 'mémoire (mo)', 'mem']`. Live Optics:
`['memory (mb)', 'total memory (mb)', 'memory mb', 'host memory (mb)']`.
Missing column → 0 → `physicalRamMb` rolls up to 0 and the dashboard
renders `—` for RAM-disponible. **Graceful degradation, no crash.**

The cluster card's RAM block subtitle now reads "consumed of physical"
where "physical" is the **host capacity sum**, not VM-allocated. The
PPTX cluster slide mirrors this. The "Capacité réservée" tile in the
banner still references VM allocations (`vcpuAllocated × speedMhz`) —
that's a different idea (sizing reservation) and stays untouched.

### 4. Atomic re-aggregate on toggle

`toggleStretched(name)` is implemented as a single Zustand `set(...)`
that flips the set membership **and** re-runs `aggregateClusters` +
`aggregateGlobals` inline. Components keep reading pre-computed
`aggregates` / `globals` from the store; no derive-on-render refactor
needed in V1. The trade-off: aggregation cost on every toggle (a few
ms for typical 18-cluster estates), but a clean component contract.

### 5. Sidebar gains a second per-cluster interaction

ADR-0006 says "the single allowed interaction is the export filter
checkbox". This decision **explicitly amends that rule**: a per-cluster
metadata flag (DR/stretched) is allowed because:

- It's a metadata annotation, not data editing or drill-down navigation.
- Without it, the deck silently reports wrong numbers — a worse outcome
  than the small UX deviation.
- The pill is visually distinct from the export checkbox; a user
  scanning the sidebar can immediately tell the two interactions apart.

The constraint ADR-0006 was protecting (no expansion / no drill-down)
remains in force. We're carving out an exception for boolean flags that
drive the math, not opening the door to general editing.

### 6. Auto-detection deferred

RVTools sometimes ships a `vCluster` sheet with a "Stretched Cluster"
column, but the column shape varies between RVTools builds, and Live
Optics doesn't expose this signal at all. Auto-detection in V1 would
either (a) miss most stretched clusters silently, or (b) give false
positives in workbooks where the column happened to mean something
else. **Manual ship now, auto-detect when we have a real fixture
showing the column structure** is the right trade.

## Consequences

**Positive**

- A deck on a stretched cluster reports a number that survives a DR
  review.
- RAM headroom is now first-class on dashboard and deck, even for
  non-stretched clusters (the host-memory parser work was overdue).
- The "DR at risk" red signal makes overcommitted stretched clusters
  visible without forcing the user to do mental math.
- Per-cluster `physicalRamMb` is now available to any future work
  (e.g. capacity-weighted global RAM mean, today still host-count-weighted).

**Negative**

- `ClusterAggregate` and `GlobalSummary` grew six and six fields
  respectively. Every test fixture that constructs one needs updating,
  but the change is mechanical.
- The cluster card and slide now have more visual elements (badge +
  RAM-disponible line). Information density rises a bit; the layouts
  still fit comfortably at 1280 px main pane.
- Toggle-on-stretched recomputes aggregates on every click. For a 200-
  cluster estate this could feel sluggish. We accept that for V1; if a
  customer hits it, we'll move to derive-on-render.

## Alternatives considered

- **Two-field model** (`availableGhz` raw + `effectiveAvailableGhz`
  DR-aware) — rejected: two numbers to read, easy to display the wrong
  one.
- **5-tile banner with explicit "DR réservé" cell** — rejected: layout
  shifts between cluster types, cramped tiles.
- **Inline toggle on each cluster card** — rejected: violates the
  static-cards rule from ADR-0006 more loudly than a sidebar pill.
- **Auto-detect from RVTools vCluster sheet** — deferred until we have
  a real fixture (see above).
- **Configurable reservation percent** — out of scope V1; 50 % is the
  industry standard for 2-site stretched-vSAN. Future ADR if customers
  ask.

## Related

- ADR-0003 (factual-only PPTX) — the badge / suffix language stays
  factual, no editorial framing
- ADR-0006 (dashboard layout) — explicitly amended here
- `src/types/cluster.ts`, `src/types/global.ts`, `src/types/vhost.ts`
- `src/engines/aggregation/aggregateClusters.ts` (DR math)
- `src/engines/parser/adapters/{rvtools,liveoptics}.ts` (memoryMb alias)
- `src/store/datasetStore.ts` (`toggleStretched` atomic re-aggregate)
- `src/components/inputs/ClusterFilterPanel.tsx` (DR pill)
- `src/components/common/StretchedBadge.tsx` (visual marker)
