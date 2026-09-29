# Public distribution readiness

This assessment was refreshed on 2026-09-29. Source and native-plugin preparation
have reviewable evidence; public distribution still requires the owner actions
below. A scanner pass, private marketplace entry or green CI does not publish the
project or certify every possible disclosure. The repository remains experimental.
No visibility, billing, registry, release or directory setting was changed by this
assessment.

## Source, licenses and distribution inventory

The catalog contains 24 meta-skills. All have their entrypoint, full license,
OpenAI interface metadata and SVG/PNG icons. The repository license, scoped
notices, source revisions and reuse decisions remain separate records: see
[upstream research](Upstream%20Research.md), upstreams.lock.json, and package
notices. The derived HTML entity table retains its BSD license beside the data.
Presence and consistency checks do not replace a legal review of every possible
redistribution claim. General domain/tool packages are outside this collection.

At local source commit d3f40a5f3d10e9d897c4c22ed58a6c96bba78f5f, Gitleaks 8.30.1
scanned all locally reachable Git refs: 144 commits and approximately 5.37 MB,
with zero alerts. It ignored inline allow comments, used the default detectors
and fully redacted report values. Later uncommitted implementation, inaccessible
history and subsequent commits are outside that scan. Pattern detection cannot
prove absence of encoded or unrecognized sensitive material. No history rewrite
was performed.

The npm allowlist contains the compiled CLI, thin launcher, canonical packages,
catalog, public docs and applicable root license/notice. It excludes source/tests,
local logs, host configuration and development dependencies. The root plugin
instead uses the single .agents/skills tree and source transports through its
host manifests. Optional portable staging copies validated packages, manifests,
license material and an integrity receipt into a disposable artifact. These are
different distribution surfaces; neither creates a registry release.

The [native pilot](Native%20Plugin%20Pilot.md) records immutable A/B/A source pins,
24-skill discovery, actual Codex/Claude SessionStart delivery, Claude MCP
initialization and data-preserving cleanup. It limits the offline dependency
warning, stubbed Codex model transport and local update mechanism. Repository
checks, official skills-ref results and packed-runtime acceptance apply to their
exact PR heads; obtain fresh results for the final release commit.

## Read-only GitHub exposure inventory

The remote/Actions inventory cutoff was **2026-09-29 20:28:57 UTC**. Discussion
capture finished at 20:31:56; the last already-selected run was confirmed complete
at 20:32:42, and scanning finished at 20:32:55. This is a bounded observation,
not an atomic snapshot or continuing monitor. The observed default branch was
main at 49049ab3dd9e191bb6fe071dfdc9a17cceab94ba.

| Surface | Observed coverage | Disposition |
| --- | --- | --- |
| Issues and PRs | 27 issues, 7 PRs, 25 issue comments, 415 review comments, 245 review records | Zero Gitleaks alerts in extracted discussion content. Two illustrative paths in [an existing review comment](https://github.com/i-9-ai/skills/pull/2#discussion_r4002059581) were reviewed; no private-source or credential finding established. |
| Actions | 140 selected archives; 364 files, 6,061,670 bytes; 125 successful and 15 failed runs | All selected archives downloaded and scanned. Zero log alerts; no unavailable, expired or skipped selected archive. Historical success is not current-head CI evidence. |
| Refs and workflows | Eight remote branches; zero tags; four registered workflows | gh-pages exists, but branch existence does not prove an active site. Later commits and workflows need a new cutoff. |
| Artifacts, releases and deployments | Zero visible entries | No content required inspection; deleted or inaccessible historical content is not certified. |
| Repository secrets, variables and environments | Zero visible entries | No secret values requested. Organization/enterprise configuration was outside scope. |
| Collaborators | One visible collaborator | Identity details retained only in protected local evidence. |
| Wiki | REST has_wiki:false; GraphQL hasWikiEnabled:true; authenticated ref lookup returned repository-not-found | Enablement and initialization remain unverified. No Wiki content could be audited; do not claim synchronization succeeded. |
| Pages and private vulnerability reporting | Both APIs returned 404 | Availability unconfirmed. Existing [security guidance](../SECURITY.md) remains the reporting fallback. |
| Main protection and rulesets | Provider returned 403 requiring a different account plan or public repository | Protection was not applied. [Issue #32](https://github.com/i-9-ai/skills/issues/32) records the requested policy and blocked configuration. |

Raw administrative API snapshots contained generated clone-token fields. Those
were not published source/discussion/log findings and were never copied into
tracked evidence. Reports, API bodies and log archives stay outside the checkout,
with private directory/file permissions. Ordinary hosted-runner paths were
excluded from hygiene candidates. Scanner limitations, unavailable surfaces
and future changes remain explicit rather than being counted as clean.

## Existing publication triggers

Source includes five workflows. Validation and Changesets are read-only. The
manual [version-preparation workflow](Release%20Management.md) prepares a draft
version PR; it does not publish npm packages, tags, GitHub releases or listings.
Its tests do not establish whether live bot PR creation is enabled by policy.

The Wiki workflow selects main, verifies Wiki enablement and mirrors docs with
GITHUB_TOKEN after matching merges or an explicit dispatch. It excludes agent
instruction files and rewrites links through the tested mirror implementation.
The visual-guide workflow can push its verified assets to gh-pages. Those
existing triggers must be considered when choosing a publication commit; this
audit neither dispatches them nor changes their permissions.

## Distribution channels and owner actions

| Channel | Prepared here | Still required before that external action |
| --- | --- | --- |
| Local repository plugin | Root Codex/Claude/Copilot manifests and marketplace entries; Codex/Claude native pilot | Select the reviewed merged commit and authorize real-consumer installation. Copilot native execution, hosted updates and additional MCP mappings remain [issue #12](https://github.com/i-9-ai/skills/issues/12) boundaries. |
| Repository-hosted marketplace | Canonical root path, identity and explicit source pinning | Private consumers need Git access. Confirm hosted fetching/update behavior at the selected revision; public visibility remains a separate owner decision. |
| npm executable | Scoped identity @i-9-ai/skills, i9-skills bin, compiled allowlist and packed-runtime tests | Verify registry scope/access and final tarball; authorize version preparation and publication separately. Keep private:true until that release task. See [issue #17](https://github.com/i-9-ai/skills/issues/17). |
| Public OpenAI directory | Optional skills-only staging and provider-neutral package cores | Owner chooses submission mode, verifies publisher/access and listing/support/privacy details, runs required scans/review and explicitly publishes after acceptance. No listing or identity is fabricated here. |
| Public Claude/Copilot listing | Repository marketplace manifests | Follow each host's current listing/review process; repository access or local validation does not imply directory acceptance. |
| Public repository governance | Experimental notice, security policy, sanitized audit and requested main policy | Resolve [main protection](https://github.com/i-9-ai/skills/issues/32), refresh exposure evidence, verify Wiki/Pages/reporting settings and deliberately approve the visibility change. |

For OpenAI directory submission, the documented ordinary paths are skills-only
or an accessible remote MCP service. This project's local stdio MCP is not a
public HTTPS service. Submit the skills-only artifact or make a separate hosting
decision; do not claim the full local runtime is directory-ready. The
[Claude-plugin conversion guide](https://developers.openai.com/plugins/guides/submit-claude-plugin)
describes those paths and the local-MCP limitation.

OpenAI's [submission process](https://developers.openai.com/plugins/deploy/submission)
separates upload, automated findings, review and explicit publication. MCP review
requires five positive cases, three negative cases and a demonstration; the
skills-only path does not require those MCP review artifacts. Recheck current
portal requirements when preparing an authorized submission. These requirements
were inspected on 2026-09-29, not satisfied by this repository audit.

Claude distinguishes local source loading from hosted plugin caches and documents
Git ref/SHA selection in its [marketplace guide](https://code.claude.com/docs/en/plugin-marketplaces).
Copilot supports explicit legacy component paths according to its
[plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference);
that format evidence is separate from a native installation test.

## Repeatable sequence

1. Choose the reviewed commit to distribute. Reconcile changes and pending
   Changesets, then run npm ci, npm run check, npm run changeset:status,
   npm run package:check and git diff --check on Node 24. Require official
   package-validator CI on that same commit. An older branch or native pilot
   source pin is not a substitute.
2. Re-run the history scan and paginated remote inventory, inspect findings,
   and record exact cutoffs. Keep raw reports outside tracked files. Inventory
   new refs, comments, logs, Wiki/Pages and artifacts before changing visibility.
3. Rehearse the selected commit in a fresh isolated consumer using the
   [native pilot procedure](Native%20Plugin%20Pilot.md#repeat-the-bounded-pilot).
   Use a detached source at the full SHA, verify actual loaded bytes, then test
   the intended hosted source separately. Preserve data through rollback and
   unregister. A moving main name does not substitute for source identity.
4. Resolve the relevant owner/account actions above. Public Git hosting, npm
   publication, workspace import and public directory submission are separate
   decisions; completing one does not perform the others.
5. For an authorized release, inspect the generated version PR and final packed
   inventory, approve the selected channel and publish explicitly. Recheck the
   installed version, package count and recovery path in a real consumer after
   publication. Retain failures rather than broad compatibility claims.

This refresh supersedes the 2026-09-19 current-state assessment, preserved in Git
history. It does not invalidate that earlier run's scoped evidence or extend
either audit to unseen data.
