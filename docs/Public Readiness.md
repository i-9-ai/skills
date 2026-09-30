# Public distribution readiness

This assessment was refreshed on 2026-09-29. Source and native-plugin preparation
have reviewable evidence. The maintainer authorized public Git hosting after
this exposure review, followed by effective main protection and Wiki
initialization/synchronization. Registry and
directory publication retain their separate release boundaries below.
A scanner pass, repository marketplace entry or green CI does not publish the
project or certify every possible disclosure. The repository remains experimental.
No visibility, billing, registry, release or directory setting was changed by this
assessment.

## Source, licenses and distribution inventory

The catalog contains 24 meta-skills. All have their entrypoint, full license,
OpenAI interface metadata and SVG/PNG icons. The repository license, scoped
notices, source revisions and reuse decisions remain separate records: see
[upstream research](https://github.com/i-9-ai/skills/wiki/Upstream-Research), upstreams.lock.json, and package
notices. The derived HTML entity table retains its BSD license beside the data.
Presence and consistency checks do not replace a legal review of every possible
redistribution claim. General domain/tool packages are outside this collection.

At source commit b9db78b521cd2e949bde3e8264cb5b416f86d791, the independent refresh
inspected 184 commits reachable from the current remote branches, all PR refs and
referenced review commits. Its scanned superset contained 212 locally available
commits, 1,776 unique blobs and 17,664,586 blob bytes. A separate Git diff scan
covered 167 patch-bearing commits and 7,245,989 bytes. Gitleaks 8.30.1 returned zero
alerts using default detectors, ignoring inline allow comments and fully
redacting report values. Manual triage found no observed private-source,
customer/personnel-record, real local-user-path or escaping-symlink blocker.
The refresh checked 24 complete package licenses and recomputed five source
aggregates from 41 recorded hashes; it did not re-fetch those 41 upstream files.
The copied entity-data hash matched, and scoped entity-data and icon notices
were retained.
Inaccessible history and subsequent commits are outside this cutoff. Pattern detection cannot
prove absence of encoded or unrecognized sensitive material. No history rewrite
was performed.

The npm allowlist contains the compiled CLI, thin launcher, canonical packages,
catalog, public docs and applicable root license/notice. It excludes source/tests,
local logs, host configuration and development dependencies. The root plugin
instead uses the single .agents/skills tree and source transports through its
host manifests. Optional portable staging copies validated packages, manifests,
license material and an integrity receipt into a disposable artifact. These are
different distribution surfaces; neither creates a registry release.

The [native pilot](https://github.com/i-9-ai/skills/wiki/Native-Plugin-Pilot) records immutable A/B/A source pins,
24-skill discovery, actual Codex/Claude SessionStart delivery, Claude MCP
initialization and data-preserving cleanup. It limits the offline dependency
warning, stubbed Codex model transport and local update mechanism. Repository
checks, official skills-ref results and packed-runtime acceptance apply to their
exact PR heads; obtain fresh results for the final release commit.

The separate [Codex MCP pilot](https://github.com/i-9-ai/skills/wiki/Codex-MCP-Pilot) adds native plugin tool
discovery and explicit catalog/read-evidence calls. Its legacy mapping requires
caller-selected external `PLUGIN_DATA` for storage and cannot infer the original
consumer cwd. This does not establish a hosted marketplace update or a public
directory's remote-MCP acceptance.

The [Copilot MCP pilot](https://github.com/i-9-ai/skills/wiki/Copilot-MCP-Pilot) adds native session discovery and
direct catalog/read-evidence calls through an ephemeral legacy plugin mount.
It requires explicit external `COPILOT_PLUGIN_DATA` for storage and likewise
cannot infer the consumer cwd. Persistent marketplace installation, hosted
update and model-selected tool use remain untested.

## Read-only GitHub exposure inventory

The remote/Actions inventory cutoff was **2026-09-30 01:15:31 UTC**
(2026-09-29 in the maintainer's local timezone). This is a bounded observation,
not an atomic snapshot or continuing monitor. The observed default branch was
main at b9db78b521cd2e949bde3e8264cb5b416f86d791. Before the authorized settings
change, incrementally inspect the readiness PR and its new commits, discussions
and workflow logs; do not extend this snapshot to those later records by inference.

| Surface | Observed coverage | Disposition |
| --- | --- | --- |
| Issues and PRs | 31 issues, 20 PRs, 43 issue comments, 415 review comments, 245 review records; zero commit comments/discussions | Zero alerts in 774 extracted discussion records (including duplicated PR bodies), 4,090,599 bytes. Illustrative review paths were triaged; no private-source or credential blocker was established. |
| Actions | 238 selected run-attempt archives; 476 files, 11,144,695 decoded bytes | All 238 archives downloaded and scanned with zero alerts and zero selected-archive gaps. Historical success is not current-head CI evidence. |
| Refs and workflows | Two remote branches, all 20 PR refs, zero tags and five registered workflows | Six files at gh-pages commit 2d748552 were inspected. Branch existence does not prove an active site. Later commits and workflows need an incremental audit. |
| Artifacts, releases and deployments | Zero visible entries | No content required inspection; deleted or inaccessible historical content is not certified. |
| Repository secrets, variables and environments | Zero visible entries | No secret values requested. Organization/enterprise configuration was outside scope. |
| Collaborators | One visible collaborator | Identity details retained only in protected local evidence. |
| Wiki | REST has_wiki:false; GraphQL hasWikiEnabled:true; authenticated ref lookup returned repository-not-found; five historical mirror runs failed | No Wiki content was accessible to audit. The maintainer now authorizes enablement, supported first-page initialization and verification of the existing mirror; [issue #52](https://github.com/i-9-ai/skills/issues/52) records actual results separately. |
| Pages and private vulnerability reporting | Both APIs returned 404 | Availability unconfirmed. Existing [security guidance](https://github.com/i-9-ai/skills/blob/main/SECURITY.md) remains the reporting fallback. |
| Main protection and rulesets | Provider returned 403 requiring a different account plan or public repository | Protection was not applied. [Issue #32](https://github.com/i-9-ai/skills/issues/32) records the requested policy and blocked configuration. |

The earlier audit's raw administrative snapshots contained generated clone-token
fields. This refresh omitted those fields before retaining API metadata; neither
audit copied them into tracked evidence or treated them as published-content
findings. Reports, API bodies and log archives stay outside the checkout,
with private directory/file permissions. Ordinary hosted-runner paths were
excluded from hygiene candidates. Scanner limitations, unavailable surfaces
and future changes remain explicit rather than being counted as clean.

## Existing publication triggers

Source includes five workflows. Validation and Changesets are read-only. The
manual [version-preparation workflow](https://github.com/i-9-ai/skills/wiki/Release-Management) prepares a draft
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
| Local repository plugin | Root Codex/Claude/Copilot manifests and marketplace entries; Codex/Claude installation pilot and native Codex/Copilot MCP calls | Select the reviewed merged commit and authorize real-consumer installation. Persistent Copilot marketplace installation and hosted updates remain separate untested distribution steps; see [issue #12](https://github.com/i-9-ai/skills/issues/12). |
| Repository-hosted marketplace | Canonical root path, identity and explicit source pinning | Consumers must be able to fetch the selected source. Confirm hosted fetching/update behavior at the selected revision; repository visibility and directory acceptance are separate decisions. |
| npm executable | Scoped identity @i-9.ai/skills, i9-skills bin, explicit public registry access, compiled allowlist and packed-runtime tests | Prepare and review the generated version and final tarball, then explicitly publish and verify an anonymous registry consumer. Public metadata alone does not upload a package. See [issue #17](https://github.com/i-9-ai/skills/issues/17). |
| Public OpenAI directory | Optional skills-only staging and provider-neutral package cores | Owner chooses submission mode, verifies publisher/access and listing/support/privacy details, runs required scans/review and explicitly publishes after acceptance. No listing or identity is fabricated here. |
| Public Claude/Copilot listing | Repository marketplace manifests | Follow each host's current listing/review process; repository access or local validation does not imply directory acceptance. |
| Public repository governance | Experimental notice, security policy, refreshed independent audit and explicit maintainer authorization | Apply and verify public access and [main protection](https://github.com/i-9-ai/skills/issues/32); enable, initialize and verify the [Wiki mirror](https://github.com/i-9-ai/skills/issues/52). Pages availability remains separate. |

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
   [native pilot procedure](https://github.com/i-9-ai/skills/wiki/Native-Plugin-Pilot#repeat-the-bounded-pilot).
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
