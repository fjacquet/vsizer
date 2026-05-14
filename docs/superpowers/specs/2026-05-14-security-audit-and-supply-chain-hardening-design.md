# Security audit & supply-chain hardening — design

- **Date:** 2026-05-14
- **Status:** Approved — implementation pending
- **Related ADRs:** ADR-0001 (client-side), ADR-0002 (SheetJS tarball), ADR-0004
  (memory-only state), ADR-0013 (container image distribution)
- **Future ADR:** ADR-0015 — Security audit & supply-chain policy

## Context

vsizer is a 100 % client-side SPA (ADR-0001). The privacy invariant means we
have no server attack surface, no backend secrets, and no user data at rest.
The remaining attack surface is therefore:

1. **Supply-chain.** A malicious or compromised npm package (or transitive
   dependency) reaching the user's browser via our published bundle.
2. **GitHub Actions supply-chain.** A retargeted action tag executing
   malicious steps in CI with `packages: write` / `id-token: write`.
3. **Container base image.** CVEs in `nginxinc/nginx-unprivileged:1.27-alpine`
   reaching production deployments.
4. **Application code.** Injection-class bugs in our TS code (low risk — no
   raw-HTML React escape hatches, no `eval`, no user-content rendering today,
   but worth scanning continuously).

Baseline at the time of writing:

- `npm audit` — 0 vulnerabilities across 235 deps (39 prod / 197 dev /
  53 optional / 10 peer).
- `trivy fs` — 0 vulnerabilities on `package-lock.json`.
- Container workflow already emits CycloneDX SBOM + provenance attestation
  via `docker/build-push-action@v6` (`sbom: true`, `provenance: true`).
- Strict CSP/COOP/COEP/CORP/Referrer/X-Frame/Permissions-Policy already
  ship in `docker/security-headers.conf`.
- **Missing:** Dependabot, CodeQL, SBOM on the static (Pages) build,
  audit gate in CI, action SHA pinning, `SECURITY.md` disclosure policy.

This work is **hardening, not remediation** — nothing is broken today.

## Decision

Introduce a coherent supply-chain policy that satisfies four user
requirements:

1. **SBOM on every build.**
2. **Use only safe versions of code.**
3. **Never leave broken code.**
4. **Always document.**

### Scope (in)

- npm dependency audit gate in CI (`npm audit --audit-level=moderate --omit=dev`).
- OSV scan via `google/osv-scanner-action`, SARIF upload to GitHub Code
  Scanning (gate: MODERATE+, matching the npm audit gate).
- CycloneDX SBOM for the npm graph via `@cyclonedx/cyclonedx-npm` (prod
  scope), uploaded as a workflow artifact on every build and attached to
  GitHub Releases on `v*` tags.
- CodeQL static analysis for `javascript-typescript`, on PR + weekly schedule.
- Dependabot for `npm`, `github-actions`, `docker`.
- All GitHub Action `uses:` switched from floating tags to pinned commit
  SHAs (with version comment for human readability).
- Container Trivy image scan after smoke test — **warn-only initially**,
  promotable to gate in a follow-up.
- `SECURITY.md` disclosure policy.
- ADR-0015 codifying the policy.

### Scope (out)

- DAST / browser fuzzing. Out of scope for a static SPA with strict CSP.
- Sigstore / cosign image signing. Already covered by GitHub-native
  provenance + attestations; cosign would duplicate the trust root.
- Replacing dependencies with "more secure" alternatives. No dep has a
  known issue; churn for its own sake is not security.
- Application-layer secret scanning beyond GitHub's native feature. No
  secrets in the repo today — `gitleaks` would be redundant.

### Key trade-offs

#### 1. Moderate+ on prod, not dev

End-user bytes never include `devDependencies` — Vite/Vitest transitive
trees don't ship. Gating Moderate+ on dev would create churn on
advisories with no user-facing risk. CodeQL still scans the full TS
source for code-level issues. **`npm audit --audit-level=moderate --omit=dev`**.

#### 2. CycloneDX over SPDX

OWASP-native; matches what BuildKit already emits for the container;
single format end-to-end. Trivy/Grype/Dependency-Track all consume it.

#### 3. Container Trivy warn-only initially

nginx-alpine base-image CVEs disclose on a cadence independent of our
release cycle. Gating from day one would break the build on disclosures
unrelated to our code. Step runs and uploads SARIF; failure surfaces in
the security tab but does not block. Promotion to gate is a one-line
change in a later PR.

#### 4. Pin Actions to commit SHA, not tag

`actions/checkout@v6` becomes `actions/checkout@<40-char-sha>  # v6.x.x`.
Defends against tag-retargeting supply-chain attacks (tj-actions/changed-files
class of incident). Dependabot auto-bumps SHAs with PRs that carry the
new version in the trailing comment.

## Architecture

### Files added

```
.github/dependabot.yml                                  NEW
.github/workflows/codeql.yml                            NEW
SECURITY.md                                             NEW
docs/adr/0015-security-audit-and-supply-chain-policy.md NEW
```

### Files modified

```
.github/workflows/static.yml      — add audit, osv-scanner, SBOM, action SHA pins
.github/workflows/container.yml   — add Trivy image scan (warn), action SHA pins
docs/adr/README.md                — index entry for ADR-0015
CHANGELOG.md                      — [Unreleased] entry
README.md                         — Security section + SBOM badge
```

### Data flow — static.yml after changes

```
checkout
  → setup-node (npm cache)
  → npm ci
  → npm audit --audit-level=moderate --omit=dev          [GATE: Moderate+]
  → osv-scanner action (SARIF upload)                    [GATE: MODERATE+]
  → npm run typecheck
  → npm run lint
  → npm run test:run
  → npm run build
  → npx @cyclonedx/cyclonedx-npm --omit dev
       --output-format JSON --output-file sbom.cdx.json
  → upload-artifact: sbom.cdx.json
  → on v* tag: gh release upload <tag> sbom.cdx.json
  → upload-pages-artifact: dist/
deploy job: actions/deploy-pages@<sha>
```

### Data flow — container.yml additions

```
... existing smoke-test ...
  → aquasecurity/trivy-action@<sha>
       scan-type: image, image-ref: vsizer:smoke
       severity: HIGH,CRITICAL, exit-code: 0      [warn-only — promotable]
       format: sarif, output: trivy.sarif
  → github/codeql-action/upload-sarif@<sha>
... existing publish ...
```

### CodeQL workflow

```yaml
name: CodeQL
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
  schedule: [{ cron: '23 4 * * 1' }]   # weekly, Monday 04:23 UTC
permissions:
  contents: read
  security-events: write
  actions: read
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - actions/checkout@<sha>
      - github/codeql-action/init@<sha>
          with: { languages: javascript-typescript }
      - github/codeql-action/analyze@<sha>
```

### Dependabot config

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    groups:
      minor-and-patch:
        update-types: [minor, patch]
    ignore:
      # xlsx is pinned to the official CDN tarball — see ADR-0002.
      - dependency-name: xlsx
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
    groups:
      actions:
        patterns: ['*']
  - package-ecosystem: docker
    directory: /
    schedule: { interval: weekly }
```

The `xlsx` ignore is critical — ADR-0002 mandates the SheetJS tarball,
not the npm package. Without this, Dependabot would file PRs to switch
us back to the CVE-affected npm release.

### SECURITY.md

```
# Security policy

## Supported versions
The latest minor release (1.x) receives security fixes.
## Reporting a vulnerability
Open a private security advisory:
https://github.com/fjacquet/vsizer/security/advisories/new
Please do not file public issues for security reports.
## Scope
vsizer is 100 % client-side (ADR-0001). The privacy invariant means
uploaded workbooks never leave the browser. Findings that would
violate that invariant are highest priority.
## Disclosure window
We aim to acknowledge within 7 days and ship a fix within 30.
```

## Components

Each unit is small and has one job:

| Unit | Purpose | Inputs | Outputs |
|---|---|---|---|
| `npm audit` step | Block moderate+ advisories in prod deps | `package-lock.json` | exit 0 / 1 |
| OSV scanner step | Cross-check with OSV DB; feeds Code Scanning | `package-lock.json` | SARIF |
| `cyclonedx-npm` step | Emit standard SBOM for prod graph | `package.json`, `package-lock.json` | `sbom.cdx.json` |
| Release-upload step | Persist SBOMs as release assets | `sbom.cdx.json`, tag | GH release asset |
| CodeQL workflow | TS source static analysis | `src/**` | SARIF → Security tab |
| Trivy image step | CVE scan of built container | `vsizer:smoke` | SARIF (warn) |
| Dependabot | Automated dep PRs | Schedule, configs | PRs |
| SECURITY.md | Disclosure path | — | Documentation |
| ADR-0015 | Policy of record | — | Documentation |

## Error handling

- `npm audit` fails the build → fix the dep (preferred) or document a
  short-lived waiver in ADR-0015 with a follow-up issue link.
- OSV SARIF upload failure → step uses `continue-on-error: true` for the
  upload only; the scan itself stays gating.
- SBOM generation failure → fails the build (an unreproducible SBOM is a
  bigger problem than no SBOM).
- Trivy step failure (warn mode) → `continue-on-error: true`; SARIF
  uploaded if present.
- Dependabot PR failures → handled per-PR by maintainer; not a CI gate.

## Testing

- **Local dry-run before pushing:**
  ```
  npm audit --audit-level=moderate --omit=dev
  npx --yes @cyclonedx/cyclonedx-npm@latest \
      --omit dev --output-format JSON --output-file sbom.cdx.json
  jq '.metadata.component.name, (.components | length)' sbom.cdx.json
  trivy fs --severity HIGH,CRITICAL --quiet .
  ```
- **CI verification:** first PR exercises every new step. If a gate fires
  on existing transitive deps, decide: fix (preferred) or narrow scope
  (e.g., add a specific `npm audit` ignore via `package.json#overrides`,
  with rationale in ADR-0015).
- **Rollback plan:** every change is a separate commit. Revertable in
  isolation. The deploy step in `static.yml` is unchanged — even a
  catastrophic regression in the new steps cannot ship bad bytes to
  Pages because the build precedes deploy.

## "Never leave broken code" — commit order

1. Docs first (no CI impact): `SECURITY.md`, ADR-0015, CHANGELOG entry,
   README section, ADR index update.
2. Dependabot config (cannot break CI).
3. CodeQL workflow (independent, additive).
4. Static workflow: SBOM step (additive, no gate).
5. Static workflow: audit + OSV gates (separate commit so a regression
   is easy to bisect).
6. Action SHA pinning (mechanical, separate commit).
7. Container workflow: Trivy warn step + action SHA pinning.
8. Release-asset upload (depends on tag — verified on next `v*`).

Each commit must pass `npm run typecheck && npm run lint && npm run test:run
&& npm run build` locally before push.

## Open items / follow-ups (not in this work)

- Promote container Trivy from warn to gate after one stable cycle.
- Consider Scorecard workflow (OpenSSF) once Dependabot + CodeQL settle.
- Evaluate `npm audit signatures` to verify package registry signatures
  on `npm ci` once the tooling stabilises across runner versions.

## Consequences

**Positive:** Verifiable SBOM with every build; automated CVE feed to
Security tab; supply-chain-resistant action pinning; documented
disclosure path; ADR record of the policy.

**Negative:** Slightly longer CI (estimated +30–60 s for OSV +
CycloneDX); periodic Dependabot PR noise (mitigated by grouping); risk
of false-positive moderate audit findings forcing dep churn (mitigated
by `--omit=dev` and overrides as last resort).

**Neutral:** No change to runtime bundle, no change to container image
contents, no change to the privacy invariant (ADR-0001 still holds end
to end).
