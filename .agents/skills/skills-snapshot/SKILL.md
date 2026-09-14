---
name: skills-snapshot
description: Create, verify, list, restore, and explicitly prune deterministic snapshots of a caller-selected skill collection or package. Use before risky skill maintenance; do not use to install or refactor skills.
license: Apache-2.0
compatibility: Node.js 24 or newer; local filesystem access; atomic replacement requires snapshot staging and target on the same filesystem.
metadata:
  author: Mentor dos Nerds
  tags: "skills, snapshot, backup, restore"
  source: original
---

# Skills Snapshot

## Responsibility and boundary

Create a content-addressed snapshot of one explicitly selected skill collection or package, verify its bytes, list stored snapshots, restore the whole collection or one package, and stage explicit retention cleanup. The primary output is a restorable snapshot with a deterministic manifest.

This skill does not discover, audit, refactor, migrate, install, publish, or activate skills. It never runs merely because the package was installed or loaded. Route those tasks to their own specialists and invoke each mutation explicitly.

## Required inputs

- `source`: the collection root selected by the caller.
- `store`: a directory outside the source and outside every active skill-discovery root.
- `scope`: `collection` or `package`; package scope also requires a safe source-relative `package` path.
- `name`: a unique snapshot name for `create`.
- Optional projection observations as `LABEL=PATH`. Labels are stored; absolute paths are hashed and reduced to a basename so manifests do not disclose a home directory.

Do not select a source that contains credentials, private transcripts, personal records, or other material that should not be copied. Creation rejects conventional credential and private-transcript paths plus PEM private-key content. The helper cannot infer every kind of sensitive ordinary file, so caller selection remains part of the privacy boundary. It never follows symbolic links.

## Create and verify

Resolve `scripts/skills_snapshot.mjs` from this installed package. Run commands from any caller workspace; every collection, store, snapshot, and target path is explicit.

```sh
node /path/to/skills-snapshot/scripts/skills_snapshot.mjs create \
  --source /path/to/active-skills \
  --store /path/outside-discovery/snapshots \
  --scope collection \
  --name before-refactor

node /path/to/skills-snapshot/scripts/skills_snapshot.mjs create \
  --source /path/to/active-skills \
  --store /path/outside-discovery/snapshots \
  --scope package \
  --package skills-audit \
  --name skills-audit-before-edit \
  --projection codex=/path/to/projected/skills-audit

node /path/to/skills-snapshot/scripts/skills_snapshot.mjs verify \
  --snapshot /path/outside-discovery/snapshots/before-refactor
```

Creation rejects overlapping source and store paths, unsafe names, recognized sensitive material, special files, and an existing destination. It copies into a sibling staging directory, scans the staged content, writes `manifest.json` and `receipt.json`, verifies the staged bytes, and renames the complete directory into place. A same-filesystem rename makes the final appearance atomic where the filesystem supports it.

The manifest omits timestamps and source absolute paths. Its sorted entries record type, POSIX mode, byte size and SHA-256 for files, plus link-target data for symbolic links. It also records the selected scope, content tree hash, source-link inventory, privacy-minimized projection observations, and creation validation status. `receipt.json` contains operational time and path information and is deliberately excluded from deterministic identity. Read [the manifest contract](references/manifest.md) when integrating with another tool.

Verification recomputes the staged-content inventory and tree hash. A mismatch fails with a nonzero exit and does not repair or restore anything.

## List and restore

```sh
node /path/to/skills-snapshot/scripts/skills_snapshot.mjs list \
  --store /path/outside-discovery/snapshots --json

node /path/to/skills-snapshot/scripts/skills_snapshot.mjs restore \
  --snapshot /path/outside-discovery/snapshots/before-refactor \
  --target /path/to/active-skills \
  --scope collection --replace

node /path/to/skills-snapshot/scripts/skills_snapshot.mjs restore \
  --snapshot /path/outside-discovery/snapshots/before-refactor \
  --target /path/to/active-skills \
  --scope package --package skills-audit --replace
```

`restore` always verifies the snapshot first. Collection restore requires a collection snapshot. Package restore accepts a collection snapshot containing that package or a matching package snapshot. The target is always a collection root; package restore replaces only `TARGET/PACKAGE`.

An existing destination requires `--replace`. Before replacement, the helper renames the old destination into `.skills-snapshot-rollbacks` beside the collection root, outside normal skill discovery. It then renames the staged replacement into place and reports the retained rollback path. It attempts to restore that rollback if the final rename fails. The helper never deletes the rollback automatically.

The restore result reports both the source snapshot tree hash and the restored selection tree hash. A caller that maintains a local effective-skill ledger records the successful restore as a new migration event and updates its current tree hash. This package never edits an installer receipt or caller ledger.

When a skill has both upstream provenance and local refinements, keep three distinct identities: the immutable installer hash, the selected pre-change snapshot tree hash, and the current effective tree hash. For a proposed upstream revision, compare the new installer hash with the immutable installer hash and compare current bytes with the snapshot baseline. If upstream and local bytes both changed, stop for a three-way review; never let an installer silently overwrite the locally refined package. After an accepted update, create and verify a new snapshot, apply the reviewed merge, validate it, and append a new effective-ledger state. Read [the manifest contract](references/manifest.md) for the hash boundary.

## Explicit retention cleanup

```sh
# Preview only; no filesystem change.
node /path/to/skills-snapshot/scripts/skills_snapshot.mjs prune \
  --store /path/outside-discovery/snapshots --keep 5

# Explicitly move older snapshots into STORE/.trash; still no permanent deletion.
node /path/to/skills-snapshot/scripts/skills_snapshot.mjs prune \
  --store /path/outside-discovery/snapshots --keep 5 --apply
```

Retention order uses `receipt.json` creation time and then snapshot name. Without `--apply`, `prune` is a dry run. With it, selected snapshots are moved into `.trash`; permanent deletion remains a separate caller-owned action.

## Higher-level maintenance workflow

For an explicitly authorized rapid collection migration, compose independent skills in this order:

1. Use this package to create and verify a caller-scoped snapshot outside discovery.
2. Run a collection audit and preserve its evidence.
3. Obtain a refactoring plan with responsibility and duplicate mappings.
4. Apply only the explicitly authorized migration actions.
5. Validate the exact resulting collection and compare it with the plan.
6. If a required gate fails, explicitly restore the collection or affected package from the verified snapshot.
7. Preview retention cleanup and apply it only when separately intended.

Calling this a “YOLO” workflow changes the pace, not the authority boundary: every mutating command remains explicit, and failures stop before dependent mutation.

## Validation and limitations

Run the bundled tests in a disposable environment:

```sh
node --test /path/to/skills-snapshot/tests/skills_snapshot.test.mjs
```

The tests create fixtures only beneath the operating system temporary directory. They cover deterministic manifests, overlap rejection, link and projection inventory, tamper detection, collection and package restore, retained rollbacks, and explicit prune behavior.

Snapshots protect selected filesystem bytes. They do not prove that a skill is safe, valid, licensed, portable, or behaviorally correct. Sparse files, device nodes, sockets, FIFOs, ACLs, extended attributes, and hard-link relationships are outside the helper's contract. Special files are rejected rather than copied ambiguously.
