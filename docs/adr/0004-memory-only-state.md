# ADR-0004 — Memory-only state (no localStorage / URL persistence of dataset)

**Status**: Accepted
**Date**: 2026-05-08

## Context

vsizer's sibling project `raidy` persists its config to the URL with LZ-string
compression — this lets users share a "here's the configuration I'm seeing" link.
That works because raidy's state is a few hundred bytes of preferences.

vsizer's state is fundamentally different: a parsed dataset for an 18-cluster /
300-host estate is comfortably 200–500 KB of structured JSON. Two things follow:

1. The size is well past the 2 KB practical URL limit and the 8 KB per-key
   `localStorage` quota wouldn't help much either.
2. The contents are confidential (hostnames, cluster names — see ADR-0001).
   Persisting them anywhere on disk turns the privacy guarantee into a "guarantee
   except for that one place".

## Decision

The Zustand store (`src/store/datasetStore.ts`) is **memory-only**. No persistence
middleware, no `localStorage`, no URL fragment, no IndexedDB. Refreshing the page
drops the dataset. The user re-drops the file.

The single allowed `localStorage` key is `vsizer-lang` — the i18n preference. That
key carries no dataset content.

## Consequences

**Positive**

- Every refresh starts clean. No stale data, no mismatch between "what's in the
  URL" and "what was actually parsed".
- Privacy guarantee (ADR-0001) holds without exceptions. Closing the tab is the
  end of the data lifecycle.
- The store stays small and fast — no serialization on every action.

**Negative**

- The user can't bookmark a result. They re-drop the file each session. Acceptable
  trade-off given the alternatives all violate ADR-0001.
- If parsing took 30 s, a refresh costs 30 s again. The performance budget in PRD
  §6.1 absorbs that.

## Alternatives considered

- **`zustand/middleware/persist` to localStorage**: rejected on confidentiality
  (would store hostnames in plain text on disk).
- **Encrypt before localStorage**: rejected. The encryption key would have to live
  somewhere in the page; an attacker with disk access also has the key. Faux
  protection.
- **IndexedDB for datasets > some threshold**: rejected. Same confidentiality
  problem; no real upside over re-dropping.
- **URL-encoded aggregates only (not raw rows)**: tempting — aggregates are 18
  rows of small numbers. But the cluster names are still PII. Same wall.

## Related

- PRD §3 (privacy guarantee), §4.2 (out-of-scope)
- ADR-0001 (client-side processing)
- `App.tsx` footer language: "votre fichier ne quitte jamais votre navigateur"
- `src/store/datasetStore.ts` — implementation
- `src/i18n/index.ts` — `lookupLocalStorage: 'vsizer-lang'` (the only key)
