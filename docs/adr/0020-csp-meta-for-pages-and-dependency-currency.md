# ADR-0020: CSP `<meta>` for GitHub Pages and dependency currency

- **Status:** Accepted
- **Date:** 2026-11-28
- **Related:** ADR-0001 (100% client-side), ADR-0013 (container headers),
  ADR-0016 (strict audit gates), ADR-0018 (PWA)

## Context

The container image (ADR-0013) ships a strict Content-Security-Policy via
`docker/security-headers.conf`. The GitHub Pages deployment cannot set
response headers, so it runs with **no CSP at all**: any injected script
could read the in-memory dataset or exfiltrate it, breaking the ADR-0001
guarantee in depth. A security review (2026-11-28) also found the lockfile
behind published patches (runtime `zod` advisory GHSA-mrhx-c7xc-m3w5).

## Decision

1. Add a `<meta http-equiv="Content-Security-Policy">` to `index.html`
   carrying the same policy as the container minus the directives a meta
   element cannot enforce (`frame-ancestors`, `report-to`; the container
   header keeps them). `script-src 'self'` needs no hashes because the only
   scripts are external files (`/theme-init.js`, the Vite module).
2. Keep `style-src 'unsafe-inline'` (React inline `style` attributes), as in
   the container policy. `connect-src 'self'` preserves ADR-0001.
3. Keep dependencies current: `npm audit fix` plus in-range and compatible
   major bumps, gated by ADR-0016 and the full typecheck/lint/test/build run.
4. `overrides` pin `glob` ^14 and `minimatch` ^11 under `workbox-build`
   (its latest release still ships the vulnerable ranges). Drop the override
   once `workbox-build` upgrades them.

## Consequences

- Pages and container share one script/connect policy; a regression shows up
  as a console CSP violation, checked in a headless smoke test.
- Clickjacking protection (`frame-ancestors`) stays container-only: GitHub
  Pages cannot provide it.
- Dev-server HMR needs `ws:`; the meta is injected at build time only so
  `npm run dev` is unaffected.
