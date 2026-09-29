# Reconcile local skills collection into the repository

## Objective

Make this repository the versioned source of the local skills collection, import the locally evolved packages into `.agents/skills/`, and replace the corresponding local package directories with links to this checkout.

## Scope

- Compare `~/.agents/skills` with `.agents/skills/` package by package.
- Import the active local packages, including `skills-snapshot`, into the repository.
- Preserve the repository history through the pull-request diff.
- Replace only imported top-level local package directories with relative links to the repository packages.
- Keep `~/.agents/skills/.system` unchanged.
- Regenerate the repository catalog and validate the resulting collection where tools are available.

## Exclusions

- No publication, release, visibility change, consumer installation, or remote push.
- No modification of `.system`, the manual backup, or the installer origin receipt.
- No automatic setup execution.

## Authority and rollback

The user authorized the local-to-repository reconciliation and local links. Git retains the prior repository state; `~/.agents/skills.bkp` retains the pre-migration local state. Rollback restores the prior checkout content and replaces links with the backed-up package directories.

## Sequence

1. Record the active local and repository inventories and resolve package collisions in favor of the local evolved package.
2. Copy active local packages into `.agents/skills/`, excluding `.system` and local migration-state artifacts.
3. Replace the copied local package directories with relative links to their repository counterparts.
4. Generate catalog output and run repository checks, package tests, link checks, and available structural validation.
5. Record the migration mapping and validation limits in the pull-request diff.

## Acceptance criteria

- Every imported local package exists in `.agents/skills/` as regular tracked content.
- Every corresponding local package is a working relative link to its repository counterpart.
- `.system`, the backup, and the origin receipt remain unchanged.
- No broken links or duplicate active local package directories remain.
- The catalog and applicable checks pass, or failures are recorded with their cause.
