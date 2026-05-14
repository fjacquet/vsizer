# ADR-0015: Security audit & supply-chain policy

- **Status:** Accepted
- **Date:** 2026-05-14
- **Related:** ADR-0001 (client-side), ADR-0002 (SheetJS tarball), ADR-0013 (container)
- **Spec:** `docs/superpowers/specs/2026-05-14-security-audit-and-supply-chain-hardening-design.md`

## Context

vsizer is 100 % client-side (ADR-0001) and ships through two channels:
GitHub Pages and `ghcr.io/fjacquet/vsizer` (ADR-0013). The remaining
attack surface is the supply chain — npm dependencies reaching the
browser, GitHub Actions executing CI with `packages: write` /
`id-token: write`, and the nginx base image distributed in the
container. The baseline is green (`npm audit` and `trivy fs` both
report 0), so this ADR captures **policy**, not remediation, ensuring
the baseline stays green and is provable to consumers.

## Decision

1. **SBOM on every build.** The static Pages workflow emits a
   CycloneDX 1.6 JSON SBOM via `@cyclonedx/cyclonedx-npm` scoped to
   production dependencies (`--omit dev`). The container workflow
   continues to emit a CycloneDX SBOM and provenance attestation via
   `docker/build-push-action`'s `sbom: true` + `provenance: true`.
   On `v*` tags, the npm SBOM is attached to the GitHub Release.

2. **Audit gates.**
   - `npm audit --audit-level=moderate --omit=dev` runs before build
     and **fails the static workflow** on any Moderate+ advisory in
     production dependencies.
   - `google/osv-scanner-action` runs against the lockfile, uploads
     SARIF to Code Scanning, and **fails on MODERATE+** for parity
     with `npm audit`.
   - Dev dependencies are scanned for visibility (CodeQL covers the TS
     source) but do **not** gate CI, because their bytes never reach
     end users.

3. **Static analysis.** A weekly + per-PR `github/codeql-action` run
   for `javascript-typescript` uploads to Code Scanning. The same
   action is reused to upload OSV and Trivy SARIF.

4. **Automated dependency updates.** Dependabot runs weekly for the
   `npm`, `github-actions`, and `docker` ecosystems, grouped to keep
   PR volume low. `xlsx` is **explicitly ignored** for npm because
   ADR-0002 mandates the SheetJS CDN tarball.

5. **GitHub Action pinning.** All `uses:` references are pinned to a
   40-char commit SHA with a trailing `# vX.Y.Z` comment for human
   readability. Dependabot bumps the SHAs.

6. **Container image scanning.** `aquasecurity/trivy-action` scans the
   built image for HIGH/CRITICAL CVEs after the smoke test. Initially
   **warn-only** (`continue-on-error: true`) because nginx-alpine
   base-image CVEs disclose on a cadence independent of our releases.
   Promotion to gate is a one-line change tracked as a follow-up.

7. **Disclosure.** `SECURITY.md` points reporters to GitHub's private
   advisory flow with a 7-day acknowledge / 30-day fix target.

## Consequences

**Positive.** SBOMs become first-class build artefacts; CVEs reach the
Security tab automatically; supply-chain attacks via tag retargeting
are blocked by SHA pinning; the privacy invariant (ADR-0001) gains a
documented disclosure channel.

**Negative.** CI lengthens by ~30–60 s for OSV + CycloneDX; Dependabot
PR volume increases (mitigated by weekly grouping); a future Moderate+
advisory may force a dep churn (mitigated by `--omit=dev`; `package.json`
`overrides` available as a last-resort waiver, with rationale recorded
here in subsequent revisions).

**Neutral.** No runtime bundle change, no container content change, no
change to the privacy invariant.

## Alternatives considered

- **SPDX instead of CycloneDX.** Rejected: BuildKit emits CycloneDX
  natively for the container; one format end-to-end is simpler.
- **`syft` + `grype` instead of CycloneDX + OSV + Trivy.** Rejected:
  syft/grype are excellent but add a binary install in CI; the GitHub-
  native + npm-native chain has fewer moving parts for a small project.
- **Gate on dev advisories too.** Rejected: devDependencies don't ship.
  CodeQL covers code-level issues. Burden > benefit.
- **Cosign image signing.** Deferred: provenance + attestations from
  `docker/build-push-action` already provide a verifiable chain on
  GHCR; cosign would duplicate the trust root.
- **Gate container scan immediately.** Deferred: base-image CVE
  cadence is upstream-controlled; warn-first avoids spurious red
  builds.

## Waivers (none today)

When an audit gate forces a waiver, append an entry here with:
- advisory ID, dependency, severity
- why it can't be fixed today
- follow-up issue link
- expiry date (max 90 days)
