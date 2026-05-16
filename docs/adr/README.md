# Architecture Decision Records

Each file in this directory captures one architectural decision in
[Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
**Context · Decision · Consequences · Alternatives**.

ADRs are append-only. To revise a decision, write a new ADR that supersedes the
old one and update the old one's `Status` to `Superseded by ADR-NNNN`.

## Index

| #    | Title                                              | Status   |
| ---- | -------------------------------------------------- | -------- |
| 0001 | 100 % client-side processing                       | Accepted |
| 0002 | SheetJS via the official tarball, not the npm pkg  | Accepted |
| 0003 | Factual-only PPTX (strip editorial language)       | Accepted |
| 0004 | Memory-only state (no localStorage / URL)          | Accepted |
| 0005 | Engines + utils as the only coverage-gated layers  | Accepted |
| 0006 | Dashboard layout: two-state, single-column, fixed sidebar | Accepted |
| 0007 | Stretched-cluster DR reservation (CPU and RAM)     | Accepted (amends 0006) |
| 0008 | Auto dark mode (full light theme + 3-state toggle) | Accepted (amends 0006) |
| 0009 | vCPU/pCPU consolidation ratio (DR-aware)           | Accepted (builds on 0007) |
| 0010 | Extended import formats: RVTools `RVTools_tab*`, modern Live Optics & `.zip` bundles | Accepted |
| 0011 | DR-aware utilization ratios (capacity-weighted)    | Accepted (builds on 0007 / 0009) |
| 0012 | CPU Ready (contention) from RVTools, asymmetric source | Accepted (builds on 0003 / 0010) |
| 0013 | Container image distribution via GHCR              | Accepted (reinforces 0001) |
| 0015 | Security audit & supply-chain policy               | Superseded by ADR-0016 |
| 0016 | Strict audit gates — all deps, LOW+ severity       | Accepted (supersedes 0015's gating clause) |
| 0017 | Multi-file import (RVTools + Live Optics)          | Accepted (builds on 0010, 0014) |
| 0018 | Installable PWA with offline app-shell service worker | Accepted (reinforces 0001 / 0013) |
