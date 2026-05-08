import { create } from 'zustand'
import type { ClusterAggregate, VHostRow, VInfoRow } from '../types'

/**
 * Single source of truth for the parsed dataset and the user's export
 * selection. The store is **memory-only** — vsizer never persists workbook
 * contents to localStorage, the URL, or anywhere else, because uploaded
 * exports may carry sensitive hostnames. Refreshing the page is expected to
 * drop everything; a sample dataset can be re-loaded from `/samples/`.
 */
export interface DatasetState {
  /** The uploaded source file. Kept for filename/size display only — bytes
   *  are parsed once on upload and the resulting rows live in `vinfo` /
   *  `vhost`. */
  file: File | null
  /** Canonical VM rows after parser + adapter normalization. */
  vinfo: VInfoRow[]
  /** Canonical host rows after parser + adapter normalization. */
  vhost: VHostRow[]
  /** Set of cluster names selected for export. An empty set is the V1 UX
   *  contract for "export all clusters" — toggling adds/removes one. */
  selectedClusters: Set<string>
  /** Computed cluster aggregates, keyed by cluster name. */
  aggregates: Record<string, ClusterAggregate>

  setFile(file: File | null): void
  setRows(rows: { vinfo: VInfoRow[]; vhost: VHostRow[] }): void
  setAggregates(aggregates: Record<string, ClusterAggregate>): void
  toggleCluster(name: string): void
  reset(): void
}

const initialState = {
  file: null,
  vinfo: [] as VInfoRow[],
  vhost: [] as VHostRow[],
  selectedClusters: new Set<string>(),
  aggregates: {} as Record<string, ClusterAggregate>,
}

export const useDatasetStore = create<DatasetState>((set) => ({
  ...initialState,
  setFile: (file) => set({ file }),
  setRows: ({ vinfo, vhost }) => set({ vinfo, vhost }),
  setAggregates: (aggregates) => set({ aggregates }),
  toggleCluster: (name) =>
    set((state) => {
      const next = new Set(state.selectedClusters)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return { selectedClusters: next }
    }),
  reset: () => set({ ...initialState, selectedClusters: new Set<string>() }),
}))
