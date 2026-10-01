# Optional telemetry and public plugin submission

## Objective and authority

Complete the authorized repository backlog with explicit optional telemetry
setup and a skills-only artifact suitable for the public Codex submission
process. Preparation does not submit a plugin or claim marketplace approval.
Existing authorization covers implementation, review, commits, PRs and merges.

## Scope and design

- Keep the repository-root plugin and its canonical `.agents/skills` source.
- Add `hook telemetry-enable`, `hook telemetry-status` and
  `hook telemetry-disable`. Each takes an explicit host and settings filename.
  Enable requires explicit collection roots and generates supported POSIX
  registrations for Codex, Claude, Copilot or Gemini using an already available
  Node executable and CLI launcher. Hook events never download or install.
- Select shared `~/.agents/skills-usage.db` by default, preserving explicit
  `I9_SKILLS_USAGE_DB` overrides. Do not migrate previous databases implicitly.
- Merge registrations with existing settings; preserve unrelated keys and
  hooks. A sibling local receipt records only this installation's entries.
  Repeated enable is idempotent. Disable removes exact owned entries and refuses
  changed entries rather than deleting user work. Read-only status creates no
  directory, settings or database. Missing runtime is an explicit status gap.
- Bundle an agent-agnostic meta-skill for setting up skill-read observations,
  with a self-contained generic implementation and optional toolkit CLI calls.
- Extend artifact preparation with an explicit public-submission profile.
  Stage only portable packages, licenses, icons and skills-only manifests;
  omit lifecycle hook files, local MCP declarations and private runtime data.
  Produce a bounded ZIP and an integrity receipt outside host discovery.
  Never infer that a ZIP's local validation establishes official approval.

## Instruction hierarchy

Current root contracts delegate source rules to `src/AGENTS.md`, command rules
to `src/command/AGENTS.md` and lifecycle rules to `src/command/hook/AGENTS.md`.
Tests and plans already have durable contracts. Preserve those boundaries;
update their Child DOX indexes for the new commands, setup package and plan.
No new nested instruction scope is needed. Package procedures stay in their
own `SKILL.md`, independently of this checkout and its CLI.

## Validation

Use disposable HOME/configuration roots. Cover mixed host settings,
idempotence, malformed JSON, symbolic links, concurrent changes, altered owned
entries, missing runtime, read-only status and data-preserving disable.
Validate ZIP paths and contents against a skills-only allowlist; verify with
an independent ZIP consumer. Run the official Agent Skills validator for the
new package, catalog synchronization, Node 24 `npm ci` and `npm run check`,
packaging checks, Changesets status and whitespace checks. Obtain independent
review on the exact committed candidate before delivery.

## Exclusions and limits

No native host launch or real user hook installation is a test fixture.
No automatic setup, telemetry uploads, remote MCP deployment or marketplace
submission. Public-directory identity verification and approval remain human
provider steps. A command executed through npm's cache remains available only
while its runtime is retained; an explicit installed launcher is the durable
option. Native telemetry is bounded read evidence, not proof of skill use.

## Rollback

Disable removes only receipt-matched registrations and retains databases.
Preserve settings whose owned entries changed and report manual reconciliation.
The new submission artifact is disposable and never replaces canonical source.
Reverting the feature commit removes commands and docs without deleting local
telemetry, settings or historical evidence.

## Entry-path verification

The existing twelve-node map now includes shared agent evidence, explicit
telemetry setup and the distinct skills-only public submission profile. The
temporary Archify renderer retains the preceding reviewed pinned font template;
the embedded 187208-byte font matches `font-sources.lock.json`. Final delivery
passes all nine showcase checks without warnings. Chrome inspection passes
containment and readability at 1440×900, 1600×1000, 1920×1080 and 2048×1320;
the endpoint light/dark captures were inspected before refreshing the source and
artifact receipt and the README preview. No hosted publication or provider
approval is inferred from these local visual checks.
