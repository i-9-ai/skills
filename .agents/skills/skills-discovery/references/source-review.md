# Reviewing a candidate source

## Capture

Search by concrete task, output, and synonyms. Record queries even when they produce no usable result. Follow catalog links to the primary repository, resolve an immutable commit, and identify the actual package path. A repository-level license label can miss per-package overrides.

Inventory every file relevant to the package before scoring it. Read linked references and scripts; inspect examples and evaluation resources; characterize assets without executing active content. Record unread binary or oversized files as gaps. Never report complete inspection after reading only `SKILL.md`.

For a reproducible benchmark, record SHA-256 of every package file and of the applicable license bytes. Compute the package digest from sorted package-relative POSIX paths: for each file, append `path`, a NUL byte, its lowercase SHA-256, and a newline; SHA-256 the combined UTF-8 bytes. Reject symlinks, submodules, duplicate/unsafe paths, and incomplete captures instead of hashing an unexplained subset.

## Decision dimensions

| Dimension | Evidence to seek | Disqualifying or conditional concern |
| --- | --- | --- |
| Task fit | Same recurring output and triggers | Unrelated platform bundle |
| Added value | Concrete decisions/resources absent locally | Repetition or generic advice |
| Rights | Scoped license, notices, asset restrictions | Missing or incompatible copying rights |
| Safety | Bounded reads/writes, authority, private-data handling | Secret access, unsafe shell, hidden installers |
| Portability | Semantic capabilities and fallback | Hardcoded home path, vendor CLI, model family |
| Executable quality | Tests and their actual coverage | Untested behavior presented as safe |
| Instruction quality | Real tasks, baseline comparisons, failure cases | Popularity treated as acceptance |
| Maintenance | Commit history and maintained dependencies | Unresolved relevant breakage |

Do not infer production approval from install counts, audit badges, a test directory, or an upstream maintainer's claim. Cite the observed evidence and its limits.

## Handoff and future updates

Return one stable source ID per distinct package with public source links, revision, scoped license, inventory, file/package digests, decisions, and gaps. Private inputs require a sanitized report and an authorized storage boundary; public provenance must not reveal their raw content or private repository identity.

An evolution workflow can compare a fresh capture with this baseline and map changed files to accepted/rejected contributions. It must re-review rights, security, task fit, and behavior before proposing an update. A hash change grants no installation or mutation authority.
