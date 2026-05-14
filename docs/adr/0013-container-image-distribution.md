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

---

## Update 2026-05-14 — `connect-src` relaxed from `'none'` to `'self'`

`connect-src 'none'` broke the "Load a sample" button in the container.
The handler in `EmptyState.tsx` issues a same-origin `fetch()` against
`/samples/rvtools-sample.xlsx`; the CSP `connect-src` directive applies
to `fetch()` / XHR / EventSource regardless of origin, so the call was
silently denied. The same UI works on GitHub Pages because Pages does
not ship a CSP header. Reported as part of issue
[#2](https://github.com/fjacquet/vsizer/issues/2) after release.

**New value**: `connect-src 'self'`. Every other directive is unchanged.

**Why the privacy property still holds.** ADR-0001 says workbook bytes
never leave the client. `connect-src 'self'` permits same-origin
requests only — third-party connections remain fully blocked at the
browser. The container's nginx instance only serves static `GET`
responses; there are no endpoints capable of receiving or persisting
posted bytes. A malicious script that issued
`fetch('/upload', { method: 'POST', body: workbookBytes })` would hit
nginx, which has no handler to log the body — the bytes are discarded
server-side. The runtime guarantee is now *"the bytes cannot leave
this origin"*, which is materially equivalent to "cannot leave the
client" given the container's static-only deployment.

**What a future regression would have to look like to defeat this.**
Adding a same-origin endpoint that accepts and persists request bodies
— e.g. introducing a reverse proxy, an analytics collector, or a
side-loaded service worker that stores payloads. Any such change MUST
ship with a renewed ADR amending the privacy invariant; the relaxed
CSP no longer protects against it.

The CI smoke-test in `.github/workflows/container.yml` is updated to
assert `connect-src 'self'`.
