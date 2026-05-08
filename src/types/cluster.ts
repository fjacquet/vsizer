/**
 * Per-cluster aggregate produced by the aggregation engine. One instance per
 * cluster maps 1:1 to one PPTX cluster slide and to one OverviewTable row.
 */
export interface ClusterAggregate {
  cluster: string
  hostCount: number
  vmCount: number
  /** Σ physicalGhz across hosts (nominal speed × cores / 1000). */
  physicalGhz: number
  /** Σ consumedGhz across hosts (physicalGhz × cpuRatio). */
  consumedGhz: number
  /** Mean cpuRatio across hosts, in [0, 1]. */
  meanCpuRatio: number
  /** Mean ramRatio across hosts, in [0, 1]. */
  meanRamRatio: number
}
