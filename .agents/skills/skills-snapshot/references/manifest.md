# Deterministic manifest contract

`manifest.json` uses schema version `1`. JSON object keys are emitted in a fixed order, arrays are sorted, and the file ends with one newline.

## Content identity

`content.entries` is sorted by package-relative POSIX path. Each entry has a `path`, `type`, and numeric POSIX `mode`.

- A regular file adds `size` and lowercase hexadecimal `sha256` of its bytes.
- A symbolic link adds `target`, `target_is_absolute`, and lowercase hexadecimal `target_sha256` of the link text. Absolute targets are represented as `<absolute-redacted>`; their hash still detects changes. The target is never followed.
- A directory has no content digest; empty directories therefore remain observable.

The tree hash is SHA-256 of the UTF-8 JSON serialization of `content.entries`, without whitespace or a trailing newline. Verification rescans `content/`, compares the full entries array, and recomputes that hash.

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
