# ADR-0018: Installable PWA with offline app-shell service worker

- **Status:** Accepted
- **Date:** 2026-05-16
- **Related:** ADR-0001 (100% client-side), ADR-0004 (memory-only state),
  ADR-0013 (container distribution / reinforces 0001),
  ADR-0016 (strict audit gates — all deps, LOW+)

## Context

vsizer is a single-page client app that already does 100% of its work
in the browser (ADR-0001): the workbook is read with the File API,
parsed, aggregated, and turned into a PPTX entirely client-side, with
**zero** network requests that carry user data. That makes it an ideal
Progressive Web App — once the static shell is cached it can run with
no network at all — but today it ships no web app manifest and no
service worker, so it is neither installable nor offline-capable.

Two project invariants constrain how a service worker may be added:

1. **Privacy (ADR-0001 / ADR-0004).** Uploaded workbook bytes and any
   derived dataset state must never leave the browser or be persisted
   (the only allowed persistent key is `vsizer-lang`). A service worker
   may cache only static, public build assets.
2. **Refresh drops the dataset (ADR-0004).** State is memory-only;
   a full page reload destroys the in-memory dataset. A service-worker
   update therefore must never silently force-reload the page.

Deployment adds a third: GitHub Pages serves under `base: '/vsizer/'`
while the container image build (ADR-0013) uses `--base=/`. Manifest
URLs, icon paths, the SW scope and the precache manifest must be
correct for **both** base values — never hardcoded.

## Decision

Add PWA support with **`vite-plugin-pwa`** (Workbox `generateSW`
strategy) in **prompt** mode.

1. **Plugin, not hand-rolled.** `vite-plugin-pwa` derives the manifest,
   the Workbox precache manifest of content-hashed assets, the SW
   scope and registration glue from Vite's resolved `base`
   automatically, so both `/vsizer/` and `/` builds are correct with no
   bespoke code. The dependency cost was weighed against ADR-0016 (see
   Consequences / Alternatives) and accepted after verifying it adds no
   LOW+ advisory.

2. **Prompt-to-reload update UX.** `registerType: 'prompt'`: a new SW
   *waits*; it never auto-`skipWaiting`/`clientsClaim`. Registration
   goes through the framework-agnostic `virtual:pwa-register` module
   inside `src/pwa/registerSW.ts`, which surfaces the update via the
   existing `sonner` toaster with i18n strings (`common:pwa.*`) and a
   "Reload" action that calls `updateSW(true)`. If the user ignores it,
   the new version activates on the next natural full navigation —
   never mid-session. This satisfies the ADR-0004 constraint: the
   in-memory dataset is only ever dropped by an explicit user action.

3. **Precache scope = static shell only.** Workbox `globPatterns`
   precache hashed JS/CSS, `index.html`, the SVG/PNG icons, the web
   manifest, and the anonymized `public/samples/rvtools-sample.xlsx`
   fixture (so "Load a sample" works offline). Sourcemaps are excluded.
   `navigateFallback: 'index.html'` boots the single SPA entry offline.
   **No `runtimeCaching` rule is configured** — there is no dynamic or
   user-data request to cache, by construction.

4. **Disabled in development.** `devOptions.enabled: false` keeps the SW
   out of `vite dev` to avoid stale-cache interference with HMR.

5. **Full icon set.** A small fixed set is generated **once** from
   `public/favicon.svg` with host tools that are **not** added to
   `package.json` (so `npm audit` / OSV-Scanner / the CycloneDX SBOM
   are unaffected), and committed as binaries under `public/icons/`.
   The manifest references the SVG (`sizes:"any"`) for crisp Chromium/
   Android install plus PNGs `icon-192`, `icon-512`, and a
   `maskable-512` (artwork inside the 80% safe zone on opaque brand
   purple `#7e14ff`). `index.html` links a 180px opaque
   `apple-touch-icon` for the iOS home screen.

   Reproduction command (run from the repo root; tools via Homebrew,
   not project dependencies):

   ```sh
   rsvg-convert -w 880 public/favicon.svg -o /tmp/vsizer-logo.png
   magick /tmp/vsizer-logo.png -background none -gravity center \
     -resize 425x425 -extent 512x512 public/icons/icon-512.png
   magick public/icons/icon-512.png -resize 192x192 \
     public/icons/icon-192.png
   magick -size 512x512 xc:'#7e14ff' \
     \( /tmp/vsizer-logo.png -resize 300x300 \) \
     -gravity center -composite public/icons/maskable-512.png
   magick -size 180x180 xc:'#7e14ff' \
     \( /tmp/vsizer-logo.png -resize 120x120 \) \
     -gravity center -composite -alpha remove -alpha off \
     public/icons/apple-touch-icon-180.png
   ```

## Consequences

**Positive.**
- vsizer becomes installable and runs fully offline after first load,
  reinforcing the no-backend product story (ADR-0001 / ADR-0013).
- Repeat visits are near-instant (cache-first hashed assets).
- The "Load a sample" path works with no network.

**Negative.**
- A new devDependency tree (`vite-plugin-pwa`, `workbox-build`,
  `workbox-window`, ~300 transitive packages) is now subject to the
  ADR-0016 LOW+ gate; a future advisory anywhere in that tree can
  red-bar CI with no code change on our side. Mitigation: the gate is
  run locally before commit; prefer a version bump or npm `overrides`;
  a mirrored `osv-scanner.toml` + Waivers entry only as last resort.
  Verified at adoption: `npm audit --audit-level=low` and OSV-Scanner
  (with the existing waiver config) both report **no** new findings.
- `theme_color`/`background_color` are static (the manifest has no
  media-query support), so the install splash uses the brand
  purple/white pair regardless of the dashboard's dark-mode state
  (ADR-0008). Acceptable; not worth a runtime hack.

**Neutral.**
- Privacy invariants (ADR-0001 / ADR-0004) are unchanged. The SW
  precaches only static, public build assets. Uploaded bytes never
  become a `Request` (File API), so there is nothing for Workbox to
  intercept or store; no `runtimeCaching` is configured and the
  precache list is a closed, build-known set.
- ADR-0013 (container distribution) is unchanged — the plugin emits
  base-correct output for both `/vsizer/` and `--base=/`.
- ADR-0008 (dark mode) is unchanged — the PPTX palette and dashboard
  theming are untouched.

## Alternatives considered

- **Zero-dependency hand-rolled SW + inline Vite plugin.** No new
  dependency, best alignment with ADR-0016 and the project's
  hand-rolled bias. Rejected by product owner in favour of
  `vite-plugin-pwa` for robust precaching of Vite's hashed filenames
  and lower maintenance, accepted once the LOW+ gate was verified clean.
- **`registerType: 'autoUpdate'` (silent reload).** Simpler, no UI
  strings. Rejected: an auto-reload destroys the in-memory dataset,
  violating ADR-0004.
- **SVG-only minimal icons.** Fewer binary assets. Rejected: no proper
  maskable icon and a degraded iOS home-screen icon; the product wants
  full install fidelity.
- **No PWA.** Rejected — installability and offline app-shell is the
  requested value, and the privacy model makes it essentially free.
