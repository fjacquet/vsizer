# ADR-0010 — Extended import formats: RVTools `RVTools_tab*`, modern Live Optics, and Live Optics `.zip` bundles

**Status**: Accepted
**Date**: 2026-05-09
**Builds on**: ADR-0001 (100 % client-side), ADR-0002 (SheetJS via the
official tarball)

## Context

V1 recognized exactly two workbook layouts:

- **RVTools** — sheets named `vInfo` + `vHost`.
- **Live Optics (classic)** — sheets named `VM Inventory` + `Host Inventory`.

Field reports surfaced two more shapes that vsizer silently rejected as
`unknown`:

1. **RVTools `RVTools_tab*`-prefixed builds.** Some RVTools builds (and
   any post-processed combined export that round-trips through the CSV
   intermediate) keep the internal table names as sheet labels —
   `RVTools_tabvInfo` / `RVTools_tabvHost`. The contents are unchanged;
   only the sheet labels differ. `detectSource` rejected them because
   `n.startsWith('vhost')` did not match `rvtools_tabvhost`.
2. **Modern Live Optics layout (Dell exports from 2025+).** The current
   Dell Live Optics tool ships a *VMWARE* workbook with compact sheet
   names (`VMs`, `ESX Hosts`, `ESX Performance`, `VM Performance`, …)
   instead of the legacy long names. Worse, the static config and
   utilization data are split across two sheets — `ESX Hosts` carries
   cores/clock/memory; the per-host `Average CPU %` / `Average Memory %`
   columns live on `ESX Performance`. The classic adapter found no host
   sheet at all under the new names.
3. **Live Optics ships a five-file `.zip`.** The actual artifact a user
   downloads from Dell is a zip bundle containing
   `LiveOptics_<id>_AIR_<date>.{xlsx,pptx}`,
   `LiveOptics_<id>_GENERAL_<date>.xlsx`,
   `LiveOptics_<id>_PERF_<date>.pptx`, and
   `LiveOptics_<id>_VMWARE_<date>.xlsx`. The dropzone only accepted
   `.xlsx`, forcing users to extract the bundle by hand and pick the
   right file — error-prone and not the workflow they expect.

These gaps rejected ~80 % of the workbooks our internal users feed in.
Manual workarounds (renaming sheets in Excel, copy-pasting columns) are
not acceptable for a tool whose pitch is "drop in your export".

## Decision

### 1. RVTools `RVTools_tab*` aliases

`detectSource` and `adaptRvtools` accept the two extra prefixes
`rvtools_tabvinfo` / `rvtools_tabvhost`, in addition to the canonical
`vinfo` / `vhost`, and use the **same** `startsWith` matching the
canonical path already uses (a post-processed combined export may
suffix the table name as `RVTools_tabvInfo_v2`). We deliberately don't
widen further to `n.includes('vinfo')` — that would match user-renamed
sheets like `vInformation` or `myvinfostuff` and risk silently picking
the wrong sheet.

The internal column shapes are identical to the canonical RVTools
build, so no adapter changes are needed beyond the sheet lookup.

### 2. Modern Live Optics: dual-layout adapter, single source format

`detectSource` returns `liveoptics` for either sheet-name fingerprint
(`VM Inventory + Host Inventory` **or** `VMs + ESX Hosts`). Returning a
new `liveoptics-modern` source value would have widened the
`SourceFormat` union and forced every consumer (UI, store, tests) to
branch on it for no real benefit — the canonical `VInfoRow` / `VHostRow`
shapes are identical between the two.

Inside the adapter we dispatch on which sheet pair is present:

```
adaptLiveOptics(workbook):
  if (VM Inventory && Host Inventory) → classic adapter
  elif (VMs && ESX Hosts)              → modern adapter (joins ESX Performance)
  else                                  → empty rows
```

Classic takes precedence when (improbably) both layouts coexist.

### 3. Modern host adapter: join, conversions, missing-perf fallback

Modern host rows are assembled from two sheets:

| Field | Source sheet | Source column | Conversion |
|---|---|---|---|
| `hostName` | `ESX Hosts` | `Host Name` | none |
| `cluster` | `ESX Hosts` | `Cluster` | none |
| `cores` | `ESX Hosts` | `CPU Cores` | trunc, ≥1 |
| `speedMhz` | `ESX Hosts` | `CPU Clock Speed (GHz)` ⨯1000 | falls back to `CPU Clock Speed (MHz)` if present |
| `memoryMb` | `ESX Hosts` | `Memory (KiB)` ÷1024 | falls back to `Memory (MiB)` if present |
| `cpuRatio` | `ESX Performance` | `Average CPU %` | toRatio (÷100 when >1.5) |
| `ramRatio` | `ESX Performance` | `Average Memory %` | toRatio (÷100 when >1.5) |

The join key is the host name string (full FQDN, identical on both
sheets in every export observed). `ESX Performance` is treated as
**optional** — if it is missing, both ratios fall back to `0`. The
schema accepts `0`; the dashboard renders the host as 0 % utilized,
which is misleading-but-honest. We surface the gap implicitly via the
"0 %" reading rather than emitting a parser error: failing the import
on a missing perf sheet would over-block users whose Live Optics run
disabled performance collection.

VM rows come from a single sheet (`VMs`). We deliberately do **not**
join `VM Performance` because `VMs.Used Memory (active) (MiB)` already
carries the active-memory value the dashboard needs — adding a join
would multiply parser surface area for no extra signal.

### 4. Unit conversions: prefer-explicit-MiB-over-derived

For both clock speed and memory we accept `MHz`/`MiB` headers (used
directly) **and** `GHz`/`KiB` headers (converted). When both are present
we prefer the already-correct unit:

```ts
const speedMhz = speedMhzRaw > 0 ? speedMhzRaw : speedGhzRaw * 1000
const memoryMb = memoryMibRaw > 0 ? memoryMibRaw : memoryKibRaw / 1024
```

This keeps the door open for a future Live Optics build that adds a
direct `Memory (MiB)` column without breaking the existing conversion
path.

### 5. Zip bundle ingestion: extract in-browser, route by file name

`FileDropzone` accepts `.zip` in addition to the spreadsheet extensions.
A new pure helper `extractWorkbookBytes(buffer, fileName)` lives in
`engines/parser/extractWorkbook.ts` and runs **before** `parseDataset`:

```
useDatasetUpload:
  buffer        ← await file.arrayBuffer()
  workbookBytes ← extractWorkbookBytes(buffer, file.name)
  parsed        ← parseDataset(workbookBytes)
```

The helper is a no-op for non-zip file names. For `.zip` it opens the
archive in-memory with [`fflate`][fflate] and selects the workbook by:

1. The first `.xlsx` whose name (case-insensitive) contains the
   `_vmware_` token. Robust against future date/serial-number changes.
2. Otherwise, the lone `.xlsx` if exactly one is present (covers
   hand-rolled archives that just zip an RVTools export).
3. Otherwise, throw `ZipExtractError` — the UI surfaces it via a
   dedicated `upload:errors.zipExtractFailed` toast, distinct from the
   generic parse-error toast so the user can tell the difference.

**Routing is by file extension**, not by magic bytes. Every `.xlsx` is
itself a zip (PK header), so a magic-byte sniff would mis-route every
upload. The dropzone provides the extension via `File.name`, which is
authoritative.

ADR-0001 is preserved: `fflate.unzipSync` runs in the browser; bytes
never leave the client. The library adds ~3 KB gzip to the index
chunk — negligible next to `vendor-xlsx` (122 KB gzip).

[fflate]: https://github.com/101arrowz/fflate

## Consequences

**Positive**

- All five workbook variants **and** the three Live Optics zip bundles
  in our internal sample set now parse end-to-end with zero validation
  errors. The accepted-formats hint in the dropzone advertises `.zip`
  explicitly; users no longer need to extract manually.
- The modern Live Optics adapter is the first parser path that joins
  two sheets. The pattern (sheet-name lookup → optional-perf join → row
  fan-out) is reusable for future formats.
- `SourceFormat` stays narrow (`rvtools | liveoptics | unknown`); UI
  and store code paths are unchanged.

**Negative**

- The Live Optics adapter file roughly doubles in size. Mitigated by
  keeping the modern column maps and helper (`buildPerfLookup`)
  co-located with the classic ones; no new module yet.
- Missing `ESX Performance` produces silent zero-utilization rather
  than a loud error. Acceptable because (a) the dashboard headline
  metrics still compute, (b) users running Live Optics with perf
  disabled get *some* output rather than a blocking failure. We can
  promote this to `errors[]` later if the silent-zero case shows up
  in the field as confusing.

## Alternatives considered

- **Widen `findSheet` to `n.includes(c)`.** Rejected: too eager —
  `vInformation` would match `vinfo`. Explicit alias list is safer.
- **New `liveoptics-modern` source value.** Rejected: adds a fork to
  every consumer of `SourceFormat` for no observable user benefit.
- **Always join `VM Performance` for active memory.** Rejected: the
  same number is on `VMs.Used Memory (active) (MiB)` directly.
- **Hard-fail when `ESX Performance` is absent.** Rejected: punishes
  the user for a Live Optics configuration choice that vsizer shouldn't
  override.

## Related

- ADR-0001 — 100 % client-side processing (preserved; zip extraction
  runs entirely in the browser)
- ADR-0002 — SheetJS via the official tarball (preserved). One new
  runtime dep: `fflate` (~3 KB gzip in the index chunk, MIT licensed).
- `src/engines/parser/detectSource.ts` (alias list)
- `src/engines/parser/adapters/rvtools.ts` (`findSheet` aliases)
- `src/engines/parser/adapters/liveoptics.ts` (modern dispatcher,
  `adaptLiveOpticsModernVInfo`, `adaptLiveOpticsModernVHost`,
  `buildPerfLookup`)
- `src/engines/parser/extractWorkbook.ts` (zip-aware
  `extractWorkbookBytes`, `ZipExtractError`)
- `src/components/inputs/FileDropzone.tsx` (accepts `.zip`)
- `src/hooks/useDatasetUpload.ts` (extracts before parsing,
  zip-specific toast)
- `src/i18n/locales/{en,fr}/upload.json` (`zipExtractFailed`,
  updated `accepted` hint)
