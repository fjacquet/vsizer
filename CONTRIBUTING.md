# Contributing to vsizer

Thanks for considering a contribution. vsizer has a small surface and a few
hard rules; this document captures them.

## Hard product invariants

These are non-negotiable. A change that breaks any of them will not be
merged regardless of how clean the implementation is.

1. **Workbooks never leave the client.** No `fetch`/`XHR`/WebSocket call may
   carry parsed dataset bytes or rows. No telemetry on dataset contents. No
   server-side assistance, ever. (ADR-0001)
2. **Memory-only state.** `vinfo` / `vhost` rows must not be persisted to
   `localStorage`, `sessionStorage`, IndexedDB, or the URL. Refresh the
   page → data is gone. (ADR-0004)
3. **Factual-only PPTX.** The deck carries numbers, not verdicts. No
   "good"/"bad", no recommendations, no editorial framing in slide
   text. The narrative is the speaker's job. (ADR-0003)
4. **SheetJS comes from the official tarball.** Don't run `npm install
   xlsx`; don't replace the pinned URL with the npm registry version.
   (ADR-0002)

## Setup

```bash
npm install            # uses the SheetJS tarball pinned in package.json
npm run dev            # http://localhost:5173/vsizer/
```

## Local checks before pushing

CI runs `typecheck → lint → test:run → build`. Run all four locally:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
```

`npm run typecheck` covers `src/` only. `npm run build` (`tsc -b && vite
build`) is the one that catches errors in `vite.config.ts`. **Always run
`npm run build` before pushing.**

## Where to put logic

`src/engines/**` and `src/utils/**` are the only layers gated by the 75 %
coverage threshold (ADR-0005). That gate is also the design hint: anything
non-trivial — parsing, aggregation, export, formatting, validation —
belongs there as pure functions. Stores hold workflow state and call into
engines; components render store/engine output.

If you find yourself writing a `for` loop or a branch in
`src/components/**` to massage data, move it into `src/utils/**` or
`src/engines/**` and write a test.

## Architecture decisions

Every non-trivial change should reference an existing ADR or add a new
one. ADRs live in `docs/adr/`, follow Nygard's
**Context · Decision · Consequences · Alternatives** format, and are
append-only (revise by writing a new ADR that supersedes the old).

## i18n

UI strings go through `t()` with the right namespace. When you add a key,
add it to **both** `src/i18n/locales/en/<ns>.json` and
`src/i18n/locales/fr/<ns>.json`. There is no missing-key gate yet, so
review the FR view manually.

## Theme

The app supports light and dark via `<html class="dark">` + Tailwind's
`dark:` variant. Every color class needs a counterpart. The PPTX deck is
palette-locked to Midnight Executive regardless of dashboard theme
(ADR-0008).

## Code style

Biome enforces the style. `npm run lint:fix` and `npm run format` will
do most of the work. Note:

- single quotes (JS/TS), double quotes (CSS), no semicolons, 2-space
  indent, 100-char lines.
- index access returns `T | undefined` (`noUncheckedIndexedAccess`);
  narrow before use rather than `!`-asserting.
- import types with `import type` (`verbatimModuleSyntax`).
- no enums, no `namespace` blocks (`erasableSyntaxOnly`).

## Commits and PRs

- Conventional-commit-ish prefixes match the existing log
  (`feat`, `fix`, `docs`, `chore`, `feat(scope)`).
- PRs against `main`. CI must be green before merge.
- One ADR-worthy change per PR when possible — easier to review and to
  revert.
