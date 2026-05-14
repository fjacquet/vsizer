import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClusterAggregate } from '../../types'
import { ClusterFilterPanel } from './ClusterFilterPanel'

const cluster = (overrides: Partial<ClusterAggregate>): ClusterAggregate => ({
  cluster: 'CL',
  hostCount: 1,
  vmCount: 1,
  physicalCores: 24,
  usablePhysicalCores: 24,
  vcpuPerPcpu: 0,
  physicalGhz: 60,
  consumedGhz: 10,
  availableGhz: 50,
  physicalRamMb: 524288,
  consumedRamMb: 0,
  drReservedRamMb: 0,
  availableRamMb: 524288,
  meanCpuRatio: 0.1,
  maxCpuRatio: 0.1,
  minCpuRatio: 0.1,
  meanRamRatio: 0,
  maxRamRatio: 0,
  minRamRatio: 0,
  vcpuAllocated: 0,
  vramAllocatedMb: 0,
  activeMemMb: null,
  mhzPerVcpu: 0,
  stretched: false,
  drReservedGhz: 0,
  meanCpuReadinessPercent: null,
  maxCpuReadinessPercent: null,
  vmsAboveReadinessWarning: 0,
  readinessAvailable: false,
  ...overrides,
})

const renderPanel = (clusters: ClusterAggregate[]) =>
  render(
    <ClusterFilterPanel
      clusters={clusters}
      selected={new Set<string>()}
      stretched={new Set<string>()}
      onToggle={vi.fn()}
      onToggleStretched={vi.fn()}
      onSelectNone={vi.fn()}
    />,
  )

describe('ClusterFilterPanel — orphan rows (ADR-0014)', () => {
  it('renders the DR toggle for real clusters', () => {
    renderPanel([cluster({ cluster: 'CL_PROD' })])
    // Locate the row by its (visible) cluster name, then assert the
    // DR pill button is present within that row.
    const labels = screen.getAllByText('CL_PROD')
    const row = labels[0]?.closest('li')
    if (!row) throw new Error('row not found')
    expect(within(row).getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('omits the DR toggle for synthesized "(no cluster) ..." rows', () => {
    renderPanel([cluster({ cluster: '(no cluster) esx-01.lab' })])
    const labels = screen.getAllByText('(no cluster) esx-01.lab')
    const row = labels[0]?.closest('li')
    if (!row) throw new Error('row not found')
    // No button inside the row — checkbox is an <input>, not a button.
    expect(within(row).queryAllByRole('button')).toHaveLength(0)
  })

  it('omits the toggle only for the orphan row, not the real ones next to it', () => {
    renderPanel([cluster({ cluster: 'CL_PROD' }), cluster({ cluster: '(no cluster) esx-02' })])
    const prod = screen.getAllByText('CL_PROD')[0]?.closest('li')
    const orphan = screen.getAllByText('(no cluster) esx-02')[0]?.closest('li')
    if (!prod || !orphan) throw new Error('rows not found')
    expect(within(prod).getAllByRole('button').length).toBeGreaterThan(0)
    expect(within(orphan).queryAllByRole('button')).toHaveLength(0)
  })
})
