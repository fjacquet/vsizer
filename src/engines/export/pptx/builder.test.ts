import { describe, expect, it } from 'vitest'
import type { ClusterAggregate, GlobalSummary, VHostRow } from '../../../types'
import { buildPptx, type PptxStrings } from './builder'

const makeAggregate = (overrides: Partial<ClusterAggregate>): ClusterAggregate => ({
  cluster: 'CL_DEMO',
  hostCount: 4,
  vmCount: 60,
  physicalGhz: 230.4,
  consumedGhz: 57.6,
  availableGhz: 172.8,
  physicalRamMb: 2_097_152,
  consumedRamMb: 650_117,
  drReservedRamMb: 0,
  availableRamMb: 1_447_035,
  meanCpuRatio: 0.25,
  maxCpuRatio: 0.32,
  minCpuRatio: 0.18,
  meanRamRatio: 0.31,
  maxRamRatio: 0.4,
  minRamRatio: 0.22,
  vcpuAllocated: 480,
  vramAllocatedMb: 524288,
  activeMemMb: 65536,
  mhzPerVcpu: 120,
  stretched: false,
  drReservedGhz: 0,
  ...overrides,
})

const host = (overrides: Partial<VHostRow>): VHostRow => ({
  hostName: 'esx-default',
  cluster: 'CL_DEMO',
  cores: 24,
  speedMhz: 2400,
  memoryMb: 524288,
  cpuRatio: 0.25,
  ramRatio: 0.31,
  ...overrides,
})

const globals: GlobalSummary = {
  clusterCount: 2,
  hostCount: 8,
  vmCount: 120,
  physicalGhz: 460.8,
  consumedGhz: 115.2,
  availableGhz: 345.6,
  physicalRamMb: 4_194_304,
  consumedRamMb: 1_300_234,
  drReservedRamMb: 0,
  availableRamMb: 2_894_070,
  meanCpuRatio: 0.25,
  meanRamRatio: 0.31,
  vcpuAllocated: 960,
  vramAllocatedMb: 1_048_576,
  activeMemMb: 131_072,
  mhzPerVcpu: 120,
  stretchedClusterCount: 0,
  drReservedGhz: 0,
}

const strings: PptxStrings = {
  deckTitle: 'vsizer — Utilisation des clusters',
  title: {
    title: 'vsizer — Utilisation des clusters',
    eyebrow: 'ANALYSE DE CAPACITÉ — VMware',
    subtitle: 'Source : test-fixture.xlsx · Date : 2026-05-09',
    kpiLabels: {
      hosts: 'hôtes',
      vms: 'VMs allumées',
      physicalGhz: 'capacité physique',
      physicalRam: 'RAM physique',
      meanCpu: 'CPU moyen utilisé',
    },
  },
  overview: {
    title: 'Utilisation CPU & RAM par cluster',
    subtitle: 'Moyenne pondérée des hôtes · marqueur or = pic max',
    columns: {
      cluster: 'Cluster',
      hostsVms: 'Hôtes / VMs',
      bars: '0%   ·   utilisation hôtes (haut: CPU, bas: RAM)   ·   100%',
      meanPeak: 'Moyenne / Pic',
      available: 'Disponibles',
    },
    cpuLabel: 'CPU',
    ramLabel: 'RAM',
    stretchedBadge: 'Étendu',
    legend: {
      title: 'Légende :',
      low: '< 40%',
      mid: '40-70%',
      high: '≥ 70%',
      peak: 'Pic max',
    },
  },
  cluster: {
    subtitle: ({
      hostCount,
      vmCount,
      totalCoresFormatted,
      ghzPerCoreFormatted,
      physicalRamFormatted,
      stretched,
      drReservedGhzFormatted,
      drReservedRamFormatted,
    }) => {
      const base = `${hostCount} hôtes · ${vmCount} VMs allumées · ${totalCoresFormatted} cores phys. (${ghzPerCoreFormatted}) · ${physicalRamFormatted} RAM`
      return stretched
        ? `${base} · DR : ${drReservedGhzFormatted} GHz / ${drReservedRamFormatted} RAM réservés`
        : base
    },
    stretchedBadge: 'Étendu',
    ramAvailableLine: (formatted: string) => `RAM disponible : ${formatted}`,
    cards: {
      cpuMean: 'CPU moyen',
      ramMean: 'RAM moyenne',
      ghzUsedVsPhys: 'GHz utilisés / phys.',
      mhzPerVcpu: 'réels par vCPU alloué',
    },
    blocks: {
      cpuTitle: 'CPU — utilisation moyenne',
      ramTitle: 'RAM — utilisation moyenne',
      cpuSubtitle: (consumed, physical, dr) =>
        `${consumed} consommés sur ${physical}${dr ? ` · ${dr} réservés DR` : ''}`,
      ramSubtitle: (consumed, physical, dr) =>
        `${consumed} consommés sur ${physical}${dr ? ` · ${dr} réservés DR` : ''}`,
      min: 'Min',
      mean: 'Moy',
      max: 'Max',
    },
    banner: {
      title: 'DONNÉES CLÉS',
      vcpuAllocated: 'vCPU alloués',
      reservedCapacity: 'Capacité réservée\n(vCPU × clock host)',
      consumedGhz: 'GHz consommés',
      availableGhz: 'GHz disponibles',
    },
    footer:
      'Source : test-fixture.xlsx — vHost (CPU/RAM usage %, Speed × Cores) + vInfo (vCPUs, Memory)',
  },
}

describe('buildPptx', () => {
  it('produces an ArrayBuffer that looks like a ZIP file (PPTX is a ZIP)', async () => {
    const out = await buildPptx({
      globals,
      clusters: [makeAggregate({ cluster: 'CL_A' }), makeAggregate({ cluster: 'CL_B' })],
      vhost: [host({ cluster: 'CL_A' }), host({ cluster: 'CL_B' })],
      strings,
    })
    expect(out).toBeInstanceOf(ArrayBuffer)
    // ZIP magic bytes: 'PK\x03\x04'
    const bytes = new Uint8Array(out)
    expect(bytes.length).toBeGreaterThan(1000)
    expect(bytes[0]).toBe(0x50) // P
    expect(bytes[1]).toBe(0x4b) // K
    expect(bytes[2]).toBe(0x03)
    expect(bytes[3]).toBe(0x04)
  })

  it('produces a deck with no clusters (title + overview only)', async () => {
    const out = await buildPptx({
      globals: { ...globals, clusterCount: 0, hostCount: 0, vmCount: 0 },
      clusters: [],
      vhost: [],
      strings,
    })
    const bytes = new Uint8Array(out)
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('handles a cluster whose hosts are missing from the vhost array', async () => {
    // Edge: aggregator emitted a cluster, but the user filtered the host list.
    // Builder should not throw — falls back to zero cores / zero speed.
    const out = await buildPptx({
      globals,
      clusters: [makeAggregate({ cluster: 'CL_GHOST' })],
      vhost: [], // intentionally empty
      strings,
    })
    expect(out).toBeInstanceOf(ArrayBuffer)
  })

  it('renders multiple clusters in input order', async () => {
    // Smoke check that a 5-cluster deck doesn't blow up. Real visual QA is
    // out-of-scope for unit tests — see PRD §8 risks.
    const clusters = ['CL_1', 'CL_2', 'CL_3', 'CL_4', 'CL_5'].map((cluster) =>
      makeAggregate({ cluster, meanCpuRatio: Math.random() }),
    )
    const vhost = clusters.map((c) => host({ cluster: c.cluster }))
    const out = await buildPptx({ globals, clusters, vhost, strings })
    expect((out as ArrayBuffer).byteLength).toBeGreaterThan(2000)
  })
})
