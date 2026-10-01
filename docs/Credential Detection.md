# Credential detection

Repository content and history are public. Never submit a real credential to
exercise a detector. The existing publication-hygiene validator and the separate
[Detect credential patterns workflow](https://github.com/i-9-ai/skills/blob/main/.github/workflows/secret-scanning.yml)
provide different checks; neither proves the absence of secrets.

## Provider and merge-check boundaries

On 2026-10-01, GitHub's repository API confirmed that native secret scanning and
push protection were enabled after an initial observation found both disabled.
GitHub offers these features for public repositories. Their provider patterns,
alerts and push-time decisions are distinct from a successful Actions check.
See [GitHub's native feature contract](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/detect-secret-leaks/enable-secret-scanning).

The additional Actions job runs on pull requests, `main` pushes and explicit
manual audits, with only `contents: read`. It checks out the exact event head
without persisting a Git credential and runs Gitleaks `8.30.1` from an official
archive verified against a fixed SHA-256. It uses no scanner token, organization
Action license, paid integration, automatic remediation or uploaded report.
Source revision, reviewed interfaces, permissions and removal requirements are in
the [implementation plan](https://github.com/i-9-ai/skills/blob/main/plans/2026-10-01-22-14-29-continuous-secret-detection.md).

The CI-only helper runs the pinned detector against two disposable examples: an
explicit `EXAMPLE_TOKEN` documentation placeholder must pass and an assembled
synthetic GitHub token must fail in a file and in a disposable Git range after
its removal from the head. No actual credential is used. Detector stdout
and stderr are captured and discarded even on failure; the helper emits fixed
messages and successful counts only. Redaction is an additional precaution.

## Content and history coverage

Pull requests scan commits reachable from the head but not the exact base SHA.
Pushes scan the equivalent `before..head` range. This includes content introduced
and removed inside the range. The helper also scans every tracked blob at the
head, so merge resolutions and content already present at that head are checked.
Blob capture does not follow symlinks or execute source files.

Missing base objects, a mismatched checkout, more than 500 new commits, more than
32 MiB of patch data, more than 10000 tree entries, an individual blob over 8 MiB
or a tracked tree over 64 MiB fail the check rather than silently reducing event
coverage. A first push with a zero `before` SHA and an explicit manual audit scan
only the newest 500 commits reachable from the selected head, plus its complete
bounded tracked tree. A successful manual result reports `bounded_history: true`;
it is not a complete historical audit. Shallow or missing history is not clean
evidence for an ordinary event range.

The detector receives an explicit configuration extending upstream default rules,
an empty ignore file, and the option disabling inline allow comments. Repository
`.gitleaks.toml`, `.gitleaksignore` and `gitleaks:allow` additions cannot waive this
check. No entropy or pattern detector covers all credentials: unknown formats,
encodings and deliberate obfuscation can evade it. Commit messages, nested archives, external
submodule content, Git LFS payloads, untracked local files, unreachable history
and commits before the stated cutoff are outside the scan. Submodule tree entries
fail for a separate audit rather than being presented as scanned. Detection does
not check whether a credential is valid or revoke it.

## Run and investigate

Install or download the explicitly reviewed Gitleaks version in an owned
disposable environment, then run:

```sh
node .github/scripts/secret-scan.mjs --self-test
SCAN_EVENT=pull_request SCAN_BASE_SHA="$BASE_SHA" SCAN_HEAD_SHA="$HEAD_SHA" \
  node .github/scripts/secret-scan.mjs
```

Set `BASE_SHA` and `HEAD_SHA` to the event's complete commit SHAs first; the checkout
must already be at that head. Set `GITLEAKS_BINARY` to select
an explicitly verified binary; the helper does not download or install one.
Manual history inspection uses `SCAN_EVENT=workflow_dispatch` and the selected
`SCAN_HEAD_SHA`. Local scans do not reproduce GitHub's native push protection.

For a failure, review the introduced files in an owned environment. Keep any
investigation output private and do not paste matched values into logs, issues,
PRs or chat. A harmless example should use an obvious placeholder or assemble its
synthetic marker at runtime. If a real detector false positive needs an exception,
review a narrowly scoped rule change with its reason and positive/negative
regressions; there is no automatic baseline or broad allowlist escape hatch.
Credential rotation and history changes require their own explicit scope.

Required-check policy can reference `secret-scanning` only after its first live
successful run on the exact PR head. Local synthetic tests and a configured
native feature do not prove that live CI or branch protection has been applied.
