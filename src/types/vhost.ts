/**
 * Canonical ESXi host row produced by the RVTools / Live Optics adapters.
 * Ratios are 0..1 floats — formatters in `@utils/format` turn them into
 * locale-aware percent strings at the UI boundary.
 */
export interface VHostRow {
  hostName: string
  cluster: string
  /** Physical core count. */
  cores: number
  /** Nominal CPU speed in MHz. */
  speedMhz: number
  /** Mean CPU utilization in [0, 1] over the source's monitoring window. */
  cpuRatio: number
  /** Mean RAM utilization in [0, 1]. */
  ramRatio: number
}
