# ADR-0008 — Auto dark mode (full light theme + 3-state toggle)

**Status**: Accepted
**Date**: 2026-05-09
**Amends (partially)**: ADR-0006 (the dashboard-mirrors-deck property is
relaxed: same layout, same information, but different palette in light mode)

## Context

vsizer was dark-only by construction. `index.css` hardcoded `color-scheme: dark`,
the `@theme` block defined the Midnight Executive palette, and every component
class targeted `bg-surface-*` / `text-slate-100` / `border-surface-700`. That
fits a presales engineer reviewing a deck on a dimmed display, but burns out
under a window or in a bright office. Customers asked for an OS-driven theme
with manual override.

The PPTX deck has different constraints: it's the deliverable, it ships with
brand identity, customers open it in their own tools — its palette has to be
deterministic and is set by ADR-0003 (factual mode + Midnight Executive). So
the ergonomic question only applies to the dashboard.

## Decision

### 1. Three-state user preference, OS-driven by default

`useTheme()` exposes:

```ts
preference: 'auto' | 'light' | 'dark'
resolved:   'light' | 'dark'
setPreference(p): void
```

Default is `auto`. When `auto`, `resolved` follows
`window.matchMedia('(prefers-color-scheme: dark)')` reactively (the listener
fires only when preference is `auto`). When the user picks `light` or `dark`,
that pin overrides the OS until they pick `auto` again.

Persistence: `localStorage['vsizer-theme']`, parallel to the existing
`vsizer-lang`. Removing the key when preference goes back to `auto` keeps
the store clean.

### 2. Class-based Tailwind variant

`src/index.css` declares `@custom-variant dark (&:where(.dark, .dark *));`
so `dark:bg-surface-800` activates when an ancestor has `class="dark"`. The
`html` element is the source of truth. We don't use Tailwind v4's media-query
default for `dark:` because manual override has to win.

`html { color-scheme: light; }` plus `html.dark { color-scheme: dark; }`
ensures native scrollbars / form controls follow the resolved theme.

### 3. FOUC prevention via inline script

`index.html` ships a tiny synchronous script in `<head>` (before stylesheets)
that reads `localStorage['vsizer-theme']` and `prefers-color-scheme` and adds
`class="dark"` to `<html>` before paint. Wrapped in try/catch because Safari
private mode throws on `localStorage` access. ~12 lines, no dependencies.

### 4. PPTX stays Midnight Executive

The deck's palette is **not** driven by the user's theme preference. ADR-0003
fixed the deck palette as a brand-neutral choice, ADR-0006 said dashboard
mirrors deck. We carve out a relaxation here: dashboard and deck still mirror
**layout and information**, but **not literal palette**. A user in light mode
sees the dashboard light, exports the deck, the deck remains Midnight
Executive. That's the right trade because:

- The deck ships off-machine; consistent palette regardless of who renders it
  is a brand requirement.
- The dashboard is on-machine; ergonomics is the user's call.

### 5. Light palette via Tailwind defaults, no new tokens

Mapping (no new CSS variables; we use existing Tailwind utilities):

| Concern | Light | Dark |
| --- | --- | --- |
| Page bg | `bg-slate-50` | `bg-surface-900` |
| Panel bg | `bg-white` | `bg-surface-800` |
| Subtle border | `border-slate-200` | `border-surface-700` |
| Primary text | `text-slate-900` | `text-slate-100` |
| Secondary text | `text-slate-500..700` | `text-slate-300..400` |
| Most muted | `text-slate-400..500` | `text-slate-500` |
| Accent gold (`accent-500`) | unchanged | unchanged |
| Status colors (low/mid/high) | unchanged | unchanged |
| Navy data banner (`bg-primary-900`) | unchanged | unchanged — intentional contrast block in both modes |

The cluster card's bottom data banner stays navy in both modes — it's a brand
element, designed for contrast against any page background, not a surface
that should adapt.

### 6. ThemeToggle component, not a hidden setting

A 3-state segmented control sits in the header next to the language switcher.
Same `<fieldset>` + `aria-pressed` idiom, with inline-SVG glyphs (sun / moon /
monitor) so we don't add an icon dependency. Translators get
`common:theme.{label,auto,light,dark}`.

## Consequences

**Positive**

- Daily ergonomics improved — users in bright environments don't burn out
  staring at a dark dashboard.
- The auto detection is reactive: changing OS theme with vsizer open flips
  the dashboard live.
- The PPTX deliverable stays palette-locked, which is what brand wants.

**Negative**

- Every component class list grew with `dark:` doubling. Roughly 80 edits
  across ~12 files. Future contributors can break light mode silently if
  they only check dark; a Storybook / Chromatic safety net is out of scope
  for V1.
- Light-mode visual review is on the developer; we don't have automated
  visual diffs. ADR-0008 documents the convention as the deterrent.
- Vitest's jsdom mode in this project doesn't expose `localStorage`
  mutators, so the `useTheme` test suite asserts on runtime behavior
  (resolved value, `<html>` class) rather than localStorage state. The
  hook works in production via try/catch.

## Alternatives considered

- **OS-honest only (just `color-scheme: dark light`)** — rejected. Browser
  chrome would adapt but visuals would stay dark; doesn't solve the actual
  ergonomic problem.
- **Inverted Tailwind (light is default, light/dark via `light:`)** —
  rejected. The dark theme is the long-running brand identity; making it
  the variant rather than the default would feel like a regression in code
  reading.
- **Custom semantic tokens (`--vs-bg-page`) flipped via data attribute** —
  rejected for V1. Cleaner but requires every component to switch from
  `bg-surface-X` to `bg-[var(--vs-bg-page)]`. Bigger blast radius for
  marginal cleanliness gain.
- **A second light palette in `@theme`** — rejected. Tailwind v4's `@theme`
  is a single source; flipping per-mode is what the `dark:` variant is for.
- **PPTX adapts to dashboard theme** — rejected (ADR-0008 §4 reasoning).

## Related

- ADR-0003 (factual-only PPTX, Midnight Executive palette for the deck)
- ADR-0006 (dashboard-mirrors-deck — relaxed here for palette only)
- `src/index.css` (`@custom-variant dark`, light-mode body styling)
- `index.html` (FOUC-prevention inline script)
- `src/hooks/useTheme.ts` + `useTheme.test.ts`
- `src/components/inputs/ThemeToggle.tsx`
- `src/components/layout/Header.tsx` (segmented control placement)
- `src/i18n/locales/{fr,en}/common.json` (`theme.*` strings)
