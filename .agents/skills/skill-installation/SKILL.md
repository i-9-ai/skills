---
name: skill-installation
description: Use to install one approved skill package at an immutable source revision into a selected agent environment and return an auditable installation receipt.
license: Apache-2.0
metadata:
  author: i-9-ai
  tags: "skills, installation, provenance"
  source: original
  source_url: "https://github.com/i-9-ai/skills"
  reasoning-effort: medium
---

# Skill Installation

## Responsibility and inputs

Install one approved skill package into a caller-selected agent environment and return an auditable receipt. Accept the package identity, immutable source revision, expected license, destination, host discovery convention, collision policy, and authorization to modify that destination.

## Procedure

1. Resolve the exact source and revision. Refuse floating branches, ambiguous package names, unknown licenses, or an unreviewed source.
2. Inspect the destination and its host-specific discovery paths. Detect an existing package, aliases, and name collisions before writing.
3. Prefer the host's documented installer when it can preserve the requested revision and package boundary. Otherwise use the bundled fallback below to stage committed bytes outside discovery on the destination filesystem.
4. Validate the staged package with the official Agent Skills validator and any declared non-setup package checks. Inspect `compatibility` and `metadata.setup`; verify that a declared setup path is package relative and present, but never execute it. Verify that no secrets, private paths, or unrelated repository files entered the staged bytes.
5. Apply the caller's collision policy. Never replace an existing package silently; preserve a restorable backup or stop when safe rollback is unavailable.
6. Install atomically where the filesystem permits, establish only the approved host links or copies, and read the installed package back from its final path.
7. Return a receipt containing package name, source, immutable revision, content digest, destination, validation evidence, installed host projections, rollback instructions, whether `metadata.setup` exists, its package-relative entrypoint when present, and `setup: not-run`.

## Tools and authority

Use filesystem, checksum, package-manager, and host-discovery tools available in the authorized environment. Network access, global installation, replacement, and credential use each require authority supplied by the caller or environment policy. Do not install package runtime dependencies or run setup as part of skill installation.

The installed package's own documented explicit setup is the only setup executor. It may run only after caller authorization, using the package's prerequisites, stated side effects, idempotence rules, and fallback. A setup declaration does not grant authority and an installation receipt always records `setup: not-run`.

References to missing companion skills are discovery inputs, not permission to install them. A coordinator may hand the missing package to this skill; this skill installs only the one approved package named in the request.

## Output and evaluation

The primary output is one installation receipt bound to the installed bytes. Selecting which skill should satisfy a task belongs to routing; finding candidates belongs to discovery; evaluating behavior and security belongs to their respective review skills.

Pass when the final path is discoverable by the intended host, its bytes match the receipt, official validation succeeds, collisions were handled explicitly, setup presence and `not-run` status are recorded, and rollback is actionable. On failure, remove only files created by this run and report the exact unresolved state.

## Complete generic fallback

Use the package-owned [installation helper](scripts/install_skill.mjs) when the
approved source is a local Git repository and the host discovers a real package
directory. It requires Node.js 24+, Git, and an already approved official
`skills-ref` executable. It has no package dependencies and works from an
unrelated working directory. Read [the fallback reference](references/generic-fallback.md)
for source retrieval, every option, receipt layout, interrupted-run recovery,
and platform limits before the first installation.

After reviewing the selected commit and confirming the destination, provide
the actual values for these caller-selected paths and immutable revision:

```sh
node ./installed/skill-installation/scripts/install_skill.mjs install \
  --repository ./reviewed-source \
  --package packages/example-skill \
  --revision "$approved_commit" \
  --name example-skill --license Apache-2.0 \
  --destination ./consumer/.agents/skills/example-skill \
  --state-dir ./installation-state \
  --validator "$approved_validator_executable" --validator-version 0.1.0
```

The destination parent and state directory must already exist. State must be
outside the discovery collection and source checkout, on the same filesystem
as the destination. The command reads committed Git objects, rejects links and
unsafe paths, validates the staged package, installs it, reads it back, and
prints JSON with `receipt`, `content.sha256`, and `setup.status: not-run`.
Existing destinations are rejected unless the caller explicitly authorizes
`--replace`; that option retains the previous package in the transaction.

Use the returned receipt path, not a reconstructed or edited receipt:

```sh
node ./installed/skill-installation/scripts/install_skill.mjs verify \
  --receipt "$installation_receipt" \
  --destination ./consumer/.agents/skills/example-skill

node ./installed/skill-installation/scripts/install_skill.mjs rollback \
  --receipt "$installation_receipt" \
  --destination ./consumer/.agents/skills/example-skill
```

Rollback checks both current and retained digests before moving anything. It
preserves the withdrawn installation and restores the prior package, or leaves
a new destination absent. Consumer edits stop rollback for manual reconciliation.
The helper never fetches a source, installs the validator, runs candidate setup
or checks, creates host aliases, or claims model/host behavior from a structural
pass. Its receipt records no host projections; verify actual host discovery
separately before declaring the complete installation ready.
