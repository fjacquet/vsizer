import { create } from 'zustand'
import { aggregateClusters } from '../engines/aggregation/aggregateClusters'
import { aggregateGlobals } from '../engines/aggregation/globals'
import type { SourceFormat } from '../engines/parser/detectSource'
import { isOrphanCluster } from '../engines/parser/synthesizeOrphanClusters'
import type { ClusterAggregate, GlobalSummary, SourceFile, VHostRow, VInfoRow } from '../types'

/**
 * Single source of truth for the parsed dataset and the user's export
 * selection. The store is **memory-only** — vsizer never persists workbook
 * contents to localStorage, the URL, or anywhere else (ADR-0001, ADR-0004),
 * because uploaded exports may carry sensitive hostnames.
 *
 * Multi-file import (ADR-0017): `sources` holds metadata for every
 * imported workbook. The raw `File` bytes are dropped after parse;
 * `sources` carries only the display metadata. `vinfo` / `vhost`
 * already contain rows from every file with cluster-name collisions
 * resolved upstream (`resolveClusterCollisions`).
 */
export interface DatasetState {
  /** Metadata for each imported workbook. Length 0 = empty state,
   *  length 1 = single-file import (most common), length > 1 =
   *  multi-file estate import (ADR-0017). */
  sources: SourceFile[]

  /** Origin of the imported data. For a single-file import this is
   *  that file's format. For a multi-file import this is the
   *  first source's format — per-row nullable fields (e.g.
   *  `cpuReadinessPercent`) handle mixed-source data symmetrically
   *  (ADR-0012). */
  source: SourceFormat

  /** Canonical VM rows after parser + adapter normalization, merged
   *  across all sources with cluster-name collisions resolved. */
  vinfo: VInfoRow[]
  /** Canonical host rows after parser + adapter normalization, merged
   *  across all sources with cluster-name collisions resolved. */
  vhost: VHostRow[]

  /** Per-row validation errors surfaced from the parser. UI renders a count
   *  badge — see PRD §5.2. Aggregated across all imported files. */
  parseErrors: { file: string; sheet: 'vinfo' | 'vhost'; index: number; message: string }[]

  /** Set of cluster names selected for export. Empty set = "export all"
   *  (V1 UX contract — see ADR-0006). */
  selectedClusters: Set<string>

  /** Set of cluster names the user has marked as 2-site stretched vSAN/
   *  vSphere clusters. Drives the 50 % DR reservation across CPU and RAM
   *  (ADR-0007). Empty set = no clusters stretched. */
  stretchedClusters: Set<string>

  /** Computed cluster aggregates, keyed by cluster name. Includes the
   *  DR-aware figures for any cluster in `stretchedClusters`. */
  aggregates: Record<string, ClusterAggregate>

  /** Estate-wide rollup. Filled at the same time as `aggregates`. */
  globals: GlobalSummary | null

  setMergedDataset(input: {
    sources: SourceFile[]
    source: SourceFormat
    vinfo: VInfoRow[]
    vhost: VHostRow[]
    parseErrors: DatasetState['parseErrors']
    aggregates: Record<string, ClusterAggregate>
    globals: GlobalSummary
  }): void
  toggleCluster(name: string): void
  /** Convenience: deselect every cluster (effectively clears the filter). */
  clearSelection(): void
  /** Toggle a cluster's stretched flag and **atomically re-aggregate** the
   *  cluster + global figures so the dashboard reflects the new DR math
   *  without a separate hook orchestration step (ADR-0007). */
  toggleStretched(name: string): void
  reset(): void
}

const emptyState = (): Omit<
  DatasetState,
  'setMergedDataset' | 'toggleCluster' | 'clearSelection' | 'toggleStretched' | 'reset'
> => ({
  sources: [],
  source: 'unknown',
  vinfo: [],
  vhost: [],
  parseErrors: [],
  selectedClusters: new Set<string>(),
  stretchedClusters: new Set<string>(),
  aggregates: {},
  globals: null,
})

export const useDatasetStore = create<DatasetState>((set) => ({
  ...emptyState(),

  setMergedDataset: ({ sources, source, vinfo, vhost, parseErrors, aggregates, globals }) =>
    set({
      sources,
      source,
      vinfo,
      vhost,
      parseErrors,
      aggregates,
      globals,
      // New dataset → fresh selection + fresh stretched flags.
      selectedClusters: new Set<string>(),
      stretchedClusters: new Set<string>(),
    }),

  toggleCluster: (name) =>
    set((state) => {
      const next = new Set(state.selectedClusters)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return { selectedClusters: next }
    }),

  clearSelection: () => set({ selectedClusters: new Set<string>() }),

  toggleStretched: (name) =>
    set((state) => {
      // Orphan rows (one synthetic cluster per standalone host,
      // ADR-0014) can never be a 2-site stretched pair — there is
      // exactly one box. The ClusterFilterPanel hides the toggle for
      // these rows; this guard catches anything else (URL hydration,
      // future scripted hooks) that tries to set the flag.
      if (isOrphanCluster(name)) return {}

      const nextStretched = new Set(state.stretchedClusters)
      if (nextStretched.has(name)) nextStretched.delete(name)
      else nextStretched.add(name)

      // Re-aggregate atomically so consumers always see consistent
      // (clusters, globals, stretchedClusters).
      const list = aggregateClusters({
        vinfo: state.vinfo,
        vhost: state.vhost,
        stretchedClusters: nextStretched,
      })
      const nextAggregates: Record<string, ClusterAggregate> = {}
      for (const cluster of list) nextAggregates[cluster.cluster] = cluster
      const nextGlobals = aggregateGlobals(list)

      return {
        stretchedClusters: nextStretched,
        aggregates: nextAggregates,
        globals: nextGlobals,
      }
    }),

  reset: () => set(emptyState()),
}))

/**
 * Selectors. Each one returns a referentially-stable value so Zustand can
 * skip unnecessary re-renders. **Don't compute new arrays / objects inside
 * a selector** — Zustand uses strict equality and an unstable reference
 * triggers an infinite re-render loop.
 *
 * Sort the cluster list at the consumer side via `useMemo`. Helper
 * `sortAggregates` is the stable derivation; call it inside `useMemo`.
 */
export const selectHasDataset = (s: DatasetState): boolean =>
  s.vinfo.length > 0 || s.vhost.length > 0

/** Helper: stable derivation from a referentially-stable `aggregates` ref. */
export const sortAggregates = (aggregates: Record<string, ClusterAggregate>): ClusterAggregate[] =>
  Object.values(aggregates).sort((a, b) => a.cluster.localeCompare(b.cluster))
