# ADR-0017: Multi-file import (issue #7)

- **Status:** Accepted
- **Date:** 2026-05-14
- **Related:** ADR-0001 (client-side), ADR-0004 (memory-only state),
  ADR-0010 (extended import formats), ADR-0012 (asymmetric CPU Ready),
  ADR-0014 (orphan host bucketing)

## Context

Issue [#7] from `congto`: a user managing 10 separate vCenter clusters
produces 10 RVTools workbooks per audit cycle and wants a single vsizer
report covering the whole estate. Today they merge files manually
before upload — slow and error-prone, and easy to get wrong (column
order drift between RVTools versions, mixed RVTools + Live Optics
sources, etc.).

vsizer's parser, aggregator and PPTX engine are already source-
agnostic at the row level. The single-file assumption is concentrated
in three places:

1. `FileDropzone` — single `<input>` and `dataTransfer.files[0]`.
2. `useDatasetUpload` — `uploadFile(file: File)` parses one workbook.
3. `datasetStore` — `setDataset` replaces all state; `file: File | null`
   holds the *one* source file.

Multi-file is therefore a UX + orchestration change, not a math change.

## Decision

Accept N files in a single drop. Implementation:

1. **Dropzone + click-to-browse accept multiple files.** `<input
   multiple>` plus iteration over `dataTransfer.files`. Per-file
   acceptable-extension filter is unchanged.

2. **Per-file parse, single store write.** `useDatasetUpload`
   exposes `uploadFiles(files: File[])`. Each file is parsed
   independently via the existing `parseDataset` pipeline
   (extractWorkbookBytes → parseXlsx → detectSource → normalize → Zod
   validate). RVTools + Live Optics + `.zip` may be mixed in one batch.

3. **Collision resolution.** A new pure function
   `resolveClusterCollisions(perFile)` concatenates all rows and
   rewrites cluster names that appear in more than one file's host
   rows to `"<cluster> (<filename without extension>)"` for *every
   contributing file*. Clusters that appear in only one file are
   untouched. The host-side defines the cluster set (same convention
   as `aggregateClusters`); VM-side rows from the same file get the
   matching rewrite so the host/VM join survives downstream.

4. **`aggregateClusters` runs once** over the merged, disambiguated
   rows — no engine math change.

5. **`datasetStore` shape change.** `file: File | null` is replaced
   with `sources: SourceFile[]` where each entry carries `{ name,
   size, source, vinfoRows, vhostRows }`. The raw `File` object is
   not retained — the bytes are dropped after parse (ADR-0001).
   `setDataset` becomes `setMergedDataset({ sources, parsed,
   aggregates, globals })`. The top-level `source: SourceFormat`
   field is kept, computed at merge time as the first source's
   format; mixed-source datasets pass through the existing per-row
   `cpuReadinessPercent: number | null` so the asymmetric-source
   handling from ADR-0012 keeps working unchanged.

6. **UI surfaces the source list.** A small `SourceFileList`
   component renders one chip per imported file beneath the dropzone:
   filename + per-file row counts + per-source icon. No remove button
   in MVP — the existing reset path clears everything.

7. **Export filename derivation.** When `sources.length === 1` the
   filename derives from that source (existing behaviour). When
   `sources.length > 1` it falls back to `vsizer_estate.pptx`. The
   PPTX header label similarly uses the single filename or
   `"Multi-source ({{n}} files)"`.

### Scope-out for this ADR's first PR

- Per-file removal/re-parse UI.
- Drag-to-reorder sources.
- Source-aware dashboard filtering (showing only one vCenter's
  clusters).
- Persisting the source list (would violate ADR-0004 anyway).

## Consequences

**Positive.**
- The "10 workbooks" workflow becomes a single drop.
- Mixed RVTools + Live Optics datasets work without preprocessing.
- Collision resolution is deterministic and auditable
  (filename-suffix is human-readable).
- No engine math changes; existing aggregation and PPTX behaviour
  carry over verbatim.

**Negative.**
- Cluster-name collisions show up in PPTX slide titles as
  `"Prod-A (site-a) "` etc. Cosmetically more visible than a single-file
  setup. Acceptable trade-off vs silent merging.
- Mixed-source PPTX header label is generic ("Multi-source"). Users
  who care about per-source provenance can read the SourceFileList
  in the dashboard.
- Memory footprint scales with `Σ` rows. For ~10 workbooks × ~500
  hosts × ~5 VMs/host, the in-memory dataset is < 5 MB — well within
  browser limits. Not surfaced as a separate ADR amendment because
  no client-side limit changes.

**Neutral.**
- Privacy invariants (ADR-0001 / ADR-0004) are unchanged: parsing
  stays client-side, no persistence, no fetches with workbook bytes.
- ADR-0010 (extended import formats) is unchanged — every file in
  the batch goes through the existing per-source adapter chain.
- ADR-0012 (asymmetric CPU Ready) is unchanged — mixed batches
  surface CPU Ready on the RVTools rows and "non disponible" on the
  Live Optics rows, per-row.
- ADR-0014 (orphan host bucketing) is unchanged — clusterless hosts
  still get the `"(no cluster) <hostName>"` synthetic name, applied
  per file before collision resolution.

## Alternatives considered

- **Silent merge by cluster name.** Simpler but loses traceability
  when two files both ship a cluster called `"Prod-A"`. Rejected:
  a security-and-audit context (which is part of vsizer's product
  promise) cannot afford silent data fusion.
- **Always suffix every cluster with source.** Cleaner code but
  uglier output for the common case (distinct names). Rejected.
- **Per-file dashboards (one tab per import).** Sidesteps the merge
  problem entirely but doesn't satisfy the user's stated need ("a
  single report"). Rejected.

[#7]: https://github.com/fjacquet/vsizer/issues/7
