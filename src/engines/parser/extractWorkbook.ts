import { unzipSync } from 'fflate'

/**
 * Raised when an upload looks like a zip but no usable workbook can be
 * extracted (no `.xlsx` inside, ambiguous candidates, malformed archive).
 * The UI surfaces `message` directly via the existing parse-failure toast.
 */
export class ZipExtractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipExtractError'
  }
}

const lower = (s: string): string => s.toLowerCase()
const endsWithXlsx = (name: string): boolean => lower(name).endsWith('.xlsx')

/**
 * Pick the workbook entry from a Dell Live Optics-style zip.
 *
 * Live Optics ships a five-file bundle (`*_AIR_*`, `*_GENERAL_*`, `*_PERF_*`,
 * `*_VMWARE_*` plus two decks). The VMware export is the one vsizer needs;
 * everything else is non-relevant chrome (`AIR.xlsx` is an applications
 * inventory, `GENERAL.xlsx` a high-level summary).
 *
 * Selection heuristic, in order:
 *   1. The first `.xlsx` whose lower-cased name contains the `_vmware_`
 *      token. Robust against future date/serial-number changes in the
 *      file naming convention because the token survives.
 *   2. If exactly one `.xlsx` exists in the archive, use it. Covers
 *      hand-rolled archives where users zipped just an RVTools export.
 *   3. Otherwise, throw — there's no safe automatic choice and we don't
 *      want to silently pick the wrong workbook.
 */
const pickXlsxEntry = (entries: Record<string, Uint8Array>): string => {
  const xlsxNames = Object.keys(entries).filter(endsWithXlsx)
  if (xlsxNames.length === 0) {
    throw new ZipExtractError('Zip contains no .xlsx file')
  }
  const vmwareMatch = xlsxNames.find((n) => lower(n).includes('_vmware_'))
  if (vmwareMatch) return vmwareMatch
  if (xlsxNames.length === 1) {
    const only = xlsxNames[0]
    if (only) return only
  }
  throw new ZipExtractError(
    `Zip contains ${xlsxNames.length} .xlsx files but none match the *_VMWARE_*.xlsx Live Optics naming pattern`,
  )
}

const extractFromZip = (bytes: Uint8Array): Uint8Array => {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err)
    throw new ZipExtractError(`Could not read zip archive: ${cause}`)
  }
  const name = pickXlsxEntry(entries)
  const data = entries[name]
  // `data === undefined` shouldn't happen (pickXlsxEntry returns a key
  // that's in `entries`), but the type system doesn't know that. The
  // zero-length branch is the realistic case: a corrupted bundle could
  // legitimately ship a 0-byte entry, and we want a typed
  // ZipExtractError now rather than a cryptic SheetJS parse failure
  // later.
  if (!data || data.length === 0) {
    throw new ZipExtractError(`Zip entry ${name} is missing or empty`)
  }
  return data
}

/**
 * Normalize an upload into the bytes of a single .xlsx workbook.
 *
 * - For a `.xlsx` (or any non-zip file name) the input is returned
 *   unchanged — `parseXlsx` is the next consumer and it already accepts
 *   both `ArrayBuffer` and `Uint8Array`.
 * - For a `.zip` the archive is opened in-memory and the relevant
 *   workbook (`*_VMWARE_*.xlsx` or, fallback, the lone `.xlsx` entry) is
 *   returned as `Uint8Array`. ADR-0001 still holds: the bytes never
 *   leave the browser.
 *
 * Routing is by **file name extension**, not magic bytes — every `.xlsx`
 * is itself a zip (PK header), so a magic-byte sniff would mis-route a
 * regular workbook upload into the zip branch.
 */
export const extractWorkbookBytes = (
  buffer: ArrayBuffer | Uint8Array,
  fileName: string,
): Uint8Array => {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  if (lower(fileName).endsWith('.zip')) {
    return extractFromZip(u8)
  }
  return u8
}
