import { z } from 'zod'
import type { ClusterAggregate, GlobalSummary, VHostRow, VInfoRow } from '../../types'

/**
 * Runtime validators for the canonical row shapes. These are applied at the
 * **adapter boundary** — once an RVTools or Live Optics row has been
 * normalized, parsing it through the schema either yields a typed row or a
 * structured error the UI can surface. Engines downstream of the adapters
 * never re-validate.
 *
 * The `z.ZodType<T>` annotations enforce that the schemas stay in lock-step
 * with the canonical TS types in `src/types/`. If a field drifts, this file
 * stops compiling — that's the intended contract.
 */

export const VInfoRowSchema: z.ZodType<VInfoRow> = z.object({
  vmName: z.string(),
  cluster: z.string(),
  // ESXi host this VM runs on. RVTools `vInfo.Host`; empty string for
  // Live Optics sources that don't expose the column. Used by
  // `synthesizeOrphanClusters` to attribute clusterless VMs to their
  // host (ADR-0014). Empty strings are valid here — same contract as
  // the `cluster` field.
  host: z.string(),
  vcpu: z.number().int().nonnegative(),
  vramMb: z.number().nonnegative(),
  // SheetJS leaves blanks as `null`; nullable() keeps that contract explicit.
  activeMemMb: z.number().nullable(),
  // CPU Ready % from RVTools quickStats (ADR-0012). Bound at 200 to
  // absorb the same source-side overshoot the ratio cap was raised to
  // 3.0 for (ADR-0011): OverallCpuReadiness can sum vCPU contributions
  // and briefly exceed 100 %. Always null on Live Optics inputs.
  cpuReadinessPercent: z.number().min(0).max(200).nullable(),
  poweredOn: z.boolean(),
})

export const VHostRowSchema: z.ZodType<VHostRow> = z.object({
  hostName: z.string(),
  cluster: z.string(),
  cores: z.number().int().positive(),
  speedMhz: z.number().positive(),
  // 0 is allowed: when the parser couldn't read the host-memory column,
  // the cluster aggregate reports `physicalRamMb = 0` and the dashboard
  // renders `—` rather than crashing.
  memoryMb: z.number().nonnegative(),
  // Allow slight overrun (1.05) since some sources clamp at 100 % imperfectly.
  cpuRatio: z.number().min(0).max(1.5),
  ramRatio: z.number().min(0).max(1.5),
})

export const ClusterAggregateSchema: z.ZodType<ClusterAggregate> = z.object({
  cluster: z.string(),
  hostCount: z.number().int().nonnegative(),
  vmCount: z.number().int().nonnegative(),
  physicalCores: z.number().int().nonnegative(),
  usablePhysicalCores: z.number().nonnegative(),
  vcpuPerPcpu: z.number().nonnegative(),
  physicalGhz: z.number().nonnegative(),
  consumedGhz: z.number().nonnegative(),
  // availableGhz / availableRamMb can be negative when a stretched cluster
  // is consumed past 50 % (the "DR at risk" signal). Don't gate on sign here.
  availableGhz: z.number(),
  physicalRamMb: z.number().nonnegative(),
  consumedRamMb: z.number().nonnegative(),
  drReservedRamMb: z.number().nonnegative(),
  availableRamMb: z.number(),
  // Bound to 3.0, not 1.5: a stretched cluster scales raw measurements
  // by `physicalGhz / (physicalGhz − drReservedGhz)` (= 2 for the V1
  // 50 % reservation), so a host running near 100 % becomes ~200 % of
  // usable capacity. Cap at 3.0 to absorb the same 1.05× source
  // overshoot the original 1.5 cap was sized for. See ADR-0011.
  meanCpuRatio: z.number().min(0).max(3),
  maxCpuRatio: z.number().min(0).max(3),
  minCpuRatio: z.number().min(0).max(3),
  meanRamRatio: z.number().min(0).max(3),
  maxRamRatio: z.number().min(0).max(3),
  minRamRatio: z.number().min(0).max(3),
  vcpuAllocated: z.number().int().nonnegative(),
  vramAllocatedMb: z.number().nonnegative(),
  activeMemMb: z.number().nonnegative().nullable(),
  mhzPerVcpu: z.number().nonnegative(),
  stretched: z.boolean(),
  drReservedGhz: z.number().nonnegative(),
  // CPU Ready aggregates (ADR-0012). Bound mirrors VInfoRow.
  meanCpuReadinessPercent: z.number().min(0).max(200).nullable(),
  maxCpuReadinessPercent: z.number().min(0).max(200).nullable(),
  vmsAboveReadinessWarning: z.number().int().nonnegative(),
  readinessAvailable: z.boolean(),
})

export const GlobalSummarySchema: z.ZodType<GlobalSummary> = z.object({
  clusterCount: z.number().int().nonnegative(),
  hostCount: z.number().int().nonnegative(),
  vmCount: z.number().int().nonnegative(),
  physicalCores: z.number().int().nonnegative(),
  usablePhysicalCores: z.number().nonnegative(),
  vcpuPerPcpu: z.number().nonnegative(),
  physicalGhz: z.number().nonnegative(),
  consumedGhz: z.number().nonnegative(),
  availableGhz: z.number(),
  physicalRamMb: z.number().nonnegative(),
  consumedRamMb: z.number().nonnegative(),
  drReservedRamMb: z.number().nonnegative(),
  availableRamMb: z.number(),
  // Same 0..3 bound as ClusterAggregateSchema — see ADR-0011.
  meanCpuRatio: z.number().min(0).max(3),
  meanRamRatio: z.number().min(0).max(3),
  vcpuAllocated: z.number().int().nonnegative(),
  vramAllocatedMb: z.number().nonnegative(),
  activeMemMb: z.number().nonnegative().nullable(),
  mhzPerVcpu: z.number().nonnegative(),
  stretchedClusterCount: z.number().int().nonnegative(),
  drReservedGhz: z.number().nonnegative(),
  // Sum across reporting clusters (ADR-0012 §7). Null when no cluster
  // reported readiness (Live Optics-only estate). Wired but not
  // currently surfaced — see ADR-0012 V2 follow-up note.
  vmsAboveReadinessWarning: z.number().int().nonnegative().nullable(),
})
