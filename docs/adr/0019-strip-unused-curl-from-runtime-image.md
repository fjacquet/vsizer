# ADR-0019: Strip unused curl/libcurl from the runtime image

- **Status:** Accepted (reinforces ADR-0013 / ADR-0001, complements ADR-0015 / ADR-0016)
- **Date:** 2026-05-16
- **Related:** ADR-0001 (100 % client-side), ADR-0013 (container distribution),
  ADR-0015 / ADR-0016 (security audit & supply-chain policy)

## Context

vsizer's container (ADR-0013) serves a static SPA from
`nginxinc/nginx-unprivileged:1.29-alpine`. Trivy surfaced 7 distinct
`curl` / `libcurl` advisories in the Security tab (14 alerts — counted
once per built architecture, `linux/amd64` + `linux/arm64`):

- use-after-free in SMB request handling
- improper HTTP proxy connection reuse
- OAuth2 bearer token leakage on HTTP(S) redirect
- connection reuse auth bypass with Negotiate
- cached TLS settings reuse — improper certificate validation
- cross-protocol redirect with OAuth2 bearer token
- global TLS option changes in multi-threaded LDAPS transfers

All are **MEDIUM**, so they do not trip the container gate
(`severity: HIGH,CRITICAL`, `ignore-unfixed: true` — ADR-0015 §6).
They were never reachable: vsizer is a static SPA, the healthcheck uses
`wget` (not curl), and nginx core does not link `libcurl`.

The packages are present only because the upstream
`docker-nginx-unprivileged` Alpine Dockerfile explicitly runs
`apk add --no-cache curl ca-certificates` with the comment *"Bring in
curl and ca-certificates to make registering on DNS SD easier"* — a
service-discovery convenience irrelevant to a static-file server.

Inspection of the base image (Alpine 3.23.4, `curl`/`libcurl`
`8.17.0-r1`) confirms `libcurl` is required **only** by `curl`, and
nothing in the image — nginx included — depends on either.

## Decision

Remove `curl` and `libcurl` from the runtime stage of the vsizer
`Dockerfile` with `RUN apk --no-cache del curl libcurl`.

`apk del` cascades to the now-orphaned curl-only transitive
dependencies, purging 8 packages total: `curl`, `libcurl`, `libpsl`,
`nghttp2-libs`, `nghttp3`, `c-ares`, `libidn2`, `libunistring`.
`ca-certificates` is independent and is retained.

This is a **root-cause elimination**, not a suppression: the
vulnerable code is removed from the image entirely. It is therefore
preferred over the alternatives (upgrade-chasing or an
ADR-0016-style waiver), neither of which removes the attack surface.

## Consequences

**Positive.** All 7 curl/libcurl advisories disappear from the
Security tab permanently, independent of whether Alpine ever ships a
patched curl. Attack surface and image size shrink (8 fewer packages,
6 of them additional libraries beyond curl itself). No waiver to renew,
no Dependabot churn on this axis.

**Negative.** A new layer is added to the runtime stage (one `RUN`).
If a future feature needs curl in the container it must be reinstated
deliberately — acceptable, since the privacy invariant (ADR-0001)
already forbids the container making outbound calls with workbook
bytes.

**Neutral.** No runtime bundle change, no nginx behaviour change, no
change to the `wget`-based healthcheck, no change to the privacy
invariant.

## Alternatives considered

- **Upgrade curl/libcurl (`apk upgrade`).** Rejected: only works once
  Alpine publishes a patched package, leaves the attack surface in
  place between disclosure and patch, and must be repeated for every
  future curl CVE.
- **Waive per ADR-0016.** Rejected: documents accepted risk rather
  than removing it; waivers expire and must be renewed. Removal is
  strictly stronger and cheaper to maintain.
- **Accept silently (rely on `ignore-unfixed` + Dependabot).**
  Rejected: leaves the Security tab perpetually noisy with reachable-
  looking advisories that are in fact dead weight, eroding signal.
- **Switch base image (distroless / nginx non-alpine).** Deferred:
  larger change than warranted; ADR-0013's hardened nginx-alpine
  config is otherwise sound and a one-line `apk del` achieves the goal.
