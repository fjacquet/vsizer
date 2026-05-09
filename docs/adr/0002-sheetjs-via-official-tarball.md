# ADR-0002 — SheetJS via the official tarball, not the npm package

**Status**: Accepted
**Date**: 2026-05-08

## Context

We need to read `.xlsx` (and ideally `.xlsm`, `.xlsb`, `.csv`, `.ods`) workbooks in
the browser. The de-facto leader is SheetJS (`xlsx`).

SheetJS is published two ways:

1. **`xlsx` on npm**: stuck at version `0.18.5` (March 2023). Has known
   prototype-pollution and ReDoS CVEs. SheetJS chose not to publish further versions
   to npm.
2. **Official CDN tarball**: `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
   Maintained, CVE-free, the channel SheetJS recommends.

A serious alternative is `read-excel-file`: smaller, on npm without CVEs, but
read-only and with weaker format breadth (no `.xlsb`, limited `.ods`, no styles —
the last we don't need).

## Decision

Pin the **official SheetJS tarball** in `package.json`:

```json
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

`npm install` resolves the tarball at install time and writes a hash into
`package-lock.json`, so subsequent installs are deterministic and tamper-evident.

## Consequences

**Positive**

- We get a maintained, CVE-free SheetJS with the format breadth we need to support
  RVTools, Live Optics, and the inevitable CSV exports a customer will eventually
  hand us.
- One library, one mental model. No need to keep a fallback parser around for
  formats `read-excel-file` doesn't cover.

**Negative**

- `npm install` requires network access to `cdn.sheetjs.com`. Air-gapped builds need
  a private mirror. CI on GitHub Actions has internet, so no impact today.
- Some npm tooling (Dependabot, Renovate, audit) doesn't track tarball deps the same
  way as registry deps. We compensate by putting the version in CLAUDE.md so the
  next maintainer knows where to look when bumping.
- New contributors will be tempted to "fix" the dep by pointing it at the npm
  package. CLAUDE.md and this ADR are the deterrent.

## Alternatives considered

- **`xlsx@0.18.5` from npm**: rejected. Known vulnerabilities, dead branch.
- **`read-excel-file`**: viable for V1 if we drop `.xlsb` / `.ods` support. Not
  worth the format constraint when the official SheetJS channel is available.
- **Server-side parsing**: rejected by ADR-0001 (no backend exists).

## Related

- PRD §6.2 (security)
- CLAUDE.md "Key dependencies" — explicit warning against the npm package
- `package.json` — pinned dependency
