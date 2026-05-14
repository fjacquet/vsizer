# Security audit & supply-chain hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the supply-chain hardening designed in `docs/superpowers/specs/2026-05-14-security-audit-and-supply-chain-hardening-design.md` — SBOM on every build, Moderate+ audit gates, CodeQL, Dependabot, action SHA pinning, `SECURITY.md`, and ADR-0015 — without breaking the existing static-Pages and container CI.

**Architecture:** Eight independently-revertable commits land documents first (no CI impact), then additive CI steps (Dependabot, CodeQL, SBOM), then the gates (npm audit / OSV), then the mechanical hardening (action SHA pins, container Trivy warn-step), then the release-asset upload. Every commit must locally pass `npm run typecheck && npm run lint && npm run test:run && npm run build`.

**Tech Stack:** GitHub Actions, `@cyclonedx/cyclonedx-npm` (CycloneDX 1.6 JSON), `google/osv-scanner-action`, `github/codeql-action`, `aquasecurity/trivy-action`, Dependabot.

**Branch:** `security-audit-supply-chain-hardening` (already created — the design spec was committed on it).

**Pre-flight (do once before Task 1):**

- [ ] Confirm we're on the branch: `git rev-parse --abbrev-ref HEAD` → `security-audit-supply-chain-hardening`.
- [ ] Confirm baseline green: `npm audit --audit-level=moderate --omit=dev` → `found 0 vulnerabilities`.
- [ ] Install a local YAML/Actions linter so each task can be verified before push:
  `brew install actionlint` (Homebrew). Verify: `actionlint -version`.
  If `brew` is unavailable, fall back to pushing each commit to a draft PR and watching the CI run.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `SECURITY.md` | NEW | Disclosure policy (GitHub-native private advisory) |
| `docs/adr/0015-security-audit-and-supply-chain-policy.md` | NEW | Policy of record (Moderate+ gates, SBOM, SHA pins, etc.) |
| `docs/adr/README.md` | MODIFY | Append index row for ADR-0015 |
| `CHANGELOG.md` | MODIFY | `[Unreleased]` entry |
| `README.md` | MODIFY | Add "Security" section + SBOM badge |
| `.github/dependabot.yml` | NEW | Weekly grouped updates for npm / actions / docker |
| `.github/workflows/codeql.yml` | NEW | JS/TS static analysis, PR + weekly |
| `.github/workflows/static.yml` | MODIFY | Add audit, OSV, SBOM, SHA pins, release upload |
| `.github/workflows/container.yml` | MODIFY | Add Trivy warn-step, SHA pins |

---

## Task 1: SECURITY.md disclosure policy

**Files:**
- Create: `SECURITY.md`

- [ ] **Step 1: Write `SECURITY.md`**

```markdown
# Security policy

## Supported versions

The latest minor release (currently `1.x`) receives security fixes. Older
minor versions are out of support — please upgrade.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting flow:
**https://github.com/fjacquet/vsizer/security/advisories/new**

Please do **not** open public issues for security reports.

If GitHub advisories are unavailable to you, email
`fred.jacquet@gmail.com` with subject `vsizer security`. PGP is not
required.

## Scope

vsizer is 100 % client-side (see [ADR-0001](docs/adr/0001-client-side-only-processing.md)).
The privacy invariant is that uploaded RVTools / Live Optics workbooks
never leave the user's browser. Findings that would violate that
invariant — for example, a code path that exfiltrates parsed dataset
rows, or a CSP weakness on the container image — are the highest
priority.

Out of scope:

- Issues that require a malicious build of vsizer (we ship signed
  provenance + SBOMs on every release; verify before deploying).
- DoS via massive workbook uploads (the browser is the resource limit).
- Third-party libraries with no exploitable path in vsizer's code.

## Disclosure window

We aim to acknowledge a report within **7 days** and ship a fix within
**30 days**. Coordinated disclosure (CVD) is welcomed; please tell us
your preferred embargo date in the initial report.

## Hall of fame

We'll credit reporters in the release notes for the fix unless asked
otherwise.
```

- [ ] **Step 2: Verify the file renders**

Run: `head -20 SECURITY.md`
Expected: shows the markdown header and "Supported versions" section.

- [ ] **Step 3: Run the standard local gates**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all pass (no TS / Biome / Vitest impact from a new markdown file).

- [ ] **Step 4: Commit**

```bash
git add SECURITY.md
git commit -m "docs(security): add SECURITY.md disclosure policy

Documents private GH advisory reporting, supported versions, scope
(privacy invariant from ADR-0001), and the 7-day acknowledge / 30-day
fix target. No code or CI impact.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: ADR-0015 — Security audit & supply-chain policy

**Files:**
- Create: `docs/adr/0015-security-audit-and-supply-chain-policy.md`
- Modify: `docs/adr/README.md`

- [ ] **Step 1: Write the ADR**

```markdown
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
```

- [ ] **Step 2: Update `docs/adr/README.md` index**

Find the table at the end of the file and append the row:

```markdown
| 0015 | Security audit & supply-chain policy               | Accepted |
```

The closing `|` matters — match the surrounding rows exactly.

- [ ] **Step 3: Verify formatting**

Run: `tail -3 docs/adr/README.md`
Expected: the new row appears as the last table entry.

Run: `head -5 docs/adr/0015-security-audit-and-supply-chain-policy.md`
Expected: shows the H1 title.

- [ ] **Step 4: Local gates**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0015-security-audit-and-supply-chain-policy.md docs/adr/README.md
git commit -m "docs(adr): ADR-0015 security audit & supply-chain policy

Codifies SBOM-on-build, Moderate+ audit gates (prod deps only), CodeQL,
Dependabot (xlsx ignored per ADR-0002), action SHA pinning, container
Trivy scan, and SECURITY.md disclosure flow. Baseline green; this ADR
keeps it provable.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: CHANGELOG entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add a `[Unreleased] → Added` entry**

Open `CHANGELOG.md`. Under the existing `## [Unreleased]` line, insert:

```markdown
## [Unreleased]

### Added

- **Security audit & supply-chain policy** (ADR-0015) — every build
  now emits a CycloneDX 1.6 JSON SBOM (`sbom.cdx.json`, prod-deps
  scope) as a workflow artefact, attached to GitHub Releases on
  `v*` tags. CI gates on `npm audit --audit-level=moderate --omit=dev`
  and `osv-scanner` (Moderate+). A CodeQL workflow scans the TS source
  weekly and on every PR. All GitHub Actions are pinned to commit
  SHAs. Dependabot manages weekly grouped updates for npm,
  github-actions, and docker (`xlsx` excluded — ADR-0002 mandates the
  SheetJS tarball). The container workflow gained a Trivy CVE scan
  (warn-only initially; gate promotion tracked as a follow-up).
  `SECURITY.md` documents the private GitHub advisory disclosure
  path.
```

If `## [Unreleased]` is currently empty (just the header followed by
the `## [1.2.0]` section), the entry goes between them.

- [ ] **Step 2: Verify the diff is what you expect**

Run: `git diff CHANGELOG.md | head -40`
Expected: shows the new `### Added` block, no other lines changed.

- [ ] **Step 3: Local gates**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): record security audit & supply-chain policy

[Unreleased] entry for ADR-0015 work: SBOM artefacts, Moderate+ audit
gates, CodeQL, Dependabot, action SHA pinning, container Trivy scan,
SECURITY.md.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: README — Security section + SBOM badge

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Open `README.md` and locate the badge block at the top**

The existing badges (CI, license, etc.) live in the header. We'll add
two new badges and a Security section pointer.

- [ ] **Step 2: Add CodeQL + SBOM badges to the header**

Find the existing badge line and append, on the same block:

```markdown
[![CodeQL](https://github.com/fjacquet/vsizer/actions/workflows/codeql.yml/badge.svg)](https://github.com/fjacquet/vsizer/actions/workflows/codeql.yml)
[![SBOM](https://img.shields.io/badge/SBOM-CycloneDX-blue)](https://github.com/fjacquet/vsizer/releases/latest)
```

(If the README has no badge block today, place these immediately after
the H1 title, separated by a blank line.)

- [ ] **Step 3: Add a "Security" section before the "License" section**

```markdown
## Security

vsizer is 100 % client-side ([ADR-0001](docs/adr/0001-client-side-only-processing.md))
and runs under a strict Content-Security-Policy on the container image
([ADR-0013](docs/adr/0013-container-image-distribution.md)).

- **SBOM:** every build produces a CycloneDX 1.6 JSON SBOM. Static
  builds attach it to GitHub Releases on `v*` tags; container builds
  embed it as an OCI attestation alongside SLSA provenance.
- **Dependency audits:** `npm audit` and `osv-scanner` gate CI at
  Moderate+ for production dependencies.
- **Static analysis:** CodeQL runs on every PR and weekly.
- **Disclosure:** see [SECURITY.md](SECURITY.md).
- **Policy:** see [ADR-0015](docs/adr/0015-security-audit-and-supply-chain-policy.md).
```

- [ ] **Step 4: Verify the diff**

Run: `git diff README.md | head -60`
Expected: only the badge additions and the new Security section.

- [ ] **Step 5: Local gates**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs(readme): add Security section + SBOM/CodeQL badges

Surface ADR-0015 to README readers: SBOM source, audit gates, CodeQL,
SECURITY.md link. Adds two badges for CI visibility.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Dependabot configuration

**Files:**
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Write `.github/dependabot.yml`**

```yaml
# Dependabot configuration — see ADR-0015.
# Weekly grouped updates across npm, github-actions, docker.
# `xlsx` is excluded from npm updates: ADR-0002 mandates the SheetJS
# CDN tarball, not the npm package (the npm release has known CVEs).

version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: '04:00'
      timezone: Etc/UTC
    open-pull-requests-limit: 10
    labels:
      - dependencies
      - npm
    groups:
      minor-and-patch:
        update-types:
          - minor
          - patch
    ignore:
      # ADR-0002: SheetJS via the official tarball, not the npm package.
      - dependency-name: xlsx

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: '04:00'
      timezone: Etc/UTC
    open-pull-requests-limit: 5
    labels:
      - dependencies
      - github-actions
    groups:
      actions:
        patterns:
          - '*'

  - package-ecosystem: docker
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: '04:00'
      timezone: Etc/UTC
    open-pull-requests-limit: 3
    labels:
      - dependencies
      - docker
```

- [ ] **Step 2: Validate YAML syntax**

If `actionlint` is installed:
Run: `actionlint -shellcheck= .github/dependabot.yml 2>&1 || true`
Expected: `actionlint` parses; note that dependabot.yml isn't a workflow,
so `actionlint` may report it as such — that's OK. The real validation
is that GitHub's Dependabot loader accepts it once pushed.

Otherwise, manual eyeball check: indentation is consistent (2 spaces),
all keys present, no tabs.

Quick smoke: `grep -c "package-ecosystem:" .github/dependabot.yml`
Expected: `3` (npm + github-actions + docker).

- [ ] **Step 3: Local gates**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci(dependabot): weekly grouped updates for npm, actions, docker

Per ADR-0015. Groups minor/patch npm updates and all action updates to
reduce PR noise; ignores xlsx (ADR-0002 requires the SheetJS tarball,
not the npm package).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: CodeQL workflow

**Files:**
- Create: `.github/workflows/codeql.yml`

- [ ] **Step 1: Resolve commit SHAs for the CodeQL actions**

The plan pins all `uses:` references to commit SHAs (ADR-0015). For
this task, resolve the SHAs first so the workflow can be written in
one pass:

```bash
gh api repos/actions/checkout/git/refs/tags/v6.0.0 \
  --jq '.object.sha' || true
gh api repos/github/codeql-action/releases/latest \
  --jq '.tag_name' || true
gh api repos/github/codeql-action/git/refs/tags/v3 \
  --jq '.object.sha' || true
```

Capture the SHAs in a scratch note. If `v6.0.0` doesn't exist for
`actions/checkout`, fall back to the highest existing v6 tag:
`gh api repos/actions/checkout/tags --jq '.[0].name'`.

(If the resolution fails, the workflow can use floating `@v6` / `@v3`
in this task and Task 9 will replace every floating tag — including
this one — with a SHA.)

- [ ] **Step 2: Write `.github/workflows/codeql.yml`**

Replace `<CHECKOUT_SHA>` and `<CODEQL_SHA>` with the SHAs resolved
above (or leave as `@v6` / `@v3` and rely on Task 9 to pin):

```yaml
# CodeQL static analysis for vsizer — see ADR-0015.
# Scans the TypeScript source on every PR + weekly.

name: CodeQL

on:
  push:
    branches: ['main']
  pull_request:
    branches: ['main']
  schedule:
    # Weekly, Monday 04:23 UTC — staggered from Dependabot.
    - cron: '23 4 * * 1'
  workflow_dispatch:

permissions:
  contents: read
  security-events: write
  actions: read

concurrency:
  group: codeql-${{ github.ref }}
  cancel-in-progress: true

jobs:
  analyze:
    name: Analyze (javascript-typescript)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout
        uses: actions/checkout@<CHECKOUT_SHA>  # v6.x.x

      - name: Initialize CodeQL
        uses: github/codeql-action/init@<CODEQL_SHA>  # v3.x.x
        with:
          languages: javascript-typescript
          queries: security-extended

      - name: Perform CodeQL analysis
        uses: github/codeql-action/analyze@<CODEQL_SHA>  # v3.x.x
        with:
          category: '/language:javascript-typescript'
```

- [ ] **Step 3: Validate YAML**

If `actionlint` is installed:
Run: `actionlint .github/workflows/codeql.yml`
Expected: no errors.

Otherwise: visual inspection.

- [ ] **Step 4: Local gates**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/codeql.yml
git commit -m "ci(codeql): add javascript-typescript scanning

Per ADR-0015. Runs on PR + main pushes + weekly schedule with the
security-extended query suite. Uploads SARIF to Code Scanning.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Static workflow — SBOM generation (additive, no gate)

**Files:**
- Modify: `.github/workflows/static.yml`

This task is **purely additive** — no existing step changes. It adds
SBOM generation and uploads it as an artefact. The audit gate comes
in Task 8 so a regression is easy to bisect.

- [ ] **Step 1: Locate the insertion point**

Open `.github/workflows/static.yml`. The current build job ends with:

```yaml
      - name: Build
        run: npm run build

      - name: Setup Pages
        if: github.event_name != 'pull_request'
```

Insert the SBOM steps **between** `Build` and `Setup Pages`.

- [ ] **Step 2: Add SBOM generation + upload**

```yaml
      - name: Generate CycloneDX SBOM (prod deps)
        run: |
          npx --yes @cyclonedx/cyclonedx-npm@latest \
            --omit dev \
            --output-format JSON \
            --output-file sbom.cdx.json
          # Smoke-check the SBOM is valid JSON and has components.
          components=$(jq '.components | length' sbom.cdx.json)
          echo "SBOM components: $components"
          if [ "$components" -lt 1 ]; then
            echo "::error::SBOM has zero components — aborting"
            exit 1
          fi

      - name: Upload SBOM artefact
        uses: actions/upload-artifact@v4
        with:
          name: sbom-cyclonedx
          path: sbom.cdx.json
          if-no-files-found: error
          retention-days: 90
```

(The `@v4` for `upload-artifact` will be pinned to a SHA in Task 9.)

- [ ] **Step 3: Dry-run the SBOM command locally**

Run: `npx --yes @cyclonedx/cyclonedx-npm@latest --omit dev --output-format JSON --output-file /tmp/sbom.cdx.json`
Expected: command exits 0 and creates `/tmp/sbom.cdx.json`.

Run: `jq '.bomFormat, .specVersion, (.components | length)' /tmp/sbom.cdx.json`
Expected: `"CycloneDX"`, `"1.6"` (or compatible), and a positive integer.

Run: `rm /tmp/sbom.cdx.json`

- [ ] **Step 4: Local gates**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/static.yml
git commit -m "ci(static): emit CycloneDX SBOM as a build artefact

Per ADR-0015. Uses @cyclonedx/cyclonedx-npm with --omit dev so the
SBOM reflects only what ships to the browser. Uploaded as
'sbom-cyclonedx' (90-day retention). Additive — does not gate the
build yet (audit gates land in the next commit).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Static workflow — audit + OSV gates

**Files:**
- Modify: `.github/workflows/static.yml`

- [ ] **Step 1: Locate the insertion point**

Insert the gates **after `Install dependencies` and before `Type check`**:

```yaml
      - name: Install dependencies
        run: npm ci
      # <— insert here —>
      - name: Type check
        run: npm run typecheck
```

- [ ] **Step 2: Add the gates**

```yaml
      - name: npm audit (prod, Moderate+)
        run: npm audit --audit-level=moderate --omit=dev

      - name: OSV-Scanner (lockfile)
        uses: google/osv-scanner-action@v1.9.0
        with:
          scan-args: |-
            --lockfile=./package-lock.json
            --format=sarif
            --output=osv-results.sarif
        # OSV's default exit code is 1 on any vulnerability found.
        # We want Moderate+ — filter post-scan via jq to avoid
        # gating on Low/Unknown. Step itself runs to completion.
        continue-on-error: true

      - name: Upload OSV SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: osv-results.sarif
          category: osv-scanner
        continue-on-error: true

      - name: Gate on OSV Moderate+
        run: |
          if [ ! -f osv-results.sarif ]; then
            echo "::warning::OSV produced no SARIF — treating as clean."
            exit 0
          fi
          # Severity comes from the rule's properties.severity field.
          # Moderate, High, Critical → fail. Low / unknown → pass.
          # Use jq to count Moderate+ findings.
          mod_plus=$(jq '[.runs[].results[]?
            | select(
                ([.properties.severity? // ""
                  , .level? // ""] | join(" ") | ascii_downcase) as $sev
                | $sev | test("(moderate|high|critical|error)")
              )] | length' osv-results.sarif)
          echo "OSV Moderate+ findings: $mod_plus"
          if [ "$mod_plus" -gt 0 ]; then
            echo "::error::OSV found $mod_plus Moderate+ advisory(ies)"
            exit 1
          fi
```

(Versions `@v1.9.0`, `@v3`, `@v4` are placeholders — Task 9 replaces
every floating tag with a commit SHA. The OSV-Scanner action version
should be confirmed via `gh api repos/google/osv-scanner-action/releases/latest`
before the SHA pinning step.)

- [ ] **Step 3: Dry-run npm audit locally**

Run: `npm audit --audit-level=moderate --omit=dev`
Expected: exit 0; output ends with `found 0 vulnerabilities` (baseline
state captured 2026-05-14).

If this fails locally, **stop and triage** — do not push a commit that
will fail CI. Document the failing advisory in ADR-0015's "Waivers"
section with a follow-up issue, then revisit.

- [ ] **Step 4: Local gates**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/static.yml
git commit -m "ci(static): gate build on npm audit and OSV (Moderate+)

Per ADR-0015. npm audit blocks on Moderate+ in production deps
(--omit=dev). OSV runs against the lockfile, uploads SARIF to Code
Scanning, and gates on Moderate+ via a jq filter. Dev advisories do
not gate — CodeQL covers code-level issues and devDeps never ship.

Baseline is green: npm audit reports 0 vulnerabilities at commit time.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Pin all GitHub Action `uses:` references to commit SHAs

**Files:**
- Modify: `.github/workflows/static.yml`
- Modify: `.github/workflows/container.yml`
- Modify: `.github/workflows/codeql.yml`

- [ ] **Step 1: Enumerate every `uses:` reference**

```bash
grep -rn "uses:" .github/workflows/ | grep -v "^#" | sort -u
```

Expected to list (today's state, will vary):

```
actions/checkout@v6
actions/setup-node@v6
actions/configure-pages@v6
actions/upload-pages-artifact@v5
actions/deploy-pages@v5
actions/upload-artifact@v4
docker/setup-qemu-action@v3
docker/setup-buildx-action@v3
docker/login-action@v3
docker/metadata-action@v5
docker/build-push-action@v6
github/codeql-action/init@v3
github/codeql-action/analyze@v3
github/codeql-action/upload-sarif@v3
google/osv-scanner-action@v1.9.0
aquasecurity/trivy-action@<resolve-at-pin-time>  # added in Task 10
```

- [ ] **Step 2: Resolve each tag to a commit SHA**

```bash
resolve_sha() {
  local repo="$1" tag="$2"
  gh api "repos/$repo/git/refs/tags/$tag" --jq '.object.sha' 2>/dev/null || \
  gh api "repos/$repo/git/refs/tags/v${tag#v}" --jq '.object.sha' 2>/dev/null
}

# Examples:
resolve_sha actions/checkout v6.0.0
resolve_sha actions/setup-node v6.0.0
resolve_sha docker/build-push-action v6.10.0
# ... repeat for each
```

If `git/refs/tags/<tag>` returns an annotated-tag object, follow it:

```bash
sha=$(gh api repos/<repo>/git/refs/tags/<tag> --jq '.object.sha')
type=$(gh api repos/<repo>/git/refs/tags/<tag> --jq '.object.type')
if [ "$type" = "tag" ]; then
  sha=$(gh api repos/<repo>/git/tags/$sha --jq '.object.sha')
fi
echo "$sha"
```

Record the mapping in a scratch file `/tmp/action-shas.txt`:

```
actions/checkout@<40-char-sha>  # v6.0.0
actions/setup-node@<40-char-sha>  # v6.0.0
...
```

- [ ] **Step 3: Apply the pins, one workflow at a time**

For each workflow, for each `uses:` line, replace `@v<X>` with `@<SHA>  # v<X.Y.Z>`.

Example before:
```yaml
      - name: Checkout
        uses: actions/checkout@v6
```

Example after:
```yaml
      - name: Checkout
        uses: actions/checkout@a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  # v6.0.0
```

Use `sed` for mechanical replacement, then visually re-read the diff.

- [ ] **Step 4: Validate every workflow**

```bash
if command -v actionlint >/dev/null; then
  actionlint .github/workflows/*.yml
fi
grep -c "uses:.*@[a-f0-9]\{40\}" .github/workflows/*.yml
```

The second grep counts SHA-pinned lines. Cross-check against the
inventory from Step 1 — they should match.

- [ ] **Step 5: Local gates**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/
git commit -m "ci: pin all GitHub Action uses: to commit SHAs

Per ADR-0015. Defends against tag-retargeting supply-chain attacks
(tj-actions/changed-files class of incident). Each SHA carries a
trailing version comment for human readability; Dependabot bumps
them with PRs that update the comment.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Container workflow — Trivy image scan (warn-only)

**Files:**
- Modify: `.github/workflows/container.yml`

- [ ] **Step 1: Locate the insertion point**

Insert **after** `Smoke-test the local image` and **before** `Build
and publish multi-arch image`. The smoke-test step already loads
`vsizer:smoke` locally; Trivy can scan it without a registry pull.

- [ ] **Step 2: Add the Trivy step**

(Use the SHA captured in Task 9; in this task the example uses a
floating tag which Task 9 has already replaced if it ran first. Plan
order has 10 after 9, so this insertion will use the SHA directly.)

```yaml
      - name: Resolve Trivy action SHA
        id: trivy-sha
        run: |
          # Pinned at write time; see ADR-0015. Update via Dependabot.
          echo 'sha=<TRIVY_SHA>' >> "$GITHUB_OUTPUT"

      - name: Scan image with Trivy (warn-only)
        uses: aquasecurity/trivy-action@<TRIVY_SHA>  # vX.Y.Z
        with:
          image-ref: vsizer:smoke
          format: sarif
          output: trivy-results.sarif
          severity: HIGH,CRITICAL
          exit-code: '0'   # warn-only until promoted to gate (ADR-0015)
          ignore-unfixed: true
        continue-on-error: true

      - name: Upload Trivy SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@<CODEQL_SHA>  # v3.x.x
        with:
          sarif_file: trivy-results.sarif
          category: trivy-image
        continue-on-error: true
```

Resolve `<TRIVY_SHA>` via:
```bash
gh api repos/aquasecurity/trivy-action/releases/latest --jq '.tag_name'
gh api repos/aquasecurity/trivy-action/git/refs/tags/<tag> --jq '.object.sha'
```

The "Resolve Trivy action SHA" step is optional bookkeeping — the
real pin is the `uses:` line. Drop that step if it feels redundant.

- [ ] **Step 3: Validate the workflow**

```bash
if command -v actionlint >/dev/null; then
  actionlint .github/workflows/container.yml
fi
```

- [ ] **Step 4: Local gates**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/container.yml
git commit -m "ci(container): add Trivy image scan (warn-only)

Per ADR-0015. Scans the locally-loaded vsizer:smoke image for HIGH/
CRITICAL CVEs after the smoke test; uploads SARIF to Code Scanning.
Warn-only initially because base-image (nginx-alpine) CVE cadence is
upstream-controlled — promotion to gate is a one-line follow-up.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: Static workflow — attach SBOM to GitHub Releases on `v*` tags

**Files:**
- Modify: `.github/workflows/static.yml`

This step only fires on tag pushes (`refs/tags/v*`), so it is a no-op
on the regular `main` push that runs everything else. It depends on
the `sbom.cdx.json` file produced in Task 7.

- [ ] **Step 1: Locate the insertion point**

Insert **after** `Upload SBOM artefact` (Task 7) and **before**
`Setup Pages`:

```yaml
      - name: Upload SBOM artefact
        # ... (Task 7) ...

      # <— insert here —>

      - name: Setup Pages
        if: github.event_name != 'pull_request'
```

- [ ] **Step 2: Add the release-asset step**

```yaml
      - name: Attach SBOM to GitHub Release
        if: startsWith(github.ref, 'refs/tags/v')
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          tag="${GITHUB_REF#refs/tags/}"
          # Create the release if it doesn't exist yet (idempotent).
          if ! gh release view "$tag" >/dev/null 2>&1; then
            gh release create "$tag" \
              --title "$tag" \
              --notes "See CHANGELOG.md for release notes." \
              --verify-tag
          fi
          gh release upload "$tag" sbom.cdx.json --clobber
```

Note: `static.yml` currently triggers only on `push: main` and
`pull_request: main`. **Tag pushes will not fire `static.yml` today.**
To enable release-asset uploads, also extend the trigger:

```yaml
on:
  push:
    branches: ['main']
    tags: ['v*']
  pull_request:
    branches: ['main']
  workflow_dispatch:
```

When the tag trigger fires, the deploy job is conditionally suppressed
(`github.event_name != 'pull_request'` is true, so the gate currently
deploys). To avoid double-deploying Pages on tag pushes, narrow the
deploy conditions:

```yaml
      - name: Upload artifact
        if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'
```

and similarly on the `deploy` job:

```yaml
  deploy:
    if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'
```

- [ ] **Step 3: Re-read the diff carefully**

The trigger change is the riskiest part of this task — a typo will
either silently never run, or run on the wrong events. Walk the diff
once more.

Run: `git diff .github/workflows/static.yml`
Expected: the `on:` block gains `tags: ['v*']`, the upload step is
gated on `github.ref == 'refs/heads/main' && ...`, the deploy job's
top-level `if:` is similarly tightened, and the new "Attach SBOM"
step appears.

- [ ] **Step 4: Local gates**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/static.yml
git commit -m "ci(static): attach SBOM to GitHub Release on v* tags

Per ADR-0015. Extends the trigger to include v* tag pushes and adds
a tag-gated step that creates the release if needed and uploads
sbom.cdx.json as a release asset. Pages deploy and artifact upload
are tightened to refs/heads/main so tag pushes don't double-deploy.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Final verification

After all eleven tasks land on the branch:

- [ ] **Step 1: Re-run the local gates one last time**

```bash
npm run typecheck && npm run lint && npm run test:run && npm run build
npm audit --audit-level=moderate --omit=dev
npx --yes @cyclonedx/cyclonedx-npm@latest --omit dev \
  --output-format JSON --output-file /tmp/sbom.cdx.json && \
  jq '.components | length' /tmp/sbom.cdx.json && \
  rm /tmp/sbom.cdx.json
```

All must exit 0.

- [ ] **Step 2: Verify the eleven commits are linear and small**

```bash
git log --oneline main..HEAD
```

Expected: 11 commits (1 spec + 10 implementation), each touching one
concern. Roll back any commit that mixes scopes.

- [ ] **Step 3: Push the branch and open a PR**

```bash
git push -u origin security-audit-supply-chain-hardening
gh pr create --base main --title "feat(security): supply-chain hardening (ADR-0015)" \
  --body "$(cat <<'EOF'
Implements ADR-0015 — see
docs/adr/0015-security-audit-and-supply-chain-policy.md and the
design spec at
docs/superpowers/specs/2026-05-14-security-audit-and-supply-chain-hardening-design.md.

Adds:
- SBOM generation (CycloneDX) on every build, attached to releases.
- npm audit + OSV-Scanner gates (Moderate+, prod deps only).
- CodeQL for JS/TS, weekly + per-PR.
- Dependabot for npm / actions / docker (xlsx excluded — ADR-0002).
- All GitHub Actions pinned to commit SHAs.
- Trivy container scan (warn-only initially).
- SECURITY.md disclosure policy.

Baseline is green at the time of writing.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Watch the PR CI run**

```bash
gh pr checks --watch
```

Triage any failure on the spot:
- `npm audit` failure → fix the dep first; if unfixable, append a
  waiver to ADR-0015 with an expiry date and follow-up issue.
- OSV failure → same.
- CodeQL failure → review the SARIF; high-confidence issues block the
  PR, advisory-only findings are filed as follow-up issues.
- Trivy failure (warn-only) → does not block; review SARIF in the
  Security tab.

- [ ] **Step 5: After merge, verify Dependabot is active**

The Dependabot dashboard at
`https://github.com/fjacquet/vsizer/network/updates` should show
the three ecosystems. The first PRs land at the next scheduled run
(Monday 04:00 UTC) or on demand via the dashboard.

- [ ] **Step 6: Verify the SBOM appears on the next release**

Cut a `v1.3.0` release with the new policy in effect:

```bash
git checkout main && git pull
git tag v1.3.0 -m "v1.3.0 — security audit & supply-chain policy"
git push origin v1.3.0
```

Then check `https://github.com/fjacquet/vsizer/releases/tag/v1.3.0`
for the `sbom.cdx.json` asset.

---

## Rollback notes

Every commit is independently revertable. If a CI gate misbehaves
post-merge:

- **`npm audit` gate noisy** → revert Task 8's commit; the SBOM
  artefact (Task 7) survives.
- **OSV step noisy** → revert just the "Gate on OSV Moderate+" step
  while leaving the SARIF upload, so visibility remains.
- **Trivy step noisy** → already `continue-on-error: true`; do
  nothing.
- **CodeQL too slow** → reduce schedule from `* * * 1` to monthly
  while keeping PR runs.

No commit changes runtime bundle output; rollback is purely CI/docs.
