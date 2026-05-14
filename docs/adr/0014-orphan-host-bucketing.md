# ADR-0014 — Orphan-host bucketing for clusterless ESXi exports

**Status**: Accepted
**Date**: 2026-05-14
**Supersedes**: —

## Context

VMware does not require an ESXi host to belong to a cluster. Many
production estates run standalone hosts directly under a datacenter
(small environments, edge / branch, lab cells, isolated security
zones). In those exports, RVTools' `vHost.Cluster` column is blank and
`vInfo.Cluster` is correspondingly blank for the VMs running on those
hosts.

Today the aggregation engine treats blank-cluster rows as
unattributable and drops them at the entry to `aggregateHostsPerCluster`
(`engines/aggregation/perCluster.ts:44`) and
`aggregateVmsPerCluster` (`engines/aggregation/vinfoMerge.ts:48`). With
every host dropped, `aggregateClusters()` returns an empty array and
`useDatasetUpload.ts:51` blocks the import with the
`validation:rows.noClusters` toast:

> "No clusters detected in this file."

Reported as issue
[#4](https://github.com/fjacquet/vsizer/issues/4) with a real RVTools
export — the user is stuck and cannot generate a deck for their
estate.

A real RVTools file (`vInfo.Host` at column `CF`, `vHost.Host` at
column `A`) shows every VM carries its host name even when neither
side carries a cluster name. Today we throw `vInfo.Host` away during
normalization. That column is the key to attributing orphan VMs to
the specific standalone host they live on.

## Decision

Synthesize unique per-host cluster names at the **parser boundary**,
not in the aggregation engine.

1. **Preserve `host` on every VM row.** Extend `VInfoRow` with
   `host: string` and the matching Zod schema. Add `host` to the
   column-alias maps of both RVTools and Live Optics (classic and
   modern) vInfo adapters. RVTools always exposes the column; Live
   Optics' classic and modern VM sheets do not, so `readString`
   returns `''` and the field acts as "no per-VM host info available"
   — strictly forward-compatible if a future Live Optics build adds
   a Host column.

2. **Run `synthesizeOrphanClusters` after validation, before
   aggregation.** A new pure function in
   `engines/parser/synthesizeOrphanClusters.ts`:
   - finds every `vhost` row with an empty `cluster`, rewrites it to
     `` `(no cluster) ${hostName}` ``, and records the set of host
     names that were orphaned;
   - finds every `vinfo` row with an empty `cluster` whose `host` is
     in that set and rewrites its `cluster` to match. VMs whose
     `host` is unknown (or blank) are left alone — they're dropped
     downstream as today, since they have no attributable host.

3. **Keep the aggregator-level filters as defense-in-depth.** The
   `if (row.cluster.length === 0) continue` guards in both
   `perCluster.ts` and `vinfoMerge.ts` stay; they're now only reached
   when synthesis couldn't attribute the row (no host name available
   at all). Their corresponding tests are renamed to reflect the
   defensive role.

4. **Label scheme is part of the contract**: `(no cluster) <hostName>`.
   Each standalone host appears as its own row in the dashboard and
   PPTX. Sort order falls out of the existing
   `localeCompare`-based cluster sort. The label is intentionally not
   localized — cluster names elsewhere are raw VMware strings, and
   downstream consumers (PPTX speaker, exported CSV, screenshots) need
   a stable identifier they can paste between locales.

## Consequences

**Positive**

- Issue #4 is fixed: workbooks where every host is clusterless now
  import cleanly.
- Mixed estates (some clustered, some standalone) get a faithful
  deck — every standalone host is its own row, with its actual VM
  count and capacity. The narrator can speak to each box
  individually.
- The aggregation engine doesn't learn about orphans. Synthesis is a
  parser concern; everything downstream sees canonical cluster names.
- The new `VInfoRow.host` field is forward-useful: future features
  (per-host drilldown, host-level CSV export) get it for free.

**Negative**

- Adds one canonical field (`VInfoRow.host`) to a previously stable
  shape. The schema, types, both RVTools adapter call sites, both
  Live Optics adapters (classic + modern), and any test fixture that
  constructs a `VInfoRow` literal must update. Touch count is
  bounded — about a dozen sites — and the strict TS schema makes
  the migration mechanical.
- A single host name carrying many VMs becomes a single "cluster" in
  the deck. For the PPTX that's one slide per standalone box, which
  scales badly for estates with dozens of standalone hosts. The user
  controls the per-cluster selection in the export panel, so they
  can deselect orphan rows if the deck would be too long.
- ADR-0007 (stretched-cluster DR reservation) keys on the cluster
  name. The synthesized labels never appear in the user's
  `stretchedClusters` set unless explicitly added in the UI, so
  orphans never get a phantom DR reservation. Acceptable behavior.

**Neutral**

- The `(no cluster) <hostName>` label is intentionally noisier than
  a single shared "Unassigned" bucket. The user explicitly clarified
  during planning that standalone hosts are separate logical
  entities, not one shared pool — the noisier label is the correct
  one.

## Alternatives considered

1. **Single shared bucket `(no cluster)` for all orphans.**
   Simpler — one synthetic name, one cluster row in the deck. But it
   conflates independent boxes whose only common property is "no
   cluster," producing aggregate numbers (mean CPU%, max RAM%) that
   span unrelated hardware. Rejected by the user during planning.

2. **Reject the workbook with a clearer error message.** Telling the
   user "your hosts have no cluster, please assign one in vCenter"
   is hostile UX — the whole point of vsizer is to consume what the
   user actually has. Rejected.

3. **Synthesize at the aggregator instead of the parser.** Putting
   the rewrite into `aggregateHostsPerCluster` keeps the parser
   unchanged but bleeds parser-level concerns (empty-string
   handling, host-name fallback) into the aggregator. Two layers
   then both know about orphans. Rejected — the canonical-rows
   contract is the right seam.

4. **Add the host column without bucketing — let the UI render
   orphans separately.** Two consumers (dashboard and PPTX) would
   each need their own orphan rendering path, and a third (CSV
   export) would diverge. Rejected — synthesis at parse time keeps
   every downstream consumer uniform.

## References

- Issue: [#4 — The problem with the system is that it doesn't have a
  cluster name](https://github.com/fjacquet/vsizer/issues/4)
- Related: ADR-0007 (stretched-cluster DR reservation — orphan rows
  never inherit it by default).
- Affects: `engines/parser/` (new `synthesizeOrphanClusters.ts`,
  adapter alias updates), `engines/aggregation/` (test renames,
  defensive comments), `src/types/vinfo.ts`,
  `src/engines/parser/schemas.ts`.
