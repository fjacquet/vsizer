# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

vsizer ingests an RVTools or Live Optics export and produces a factual VMware cluster utilization
PowerPoint deck. **The whole pipeline runs in the browser — uploaded files must never leave the
client.** Treat that constraint as a hard product invariant when adding features (no fetches that
ship workbook bytes, no telemetry of parsed contents, no `localStorage` persistence of dataset rows).

## Commands

```bash
npm run dev            # Vite dev server at http://localhost:5173/vsizer/
npm run build          # tsc -b && vite build (production bundle into dist/)
npm run preview        # serve the built bundle
npm run typecheck      # tsc --noEmit (strict, src/ only — does NOT cover vite.config.ts)
npm run lint           # biome check .
npm run lint:fix       # biome check --write .
npm run format         # biome format --write .
npm run test           # vitest (watch)
npm run test:run       # vitest run (CI mode, single pass)
npm run test:coverage  # vitest run --coverage
# Run a single test file or pattern:
npx vitest run src/engines/aggregation/ghz.test.ts
npx vitest run -t "physicalGhz"
```

CI (`.github/workflows/static.yml`) runs `typecheck → lint → test:run → build` on push to `main`
then deploys `dist/` to GitHub Pages. `tsc -b` (inside `build`) project-references both
`tsconfig.app.json` and `tsconfig.node.json` — so any type error in `vite.config.ts` is caught at
build time but not by `npm run typecheck`. **Always run `npm run build` before pushing.**

## Architecture

The app is a single-page React 19 + TypeScript + Vite client. The intended layering — wired through
path aliases in both `vite.config.ts` and `tsconfig.app.json` — is:

- `@engines` (`src/engines/`) — pure, side-effect-free domain logic: RVTools/Live Optics parsing,
  cluster utilization math, PPTX deck assembly. **All non-trivial logic belongs here.** These
  modules are the only ones gated by Vitest coverage thresholds (75% lines/functions/branches/
  statements via `vitest.config.ts`'s `include`). Write them as plain functions that take parsed
  data and return results.
- `@utils` (`src/utils/`) — small reusable helpers (formatters, csv export, validators); also
  covered by the 75% threshold.
- `@store` (`src/store/`) — Zustand stores. `datasetStore.ts` is the single source of truth for
  the parsed dataset and the user's export selection. Keep stores thin: they hold UI/workflow state
  and call into engines, never embed business logic.
- `@components` (`src/components/`) — React UI; consumes stores and engine outputs.
- `@hooks` (`src/hooks/`) — React hooks bridging stores/engines to components.
- `@types` (`src/types/`) — canonical shared shapes (`VInfoRow`, `VHostRow`, `ClusterAggregate`).
  Validate external/untrusted shapes (uploaded workbooks) with Zod at the engine boundary.

### i18n

`src/i18n/` bootstraps react-i18next with FR + EN and five namespaces (`common`, `upload`,
`dashboard`, `pptx`, `validation`). Resources are bundled at build time, not lazy-loaded. The
detector is `i18next-browser-languagedetector` (querystring `?lang=` → `localStorage` key
`vsizer-lang` → browser navigator → `fr` fallback). Test setup imports `../i18n` so
`useTranslation()` returns real strings during Vitest runs.

When adding a UI string: route it through `t()` and add the key to **both** `locales/en/<ns>.json`
**and** `locales/fr/<ns>.json`. Untranslated keys produce silent fallthrough — there's no missing-key
gate yet, so review the FR view manually until one is added.

### Key dependencies

- **xlsx (SheetJS, pinned to the official CDN tarball in `package.json`)** — reads the uploaded
  workbook. Do **not** replace this with `npm install xlsx`; the npm package is stuck at 0.18.5
  with known CVEs. The tarball install (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) is
  the SheetJS-recommended channel.
- **pptxgenjs** — generates the output deck. The Tailwind theme tokens in `src/index.css`
  (Midnight Executive palette: `--color-primary-*`, `--color-util-{low,mid,high}`,
  `--color-accent-500`) are intended to mirror the PPTX export theme — keep the two in sync.
- **zustand** — client state, memory-only. **Never** persist `vinfo`/`vhost` rows to URL or
  `localStorage` (privacy invariant).
- **react-error-boundary** — `App.tsx` wraps the tree; `FallbackError` is exported for unit
  testing. `FallbackProps.error` is typed `unknown`, so always narrow with `instanceof Error`
  before reading `.message`.
- **sonner** — `<Toaster />` is mounted in `App.tsx`; reuse it rather than introducing alternatives.
- **zod** — runtime validation for parsed/external data.

### Vite config quirks

- `base: '/vsizer/'` is set for GitHub Pages; the dev server URL therefore lives at
  `/vsizer/`, not `/`.
- `rollupOptions.output.manualChunks` uses the **function form** intentionally. The static-object
  form (`{ 'vendor-react': ['react', ...] }`) trips Rollup's discriminated union typing under
  `tsc -b`, even though the runtime accepts both.

## Conventions

- **Strict TypeScript.** `tsconfig.app.json` enables `strict`, `noUncheckedIndexedAccess`,
  `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, and
  `resolveJsonModule`. Index access returns `T | undefined`; narrow before use rather than
  `!`-asserting (Biome warns on `noNonNullAssertion`). Import types with `import type`
  (verbatimModuleSyntax). Don't use enums or `namespace` blocks (erasableSyntaxOnly).
- **Path aliases.** Use `@engines/aggregation/ghz`, `@utils/format`, `@store/datasetStore`, etc.
  **Bare-form aliases (`@engines`, `@utils`) are not configured** — always include a sub-path or
  import the file directly. Note also that the `@types/*` mapping shadows npm's `@types/*` package
  namespace; importing from npm `@types/<pkg>` directly will misresolve.
- **Biome formatting** (`biome.json`): single quotes (JS only — CSS uses double), no semicolons,
  2-space indent, 100-char lines. Imports are auto-organized. `noUnusedImports` and
  `noUnusedVariables` are errors in source but only warnings in test files.
- **Tests** live next to source as `*.test.ts(x)`. The Vitest setup file is `src/test/setup.ts`
  (jsdom + `@testing-library/jest-dom` + i18n init). Coverage gates only `src/engines/**` and
  `src/utils/**`, which reflects where logic should concentrate. Tests under `src/store/`,
  `src/components/`, etc. run but don't count toward thresholds.
- **UI text** goes through `t()` with the right namespace. The shell already uses `common:` and
  `upload:` keys — match that pattern for new components.
