# Public distribution readiness reconciliation

Issue: #25. Related: native plugin pilot #12, CLI distribution #17 and branch
protection #32. This is preparation, not a public release.

## Objective and scope

Refresh source/history exposure evidence, package/license/provenance inventories,
repository publication surfaces and the private-to-public distribution runbook.
Keep the repository itself the plugin and `.agents/skills` its sole canonical
collection. Distinguish a repository-hosted marketplace, a workspace import,
registry publication and public directory submission.

Use the existing installed Gitleaks tool and repository validators read-only.
Retain raw reports, API bodies and logs outside the repository; commit only
sanitized counts, source revisions, dispositions and repeatable commands. State
the cutoff and coverage limits. No scanner pass certifies all possible disclosure.

## Sequence

1. Capture Git refs and the current source revision; scan all locally reachable
   history for high-confidence secrets and inspect current tracked/package paths.
2. Reconcile license/notice and upstream-lock evidence with the compiled npm and
   root-plugin inventories. Preserve the experimental label and avoid making
   publication or universal compatibility claims from structural checks.
3. Read repository-level GitHub state, workflows, available issues/PR comments,
   Actions logs and publication surfaces. Report unavailable surfaces distinctly.
   Do not print secret values or private logs into tracked evidence.
4. Refresh primary host documentation for marketplace registration, immutable
   source selection, updating, rollback and public submission requirements.
5. Update public readiness/distribution guides and stale linked statements with
   actual native-pilot results and clear owner/account actions. Provide a pinned
   local-source rehearsal independent of moving branches. Do not invent registry
   ownership, verified identity, support contacts or public legal URLs.
6. Validate changed docs/links, Changeset and source checks; obtain independent
   exact-commit review before a focused PR. Runtime/package tests are retained
   separately from host-native pilot and public directory approval.

## Acceptance and limits

Every finding has an evidence-backed disposition or linked issue. Readers can
follow the local/pinned rehearsal and see exactly what remains before an external
release. Unknown API availability or account permissions remain unknown. Branch
protection is tracked in #32 because the provider rejected it on the current
private-repository plan; the guide must not imply that main is protected.

The user authorized audit, implementation and local isolated tests. Do not change
visibility, billing, account verification, branch settings beyond that already
requested, publish npm packages/tags/releases, submit directory listings, or
alter real consumer installations. Existing workflow triggers are documented,
not newly dispatched by this audit.

## Verification and rollback

### Consumer installation refinement

The follow-up installation request uses unversioned `npx skills` and current
GitHub source examples as the normal path. Remove mandatory SHA placeholders
and explicit `--package` selection from those examples; retain immutable source
selection as an optional reproducibility technique and keep actual test versions
in evidence receipts. Document Codex Git-marketplace and local-folder installation
in the README, with verification, desktop discovery, updates and removal in the
plugin guide. Exercise both marketplace sources and the inferred single npm bin
in disposable consumer state, leaving real installed skills and host settings
unchanged. No dependency, command route or plugin manifest changes are required.
The selected npm identity is now `@i-9.ai/skills`, matching the domain rather than
the GitHub organization spelling. Update the manifest, root lock metadata,
installed-package identity checks, packed fixtures, pending Changesets and public
references together. The `i9-skills` executable and `i-9-ai/skills` GitHub
repository remain unchanged. Re-run the production-only packed installation;
renaming this unpublished package must not make its installed catalog, onboarding
or plugin-artifact preparation reject its own manifest. Registry ownership must
be established under the selected npm scope, independently of account username.

Registry publication remains issue #17. The current account check returns
`ENEEDAUTH` and the public registry identity returns `E404`; the shorter registry
command must remain labeled unavailable until an authenticated scope owner
publishes a reviewed package. Keep the existing publication guard while that
prerequisite is unresolved. Check the Changeset, links and Node 24 repository
suite before review. Reverting these documentation changes restores the earlier
examples without changing any consumer or registry state.

Record the Gitleaks version, refs/cutoff, scanned commit count and findings without
secret matches. Validate current repository and packed allowlist through existing
Node 24 checks, inspect exact-head official package evidence, and preserve the
native pilot's host versions, source pins and limitations. Public links are
primary documentation; external access and marketplace acceptance are not inferred.

This change adds documentation/evidence only and can be reverted without changing
host or registry state. Temporary audit reports remain outside publication and
are not removed as an implied cleanup step.
