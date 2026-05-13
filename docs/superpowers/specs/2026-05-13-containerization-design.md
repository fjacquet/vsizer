# vsizer container image + GHCR publishing — design

**Date**: 2026-05-13
**Status**: Approved — ready for implementation planning
**Closes**: [#2](https://github.com/fjacquet/vsizer/issues/2) — *Provide container images for testing.*
**Companion ADR**: 0013-container-image-distribution (to be authored during implementation)

---

## 1. Goal

Ship a hardened OCI image of vsizer to `ghcr.io/fjacquet/vsizer` so users can run the app
locally or in their own infra without trusting GitHub Pages with workbook contents. The image
serves a static `dist/` over nginx; **no server-side processing is added** — ADR-0001
(100 % client-side processing) is reinforced, not weakened.

## 2. Non-goals (YAGNI)

- Kubernetes manifests, Helm chart, OpenShift templates.
- A bundled `docker-compose.yml`. (A one-liner in the README suffices.)
- Runtime base-path rewriting via env var. The container serves at `/` and that is enough.
- Image signing with `cosign`. Worth doing later but out of scope here; GHCR provenance + SBOM
  attestation from `docker/build-push-action@v6` is the baseline.
- Multi-tenant or auth concerns. The container ships the same anonymous public app as Pages.

## 3. Architecture

Two-stage multi-arch Docker build, separate GitHub Actions workflow, image published on
pushes to `main` (`:edge`) and on `v*` tags (semver + `:latest`).

```text
┌── stage 1: builder (node:24-alpine, pinned by digest) ─────────┐
│  COPY package*.json .                                           │
│  npm ci --ignore-scripts                                        │
│  COPY . .                                                       │
│  npm run build:container          → /app/dist (base='/')        │
└─────────────────────────────────────────────────────────────────┘
                       ↓ COPY --from=builder /app/dist
┌── stage 2: runtime (nginxinc/nginx-unprivileged:1.27-alpine) ──┐
│  /usr/share/nginx/html ← dist/                                  │
│  /etc/nginx/conf.d/default.conf ← hardened config              │
│  USER 101 (nginx), EXPOSE 8080                                  │
│  HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/ || exit 1     │
└─────────────────────────────────────────────────────────────────┘
```

**Why two stages**: build tooling (Node, npm cache, devDependencies, source) never ships in
the runtime image. Final image is the nginx base + a handful of static files (~50 MB).

**Why `nginxinc/nginx-unprivileged`**: drops `root` by default, listens on 8080, suited for
OpenShift and hardened Kubernetes out of the box. Matches the privacy-sensitive posture of
the project.

## 4. Components

### 4.1 `Dockerfile`

- Multi-stage.
- Both base images pinned with explicit version tags (no `latest`). Digest pinning is a
  follow-up — keep the surface simple for the first iteration.
- `LABEL` set: `org.opencontainers.image.source`, `…description`, `…licenses`, `…title`,
  `…vendor`, `…revision`, `…version` — populated by `docker/metadata-action` at build time.
- Runtime stage: `COPY --chown=101:101 dist/ /usr/share/nginx/html/`. `USER 101`. `EXPOSE 8080`.

### 4.2 `docker/nginx.conf`

Single server block, listens on `0.0.0.0:8080`, document root `/usr/share/nginx/html`.

```nginx
server {
    listen 8080 default_server;
    listen [::]:8080 default_server;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback (vsizer has client-side routing only via React; this future-proofs it)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Long-cache for hashed assets
    location /assets/ {
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # index.html must never be cached — clients always re-fetch the entry
    location = /index.html {
        add_header Cache-Control "no-store" always;
    }

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 256;

    # ── Hardened headers (apply to every response) ───────────────────────
    add_header Content-Security-Policy
        "default-src 'self'; \
         script-src 'self'; \
         style-src 'self' 'unsafe-inline'; \
         img-src 'self' data: blob:; \
         font-src 'self' data:; \
         connect-src 'none'; \
         worker-src 'self' blob:; \
         object-src 'none'; \
         base-uri 'self'; \
         frame-ancestors 'none'; \
         form-action 'none'" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Permissions-Policy
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
        always;
}
```

**Header rationale**:

- `connect-src 'none'` makes ADR-0001 a runtime guarantee: even if a future regression
  introduces a `fetch()` of workbook bytes, the browser blocks it.
- `style-src 'self' 'unsafe-inline'` — concession to Tailwind v4's runtime style injection
  (verified by inspecting a production build during implementation; tighten to
  `style-src 'self'` if the inline `<style>` blocks are absent).
- `worker-src 'self' blob:` and `img-src ... blob:` — pptxgenjs creates blob URLs for the
  generated `.pptx` download. Without these the download triggers a CSP violation.
- `frame-ancestors 'none'` + `X-Frame-Options DENY` — defense in depth against clickjacking.

### 4.3 FOUC script externalisation

`index.html` currently contains an inline `<script>` that sets the `dark` class on `<html>`
before stylesheets load. Strict `script-src 'self'` would block it. **Move the body of that
IIFE into `public/theme-init.js`** and replace the inline tag with
`<script src="/theme-init.js"></script>` placed before any stylesheet `<link>`. Tiny FOUC
risk on the first paint (one extra request, served by the same origin) — worth it to keep
the strict CSP.

This change applies to **both** the Pages build and the container build — it's a pure
hardening improvement with no behavioural difference.

### 4.4 `package.json`

Add one script:

```json
"build:container": "tsc -b && vite build --base=/"
```

The existing `build` script remains unchanged (Pages keeps `base: '/vsizer/'`). `vite build`
respects the `--base` CLI flag and overrides the value from `vite.config.ts`, so no config
change is required.

### 4.5 `.dockerignore`

Exclude from build context: `node_modules`, `dist`, `coverage`, `.git`, `.github`, `docs`,
`*.md` (with explicit `!package*.json` re-include), `.planning`, `.claude`, `.vscode`,
`.reference`, `scripts`. Keeps the context under a few MB and prevents accidental leakage of
local dev artefacts into image layers.

### 4.6 `.github/workflows/container.yml`

New workflow, **separate from `static.yml`** so Pages deploys are independent of registry
publishes.

Triggers:

- `push` to `main` → build, smoke-test, **and publish** `:edge` + `:sha-<short>`
- `push` of `v*` tag → build, smoke-test, **and publish** `:<major>.<minor>.<patch>`,
  `:<major>.<minor>`, `:<major>`, `:latest` + `:sha-<short>`
- `pull_request` against `main` → build and smoke-test **without publishing** (catches
  Dockerfile/workflow regressions in review)
- `workflow_dispatch` → manual run, behaves like a `main` push

Permissions: `contents: read`, `packages: write`, `id-token: write` (for provenance
attestation).

Pipeline:

1. `actions/checkout@v6`
2. `docker/setup-qemu-action@v3` (arm64 emulation)
3. `docker/setup-buildx-action@v3` — installs the latest stable Buildx builder
4. `docker/login-action@v3` (registry `ghcr.io`, username `${{ github.actor }}`, password
   `${{ secrets.GITHUB_TOKEN }}`)
5. `docker/metadata-action@v5` — generates tags + OCI annotation labels from git ref
6. `docker/build-push-action@v6` — **two-pass** to keep smoke-test on the same job:
   - **First pass (amd64 only, local load)**: `platforms: linux/amd64`,
     `load: true`, `push: false`, `tags: vsizer:smoke`, `cache-from: type=gha`,
     `cache-to: type=gha,mode=max`. Produces a locally-loaded image for the smoke test.
   - **Smoke test (still on the same job)**:
     - `docker run -d -p 8080:8080 --name vsizer-smoke vsizer:smoke`
     - wait up to 30 s for `curl -fsS http://127.0.0.1:8080/` to return 200
     - `curl -fsSI` and `grep` for `Content-Security-Policy`,
       `Cross-Origin-Opener-Policy`, `X-Content-Type-Options`, `Referrer-Policy`
     - `docker logs vsizer-smoke` on failure
     - `docker rm -f vsizer-smoke`
   - **Second pass (multi-arch publish, conditional)**: `platforms: linux/amd64,linux/arm64`,
     `push: ${{ github.event_name != 'pull_request' }}`, tags from `metadata-action`,
     `provenance: true`, `sbom: true`, same GHA cache. Reuses cached amd64 layers from
     the first pass; only arm64 is fresh work.

PR runs execute the first pass + smoke test, **skip** the second pass push. This catches
Dockerfile/workflow regressions in review without polluting the registry.

## 5. Doc-first artefacts (project invariant)

Per `memory:doc-first-workflow`, every non-trivial change writes ADR + CHANGELOG + PRD
before code. Authored in this order during implementation:

1. **`docs/adr/0013-container-image-distribution.md`** — Nygard format.
   - *Context*: issue #2; users wanting to run vsizer offline or in air-gapped environments.
   - *Decision*: publish a hardened nginx-unprivileged image to GHCR; build with `base='/'`;
     enforce ADR-0001 via CSP `connect-src 'none'`.
   - *Consequences*: dual-base-path build, public GHCR dependency, externalised FOUC script,
     new workflow.
2. **`CHANGELOG.md`** — open `[Unreleased]` section under `### Added`:
   *"Container image distribution via GHCR (ADR-0013) — `ghcr.io/fjacquet/vsizer` multi-arch
   (amd64/arm64), CSP-hardened nginx static server."*
3. **`README.md`** — add a "Run with Docker" subsection right after the Quick start:

   ```bash
   docker run --rm -p 8080:8080 ghcr.io/fjacquet/vsizer:latest
   # → open http://localhost:8080/
   ```

4. **`docs/PRD.md`** — extend the distribution section to mention the container channel
   alongside GitHub Pages.

## 6. Testing strategy

- **CI smoke test** — defined above in §4.6 step 7. Asserts the container boots, serves
  the SPA, and ships the documented security headers. This is the only automated test.
- **Existing unit & integration suite — unchanged.** No engine/store/component code is
  touched. The engines + utils coverage gate (75 %, ADR-0005) is unaffected.
- **Manual verification before announcing on issue #2**:
  - `docker run --rm -p 8080:8080 ghcr.io/fjacquet/vsizer:latest`
  - Load a real RVTools workbook
  - Generate a PPTX, confirm download works (CSP `worker-src` / `blob:` correct)
  - Toggle dark mode and reload, confirm no FOUC and the externalised script ran
  - Open DevTools → Network → assert zero outbound requests beyond same-origin static assets

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| CSP breaks pptxgenjs blob download in production. | `worker-src 'self' blob:` + `img-src 'self' data: blob:` already covers it. Manual verification step §6 catches regressions. |
| Tailwind v4 emits inline `<style>` blocks that CSP `style-src 'self'` would block. | Keep `'unsafe-inline'` in `style-src` for v1; revisit if Tailwind moves to fully external stylesheets. |
| Externalising the FOUC script causes visible flash on first paint. | `<script src="/theme-init.js">` placed before any `<link rel="stylesheet">` in `<head>`. Render-blocking same-origin script; flash is sub-frame in practice. |
| arm64 build via QEMU is slow (~5-7 min extra). | Acceptable cost. Buildx GHA cache amortises across runs. |
| `:latest` and `:edge` confuse users. | README documents both: `:latest` = released, `:edge` = main HEAD. |
| GHCR free tier limits for public packages. | Public packages have no pull rate limit on GHCR; storage is free for public repos. |

## 8. Open items (none blocking)

- Image signing with `cosign` — deferred to a follow-up issue. The provenance + SBOM
  attestation from build-push-action gives meaningful supply-chain signal in the meantime.
- Pinning base images by SHA digest — deferred to a follow-up. Tag-pinning the major+minor
  (`node:24-alpine`, `nginxinc/nginx-unprivileged:1.27-alpine`) is sufficient initial rigour.

## 9. What does NOT change

- `static.yml` (the Pages workflow) is untouched. Pages continues to deploy with
  `base: '/vsizer/'`.
- No new runtime dependencies in `package.json`.
- No changes to engines, stores, components, or hooks.
- The PPTX palette (Midnight Executive, ADR-0003/0008) is unchanged.
- The privacy invariant (ADR-0001) is reinforced, not modified.
