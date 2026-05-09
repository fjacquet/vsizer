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
