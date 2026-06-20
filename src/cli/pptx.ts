// src/cli/pptx.ts
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { assembleBuildPptxInput } from '../engines/export/pptx/assemble'
import { buildPptx } from '../engines/export/pptx/builder'
import { buildPptxStrings } from '../engines/export/pptx/strings'
import { IngestError, ingestDataset } from '../engines/ingest'
import { createPptxT } from './i18n'

interface Args {
  input?: string
  out?: string
  lang: string
  quiet: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { lang: 'fr', quiet: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') args.out = argv[++i]
    else if (a === '--lang') args.lang = argv[++i] ?? 'fr'
    else if (a === '--quiet') args.quiet = true
    else if (!a.startsWith('-')) args.input = a
  }
  return args
}

const todayIso = (): string => new Date().toISOString().slice(0, 10)

export async function runCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv)
  if (!args.input) {
    process.stderr.write('usage: vsizer-pptx <source.xlsx> [--out file] [--lang code] [--quiet]\n')
    return 2
  }
  try {
    const bytes = await readFile(args.input)
    const ds = ingestDataset([{ name: basename(args.input), size: bytes.length, bytes }])
    const strings = buildPptxStrings(
      createPptxT(args.lang),
      basename(args.input),
      todayIso(),
      ds.source,
    )
    const input = assembleBuildPptxInput(ds, strings)
    const deck = await buildPptx(input)
    const out =
      args.out ??
      join(dirname(args.input), `${basename(args.input).replace(/\.[^.]+$/, '')}_vsizer.pptx`)
    await writeFile(out, Buffer.from(deck))
    if (!args.quiet) process.stdout.write(`${out}\n`)
    return 0
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`${err instanceof IngestError ? 'ingest error' : 'error'}: ${msg}\n`)
    return 1
  }
}

// Node passes [node, script, ...args]; strip the first two.
if (process.argv[1]?.endsWith('pptx.ts')) {
  runCli(process.argv.slice(2)).then((code) => process.exit(code))
}
