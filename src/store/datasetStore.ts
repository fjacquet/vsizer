import { create } from 'zustand'
import { aggregateClusters } from '../engines/aggregation/aggregateClusters'
import { aggregateGlobals } from '../engines/aggregation/globals'
import type { SourceFormat } from '../engines/parser/detectSource'
import type { ParsedDataset } from '../engines/parser/normalizeColumns'
import type { ClusterAggregate, GlobalSummary, VHostRow, VInfoRow } from '../types'

/**
 * Single source of truth for the parsed dataset and the user's export
 * selection. The store is **memory-only** — vsizer never persists workbook
 * contents to localStorage, the URL, or anywhere else (ADR-0001, ADR-0004),
 * because uploaded exports may carry sensitive hostnames.
 */
export interface DatasetState {
  /** The uploaded source file. Kept for filename/size display only — bytes
   *  are parsed once on upload and the resulting rows live in `vinfo` /
   *  `vhost`. */
  file: File | null

  /** Origin of the workbook (RVTools / Live Optics / unknown). Drives the
   *  manual mapping fallback when set to `'unknown'`. */
  source: SourceFormat

  /** Canonical VM rows after parser + adapter normalization. */
  vinfo: VInfoRow[]
  /** Canonical host rows after parser + adapter normalization. */
  vhost: VHostRow[]

  /** Per-row validation errors surfaced from the parser. UI renders a count
   *  badge — see PRD §5.2. */
  parseErrors: ParsedDataset['errors']

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

  setDataset(input: {
    file: File
    parsed: ParsedDataset
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
  'setDataset' | 'toggleCluster' | 'clearSelection' | 'toggleStretched' | 'reset'
> => ({
  file: null,
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

  setDataset: ({ file, parsed, aggregates, globals }) =>
    set({
      file,
      source: parsed.source,
      vinfo: parsed.vinfo,
      vhost: parsed.vhost,
      parseErrors: parsed.errors,
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
