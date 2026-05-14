import type { SourceFormat } from '../engines/parser/detectSource'

/**
 * One entry in the `sources` array of `datasetStore`. Captures the
 * subset of file metadata the UI actually needs to display — name,
 * size, detected source format, and per-file row contributions —
 * without retaining the raw `File` bytes.
 *
 * The `File` object itself is not kept (privacy invariant ADR-0001
 * means bytes are dropped after parse; storing the File would
 * incidentally retain the workbook in memory longer than necessary).
 *
 * Added in ADR-0017 to support multi-file import (issue #7).
 */
export interface SourceFile {
  /** Original filename (with extension). */
  name: string
  /** Bytes (from `File.size`) — surfaced as "N kB" in the UI. */
  size: number
  /** Detected source format for THIS file. May differ from another
   *  file in the same batch (mixed RVTools + Live Optics is allowed
   *  per ADR-0017). */
  source: SourceFormat
  /** Number of canonical `VInfoRow`s contributed by this file after
   *  parser + Zod validation. */
  vinfoRows: number
  /** Number of canonical `VHostRow`s contributed by this file after
   *  parser + Zod validation. */
  vhostRows: number
}
