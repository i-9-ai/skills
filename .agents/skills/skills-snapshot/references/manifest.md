# Deterministic manifest contract

`manifest.json` uses schema version `2` for new captures. Existing schema-1 full-copy backups remain readable and restorable without rewriting. JSON object keys are emitted in a fixed order, arrays are sorted, and the file ends with one newline.

## Content identity

`content.entries` is sorted by package-relative POSIX path. Each entry has a `path`, `type`, and numeric POSIX `mode`.

- A regular file adds `size` and lowercase hexadecimal `sha256` of its bytes.
- A symbolic link adds `target`, `target_is_absolute`, and lowercase hexadecimal `target_sha256` of the link text. Absolute targets are represented as `<absolute-redacted>`; their hash still detects changes. Link text itself is stored as an object. Targets are not followed unless explicitly selected for preimage capture; nested links within a selected target are not followed.
- A directory has no content digest; empty directories therefore remain observable.

The tree hash is SHA-256 of the UTF-8 JSON serialization of `content.entries`, without whitespace or a trailing newline. Schema-2 verification validates safe sorted unique paths and recorded directory parents, recomputes the hash, and verifies all file and link objects. `content.root_mode` preserves ordinary root permission bits separately from the entries-only tree hash. Schema-1 verification instead rescans its full `content/` copy.

## Shared object storage and complete manifests

```text
snapshot-store/
  .objects/sha256/<64-character-byte-hash>
  before-edit/manifest.json
  before-edit/receipt.json
  after-edit/manifest.json
  after-edit/receipt.json
  .trash/older/manifest.json
```

`storage.layout` is `shared-sha256-v1`. Every file uses its `sha256` object; every link uses its `target_sha256` object containing exact UTF-8 link text. Objects are published with an atomic no-clobber operation and reused only after regular-file/hash/size verification. Restore writes independent files, never hard links into this store. Symlink objects and symlink object directories are refused. Link permission bits are restored where the platform supports them; inability to preserve selected bits fails staging before replacement. A snapshot finds objects in its immediate parent store, or the parent of `.trash`; receipt paths are never used to redirect object lookup.

Each manifest records a complete selected state, not an incremental patch. New/changed bytes add objects; absent paths represent deletion in that new state. Earlier manifests remain restorable. Root permissions are recorded even for an empty collection. Directory/file modes use ordinary `0777` bits; ACLs, extended attributes, setuid/setgid/sticky bits, and hard-link relationships are not preserved.

Move or archive the entire store together. A schema-2 manifest directory alone is insufficient backup. `prune` moves manifests to `.trash`, retains objects, and permits verification/restoration from trash. No object garbage collection or encryption is provided; failed captures may leave unreferenced objects.

## Explicit linked-target preimages

`preimages` is an array sorted by `link_path`. Each item records the selected source-relative link, a SHA-256 of its original resolved absolute target path, `root_type` (`file` or `directory`), and a `content` tree with root mode, entries, and tree hash. Directory contents use relative paths; a single file uses the logical path `value`. Sensitive-name checks use the actual target basename before this normalization. All preimage bytes share the same object store.

Only an explicit `--capture-link-target RELPATH` follows that selected link to capture target bytes. Projection observations remain inventory only. Link-parent aliases, missing selected targets, special files, and targets overlapping the store are refused. Nested target links remain link text and require their own separately planned preimage if their targets will change.

`restore-preimage --snapshot PATH --link RELPATH --target PATH [--replace]` restores one selected preimage to an explicit destination, verifies materialized bytes/modes, and retains the previous destination. It never derives mutation destinations from the manifest. Normal `restore` reports `external_targets_restored: false` and does not restore preimages implicitly. Preimage coverage is a caller planning responsibility, not an automatic guarantee inferred from link inventory.

## Helper implementation map

`scripts/skills_snapshot.mjs` owns CLI selection, privacy checks, source scans, manifest/receipt publication, retention, and staged restoration. `scripts/snapshot_objects.mjs` owns immutable object publication, strict tree validation, object verification, and independent materialization. Neither module changes installer locks, catalogs, external targets on ordinary restore, or host links automatically.

## Scope and links

`selection.scope` is `collection` or `package`. Package scope records the normalized source-relative package path. Collection manifests omit it.

`links.source` repeats the symbolic-link entries so a reviewer can inspect link boundaries directly. `links.projections` records caller-supplied observations. Projection labels are preserved. The observation path is represented by basename plus SHA-256 of the absolute path; absolute link targets are redacted to `<absolute-redacted>` while their hashes and relation to the selected source remain available. Projections are inventory only and are never created or restored.

## Operational receipt

`receipt.json` is outside deterministic identity. It records the snapshot name, creation time, selected source and store paths, and tool version for local operations. Do not publish receipts when their paths reveal private environment details.

The snapshot name and creation time do not influence `manifest.json`. Two snapshots of the same selected bytes and projection observations therefore have byte-identical manifests.

## Effective-ledger integration

Treat an installer's lock file as an immutable upstream receipt unless that installer explicitly documents a compatible mutation interface. Do not replace its installed hash with a locally computed tree hash; their algorithms and meanings can differ.

A separate local effective ledger should map each canonical skill identity to:

- the installer receipt reference and original installed hash, when present;
- the pre-change snapshot identifier and package tree hash;
- the current effective package tree hash;
- disposition, migration record, validation state, and supersession links.

An upstream update is conflict-free only when either the upstream installer hash is unchanged or the current effective package tree equals the recorded local baseline. If the upstream installer hash and local effective tree both changed, require a three-way review using the immutable receipt, preserved snapshot, and new upstream candidate. A successful restore updates only the effective ledger after the target bytes and reported restore hash are verified; it never rewrites history in the installer receipt.
