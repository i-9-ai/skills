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
- Optional source-relative `capture-link-target` selections for linked packages or files whose target bytes will be edited. A broken selected target fails capture.
- Optional projection observations as `LABEL=PATH`. Labels are stored; absolute paths are hashed and reduced to a basename so manifests do not disclose a home directory.

Do not select a source that contains credentials, private transcripts, personal records, or other material that should not be copied. Creation rejects conventional credential and private-transcript paths plus PEM private-key content. The helper cannot infer every kind of sensitive ordinary file, so caller selection remains part of the privacy boundary. By default it records link text without following targets. Repeated explicit `--capture-link-target RELPATH` selections also preserve the resolved target file or directory; nested links remain links. Projection observations never capture target bytes.

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

Creation rejects overlapping source and store paths, unsafe names, recognized sensitive material, special files, and an existing destination. It inventories selected paths, stores each unique file and link-text byte sequence once under `STORE/.objects/sha256/HASH`, writes a schema-2 `manifest.json` and private `receipt.json` in a staging directory, verifies all object references, checks source stability, and renames the complete manifest directory into place. Unchanged captures reuse verified objects; an edit adds only new bytes. Deleted paths disappear from newer manifests while older manifests retain their references. No full `content/` copy is created for new snapshots. A same-filesystem rename makes the final appearance atomic where the filesystem supports it.

The manifest omits timestamps and source absolute paths. Its sorted entries record type, POSIX mode, byte size and SHA-256 for files, plus link-target data for symbolic links. It also records the selected scope, content tree hash, source-link inventory, privacy-minimized projection observations, and creation validation status. `receipt.json` contains operational time and path information and is deliberately excluded from deterministic identity. Read [the manifest contract](references/manifest.md) when integrating with another tool.

Verification validates sorted safe manifest paths and tree hashes, reads every referenced object as a regular file, checks byte hashes and sizes, and checks captured preimages. Manifest and receipt reads are bounded to 8 MiB and individual file/object reads to 64 MiB. A capture allows at most 16,384 selected entries across its source and preimages, with a maximum depth of 64 components; directory enumeration stops at the bound. Duplicate manifest JSON fields, invalid UTF-8 link targets, special files and links in stored inputs are rejected before use. Nonblocking no-follow opens and descriptor checks reject detected replacements without waiting on a FIFO. Schema-1 snapshots still verify against their existing real `content/` directories without conversion. A mismatch fails with a nonzero exit and does not repair or restore anything.

## Linked package target preimages

A link-only snapshot cannot undo edits to the linked repository. Before authorized maintenance, identify every target that will change and explicitly capture each source-relative link. Package scope requires a real package directory, so use collection scope for projected package links.

```sh
node /path/to/skills-snapshot/scripts/skills_snapshot.mjs create \
  --source /path/to/active-skills --store /path/outside-discovery/snapshot-store \
  --scope collection --name before-linked-edit \
  --capture-link-target projected-package --capture-link-target shared-contract

node /path/to/skills-snapshot/scripts/skills_snapshot.mjs verify \
  --snapshot /path/outside-discovery/snapshot-store/before-linked-edit

# Independently restore one explicitly captured target; no destination inference.
node /path/to/skills-snapshot/scripts/skills_snapshot.mjs restore-preimage \
  --snapshot /path/outside-discovery/snapshot-store/before-linked-edit \
  --link projected-package --target /path/to/project/.agents/skills/example --replace
```

The result reports whether the explicit destination matches the original resolved target path hash. Restoring elsewhere is permitted when the caller deliberately selects a recovery fixture. Target restoration retains the previous destination beside that destination. Normal collection restore restores link text only and never writes external target bytes; invoke `restore-preimage` separately for each required target. Review captured-preimage coverage before treating a snapshot as sufficient rollback evidence.

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

Restoration materializes independent files from verified objects and checks the staged selection before replacement; restored files never share mutable inodes with object storage. Destination symlinks and linked package parents are refused. An existing destination requires `--replace`. Before replacement, the helper renames the old destination into `.skills-snapshot-rollbacks` beside the collection root, outside normal skill discovery. It then renames the staged replacement into place and reports the retained rollback path. It attempts to restore that rollback if the final rename fails. The helper never deletes the rollback automatically.

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

Retention order uses `receipt.json` creation time and then snapshot name. Without `--apply`, `prune` is a dry run. With it, selected manifests are moved into `.trash` and remain verifiable with the same shared objects. Shared objects are never garbage-collected, even when no live manifest references them. Do not delete `.objects` while any live or trashed snapshot depends on it; move or back up the entire store together.

## Higher-level maintenance workflow

For an explicitly authorized rapid collection migration, compose independent skills in this order:

1. Inventory required linked-target preimages, then use this package to create and verify a caller-scoped snapshot outside discovery.
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

The tests create fixtures only beneath the operating system temporary directory. They cover deterministic manifests, byte reuse, single-file edits and deletion history, legacy backups, root/file/directory permissions, link text and target preimages, object/path tampering, independent materialization, collection/package restore, retained rollback, overlap refusal, and verifiable retention.

Snapshots protect selected filesystem bytes. They do not prove that a skill is safe, valid, licensed, portable, or behaviorally correct. Sparse files, device nodes, sockets, FIFOs, ACLs, extended attributes, and hard-link relationships are outside the helper's contract. Special files are rejected rather than copied ambiguously.

Object hashes detect corruption, not an attacker who can rewrite both manifests and objects; no signing or encryption is implemented. Capture is not a filesystem-wide transaction: keep selected source and target trees stable during the command. Failed captures can leave unreferenced immutable objects, which are retained rather than deleted automatically. Files are read into memory; this helper targets skill packages, not large media backups. The shared store must be preserved with its manifests. Existing full-copy backups remain intact and do not become deduplicated retroactively.
