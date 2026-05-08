import { z } from 'zod'
import type { ClusterAggregate, VHostRow, VInfoRow } from '../../types'

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
  vcpu: z.number().int().nonnegative(),
  vramMb: z.number().nonnegative(),
  // SheetJS leaves blanks as `null`; nullable() keeps that contract explicit.
  activeMemMb: z.number().nullable(),
  poweredOn: z.boolean(),
})

export const VHostRowSchema: z.ZodType<VHostRow> = z.object({
  hostName: z.string(),
  cluster: z.string(),
  cores: z.number().int().positive(),
  speedMhz: z.number().positive(),
  // Allow slight overrun (1.05) since some sources clamp at 100 % imperfectly.
  cpuRatio: z.number().min(0).max(1.5),
  ramRatio: z.number().min(0).max(1.5),
})

export const ClusterAggregateSchema: z.ZodType<ClusterAggregate> = z.object({
  cluster: z.string(),
  hostCount: z.number().int().nonnegative(),
  vmCount: z.number().int().nonnegative(),
  physicalGhz: z.number().nonnegative(),
  consumedGhz: z.number().nonnegative(),
  meanCpuRatio: z.number().min(0).max(1.5),
  meanRamRatio: z.number().min(0).max(1.5),
})
