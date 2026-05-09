import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App, { FallbackError } from './App'
import { useDatasetStore } from './store/datasetStore'
import type { GlobalSummary, VInfoRow } from './types'

const sampleVm: VInfoRow = {
  vmName: 'vm-1',
  cluster: 'CL_DEMO_1',
  vcpu: 4,
  vramMb: 8192,
  activeMemMb: 1024,
  poweredOn: true,
}

const sampleGlobals: GlobalSummary = {
  clusterCount: 1,
  hostCount: 1,
  vmCount: 1,
  physicalGhz: 100,
  consumedGhz: 25,
  availableGhz: 75,
  physicalRamMb: 524288,
  consumedRamMb: 157286,
  drReservedRamMb: 0,
  availableRamMb: 367002,
  meanCpuRatio: 0.25,
  meanRamRatio: 0.3,
  vcpuAllocated: 4,
  vramAllocatedMb: 8192,
  activeMemMb: 1024,
  mhzPerVcpu: 6250,
  stretchedClusterCount: 0,
  drReservedGhz: 0,
}

afterEach(() => {
  useDatasetStore.getState().reset()
})

describe('App shell', () => {
  it('renders the empty landing when no dataset is loaded', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /vsizer/i })).toBeInTheDocument()
    // Dropzone instruction is the first visible CTA.
    expect(screen.getByText(/glissez votre export|drop your rvtools/i)).toBeInTheDocument()
  })

  it('switches to the cockpit (header + main content) when a dataset is loaded', () => {
    useDatasetStore.getState().setDataset({
      file: new File(['fake'], 'demo.xlsx'),
      parsed: { source: 'rvtools', vinfo: [sampleVm], vhost: [], errors: [] },
      aggregates: {
        CL_DEMO_1: {
          cluster: 'CL_DEMO_1',
          hostCount: 1,
          vmCount: 1,
          physicalGhz: 100,
          consumedGhz: 25,
          availableGhz: 75,
          physicalRamMb: 524288,
          consumedRamMb: 157286,
          drReservedRamMb: 0,
          availableRamMb: 367002,
          meanCpuRatio: 0.25,
          maxCpuRatio: 0.3,
          minCpuRatio: 0.2,
          meanRamRatio: 0.3,
          maxRamRatio: 0.32,
          minRamRatio: 0.28,
          vcpuAllocated: 4,
          vramAllocatedMb: 8192,
          activeMemMb: 1024,
          mhzPerVcpu: 6250,
          stretched: false,
          drReservedGhz: 0,
        },
      },
      globals: sampleGlobals,
    })

    render(<App />)
    // Header carries the export button.
    expect(screen.getByRole('button', { name: /exporter pptx|export pptx/i })).toBeInTheDocument()
    // Cluster name appears in the loaded view.
    expect(screen.getByRole('heading', { name: /CL_DEMO_1/ })).toBeInTheDocument()
  })
})

describe('FallbackError', () => {
  it('renders the message of an Error instance', () => {
    render(<FallbackError error={new Error('boom-from-test')} resetErrorBoundary={() => {}} />)
    expect(screen.getByText('boom-from-test')).toBeInTheDocument()
  })

  it('coerces non-Error throws to a string', () => {
    render(<FallbackError error={'string-throw'} resetErrorBoundary={() => {}} />)
    expect(screen.getByText('string-throw')).toBeInTheDocument()
  })
})
