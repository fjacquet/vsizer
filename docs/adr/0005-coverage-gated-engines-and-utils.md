# ADR-0005 — Engines + utils as the only coverage-gated layers

**Status**: Accepted
**Date**: 2026-05-08

## Context

A whole-codebase coverage threshold sounds rigorous but tends to produce three
failure modes in React apps:

1. **Vanity tests for components**: render the component, assert it doesn't crash.
   Coverage goes up; bug-detection power doesn't.
2. **Snapshot drift**: snapshots become noise that PR reviewers rubber-stamp,
   defeating the point.
3. **Pressure to test wiring**: stores, hooks and adapters get test scaffolding
   that breaks every time you rename a variable, with no real bug surfaced.

Where logic actually concentrates in vsizer is unambiguous — every branch we'd
care to defend is in `src/engines/` (parsing, aggregation, PPTX assembly) or
`src/utils/` (formatters). Components glue store state to engine output;
hooks glue effects to stores. That layering is intentional (see CLAUDE.md §
Architecture).

## Decision

Vitest's coverage configuration gates exactly two paths at 75 % across all four
metrics:

```ts
// vitest.config.ts
coverage: {
  include: ['src/engines/**/*.ts', 'src/utils/**/*.ts'],
  thresholds: { lines: 75, functions: 75, branches: 75, statements: 75 },
}
```

Tests outside that path (component tests, store tests, integration tests) **run**
but don't contribute to or be measured against the threshold. The threshold also
excludes `**/*.test.ts`, `**/*.spec.ts`, and `**/*.d.ts`. Barrel files (`index.ts`)
are technically in scope but contribute zero branches and one re-export each, so
they don't move the needle.

## Consequences

**Positive**

- The number that matters is the number that matters. A 95 % coverage bar on the
  layer that contains every cluster-utilization calculation is meaningful; that
  same bar on a `<Header />` is theatre.
- Component tests stay opt-in and purposeful. We can write a `<ClusterCard />`
  test when we want to prove a specific behavior, not because a coverage gate
  demands one.
- Refactoring components doesn't break a coverage gate. Refactoring an engine
  function intentionally exposes whether the existing tests still pin the
  behavior.

**Negative**

- Bugs in stores or hooks pass through the gate. That's a real risk. We mitigate
  with:
  - Stores stay thin by convention — they hold state and call engines, never embed
    business logic.
  - Hooks are thin too: a typed wrapper around a store action.
  - When a wiring bug *does* surface, we add a test on the specific path,
    accepting that it doesn't gate coverage.
- A new contributor reading the threshold might think the project is "75 %
  tested" and ship something untested in components. CLAUDE.md and this ADR are
  the deterrent.

## Alternatives considered

- **Whole-codebase 75 % gate**: rejected. Produces vanity tests in components.
- **Different thresholds per layer (90 % engines, 60 % utils, 0 % components)**:
  rejected as overcomplicated. The boolean "logic vs wiring" cut is enough.
- **No threshold; rely on review**: rejected. The threshold catches the case
  where someone deletes a test file in passing.

## Related

- PRD §7 (success criteria — coverage ≥ 75 %)
- CLAUDE.md "Architecture" — the layering rationale
- `vitest.config.ts` — the actual configuration
