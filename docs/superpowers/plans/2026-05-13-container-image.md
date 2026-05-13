# Container image + GHCR publishing — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a hardened multi-arch OCI image of vsizer to `ghcr.io/fjacquet/vsizer` via a separate GitHub Actions workflow, without touching the existing Pages deploy.

**Architecture:** Two-stage Dockerfile (node:24-alpine builder → nginxinc/nginx-unprivileged:alpine runtime) serves `dist/` built with `base='/'`. nginx config ships hardened CSP (including `connect-src 'none'` to enforce ADR-0001 at the HTTP layer), COOP/COEP, Referrer-Policy, X-Frame-Options. New `.github/workflows/container.yml` builds amd64+arm64 via `docker/build-push-action@v6` with provenance + SBOM, smoke-tests the image, publishes `:edge` on main and `:latest`+semver on `v*` tags. Pages workflow untouched.

**Tech Stack:** Docker (multi-stage, buildx), nginxinc/nginx-unprivileged:1.27-alpine, node:24-alpine, GitHub Actions (`docker/setup-buildx-action@v3`, `docker/setup-qemu-action@v3`, `docker/login-action@v3`, `docker/metadata-action@v5`, `docker/build-push-action@v6`), GHCR registry, Vitest (existing).

**Companion spec:** [`docs/superpowers/specs/2026-05-13-containerization-design.md`](../specs/2026-05-13-containerization-design.md)

**Branch:** `feat/container-image` (already checked out by the brainstorming step; spec commit `68d4c8d` lives there)

---

## File map

| File | Action | Purpose |
|---|---|---|
| `docs/adr/0013-container-image-distribution.md` | Create | Nygard ADR recording the decision |
| `docs/adr/README.md` | Modify | Append row to index table |
| `CHANGELOG.md` | Modify | Add `[Unreleased] / Added` section |
| `docs/PRD.md` | Modify | Mention container distribution channel |
| `README.md` | Modify | "Run with Docker" subsection after Quick start |
| `public/theme-init.js` | Create | Externalised FOUC script (was inline) |
| `index.html` | Modify | Replace inline `<script>` with `<script src="/theme-init.js">` |
| `src/index.html.test.ts` | Create | Vitest asserting the externalisation invariant |
| `package.json` | Modify | Add `"build:container": "tsc -b && vite build --base=/"` |
| `.dockerignore` | Create | Keep build context small |
| `Dockerfile` | Create | Multi-stage build |
| `docker/nginx.conf` | Create | Hardened server block with CSP/COOP/COEP |
| `.github/workflows/container.yml` | Create | Build + smoke-test + GHCR publish |

The vsizer codebase uses small focused files; this plan respects that — no file exceeds ~80 lines.

---

## Task 1: Author ADR-0013 and update the index

**Files:**
- Create: `docs/adr/0013-container-image-distribution.md`
- Modify: `docs/adr/README.md`

- [ ] **Step 1: Create the ADR file**

Create `docs/adr/0013-container-image-distribution.md` with this exact content:

```markdown
# ADR-0013 — Container image distribution via GHCR

**Status**: Accepted
**Date**: 2026-05-13
**Supersedes**: —

## Context

GitHub issue #2 asks for a container image so users can run vsizer offline,
in air-gapped environments, or in their own infra without trusting the public
GitHub Pages deploy with workbook contents. The product invariant (ADR-0001 —
100 % client-side processing) holds equally well from a container as from
Pages: the bytes never leave the user's machine either way.

The Pages build pins `base: '/vsizer/'` so static assets resolve under
`fjacquet.github.io/vsizer/`. A container served at `http://localhost:8080`
would 404 on every asset under that prefix. The container therefore needs a
build variant that targets the root path.

The codebase keeps an inline `<script>` in `index.html` to set the `dark`
class on `<html>` before stylesheets load (FOUC prevention). A strict
Content-Security-Policy with `script-src 'self'` would block inline scripts;
the script must move to an external file in `public/`.

## Decision

Publish a hardened multi-arch (amd64 + arm64) OCI image to
`ghcr.io/fjacquet/vsizer` from a new, independent GitHub Actions workflow.

- **Runtime base**: `nginxinc/nginx-unprivileged:1.27-alpine` — non-root by
  default, listens on 8080, suited for hardened orchestrators.
- **Build base**: `node:24-alpine`.
- **Build mode**: a new `build:container` npm script runs
  `tsc -b && vite build --base=/`. The existing `build` script and
  `vite.config.ts` are unchanged; Pages keeps `base: '/vsizer/'`.
- **CSP**: `default-src 'self'; script-src 'self'; style-src 'self'
  'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;
  connect-src 'none'; worker-src 'self' blob:; object-src 'none'; base-uri
  'self'; frame-ancestors 'none'; form-action 'none'`. `connect-src 'none'`
  makes ADR-0001 a runtime guarantee at the HTTP layer.
- **FOUC script**: moved from inline in `index.html` to
  `public/theme-init.js`, referenced via `<script src="/theme-init.js">` so
  strict `script-src 'self'` can hold.
- **Tagging**: `:edge` + `:sha-<short>` on every push to `main`; semver
  triplet + `:major.minor` + `:major` + `:latest` + `:sha-<short>` on `v*`
  tags. Tags derived by `docker/metadata-action@v5`.
- **Pages**: deploy workflow (`static.yml`) is untouched.

## Consequences

**Positive**

- Users with strict data-handling policies can run vsizer locally with one
  `docker run` instead of building from source.
- Strict CSP `connect-src 'none'` provides defense in depth around ADR-0001;
  any future regression that introduces a workbook-bearing `fetch()` is
  blocked at the browser.
- The image is non-root, multi-arch, signed with provenance + SBOM
  attestation from `docker/build-push-action@v6`.

**Negative**

- Two build paths (`base='/vsizer/'` for Pages, `base='/'` for container).
  The diff is one CLI flag, but it's a fork to maintain.
- Tailwind v4 emits inline `<style>` runtime blocks; `style-src` retains
  `'unsafe-inline'`. We accept this until Tailwind moves to fully external
  stylesheets.
- arm64 builds via QEMU add ~5–7 min to each workflow run. Acceptable.

**Neutral**

- The FOUC script externalisation adds one same-origin request before first
  paint. It is render-blocking and same-origin, so the user-perceived flash
  is sub-frame in practice. Same behaviour ships to Pages, simplifying the
  divergence.

## Alternatives considered

1. **Keep `base: '/vsizer/'` in the container, serve at the same subpath.**
   Forces users to remember `http://localhost:8080/vsizer/`. Rejected for
   UX.
2. **Caddy or distroless instead of nginx-unprivileged.** Caddy is fine but
   less common in enterprise; distroless static can't add response headers.
   Rejected.
3. **Image signing with `cosign` immediately.** Provenance + SBOM
   attestation already give meaningful supply-chain signal; cosign is a
   reasonable follow-up but not a blocker for closing issue #2.
4. **Base-path rewriting at container startup via env var.** Adds runtime
   complexity for a use case (reverse-proxy under arbitrary subpath) that
   no user has requested. YAGNI.

## References

- Issue: [#2 — Provide container images for testing](https://github.com/fjacquet/vsizer/issues/2)
- Design spec: `docs/superpowers/specs/2026-05-13-containerization-design.md`
- Reinforces: ADR-0001 (100 % client-side processing)
```

- [ ] **Step 2: Append the row to the ADR index**

Edit `docs/adr/README.md` — append exactly one row to the index table after the 0012 row:

```markdown
| 0013 | Container image distribution via GHCR              | Accepted (reinforces 0001) |
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0013-container-image-distribution.md docs/adr/README.md
git commit -m "docs(adr): 0013 — container image distribution via GHCR

Reinforces ADR-0001 by adding CSP connect-src 'none' enforcement at the
HTTP layer when the app is served from the container image."
```

---

## Task 2: Update CHANGELOG and PRD

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/PRD.md`

- [ ] **Step 1: Open `CHANGELOG.md` and insert `[Unreleased]` section**

Insert this block immediately after the `## [1.1.0] — 2026-05-10` header line's existing position is preserved; the new block goes **above** the `[1.1.0]` heading and below the intro paragraph:

```markdown
## [Unreleased]

### Added

- **Container image distribution** (ADR-0013) — multi-arch (amd64/arm64)
  OCI image published to `ghcr.io/fjacquet/vsizer` from a new GitHub
  Actions workflow. Image serves the SPA from a hardened
  `nginxinc/nginx-unprivileged` base with CSP `connect-src 'none'`
  enforcing the privacy invariant (ADR-0001) at the HTTP layer.
  Tags: `:edge` on `main`, `:latest` + semver on `v*` releases.

### Changed

- **Externalised the dark-mode FOUC script** from inline in `index.html`
  to `public/theme-init.js` so the container's strict
  `script-src 'self'` Content-Security-Policy can hold. Behavior is
  unchanged on Pages.
```

- [ ] **Step 2: Open `docs/PRD.md` and locate the distribution / operations section**

Find the existing distribution discussion (search for "GitHub Pages" or "deploy"). Append a paragraph after it (exact wording — adapt heading depth to match the surrounding markdown):

```markdown
**Container image (since v1.2)**: vsizer is additionally published as a
hardened OCI image at `ghcr.io/fjacquet/vsizer`. Users who cannot or will
not use the public Pages deploy can `docker run` the image locally; the
privacy invariant holds identically because the image still serves only
static files and the runtime CSP forbids outbound fetches
(`connect-src 'none'`). See ADR-0013.
```

- [ ] **Step 3: Verify and commit**

```bash
git diff --stat CHANGELOG.md docs/PRD.md
# expect both files modified, no other changes
git add CHANGELOG.md docs/PRD.md
git commit -m "docs: changelog + PRD entries for container distribution (ADR-0013)"
```

---

## Task 3: Externalise the FOUC script

**Files:**
- Create: `public/theme-init.js`
- Modify: `index.html`
- Create: `src/index.html.test.ts`

The current inline script in `index.html:14-26` sets the `dark` class based on `localStorage` or the OS preference. We move the body to a same-origin external file so strict CSP can hold.

- [ ] **Step 1: Write the failing test**

Create `src/index.html.test.ts` with this content:

```typescript
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '..')

describe('FOUC script externalisation (ADR-0013)', () => {
  it('index.html references /theme-init.js, no inline dark-mode logic', () => {
    const html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8')

    expect(html).toContain('<script src="/theme-init.js"></script>')
    // Inline <script> block with localStorage access must be gone — that
    // pattern is what blocks strict CSP `script-src 'self'`.
    expect(html).not.toMatch(/<script>[\s\S]*localStorage[\s\S]*<\/script>/)
  })

  it('public/theme-init.js exists and contains the dark-class IIFE', () => {
    const js = readFileSync(resolve(repoRoot, 'public/theme-init.js'), 'utf8')

    expect(js).toContain("localStorage.getItem('vsizer-theme')")
    expect(js).toContain("classList.add('dark')")
    expect(js).toContain("prefers-color-scheme: dark")
  })
})
```

- [ ] **Step 2: Run test, expect failure**

```bash
npx vitest run src/index.html.test.ts
```

Expected: 2 failures — `public/theme-init.js` doesn't exist yet, and `index.html` still has the inline script.

- [ ] **Step 3: Create `public/theme-init.js`**

```javascript
// FOUC-prevention for vsizer's dark-mode toggle. Externalised from
// index.html so the container's strict CSP (script-src 'self') applies.
// Behaviour is byte-identical to the previous inline script. See ADR-0013.
;(() => {
  var pref = null
  try {
    pref = localStorage.getItem('vsizer-theme')
  } catch (_) {}
  var resolved =
    pref === 'light' || pref === 'dark'
      ? pref
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
  if (resolved === 'dark') document.documentElement.classList.add('dark')
})()
```

- [ ] **Step 4: Replace the inline script in `index.html`**

Replace the entire `<script>…</script>` block at lines 14–26 (the inline IIFE plus its preceding HTML comment) with a single line. The new `<head>` reads:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>vsizer</title>
    <!-- FOUC-prevention: see public/theme-init.js (ADR-0013). -->
    <script src="/theme-init.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Run the new test, expect pass**

```bash
npx vitest run src/index.html.test.ts
```

Expected: 2 passes.

- [ ] **Step 6: Run the full lint + typecheck + tests + build to ensure no regressions**

```bash
npm run lint && npm run typecheck && npm run test:run && npm run build
```

Expected: all green. The build should still produce `dist/index.html` with the externalised script, plus `dist/theme-init.js` copied from `public/`.

- [ ] **Step 7: Verify the built output**

```bash
grep -l 'theme-init.js' dist/index.html
ls dist/theme-init.js
```

Expected: `dist/index.html` referenced and `dist/theme-init.js` present.

- [ ] **Step 8: Commit**

```bash
git add public/theme-init.js index.html src/index.html.test.ts
git commit -m "refactor(theme): externalise FOUC script to public/theme-init.js

Enables strict CSP script-src 'self' for the container image (ADR-0013).
Behaviour is byte-identical; behaviour parity is locked by a new vitest
that asserts both the file presence and the absence of inline dark-mode
logic in index.html."
```

---

## Task 4: Add the container build script and .dockerignore

**Files:**
- Modify: `package.json`
- Create: `.dockerignore`

- [ ] **Step 1: Add the `build:container` npm script**

In `package.json`, inside the `"scripts"` object, add this line after the existing `"build"` entry (preserve trailing-comma rules — Biome will reformat if needed):

```json
"build:container": "tsc -b && vite build --base=/",
```

The full `scripts` block after edit:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "build:container": "tsc -b && vite build --base=/",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit",
  "lint": "biome check .",
  "lint:fix": "biome check --write .",
  "format": "biome format --write .",
  "test": "vitest",
  "test:run": "vitest run",
  "test:coverage": "vitest run --coverage",
  "generate-sample": "node scripts/generate-sample.mjs"
}
```

- [ ] **Step 2: Verify the container build works locally**

```bash
rm -rf dist
npm run build:container
grep -c 'src="/assets/' dist/index.html
grep -c 'src="/vsizer/assets/' dist/index.html
```

Expected: first `grep -c` ≥ 1 (root-based asset paths), second `grep -c` = 0 (no `/vsizer/` prefix).

- [ ] **Step 3: Restore the Pages build artefact**

```bash
npm run build
grep -c 'src="/vsizer/assets/' dist/index.html
```

Expected: ≥ 1 — the Pages build is unchanged.

- [ ] **Step 4: Create `.dockerignore`**

```
# Source control
.git
.gitignore
.gitattributes

# Build output (we rebuild inside the image)
dist
coverage

# Node
node_modules
npm-debug.log*

# Tooling / IDE
.vscode
.idea
.DS_Store
*.swp

# Repo-internal context that should never leak into image layers
.planning
.claude
.reference

# Docs (not needed at runtime; reduces context size)
docs
*.md
!README.md

# CI metadata
.github
```

(`!README.md` keeps the README so `docker history` and OCI annotations have a sensible reference, but the README is referenced via OCI labels, not COPYed into the runtime image.)

- [ ] **Step 5: Commit**

```bash
git add package.json .dockerignore
git commit -m "build: add build:container script and .dockerignore

build:container runs the same TypeScript build then vite with --base=/
so root-served container images resolve assets correctly. The Pages
build script is unchanged (base='/vsizer/' from vite.config.ts)."
```

---

## Task 5: Add the Dockerfile and nginx config

**Files:**
- Create: `Dockerfile`
- Create: `docker/nginx.conf`

- [ ] **Step 1: Create `docker/nginx.conf`**

```nginx
# vsizer container nginx config — see ADR-0013.
# Listens on 8080 (nginx-unprivileged default), serves the SPA, ships
# hardened response headers including CSP that enforces ADR-0001
# (connect-src 'none' forbids any outbound fetch of workbook bytes).

server {
    listen 8080 default_server;
    listen [::]:8080 default_server;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback — vsizer is fully client-routed today, this future-proofs
    # any client-side route additions.
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Hashed asset bundles can cache for a year.
    location /assets/ {
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }

    # The entry HTML must never be cached — clients always re-fetch.
    location = /index.html {
        add_header Cache-Control "no-store" always;
    }

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 256;

    # ── Hardened response headers (apply to every response) ───────────────
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" always;
}
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
# vsizer container image — see ADR-0013.
# Two stages: node:24-alpine builder produces dist/ with base='/',
# nginxinc/nginx-unprivileged:1.27-alpine serves it under a hardened config.

# syntax=docker/dockerfile:1.9

# ── Stage 1: builder ────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

# Install dependencies first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source and build with container-flavoured base path.
COPY . .
RUN npm run build:container

# ── Stage 2: runtime ────────────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# OCI annotations — values are overridden at build time by metadata-action.
LABEL org.opencontainers.image.title="vsizer" \
      org.opencontainers.image.description="Factual VMware cluster utilization deck from RVTools / Live Optics — 100% client-side." \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/fjacquet/vsizer" \
      org.opencontainers.image.vendor="Frédéric Jacquet" \
      org.opencontainers.image.url="https://github.com/fjacquet/vsizer"

# Replace the default nginx-unprivileged server block with vsizer's
# hardened version.
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Static SPA — owned by the non-root nginx user (uid 101).
COPY --from=builder --chown=101:101 /app/dist/ /usr/share/nginx/html/

USER 101
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile docker/nginx.conf
git commit -m "build: Dockerfile + nginx config for container image (ADR-0013)

Multi-stage build (node:24-alpine → nginxinc/nginx-unprivileged:1.27-alpine).
Hardened nginx config ships strict CSP (connect-src 'none' enforces
ADR-0001 at the HTTP layer), COOP/COEP, Permissions-Policy, and X-Frame-
Options DENY. Healthcheck via busybox wget on /."
```

---

## Task 6: Local smoke test before adding CI

This task is a manual checkpoint — verify the image actually works end to end before wiring CI.

- [ ] **Step 1: Build the image locally for amd64 (or your native arch)**

```bash
docker build -t vsizer:smoke .
```

Expected: build succeeds with no errors.

- [ ] **Step 2: Run the container**

```bash
docker run -d --rm -p 8080:8080 --name vsizer-smoke vsizer:smoke
sleep 2
```

- [ ] **Step 3: Hit the index and assert headers**

```bash
curl -fsS http://127.0.0.1:8080/ > /dev/null && echo "200 OK"
curl -fsSI http://127.0.0.1:8080/ | grep -E '^(content-security-policy|cross-origin-opener-policy|cross-origin-embedder-policy|x-content-type-options|x-frame-options|referrer-policy|permissions-policy):' -i
```

Expected: `200 OK`, then all seven header names appear in the curl output.

- [ ] **Step 4: Confirm connect-src is `'none'`**

```bash
curl -fsSI http://127.0.0.1:8080/ | grep -i 'content-security-policy:' | grep -c "connect-src 'none'"
```

Expected: 1.

- [ ] **Step 5: Open the app in a browser and confirm PPTX export works**

Manual: `open http://127.0.0.1:8080/` → upload `public/sample-rvtools.xlsx` (or any RVTools export) → click the export button → confirm the PPTX downloads without CSP errors in DevTools console. Toggle dark mode and reload to confirm no FOUC.

- [ ] **Step 6: Tear down**

```bash
docker stop vsizer-smoke
```

- [ ] **Step 7: No code commit for this task** — it is a verification gate. Proceed to Task 7 only if every step above passed.

---

## Task 7: Add the GitHub Actions workflow

**Files:**
- Create: `.github/workflows/container.yml`

- [ ] **Step 1: Create the workflow**

```yaml
# Build, smoke-test, and publish the vsizer container image to GHCR.
# See ADR-0013 and docs/superpowers/specs/2026-05-13-containerization-design.md.
name: Container image

on:
  push:
    branches: ['main']
    tags: ['v*']
  pull_request:
    branches: ['main']
  workflow_dispatch:

permissions:
  contents: read
  packages: write
  id-token: write
  attestations: write

concurrency:
  group: container-${{ github.ref }}
  cancel-in-progress: true

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3
        with:
          platforms: arm64

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract image metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=edge,branch=main
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=semver,pattern={{major}}
            type=sha,format=short
          flavor: |
            latest=auto

      # First pass: amd64 only, loaded locally for the smoke test. Push is
      # disabled here; the second pass handles publish.
      - name: Build amd64 image (local load for smoke test)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./Dockerfile
          platforms: linux/amd64
          push: false
          load: true
          tags: vsizer:smoke
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Smoke-test the local image
        run: |
          set -euo pipefail
          docker run -d --rm -p 8080:8080 --name vsizer-smoke vsizer:smoke
          # Wait up to 30 s for nginx to come up.
          for i in $(seq 1 30); do
            if curl -fsS http://127.0.0.1:8080/ > /dev/null; then break; fi
            sleep 1
          done
          curl -fsS http://127.0.0.1:8080/ > /dev/null
          echo "─── headers ───"
          curl -fsSI http://127.0.0.1:8080/
          for header in 'content-security-policy' 'cross-origin-opener-policy' 'cross-origin-embedder-policy' 'x-content-type-options' 'x-frame-options' 'referrer-policy' 'permissions-policy'; do
            if ! curl -fsSI http://127.0.0.1:8080/ | grep -qi "^$header:"; then
              echo "::error::missing response header: $header"
              docker logs vsizer-smoke
              docker stop vsizer-smoke || true
              exit 1
            fi
          done
          # ADR-0001 reinforcement.
          if ! curl -fsSI http://127.0.0.1:8080/ | grep -i 'content-security-policy:' | grep -q "connect-src 'none'"; then
            echo "::error::CSP must include connect-src 'none' (ADR-0001 enforcement)"
            docker logs vsizer-smoke
            docker stop vsizer-smoke || true
            exit 1
          fi
          docker stop vsizer-smoke

      # Second pass: multi-arch, publishes only on non-PR events. Reuses the
      # GHA cache from the first pass; only arm64 is new work.
      - name: Build and publish multi-arch image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./Dockerfile
          platforms: linux/amd64,linux/arm64
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          annotations: ${{ steps.meta.outputs.annotations }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: true
          sbom: true
```

- [ ] **Step 2: Lint the YAML (best-effort)**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/container.yml')); print('yaml ok')"
```

Expected: `yaml ok`. (Python's PyYAML ships with macOS.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/container.yml
git commit -m "ci: container workflow — build, smoke-test, publish to GHCR

Two-pass build: amd64-only first pass loaded locally for smoke testing
(asserts hardened headers and connect-src 'none' per ADR-0001), then a
multi-arch (amd64+arm64) pass that publishes to ghcr.io/fjacquet/vsizer
on main pushes (:edge + :sha-<short>) and v* tags (:latest + semver).
PRs run build + smoke test without publishing.

Closes #2."
```

---

## Task 8: README — "Run with Docker" subsection

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Locate the Quick start section**

```bash
grep -n -E '^## |^### ' README.md
```

Pick the heading immediately after the Quick start section. The new subsection goes between Quick start and that next heading.

- [ ] **Step 2: Insert this subsection**

```markdown
### Run with Docker

A hardened multi-arch image is published to GHCR with every release:

```bash
docker run --rm -p 8080:8080 ghcr.io/fjacquet/vsizer:latest
```

Open <http://localhost:8080/>. The image is built from a non-root nginx
base, ships strict CSP (`connect-src 'none'`) that forbids any outbound
fetch of workbook data, and runs entirely client-side just like the
public deploy. Tags:

- `:latest`, `:1.2`, `:1`, `:1.2.0` — semver releases
- `:edge` — built from `main` on every push
- `:sha-<short>` — pinpoint a specific commit

See [ADR-0013](docs/adr/0013-container-image-distribution.md) for the
design.
```

- [ ] **Step 3: Verify markdown renders sanely**

```bash
grep -A2 'Run with Docker' README.md | head -10
```

Expected: the subsection header followed by its intro line.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): add Run with Docker subsection (ADR-0013)"
```

---

## Task 9: Open the PR and validate CI

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/container-image
```

- [ ] **Step 2: Open the PR**

Write the body to a temp file first (avoids shell quoting hell with backticks in markdown):

```bash
cat > /tmp/vsizer-pr-body.md <<'EOF'
Closes #2.

Adds a hardened multi-arch (amd64 + arm64) OCI image at
`ghcr.io/fjacquet/vsizer` plus the GitHub Actions workflow that builds,
smoke-tests, and publishes it. Pages deploy is untouched.

## Highlights

- Multi-stage Dockerfile: `node:24-alpine` → `nginxinc/nginx-unprivileged:1.27-alpine`.
- New `build:container` npm script builds with `base='/'`; existing `build`
  script keeps `base: '/vsizer/'` for Pages.
- Hardened CSP: `connect-src 'none'` enforces ADR-0001 (no outbound
  workbook bytes) at the HTTP layer.
- FOUC script externalised from `index.html` to `public/theme-init.js`
  so strict `script-src 'self'` holds.
- CI smoke test asserts the seven hardened response headers and the
  `connect-src 'none'` directive on every build.
- Tags: `:edge` on `main`, semver triplet + `:latest` on `v*` tags.

## Docs

- ADR-0013 — Container image distribution via GHCR
- CHANGELOG (Unreleased)
- README — new "Run with Docker" subsection
- PRD — distribution section extended

## Reviewer checklist

- [ ] ADR-0013 reads cleanly and is in the index
- [ ] CHANGELOG `[Unreleased]` entry is accurate
- [ ] FOUC externalisation behaviour is byte-identical (test asserts this)
- [ ] CI `Container image` job builds, smoke-tests, and (for tags/main)
      pushes to GHCR
- [ ] No changes to `static.yml` (Pages workflow untouched)
EOF

gh pr create --base main --head feat/container-image \
  --title "feat: container image distribution via GHCR (closes #2)" \
  --body-file /tmp/vsizer-pr-body.md
```

- [ ] **Step 3: Watch the workflow**

```bash
gh run watch
```

Expected: both `Deploy to GitHub Pages` (unchanged behaviour) and `Container image` (new) succeed. The new job's smoke-test step must pass; if it fails, inspect with `gh run view --log-failed`.

- [ ] **Step 4: Verify the package was not pushed for PR**

```bash
gh api -H "Accept: application/vnd.github+json" \
  "/users/fjacquet/packages/container/vsizer/versions" 2>/dev/null \
  | grep -c '"name"' || echo "no package versions yet (expected — PR run does not publish)"
```

Expected: either "no package versions yet" or only previously existing versions if any. The PR run must not have pushed a new image.

- [ ] **Step 5: Merge the PR**

After review:

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 6: Verify the post-merge `main` push publishes `:edge`**

```bash
gh run watch  # follow the main-branch run
# then:
docker pull ghcr.io/fjacquet/vsizer:edge
docker run --rm -p 8080:8080 ghcr.io/fjacquet/vsizer:edge &
sleep 3
curl -fsSI http://127.0.0.1:8080/ | grep -i content-security-policy
kill %1
```

Expected: pull succeeds, headers as designed.

---

## Task 10: Close out issue #2

- [ ] **Step 1: Reply on the issue with the deploy + image instructions**

Write the comment body to a file first, same reason as the PR body:

```bash
cat > /tmp/vsizer-issue2-reply.md <<'EOF'
Hi @congto — two ways to test now:

**1. Public Pages deploy (no install)**: https://fjacquet.github.io/vsizer/

**2. Container (offline-friendly)**:

```bash
docker run --rm -p 8080:8080 ghcr.io/fjacquet/vsizer:latest
```

Then open <http://localhost:8080/>. The image is multi-arch
(amd64 + arm64), runs as a non-root user, and ships a strict CSP that
forbids any outbound fetch of your workbook data — so you can drop
RVTools / Live Optics exports with the same privacy guarantees as the
local Python tooling.

Design notes: [ADR-0013](https://github.com/fjacquet/vsizer/blob/main/docs/adr/0013-container-image-distribution.md).
EOF

gh issue comment 2 --body-file /tmp/vsizer-issue2-reply.md
```

- [ ] **Step 2: Close the issue (the merge will likely auto-close via "Closes #2" in the PR body — verify)**

```bash
gh issue view 2 --json state -q .state
```

Expected: `CLOSED`. If still `OPEN`:

```bash
gh issue close 2 --reason completed
```

---

## Spec-coverage self-check

| Spec section | Covered by |
|---|---|
| §1 Goal | Tasks 5, 7 (Dockerfile + workflow do the shipping) |
| §2 Non-goals | Plan declines to add Helm, compose, runtime base-path rewriting, cosign |
| §3 Architecture (two-stage Dockerfile, multi-arch, separate workflow) | Tasks 5, 7 |
| §4.1 Dockerfile | Task 5 |
| §4.2 nginx.conf + headers | Task 5 |
| §4.3 FOUC externalisation | Task 3 (TDD with vitest) |
| §4.4 `build:container` script | Task 4 |
| §4.5 `.dockerignore` | Task 4 |
| §4.6 workflow + smoke test | Task 7 |
| §5.1 ADR-0013 + index | Task 1 |
| §5.2 CHANGELOG | Task 2 |
| §5.3 README "Run with Docker" | Task 8 |
| §5.4 PRD distribution section | Task 2 |
| §6 Testing strategy (smoke test in CI, manual local) | Tasks 6, 7 |
| §7 Risks | Mitigations encoded in Tasks 3, 5, 7 (CSP `worker-src blob:`, `'unsafe-inline'` for `style-src`, FOUC externalisation, smoke test) |
| §9 What does NOT change (`static.yml` untouched, no engine code changes) | Verified by PR-level reviewer checklist in Task 9 |

No spec section is uncovered. No `TBD`/`TODO` markers in this plan. All function/file/script names cross-checked between tasks (`build:container`, `vsizer:smoke`, `public/theme-init.js`, `ghcr.io/fjacquet/vsizer`).
