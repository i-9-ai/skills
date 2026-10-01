# Continuous secret detection

Related: [issue #53](https://github.com/i-9-ai/skills/issues/53).

## Objective and scope

Reject newly introduced credential patterns in pull requests and main updates
with a read-only, zero-secret GitHub Actions check. On 2026-10-01, the repository
API reported a public repository with native secret scanning and push protection
disabled. GitHub makes these native features available for public repositories;
changing their settings remains a separate administrative action. The additional
check supplies a reproducible merge-check boundary while native scanning provides
different provider-pattern and push-time coverage when enabled.

## Source and dependency decision

Run the upstream Gitleaks CLI, not its organization-licensed Action. Pin release
`v8.30.1`, source commit `83d9cd684c87d95d656c1458ef04895a7f1cbd8e`, and the Linux
x64 archive SHA-256
`551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb` from its
official checksum manifest. The CLI is MIT-licensed. Review its README, default
rules, `git` command and ignore/configuration behavior; execute the distributed
binary without copying upstream source into the collection. No paid service,
stored token, package dependency or installed consumer tool is introduced.

Primary sources: [upstream revision](https://github.com/gitleaks/gitleaks/tree/83d9cd684c87d95d656c1458ef04895a7f1cbd8e),
[release assets](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1),
[GitHub native scanning](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/detect-secret-leaks/enable-secret-scanning).

## Implementation and boundaries

1. Add a GitHub-hosted workflow with only `contents: read`, immutable checkout
   and setup-node pins, no persisted checkout credential, and the exact PR head.
2. Download and verify the pinned archive under the runner temporary directory.
3. Run an isolated positive/negative synthetic detector test before each scan.
4. Scan commits reachable from the head but not the event base. Pull requests use
   their base SHA; pushes use `before`. An initial push or manual audit scans up
   to 500 commits reachable from the selected head. Reject an incomplete event
   range, more than 500 new commits or more than 32 MiB of patch data rather than
   reporting a partial range as clean. Scan the current tracked tree as well,
   bounded to 64 MiB in total and 8 MiB per blob; this covers merge resolutions.
5. Capture and discard detector output. Emit fixed diagnostics and counts only;
   do not create a report, artifact, baseline or matched-value log. Use default
   rules with an explicit empty local configuration that extends the defaults,
   and disable repository-controlled ignore files and inline allow comments.
6. Document actual limits and narrow false-positive review. Do not rotate a
   credential, rewrite history, change billing, auto-fix content or grant a PR
   privileged execution. Required-check settings may change only after a live
   successful run on the exact candidate head.

## Validation and retained evidence

Unit/integration tests exercise range validation, missing history, merge content,
bounded output and fail-closed scanner failures using disposable repositories.
The pinned real detector must reject an assembled synthetic GitHub token and
accept an explicit `EXAMPLE_TOKEN` placeholder without echoing either value.
Run the focused Node tests, repository checks, Changesets status and whitespace
checks. Retain source pins, checksum, counts and live check identity; no private
scan report belongs in the repository. This is pattern detection, not proof that
no credential exists, credential validity verification or a complete history
audit beyond the stated cutoff. Git LFS payloads and nested archives are outside
the scan boundary.

## Rollback

Remove the workflow, its CI-only helper, synthetic tests, documentation and
Changeset. Remove its required-check rule first if one was later configured;
otherwise removal could block merges. The helper neither installs into the host
nor mutates repository content or provider settings.
