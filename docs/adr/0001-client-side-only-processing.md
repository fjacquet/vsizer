# ADR-0001 — 100 % client-side processing

**Status**: Accepted
**Date**: 2026-05-08
**Supersedes**: —

## Context

vsizer ingests RVTools or Live Optics workbooks. These files routinely contain
production hostnames, IP addresses, customer cluster names, and VM names that map 1:1
to internal services. They're confidential by default, and many target customers have
explicit IT policies forbidding upload to third-party SaaS.

The legacy reference tool is a Python script run locally — that's the only reason it
gets used at all. We need to reach the same audience over the public web without
breaking the trust contract that made the script acceptable.

## Decision

Process every byte in the user's browser. The deployment is a single static site on
GitHub Pages. No backend exists. After the app loads:

- The dropped workbook is read with `FileReader` into an in-memory `ArrayBuffer`.
- SheetJS parses on the main thread (Web Worker is a future option, see PRD §8).
- Aggregation runs as pure functions in `src/engines/`.
- The resulting PPTX is assembled by `pptxgenjs` and downloaded directly.
- No request that carries user data is ever made.

## Consequences

**Positive**

- Trivially auditable: open DevTools → Network and the user can verify themselves.
- No infrastructure to operate, no auth, no secrets, no DPA.
- App URL can be shared with anyone — partners, customers — without legal review.

**Negative**

- Heavy parsing happens on whatever the user has. A 200 MB workbook on a 4 GB Chromebook
  will struggle. We accept that for V1 (PRD §6.1) and will move parsing to a Web
  Worker if a real customer hits it.
- Some quality-of-life features are explicitly off the table: cross-session history,
  shareable result links, server-side LLM analysis of the dataset. Those would
  trade away the property that makes the tool deployable.
- We can't observe production failures via server logs. We rely on the
  `react-error-boundary` fallback and (eventually) opt-in client-side error reporting
  that does not embed dataset content.

## Alternatives considered

- **Backend with auth + transient storage**: rejected. Even with TLS and per-customer
  encryption, the procurement bar to deploy this internally at customer sites raises
  the cost of adoption an order of magnitude. The original script was successful
  *because* it ran locally.
- **Hybrid: client parses, server only stores aggregates for sharing**: rejected for
  V1. Aggregates can still leak cluster names; once we open the door we'd have to
  argue the line. Easier to keep the door closed.

## Related

- PRD §3 (privacy guarantee), §5.1 (input layer), §6.2 (security)
- `App.tsx` footer: "100 % client · votre fichier ne quitte jamais votre navigateur"
