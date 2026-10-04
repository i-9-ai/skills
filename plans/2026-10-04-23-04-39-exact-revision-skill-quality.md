# Exact-revision skill quality delivery

## Objective and accepted scope

Deliver [issue #89](https://github.com/i-9-ai/skills/issues/89): explicit structural and behavioral receipts tied to every byte of one source-qualified skill revision. Use the existing evidence database, CLI, MCP and memory inspection. Real global skills informed the preceding evaluation; their private source corpus and logs remain outside this delivery. A quality receipt is evidence with limits, never a universal quality score or an automatic readiness decision.

The user authorized implementation, commits, pull requests, independent review and checked merges. Native consumer installation/update remains [issue #90](https://github.com/i-9-ai/skills/issues/90); module ownership remains [issue #16](https://github.com/i-9-ai/skills/issues/16). Neither is completed by this stage. No actual global package/settings/database mutation, release preparation, npm publication, provider installation, visibility change or external module creation is included. No dependency or second task database is added. Beads remains the task ledger.

## Implementation sequence

1. Merge the reviewed bounded-delivery repair, then inspect the clean canonical checkout, source fingerprints and issue state. Create one feature branch in this checkout.
2. Preserve issued migration SQL 1–3, source/identity normalization and benchmark serialization through independent pre-change fixtures. Add ordered migration 4, a closed metadata-only quality contract, an exact package-tree fingerprint and append-only storage.
3. Add `skills quality record` / `skills quality inspect` and equivalent `skill_quality_record` / `skill_quality_inspect` MCP operations. Validate input before selecting storage. Read-only queries never create, migrate or delete anything. Include quality as a separate memory section, without changing read/lifecycle denominators or counting the envelope twice.
4. Verify genuine retained benchmark manifests, packages, runs, receipts and artifacts through the existing bounded verification seam. Derive selected-package coverage; reject detached summaries, stale digests, changed artifacts and caller-chosen trusted assurance. Preserve incomplete, failed, blocked and unexecuted evidence and distinguish passing treatment from suite comparison completeness.
5. Add an explicit official-CI observation opt-in around the existing shell-free process path. Require all three flags: `--quality-request FILE --quality-db ABSOLUTE --quality-output NEW_ABSOLUTE_ROOT`. The closed request contains only `collection`, `skill`, and existing source assertions; its package path must be `.agents/skills/<skill>` and the full requested digest must match the selected canonical package before effects.
6. Preflight storage/output/protected roots before setup. Derive the method identity from reviewed configuration; retain exact fingerprints immediately before and after the actual selected `validate` call. Retain one compact metadata artifact without overwrite. Only internal observations may select an observed tier. A changed/unknown fingerprint, unavailable or wrong-version process, setup failure, timeout, interruption or execution error cannot pass. Continue checking every canonical package and the temporary scaffold; do not persist a scaffold receipt.
7. Exercise that explicit path in the existing prepared-CI validation job using runner-owned temporary DB/output and the exact checked-out head. The job log retains only compact sanitized artifact/receipt JSON; later external import remains a caller assertion. No new upload action, shared DB or process endpoint through MCP is needed.
8. Update concrete public documentation, existing instruction indexes, command help and entry-path capabilities when affected. Add a minor Changeset. Run the meaningful local, packaging and exact-head official checks, obtain independent review, fix pertinent findings and merge only the reviewed checked head.

## Classes and affected components

- `SkillEvidenceContractValidator` centralizes existing envelope/source normalization; issued canonical byte order and key formulas stay unchanged.
- `SkillPackageTreeValidator` preserves UTF-8 sorted `path NUL file-sha256 LF` identity. `SkillPackageRevisionRepository` reads a stable inert package through the existing filesystem guard, including all regular resources; no scripts, Git or provider execution.
- `SkillQualityValidator` owns closed assertion/query/stored observation shapes, consistency, cursor, period and output bounds. `OfficialQualityValidator` owns the explicit official request and sanitized observation artifact contract.
- `SkillQualityRepository` owns transactional journal claim and quality projection, retries, conflicts and bounded history. `SkillQualityArtifactRepository` owns explicit external no-overwrite artifact selection/retention; it does not choose assurance or execute processes.
- `SkillQualityService` validates ingress, selects protected storage, and privately persists internally established observations. `SkillQualityBenchmarkService` derives coverage from fully verified retained evidence.
- `SkillQualityToolConfiguration`, quality command classes, `CommandConfiguration`, `SkillMcpService` and `SkillMcpTransport` adapt that same interface. No competing launcher or route registry is introduced.
- `OfficialValidationService`, `OfficialValidatorProcessRepository`, `OfficialValidator` and `OfficialSkillsValidateCommand` retain ordinary CI behavior and add bounded observation callbacks/configured identity for the explicit path only.
- Compose the official executor only at that command boundary. Generic quality and MCP/catalog operations must not import the official setup runtime or require a particular installed skill's authoring helper; an unconfigured observer fails before filesystem effects.
- `SkillReadMigration`, event repository, memory repository and their fixtures gain the additive projection while preserving issued behavior.

## Contract, bounds and assurance

`skill.quality.recorded` uses the existing schema-2 event envelope, unique occurrence/correlation IDs, canonical UTC time and `session: null`. It records collection, skill, source, kind, method, result, bounded coverage, portable artifact locator/hash and explicit limitations. Git repository/ref/revision, model/executor/timing/freshness/grading assertions do not become authenticated facts through hashes.

Public recording always starts at `caller_assertion`. A genuine internally verified retained benchmark can select `verified_retained_benchmark`, establishing byte identity only. The internally executed correct-version official process can select `locally_observed_official_process` only for the unchanged exact selected package. No serialized caller field, summary, hash or internal-looking JSON can select those tiers. Dependency injection is a test composition seam, not an authentication claim.

Receipt input is at most 16 KiB, query 4 KiB and output 64 KiB. The half-open UTC period is at most 366 days, matching work at most 5,000 rows and display at most 100. Package inventory is at most 2,048 total filesystem entries, including directories, 4 MiB per file and 32 MiB total; links, hardlinks, special files and detected mutation are rejected. Existing benchmark freeze/run/artifact bounds remain; all selected evidence must fit the receipt cap or fail without silent omission. This requires stable owned workspaces and does not claim race-proof OS confinement.

The official artifact records event/time/source assertions, configured source/archive/version identity, setup/version status, sanitized process status/exit/signal, exact before/after fingerprints and result/reason. It contains no raw stdout/stderr, errors, prompts, source bodies, credentials, physical paths or private logs. If later storage fails, preserve the already retained artifact. Invalid selections must not create directories, install dependencies or open a writer.

## Instruction architecture and documentation map

The existing reading routes remain root → `src/AGENTS.md` (and `src/command/AGENTS.md` for commands), root → `tests/AGENTS.md`, and root → `plans/AGENTS.md`. Public pages follow the existing `.agents/references/public-documentation.md` contract. No new durable boundary or child `AGENTS.md` is justified.

Retain all existing instruction scopes. Update their existing indexes with one operational synthesis for quality receipts and the new plan: responsibility, explicit output and no readiness/publication inference. Roll back those links together with source/docs, rather than creating parallel manuals.

Add `docs/Skill Quality.md` with complete synthetic inert record/query examples and recovery. Update `Skill Memory`, `Skill MCP`, `Behavioral Benchmark`, `Validation`, `Home`, CLI/MCP operator guides and affected architecture/entry paths. Wiki page links use title URLs without `.md`. The document explains caller assertions, observed conformance, retained coverage and incomplete comparisons separately. Private source corpora do not enter docs, Wiki, website, npm or SQLite.

## Verification and retained evidence

- Independent fixtures lock SQL/checksums 1–3, pre-change source/identity formulas, package digest and normalized benchmark output. Additive migration 4 preserves old rows; untracked/future/tampered schemas and failed DDL reject without reset. Old consumers reject schema 4; new read-only consumers reject old schema without upgrade.
- Test exact retry/cross-family conflict, negative historical receipts, same-name different-source isolation, revision filters, bounded paging/output and lazy no-effect reads. Quality is one logical memory family and remains separate from lifecycle/read counts.
- Test full resource digests, unsafe/oversized/mutating trees, genuine retained verification, detached-summary escalation, contradictory coverage and valid incomplete passing treatments. Historical freeze/run/grade artifacts remain unchanged.
- Fake process tests cover actual callback ordering, source/version identity, selected pre/post fingerprints, conformance failures, timeout/unavailable/setup/version failures, no-overwrite artifacts, protected paths and retained artifacts on DB failure. Fake tests are not actual official conformance.
- CLI/MCP tests use only disposable explicit `I9_AGENT_STATE_ROOT`/`I9_SKILLS_USAGE_DB` or fixture-owned absolute `--db` selections. Never reassign `HOME` or `CODEX_HOME`, read installed globals, execute Python/network or alter a consumer. Process seams are fake in local suites.
- With explicit `npm ci` and Node 24+, run focused suites, `npm run check`, `npm run package:check`, `npm run changeset:status`, `git diff --check`, exact-head official CI with a retained compact observation, and independent exact-commit review. Report each type of proof distinctly.

## Recovery and rollback

Revert code and disable the explicit recorder while preserving database/artifact bytes. Migration 4 is additive but older binaries are incompatible; a code revert does not downgrade, reconstruct or erase evidence. Valuable-data upgrade needs a separately selected verified backup outside discovery/distribution roots. Backup restoration, deletion and consumer settings changes need their own authority. Compatible consumers can inspect retained history; readiness and publication remain explicit decisions. Keep Beads open until implemented acceptance and review evidence are recorded.
