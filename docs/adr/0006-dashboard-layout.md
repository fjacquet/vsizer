# ADR-0006 — Dashboard layout: two-state, single-column cards, fixed sidebar

**Status**: Accepted
**Date**: 2026-05-09

## Context

V1 needs a preview-only dashboard that mirrors the PPTX deck (PRD §5.3). Many
ways to lay it out — split-screen vs. tabs, multi-column vs. single-column
cards, sidebar vs. inline filters — and each downstream test or visual tweak
depends on the choice.

The plan calls out:

- A landing state with a centered dropzone + "Charger un exemple" CTA
  (Plan §"Flux utilisateur" / step 1).
- A loaded state with a split-screen Cockpit (UploadSidebar | ClusterDashboard).
- One overview table + one card per cluster, "affichage statique, pas
  d'expansion, pas de drill-down".
- The single allowed interaction: per-cluster checkboxes in the sidebar to
  scope the export.

That settles most of the macro layout. The decisions remaining were on
density, sidebar width, mobile behavior, and the order of sections in the
main pane.

## Decision

**Layout has two distinct states**, keyed by `datasetStore.vinfo.length > 0`:

1. **Empty (landing)**. Vertically centered column with the brand wordmark,
   a single hero `FileDropzone`, and a "Charger un exemple" button below.
   No header, no sidebar, no main pane. The whole viewport invites the drop.

2. **Loaded**. The full Cockpit:
   - **Header** (top, sticky): brand left, language toggle and "Exporter
     PPTX" button right.
   - **Sidebar** (left, **fixed 320 px** on viewports ≥ 1024 px; stacks
     above the main pane on smaller viewports — no collapse animation,
     no toggle button, just CSS flex-wrap).
   - **Main pane**: a vertical stack of three sections in this order:
     `GlobalKpiBar → OverviewTable → ClusterCards`. The order is the
     same as the PPTX (title-page KPIs → overview slide → cluster slides),
     so what the user sees on screen above the fold is what's on the
     deck's first two slides.

**Cluster cards are single-column**, full-width inside the main pane. Two
reasons:

- One on-screen card maps 1:1 to one PPTX cluster slide. A multi-column
  grid breaks that mental model and makes visual QA against the deck
  harder.
- A cluster card already carries 4 KPI cards + 2 utilization blocks + the
  factual data banner. At a 1280 px main pane (1600 px viewport minus
  320 px sidebar), a single column has room to breathe; two-up gets
  cramped at typical resolutions.

**Default cluster selection is "all"**. The user toggles checkboxes off
to remove clusters from the export, never on. Empty selection is treated
as "export all" by the export hook — there's no button to disable.

## Consequences

**Positive**

- The dashboard mirrors the PPTX 1:1. A reviewer scrolling the dashboard
  is reviewing the slides in deck order.
- The sidebar is always visible during work, so the only allowed
  interaction (cluster filter) is one click away — no surprise modals or
  expansion targets.
- The empty state is purposeful: the only thing to do is drop a file or
  load the sample. No premature UI.

**Negative**

- 18+ cluster cards in single-column means a lot of scrolling. We mitigate
  with the OverviewTable (1 row per cluster, all visible above ~720 px
  viewport when collapsed) so users have a glance-level summary before
  diving into individual cards.
- The sidebar stacks (rather than collapses) on mobile. A real mobile
  user would want a toggle or a sticky-bottom filter sheet; we accept
  V1's "drag a 200 KB xlsx on a phone" being a niche use case and revisit
  if usage data says otherwise.
- Loaded state has no "shrink to landing" affordance besides a header
  "Recommencer" action — that calls `datasetStore.reset()` and returns
  the user to the empty state.

## Alternatives considered

- **Tabs (Overview / Cluster X / Cluster Y / …)**: rejected. Adds a
  click between the user and every datapoint. The plan explicitly
  forbids drill-down navigation.
- **Two-column card grid**: rejected (see above) — breaks the 1:1
  card↔slide mapping and gets cramped.
- **Collapsible sidebar with hamburger**: rejected for V1. The interaction
  is too small to justify the keyboard and aria-state complexity. Stack
  on small screens, keep open on large.
- **OverviewTable below the cards**: rejected. The KPI bar and overview
  are the at-a-glance view; cluster cards are the deep dive. Cards-first
  buries the summary.

## Related

- PRD §5.3 (Dashboard)
- ADR-0003 (Factual-only PPTX) — the dashboard mirrors that policy
- `src/components/layout/Cockpit.tsx`, `src/components/outputs/*.tsx`
- `src/store/datasetStore.ts` — the `vinfo.length > 0` flag drives the state switch
