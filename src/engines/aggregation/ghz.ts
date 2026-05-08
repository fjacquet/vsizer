/**
 * GHz primitives shared by the cluster-aggregation engine and the PPTX
 * builder. Kept side-effect-free and unit-stable: every input is documented
 * in MHz / cores / 0..1 ratio so the call sites can't accidentally mix units.
 *
 * These mirror the calculations from the legacy `build_pptx.py` script —
 * port them carefully when filling in the rest of the aggregation engine.
 */

/** Convert a raw MHz value into GHz. */
export const mhzToGhz = (mhz: number): number => mhz / 1000

/**
 * Total physical GHz a host advertises: nominal CPU speed × physical cores.
 * Inputs are MHz and a positive integer; the result is GHz.
 */
export const physicalGhz = (speedMhz: number, cores: number): number => (speedMhz * cores) / 1000

/**
 * GHz currently consumed by a host: physical capacity scaled by its mean
 * CPU utilization ratio (0..1).
 */
export const consumedGhz = (speedMhz: number, cores: number, cpuRatio: number): number =>
  physicalGhz(speedMhz, cores) * cpuRatio
