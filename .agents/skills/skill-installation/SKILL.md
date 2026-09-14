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
3. Prefer the host's documented installer when it can preserve the requested revision and package boundary. Otherwise stage the package in a temporary sibling directory.
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
