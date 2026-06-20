import { describe, expect, it } from 'vitest'
import { buildPptxStrings } from './strings'
import { createPptxT } from '../../../cli/i18n'

describe('buildPptxStrings', () => {
  it('fills the deck strings from a standalone i18n instance', () => {
    const t = createPptxT('fr')
    const s = buildPptxStrings(t, 'estate.xlsx', '2026-06-20', 'rvtools')
    expect(typeof s.deckTitle).toBe('string')
    expect(s.deckTitle.length).toBeGreaterThan(0)
    expect(typeof s.title.title).toBe('string')
  })
})
