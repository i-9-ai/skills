# Public repository exposure and main protection

Related: public-readiness issue #25 and main-protection issue #32.

## Objective and authority

Make the repository publicly accessible after a refreshed exposure review and
remove wording that incorrectly makes repository visibility part of its runtime
contract. The maintainer explicitly authorized the visibility change on
2026-09-29, conditional on that review finding the repository safe to expose.
The prior request separately authorizes protecting `main` when GitHub supports it.

The maintainer subsequently authorized enabling and initializing the repository
Wiki so the existing documentation mirror can run, and verifying public-source
skill installation and CLI execution through `npx` in disposable consumers.
Registry publication, release preparation, tags, directory submission, billing
and installation into the maintainer's real consumer profile remain outside this change.
The npm manifest's `private: true` continues to prevent accidental registry
publication; it does not describe the GitHub repository's visibility.

## Scope and instruction map

- The root `AGENTS.md` retains repository authority and publication boundaries.
- `plans/AGENTS.md` retains the durable implementation recipes and adds this plan
  to its Child DOX index. No new instruction scope is needed.
- Public documentation follows the root contract and
  `.agents/references/public-documentation.md`; no package procedure changes.
- Correct visibility-dependent wording in the security guidance and existing
  baseline plans. Preserve dated audit evidence and generic security concepts.
- Refresh the public-readiness assessment with sanitized exact-revision evidence.
- Change GitHub repository visibility, the requested `main` policy and Wiki
  availability. Initialize the first Wiki page through GitHub's supported UI,
  then run the existing mirror from the accepted default branch.
- Verify public-source distribution in disposable consumers. Document `npx`
  only with a working, immutable package source. A public Git repository does
  not make an unpublished scoped package available in the npm registry.
- Add the standard npm `prepare` lifecycle to type-check and build the ignored
  `dist/` runtime during an explicit trusted-source install or Git-source pack.
  The existing clean Git-source test fails because `dist/index.js` is absent;
  the same fixture succeeds with `prepare: npm run build`. Keep `private: true`
  and the compiled package allowlist. No launcher or session hook runs setup.
  Validate this path on Node 24 in disposable source/cache/consumer directories
  and document its dependency download and lifecycle-execution boundary.

## Acceptance and sequence

1. Verify clean canonical source, remote refs and permission to manage settings.
   Independently inspect reachable source/history, licenses/notices and current
   public-exposure surfaces: issues, PRs, review/discussion content, Actions
   logs/artifacts, releases, branch content, Wiki and Pages. Record coverage and
   observed limitations; do not publish raw API snapshots or matched secrets.
2. Resolve findings before exposure. Scan results alone do not authorize opening
   the repository. Update misleading visibility wording and retain a Changeset.
3. Run Node 24 repository checks, Changesets and whitespace checks after explicit
   dependency setup. Obtain independent review and current-head GitHub checks
before merging the documentation and Git-source preparation change. Reconcile newly created refs and
   workflow/discussion content with the exposure cutoff before changing settings.
4. Reconfirm the accepted main revision and the exposure verdict. Use GitHub's
   explicit repository-visibility interface to select `public`; verify through
   authenticated API and unauthenticated access to the accepted source.
5. Re-read branch protection and applicable rulesets after visibility changes.
   Preserve stronger existing rules. If no rule exists, apply the policy below.
6. Read back the effective protection and record sanitized evidence in issue #32
   and Beads. Close the protection task only when the provider confirms the rule.
7. Enable the Wiki, inspect existing content and initialize `Home` when absent.
   Dispatch the existing workflow and verify its actual push, page inventory,
   representative links and exclusion of agent instruction files. Record the
   result in issue #52 and Beads; a settings change alone is not a successful sync.
8. Verify the public CLI and selected skill installation in temporary directories,
   retaining concrete command, source identity and result. Reconcile issue #17's
   remaining registry-release boundary and create issues for useful improvements.

## Main policy

- Require a pull request and resolution of review conversations.
- Require the actual `validate` and `changesets` check names from GitHub Actions
  app ID `15368`, with an up-to-date base branch.
- Enforce protection for administrators; disallow force pushes and deletion.
- Preserve merge commits for the existing delivery history. Do not impose linear
  history or an unavailable hosted-reviewer approval requirement.
- Required formal approvals remain zero. Independent review on the exact commit
  is the separately evidenced delivery gate authorized by the maintainer.
- Do not add access restrictions, bypass identities or unrelated settings.

GitHub documents that Actions history/logs become public when repository
visibility changes and that visibility changes can disable push rulesets. The
exposure audit includes those logs, and the policy is read again after the
transition. References: [repository visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
and [branch protection API](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection).

## Evidence and rollback

Retain the accepted Git revision, sanitized audit counts/cutoffs, independent
review identity, current-head checks and exact settings readback. Keep raw reports
and original settings outside the tracked repository. Failed API calls are not
successful settings changes.

Documentation can be reverted as one coherent commit. Preserve original branch
settings before applying the policy so an explicitly authorized restoration can
reapply them. Changing visibility back cannot retract copies or forks already
obtained by others; therefore complete the exposure review before opening access.
Do not rewrite history or delete remote evidence as implicit cleanup.
