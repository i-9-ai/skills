# Generic installation fallback

Use this reference when the intended host has no suitable installer and can
discover a package directory. The bundled `scripts/install_skill.mjs` implements
the complete filesystem transaction. It does not require this skill's source
repository, a catalog, companion package, package manager, or global setup.

## Prerequisites and source retrieval

Use Node.js 24+, Git, a reviewed immutable source commit, a known package-relative
path, and an approved official `skills-ref` executable with a known version.
Choose a writable destination collection and private transaction directory on
the same filesystem. Stop if either tool is unavailable. Obtaining tools or
network sources is a separate, explicitly authorized preparation step.

The official executable is from `agentskills/agentskills`, not an arbitrary
similarly named package. Obtain it through a trusted, prepared environment or
an authorized validator setup. Record its source and dependency provenance in
the caller's approval evidence. `--validator` must be an absolute executable
path and `--validator-version` must match its `--version` output. The helper
records the executable digest and version; those values do not independently
prove the provenance of its interpreter or installed dependencies.

If the reviewed commit is already available locally, no network or checkout is
needed. The helper reads Git objects at that commit, ignoring working-tree
changes, untracked files, and replace refs. A separate authorized retrieval can
populate an empty, caller-selected cache as follows:

```sh
# Assign these from the approved source record; do not use a floating branch.
source_url=https://example.invalid/team/approved-skills.git
source_cache=./reviewed-source
# approved_commit must contain the actual full 40- or 64-character commit ID.

git init "$source_cache"
git -C "$source_cache" remote add origin "$source_url"
git -C "$source_cache" fetch --no-tags --depth 1 origin "$approved_commit"
git -C "$source_cache" rev-parse --verify "$approved_commit^{commit}"
```

Compare the final output with the approved commit. Use an existing credential
helper when authorized; never put credentials in the URL or command. If the
server cannot fetch that exact object, use a separately approved retrieval or
stop. Do not substitute a branch tip. Inspect the relevant committed files,
license text, source provenance, compatibility requirements, and setup
declaration before installation. A digest preserves the selected bytes; it does
not establish their quality or trustworthiness.

## Layout and ordinary invocation

The paths below are selected by the caller. No path is inferred from a user's
home, another package, or the current repository:

```text
installed/skill-installation/       # this independently copied skill
  SKILL.md
  scripts/install_skill.mjs
  references/generic-fallback.md
reviewed-source/                   # reviewed local Git source
consumer/.agents/skills/            # approved host discovery collection
  example-skill/                    # installed package only
installation-state/                # outside both source and discovery
  installation-<random>/
    receipt.json                   # private transaction record
    candidate/example-skill/       # staging, before publication
    previous/example-skill/        # retained original, on replacement
    withdrawn/example-skill/       # retained installed bytes, after rollback
```

Create the approved destination parent and private state directory explicitly.
Keep state outside version control and skill discovery. Do not store a recovery
package among live skills, where a host could activate it accidentally.

```sh
mkdir -p ./consumer/.agents/skills
mkdir -m 700 ./installation-state

node ./installed/skill-installation/scripts/install_skill.mjs install \
  --repository ./reviewed-source \
  --package packages/example-skill \
  --revision "$approved_commit" \
  --name example-skill \
  --license Apache-2.0 \
  --destination ./consumer/.agents/skills/example-skill \
  --state-dir ./installation-state \
  --validator "$approved_validator_executable" \
  --validator-version 0.1.0
```

| Option | Meaning and constraint |
| --- | --- |
| `--repository` | Existing real root directory of the approved non-bare local Git repository, not a nested directory. No source mutation or network operation. |
| `--package` | Exact directory in the commit, relative to its root. Use `.` only for a package at the repository root. Empty, absolute, dot-segment, and unsupported portable paths are rejected. |
| `--revision` | Full lowercase commit ID, not a tag, branch, abbreviation, or tree ID. |
| `--name` | Approved lowercase hyphenated name, equal to both the destination basename and official properties. |
| `--license` | Exact approved license metadata value. Review the full bundled `LICENSE` separately; the helper checks presence, nonempty content, and metadata equality. |
| `--destination` | The one package path authorized for modification. Its parent must exist; final aliases and case-insensitive collisions are rejected. |
| `--state-dir` | Existing private directory outside discovery and the source checkout, on the destination filesystem. |
| `--validator` | Absolute path to the trusted official executable; invoked with argument arrays, never through a shell. |
| `--validator-version` | Exact approved semantic version; the demonstrated official contract is `0.1.0`. |
| `--replace` | Optional explicit permission to replace an existing real package and retain its preimage. The default is to refuse all collisions. |

The helper prints one JSON result. Save the returned `receipt` path in the
caller's record. `verify` and `rollback` accept only `--receipt` and the separately
selected `--destination`; they do not infer mutation authority from the receipt.

## Transaction, validation, and receipt

Before writing, the helper verifies the source commit and entry types, checks
destination collisions, and acquires an exclusive per-package lock in the
collection. It stages committed regular files in a private transaction outside
discovery. It rejects symlinks, Git submodules, special files, hardlinked input
files, path traversal, case-insensitive duplicate paths, and obvious credential
material. It preserves Git executable bits, normalizes new directories to mode
0755, and keeps receipt files at mode 0600. No archive extraction or checkout
filter is executed.

Next it runs the chosen official executable with `validate <staged-package>`
and `read-properties <staged-package>`. It checks the approved name/license,
validates any `metadata.setup` as an existing package-relative `scripts/` file,
and verifies that staged bytes did not change during validation. It does not
invoke that setup script, other candidate scripts, or candidate runtime checks.
Run any separately required behavioral review only under its own authority.

The receipt is written as `prepared` before the first package move. For an
explicit replacement, the prior real directory moves to `previous/<name>`.
The staged package then moves into the final destination. A final read-back
must match the staged digest before the receipt changes to `installed`.
Moves remain on one filesystem; replacement has a short interval in which the
destination is absent. Do not change packages while another host is loading
them. This is recoverable replacement, not a filesystem-wide atomic swap.

The receipt records:

- schema version, state, canonical destination, and package name;
- source repository, package path, and immutable Git revision;
- installed digest, entry count, byte count, and prior package digest when present;
- validator identity/version, executable digest, commands, and validated content digest;
- setup entrypoint or `null`, always with status `not-run`;
- an empty `host_projections` list because this fallback creates no host aliases.

The digest is SHA-256 over UTF-8 `JSON.stringify(records)`, with records sorted
by the byte order of their forward-slash relative paths. Directory records
contain `path`, `type: directory`, and permission `mode`, including the root at
the empty path. File records contain `path`, `type: file`, `mode`, byte `size`,
and content `sha256`, in that key order. The digest excludes timestamps,
ownership, ACLs, and extended attributes. A fresh install recreates tracked
files and executable modes, not every property of the source filesystem.
Replacement backups preserve the original directory by moving it intact.

Keep receipts private: their selected local paths are operational evidence,
not publication artifacts. Preserve their machine-generated JSON encoding;
editing, duplicate fields, an unmatched destination, or an unsupported state
blocks use. A receipt is not a signature; protect the transaction directory
from untrusted writers.

## Verification and rollback

```sh
node ./installed/skill-installation/scripts/install_skill.mjs verify \
  --receipt "$installation_receipt" \
  --destination ./consumer/.agents/skills/example-skill

# Run only when removal/restoration of this destination is authorized.
node ./installed/skill-installation/scripts/install_skill.mjs rollback \
  --receipt "$installation_receipt" \
  --destination ./consumer/.agents/skills/example-skill
```

`verify` checks the final tree against an installed receipt, or the prior/absent
state after rollback. `rollback` checks current and retained digests before
moving anything. It retains the withdrawn package under the transaction and
restores the old package, or leaves a new destination absent. It is idempotent
after a successful rollback. Unexpected consumer edits, missing retained bytes,
or a changed backup stop the operation without overwriting those bytes.

On an ordinary pre-publication failure, only this invocation's temporary
transaction is removed. Once a receipt exists, failures preserve the receipt
and attempt verified rollback. If recovery cannot be completed, the error
identifies the retained transaction for inspection; do not report installation
success. The original failure output from Git or the validator is suppressed
to avoid echoing source credentials or candidate text.

If a process stops abruptly, inspect its `prepared` receipt and the destination,
previous, and withdrawn directories. Stop competing writers first. A stale
empty `.skill-install-<name>.lock` can be removed explicitly with `rmdir` after
confirming that no installer is still running. Then `rollback` also recovers a
prepared transaction whose observed bytes match its recorded preimage and
candidate. It refuses ambiguous states. Do not edit a receipt to force recovery.
Retained transactions are never pruned automatically; delete one only after
separate retention authorization and a verified decision that recovery is no
longer needed.

## Limits and readiness

Work in owned, stable directories without concurrent external writers. The
lock coordinates this helper's invocations only; the helper is not a sandbox
against adversarial filesystem races, nor a power-loss durability guarantee.
Each file is limited to 8 MiB, a package to 64 MiB and 4096 entries, paths to
32 segments, and each external command to 30 seconds with bounded output.
An oversized or unsupported package needs a reviewed host-specific installer;
do not remove limits to make an unreviewed source fit.

The high-confidence scan catches private-key markers, authenticated HTTP URLs,
selected token signatures, and obvious private filenames. It cannot prove the
absence of secrets in arbitrary text, binaries, or behavior. Source security
and license review remain required. The fallback creates no aliases or host
configuration: use the host's documented discovery path and confirm discovery
there. A successful structural validation is separate from host behavior and
quality evaluation. If official validation is unavailable, no package is
published by this helper; keep readiness pending until a trusted environment
can perform the official check.

## Reference provenance

The original helper above was written for this package. No upstream executable
code or documentation was copied. Its official-validator command contract was
checked against [agentskills/agentskills CLI source at commit
69ef37e9424c0a7ea9dd2293b559e43ec8176379](https://github.com/agentskills/agentskills/blob/69ef37e9424c0a7ea9dd2293b559e43ec8176379/skills-ref/src/skills_ref/cli.py)
(`validate`, `read-properties`, and the version option), under that project's
Apache-2.0 code license. Recheck this contract before selecting a different
validator version; the installed package remains usable without visiting the
link for the demonstrated version.
