// src/cli/pptx.test.ts

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRvToolsXlsx } from '../test/fixtures/buildXlsx'
import { runCli } from './pptx'

describe('runCli', () => {
  it('writes a valid .pptx from an RVTools file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vsizer-cli-'))
    const input = join(dir, 'estate.xlsx')
    writeFileSync(input, Buffer.from(buildRvToolsXlsx()))
    const out = join(dir, 'out.pptx')
    const code = await runCli(['--out', out, '--quiet', input])
    expect(code).toBe(0)
    const bytes = readFileSync(out)
    expect(bytes.length).toBeGreaterThan(1000)
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK') // pptx is a zip
  })

  it('returns non-zero on a missing file', async () => {
    expect(await runCli(['/no/such/file.xlsx', '--quiet'])).not.toBe(0)
  })
})
