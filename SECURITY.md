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
  provenance + SBOMs on container releases; verify before deploying).
- DoS via massive workbook uploads (the browser is the resource limit).
- Third-party libraries with no exploitable path in vsizer's code.

## Disclosure window

We aim to acknowledge a report within **7 days** and ship a fix within
**30 days**. Coordinated disclosure (CVD) is welcomed; please tell us
your preferred embargo date in the initial report.

## Hall of fame

We'll credit reporters in the release notes for the fix unless asked
otherwise.
