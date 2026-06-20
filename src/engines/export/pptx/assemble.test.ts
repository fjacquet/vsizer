// src/engines/export/pptx/assemble.test.ts
import { describe, expect, it } from 'vitest'
import { createPptxT } from '../../../cli/i18n'
import { buildRvToolsXlsx } from '../../../test/fixtures/buildXlsx'
import { ingestDataset } from '../../ingest'
import { assembleBuildPptxInput } from './assemble'
import { buildPptxStrings } from './strings'

describe('assembleBuildPptxInput', () => {
  it('selects all clusters sorted and wires strings + readiness', () => {
    const ds = ingestDataset([{ name: 'estate.xlsx', bytes: buildRvToolsXlsx() }])
    const strings = buildPptxStrings(createPptxT('fr'), 'estate.xlsx', '2026-06-20', ds.source)
    const input = assembleBuildPptxInput(ds, strings)
    expect(input.clusters.length).toBe(Object.keys(ds.aggregates).length)
    expect(input.strings).toBe(strings)
    expect(input.globals).toBe(ds.globals)
  })
})
