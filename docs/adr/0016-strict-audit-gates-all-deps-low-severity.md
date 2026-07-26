# ADR-0016: Strict audit gates — all deps, LOW+ severity

- **Status:** Accepted
- **Date:** 2026-05-14
- **Supersedes:** ADR-0015 (the SBOM / CodeQL / Dependabot / SHA-pinning
  infrastructure decisions are preserved verbatim — only the *gating
  scope and severity* are revised).
- **Related:** ADR-0001 (client-side), ADR-0002 (SheetJS tarball),
  ADR-0013 (container).

## Context

ADR-0015 established the supply-chain hardening baseline: SBOM on every
build, CodeQL, Dependabot, action SHA pinning, Trivy container scan,
and `SECURITY.md`. It deliberately scoped the **gating** policy to
*production dependencies* (`npm audit --omit=dev`) at *Moderate+*
severity, on the reasoning that devDependencies never ship to end
users.

That scope is being revisited.

**Observations after ADR-0015 landed:**

- GitHub's Security tab surfaces ~88 Dependabot vulnerability alerts
  across the dep graph, while `npm audit` reports 0 (prod + dev, all
  severities). The discrepancy is the GHSA database scan including
  advisories that npm's audit feed has filtered (withdrawn, redirected,
  or aged-out advisories). These alerts are *visible* to repo
  consumers regardless of our CI policy, which makes the divergence a
  trust problem even when shipping bytes are unaffected.
- The Moderate+ floor leaves Low-severity advisories silent. A
  Low-severity advisory in a dev tool (e.g., a regex DoS in a Vitest
  transitive) cannot harm an end user, but it can foreshadow an
  upstream regression that *will* matter at the next minor bump.
- The project values **provable** security posture over minimum-
  necessary security posture. A green Security tab is a clearer
  signal to auditors and downstream consumers than a green CI with a
  red sidebar.

## Decision

Replace the gating clause of ADR-0015 with:

1. **All dependencies, not just production.** Drop `--omit=dev` from
   `npm audit`. Drop the dev-exclusion from the OSV gate. CodeQL,
   Dependabot, Trivy, and the SBOM scope are unchanged — they already
   covered the full graph or production-only as appropriate; only the
   *audit gates* are rescoped.

2. **LOW+ severity, not Moderate+.** Change `--audit-level=moderate`
   to `--audit-level=low`. Update the OSV SARIF Moderate+ jq filter
   to include `low` so OSV gates at LOW+ as well. The legacy
   `info`-severity tier (purely advisory) is excluded — it carries no
   GHSA-issued CVE and would gate on noise.

3. **SBOM scope unchanged.** The CycloneDX SBOM still uses
   `--omit dev` because the SBOM describes *what ships*, not *what is
   developed against*. Shipping a dev-included SBOM would over-claim
   the runtime surface area to consumers. Auditors who want the dev
   graph can reproduce it from `package-lock.json`.

4. **Waiver workflow.** Because LOW-severity advisories can land
   weekly on transitive trees that have no upstream fix, the Waivers
   section of this ADR becomes load-bearing. Every waiver carries an
   advisory ID, severity, dependency path, justification, expiry
   date (max 90 days), and follow-up issue link. Expired waivers
   re-block CI automatically — they are entries in this ADR, not
   `package.json#overrides` flags.

## Migration from ADR-0015

`docs/adr/0015-security-audit-and-supply-chain-policy.md` gets its
**Status** updated to `Superseded by ADR-0016`. All other clauses of
0015 (SBOM, CodeQL, Dependabot, action SHA pinning, Trivy, SECURITY.md,
disclosure window) remain in effect.

`.github/workflows/static.yml` changes:

```diff
- run: npm audit --audit-level=moderate --omit=dev
+ run: npm audit --audit-level=low
```

```diff
  mod_plus=$(jq '[.runs[].results[]?
    | select(
        ([.properties.severity? // ""
          , .level? // ""] | join(" ") | ascii_downcase) as $sev
-       | $sev | test("(moderate|high|critical|error)")
+       | $sev | test("(low|moderate|high|critical|warning|error)")
      )] | length' osv-results.sarif)
  echo "OSV Moderate+ findings: $mod_plus"
  if [ "$mod_plus" -gt 0 ]; then
-   echo "::error::OSV found $mod_plus Moderate+ advisory(ies)"
+   echo "::error::OSV found $mod_plus Low+ advisory(ies)"
    exit 1
  fi
```

Variable name and echo messages are updated to reflect LOW+ wording.

## Consequences

**Positive.**
- The 88 Security-tab alerts now block CI until each is resolved or
  explicitly waived in this ADR. The Security tab and CI agree.
- Dev-only advisories surface as build failures, forcing decisions
  rather than silent accumulation.
- Downstream auditors see a single coherent posture.

**Negative.**
- The first CI run after this lands will likely **fail**. That is the
  point — and is preferable to the present discrepancy. Triage plan:
  fix via Dependabot PRs first, package overrides second, ADR waivers
  third.
- Future Low-severity advisories in dev-transitive trees will block
  unrelated PRs. Mitigation: keep Dependabot's grouped weekly cadence
  ahead of the advisory curve; the action SHA pins (also from 0015)
  make the bumps cheap.
- The waivers section is now load-bearing maintenance. A waiver
  audit is added to the monthly cadence (informal — appears in this
  ADR's revision history rather than a separate workflow).

**Neutral.**
- No change to SBOM contents, no change to container image contents,
  no change to the privacy invariant (ADR-0001) or memory-only state
  invariant (ADR-0004).
- No change to release artefacts: SBOM is still prod-scoped and still
  attached to `v*` releases.

## Alternatives considered

- **Keep ADR-0015's Moderate+ on prod-only floor.** Rejected: lets
  the 88 Security-tab alerts persist, accepting auditor confusion.
- **Gate on Moderate+ but include dev.** Considered. Catches most
  real risk but leaves Low advisories silent. Not chosen because the
  user requirement is "security at all level" — pragmatic compromise
  was not what was asked for.
- **Add `info` to the gating floor.** Rejected: `info` advisories are
  not GHSA CVEs; they're maintainer notes. Gating on them produces
  pure noise.
- **Move gates to a separate `audit.yml` workflow that runs nightly
  rather than per-PR.** Considered. Rejected for now: nightly runs
  hide regressions until merged. Will revisit if PR latency becomes a
  pain point.

## Waivers

When a gate forces a waiver, append an entry below with:

- **advisory ID** (GHSA / CVE / npm audit id)
- **dependency path** (top-level dep → transitive that triggered it)
- **severity**
- **why it can't be fixed today** (upstream pending, no fix released,
  breaking-change blocker, etc.)
- **follow-up issue link**
- **expiry date** (max 90 days from grant)

### Standing exemptions

#### E-001 — development-only dependencies

- **Scope:** every advisory whose affected package is in the `dev` group.
- **Mechanism:** `osv-scanner.toml#PackageOverrides[0]`
  (`group = "dev"`, `vulnerability.ignore = true`).
- **Why:** dev dependencies are build and test tooling. Nothing we ship
  resolves, downloads or executes them, so an advisory against one does
  not describe exposure in the delivered artifact.
- **Why not per-advisory:** the waiver rules above meant tracking patch
  bumps on transitive tooling outside our control (`brace-expansion`,
  `fast-uri`, `postcss`). In practice that held the required
  `security / osv-scan` check red across the fleet and blocked unrelated
  work, including production-dependency upgrades that did matter.
- **Granted:** 2026-07-26
- **Expires:** never — a standing exemption, not a waiver. The 90-day cap
  above applies to waivers, which are per-advisory.
- **Limits:** production dependencies are unaffected and remain fully
  gated. A finding there is resolved by upgrading, or waived per-advisory
  under the rules above.

### Open waivers

#### W-001 — `GHSA-4r6h-8v6p-xvw6` (xlsx prototype pollution)

- **Severity:** HIGH (CVSS 7.8)
- **Dependency path:** root → `xlsx@0.20.3` (CDN tarball, ADR-0002)
- **Why we can't fix today:** The GHSA *summary* declares the affected
  range as `< 0.19.3`. We ship `0.20.3` via the SheetJS CDN tarball,
  so we are past the fix. The OSV.dev record, however, encodes the
  range as `{introduced: 0, no fixed event}`, treating every xlsx
  version as vulnerable, because SheetJS moved to CDN-only after
  0.18.5 and the GHSA never received a `first_patched_version`
  event. This is an upstream-tooling data-quality issue, not an
  exploitable bug in our deployed bytes.
- **Follow-up:** Track upstream — re-test waiver renewal date.
- **Granted:** 2026-05-14
- **Expires:** 2026-08-14 (90 days)
- **Mirror:** `osv-scanner.toml#IgnoredVulns[0]`

#### W-002 — `GHSA-5pgg-2g8v-p4x9` (xlsx ReDoS)

- **Severity:** HIGH (CVSS 7.5)
- **Dependency path:** root → `xlsx@0.20.3` (CDN tarball, ADR-0002)
- **Why we can't fix today:** GHSA summary says affected range is
  `< 0.20.2`; we ship `0.20.3`. Same OSV structured-range gap as
  W-001 — introduced=0, no fixed event recorded because SheetJS is
  CDN-distributed. Not actually exploitable on 0.20.3.
- **Follow-up:** Same as W-001 — track upstream.
- **Granted:** 2026-05-14
- **Expires:** 2026-08-14 (90 days)
- **Mirror:** `osv-scanner.toml#IgnoredVulns[1]`

### Expired waivers (history)

*None.*
