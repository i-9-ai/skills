# Changelog

## 0.3.3

### Patch Changes

- fafab9f: Avoid falsely refusing concurrent evidence writers when SQLite removes a journal
  while its pathname inspection returns a detached regular inode. Inspect that
  sidecar pathname once more and validate any current replacement with the same
  regular, single-link file rules. Keep the primary database strict, reject unsafe
  replacements and repeated invalid observations, and preserve the five-second
  SQLite lock timeout without retrying writes or resetting evidence.

## 0.3.2

### Patch Changes

- 38a9547: Define admission and interoperability for independently owned skill collection modules, including source-qualified collisions, license and identity evidence, resource boundaries, explicit updates and standalone fallbacks. Extend the synthetic federated integration proof to reject unsupported catalog versions and duplicate source IDs while preserving the existing aggregate and evidence. This contract does not install modules or authenticate publishers.
- 38a9547: Report the validated installed package version in the CLI and local plugin MCP
  handshake instead of a fixed implementation version. Initialization reads only
  the installed manifest, leaves catalogs and evidence storage untouched, and
  rejects malformed package identity. The MCP protocol version remains independent.
- 38a9547: Document explicit Codex registration of the local stdio MCP through `npx @i-9.ai/skills mcp serve`, including runtime prerequisites, first-launch downloads and duplicate-registration limits. Explain that this local launch does not attach MCP to the public skills-only plugin: the public directory currently requires a remote HTTPS endpoint and cannot add MCP to an existing skills-only submission.
- 38a9547: Constrain optional skill-read setup to closed, reviewed metadata observers.
  The portable helper derives Claude, Gemini and Copilot commands from a selected
  local Node, a byte-identical read-only retained observer, explicit collections
  and a local JSONL sink; arbitrary command JSON is now manual preview only.
  Existing generic ownership receipts remain inspectable and exactly removable.

  Toolkit `hook telemetry-enable --write` now requires `--reviewed-registration`
  from its preview, the installed launcher and a retained read-only package with
  local production dependencies, traversing the declared transitive dependencies
  and required peers relative to each importer. Missing optional packages remain
  optional; present out-of-tree resolutions fail without evaluating modules.
  Changed code/imports, unrelated runtimes, links,
  writable toolkit assets and stale digests fail before settings writes.
  Status verifies Node/launcher/inventory identity; removal preserves unrelated
  settings and SQLite evidence. The toolkit retains its Codex read-proof path.

  Node is selected and byte-bound but may remain owner-updatable. Filesystem
  checks assume stable owned directories and do not provide hostile-race
  confinement, validation of computed/undeclared imports, or toolkit per-event
  inventory verification. No automatic download,
  compilation, trust bypass or evidence upload is introduced. The public
  skills-only submission still excludes the setup skill; hardening is not provider
  approval.

## 0.3.1

### Patch Changes

- 45f1db0: Include the complete public plugin listing in the portable and compatibility manifests, with a 26-character subtitle, a validated 512-pixel product icon, support links and published privacy and terms URLs at skills.i-9.ai.

  Public submission now transparently excludes the optional `skills-usage-setup` persistent-command registration package and records the reason in artifact receipts; the full repository and npm distribution retain it. The public ZIP still provides no local MCP or lifecycle hooks, and provider approval remains a separate review.

  Add readable privacy and terms pages to the website. For explicit local usage setup, show the exact registration and require its reviewed digest before writing a new registration; this binds the write to reviewed input but does not establish command safety or native execution.

## 0.3.0

### Minor Changes

- 1c16cb8: Add `--executable`, `--project`, `--global-root`, `--no-global` and `--max-entries`
  to `hook session-config` and `hook verify`. Generate opt-in POSIX session hooks
  for a retained local CLI executable and resolve its consumer project explicitly
  or from the hook working directory. Reject missing or non-executable selections;
  preserve existing checkout and plugin defaults. Generation and verification do
  not enable hooks, install dependencies or prove native host delivery.
- 1c16cb8: Add explicit `hook telemetry-enable`, `hook telemetry-status` and
  `hook telemetry-disable` commands. They preview or merge supported Codex,
  Claude, Copilot and Gemini registrations into a selected settings file,
  preserve unrelated hooks, and use a local ownership receipt for idempotent
  setup and exact-entry removal. Observations use the shared agent evidence
  database by default. Hook events never install or download a runtime, and
  disabling observations retains evidence. POSIX settings registration requires
  an existing canonical parent directory and an already available executable;
  native host trust remains a separate prerequisite.
- 1c16cb8: Add `plugin submission` to preview or explicitly write a portable skills-only plugin folder, deterministic ZIP and SHA-256 integrity summary under a new neutral staging parent. The public projection includes complete packages, assets and licenses while excluding repository hooks, local MCP, apps and local state. Preparation performs no installation, portal upload or publication and does not establish provider approval; changed skills or package files require a newly prepared ZIP for manual submission.
- 1c16cb8: Share native and CLI skill-read evidence at `~/.agents/skills-usage.db` by
  default, with explicit `I9_AGENT_STATE_ROOT`, `I9_SKILLS_USAGE_DB` and command
  database overrides. Automatic plugin data variables no longer split evidence
  by host. Existing databases are never moved, merged or deleted implicitly.

  Add bounded Codex literal shell-read verification and Gemini/Copilot read
  adapters alongside Claude observations. Queries remain read-only; explicit
  writers initialize selected safe state lazily. Store opaque identities and
  bounded metadata, without raw prompts, commands or file content. Receipt
  counts signal demand rather than activation. Gemini and Copilot receipts do
  not establish reliable pre/post call correlation, and supported payload tests
  do not prove universal native-host delivery or trust.
- 1c16cb8: Add the portable `skills-usage-setup` meta-skill for previewing, explicitly enabling,
  inspecting and removing optional skill-read observations for selected collections.
  Its bundled Node 24 helper preserves unrelated settings and local evidence with
  receipt-owned registration, a metadata-only JSONL sink and complete synthetic
  examples. Native host adapters are optional; installation never enables capture,
  and read observations do not prove skill activation or effectiveness.

### Patch Changes

- 1c16cb8: Add a read-only credential-pattern check for pull requests and main updates using
  checksum-pinned Gitleaks 8.30.1, isolated synthetic detector checks, complete event
  commit ranges and tracked-head blob inspection. Fail on missing history or stated
  resource limits; discard matched-value output and provide no automatic exception,
  rotation or history rewrite. Manual history audits stop at the newest 500 commits.

  Refresh official checkout, Node setup and Python setup actions to immutable Node
  24 releases. Verify local runtime, manifest and OIDC identity prerequisites before
  the official packed npm publication, while explicitly leaving the server-side
  trusted publisher binding and successful upload to provider verification.
- 1c16cb8: Retain a bounded source receipt when a compiled package is prepared from a clean Git checkout of the collection. Installed `catalog search`, `catalog read`, `catalog overview` and their MCP equivalents expose the exact source revision as a build assertion after verifying distributed file digests. Missing, modified, archive or dirty-source receipts report unavailable Git provenance; receipt hashes do not authenticate the publisher, and runtime reads never infer a revision from the caller's repository.
- 1c16cb8: Preserve existing changelog preamble and historical release bytes during `repo prepare-version`, including indented blank lines and mixed version-heading depths. Normalize only newly generated entries and reproduce the same output in repeated read-only `repo verify-release --base` checks.
- 1c16cb8: Update the interactive entry-path map and README diagram to distinguish shared
  agent evidence, explicit optional telemetry setup and skills-only public plugin
  submissions from full repository-root plugins with hooks and local MCP.
- 1c16cb8: Add an original package favicon to the catalog website, with paths that work from
  the root, translated pages and a GitHub Pages project subdirectory.

## 0.2.0

### Minor Changes

- e094c79: Add an English, Portuguese and Spanish promotional site for the meta-skill catalog,
  with canonical package descriptions/icons, exhaustive responsibility filters,
  language and search URL-state preservation, a dismissible root-only browser-language
  suggestion, simplified all-skills installation, manual package/plugin/toolkit
  installation paths, and documented evidence limits. npm run site:build creates
  an owned static review artifact, npm run site:preview serves it on loopback only,
  and npm run site:test checks synthetic output and preview safety, including
  reserved-path case aliases and preservation of dangling caller-owned links. Default builds
  remain noindex. Explicit production URL configuration adds canonical locale links,
  share metadata and a sitemap for native Cloudflare Git delivery; the builder never
  deploys. Existing GitHub Pages visual-guide routing remains unchanged, and the
  website PR stays open for human review before main production receives its source.

### Patch Changes

- 76652f2: Complete the Changesets release workflow: prepare aligned package/plugin versions in a draft PR, then publish the checked compiled artifact with npm Trusted Publishing and create its Git tag and GitHub release after the reviewed merge. Preserve bounded note validation and verify generated release content before publication.

  Add an explicit recovery dispatch for the missing 0.1.0 GitHub release at its original reviewed commit, without uploading that npm version again. Update installation and release instructions to reflect the available public registry package and the exact workflow publisher binding.
- 8fb6f72: Fix Changesets release planning in GitHub Actions when the triggering commit is checked out with detached HEAD. Resolve the local default-branch reference to that verified commit before planning, without moving the checkout or changing pending release notes.
- 65fc634: Publish the multilingual catalog website through GitHub Pages Actions instead
  of the visual-guide-only branch workflow. Preserve existing guide URLs and
  support project-path canonical URLs and locale suggestions.

## 0.1.0

### Minor Changes

- 9a0dfae: Integrate reviewed Agent Skills guidance into authoring, design, evaluation,
  evidence collection and optimization: sanitized task corrections, step-specific
  instruction control, noninteractive helper contracts, portable evaluation cases,
  and separate activation-error optimization. Keep final acceptance frozen and
  distinguish official format validation from stricter local and behavioral checks.
  No upstream scripts, automatic installers or provider-specific executor are added.
- f9def8d: Register the shared local skill MCP directly in the repository-root Codex plugin.
  The verified legacy mapping resolves the dependency-free Node 24 entrypoint from
  the installed plugin and forwards explicitly selected `PLUGIN_DATA`; catalog,
  report and guide operations work without storage. Storage tools fail as unavailable
  when no data directory is supplied. Relative, linked and plugin-contained data is
  rejected; the caller must also keep it outside consumer projects because this
  legacy process cannot infer the consuming thread's cwd. Native isolated discovery,
  tool calls and data-preserving cleanup are documented separately from model use,
  hosted updates and publication. No skill copy, automatic installation or telemetry
  activation is introduced.
- e36489e: Add `collection audit`, `collection plan` and `collection evolve` for explicitly selected repository/global skill collections. Return bounded structural findings and stale-state fingerprints, separate deterministic operations from semantic handoffs, and preview evolution by default. Explicit application supports missing/stale catalog regeneration only, with a minimal external preimage snapshot, restore verification before mutation, post-write checks and catalog-only rollback. Malformed catalogs and judgment-dependent package changes remain pending; no model, candidate script, automatic installation or task database is invoked.

  Incomplete inventory stops secondary scans and reports uninspected packages explicitly. Receipt persistence is reported independently from the verified collection outcome; an unavailable receipt returns a nonzero CLI exit without contradicting an already-applied change.
- c5ce59c: Require separate reference-skill discovery and current authoritative domain research across design, evolution, evaluation and synthesis, reconciled with process-owner input. Preserve sourced regulated information while reserving qualified validation for individual professional decisions. Refactoring now explicitly reevaluates names, responsibility and overlap within the current collection. Authoring routes one contributing source directly to design; synthesis continues to require two distinct sources.
- ad85c48: Extend skill optimization with evidence-based context efficiency. Design and authoring can now compare prose, tables, Mermaid, code or schemas, and on-demand references using frozen before-and-after measures while preserving semantic coverage, clarity, accessibility, and compatibility. The optimization handoff remains conditional on a material, measurable objective; Mermaid is never assumed to reduce tokens.
- ab79979: Add a Copilot CLI legacy-plugin MCP mapping through `.github/plugin/plugin.json`
  and `mcp/copilot.json`, launching the existing Node 24 TypeScript server with
  `--host copilot` and retaining the canonical skill collection. Catalog, resource,
  overview, bump-report and onboarding tools need no evidence database. Explicit
  evidence operations use only caller-supplied absolute `COPILOT_PLUGIN_DATA`;
  missing or invalid storage fails closed without a home or other-host fallback.

  Document isolated Copilot 1.0.89 native discovery and direct tool execution,
  synthetic record retry behavior and data-preserving removal of an ephemeral
  plugin mount. Legacy data is not automatically provisioned, and the operator must
  keep it outside the unknown consumer directory as well as the plugin. Other
  client versions retain the portable `mcp serve --db` fallback; this does not claim
  model behavior, persistent marketplace installation or publication.
- cca39d0: Group repository checks under `repo validate --project PATH` and pinned official Agent Skills conformance under `repo validate-official`. These replace the pre-release `validate` and `ci-official` CLI routes; the existing npm scripts continue to work. Official validation help now identifies its Python and prepared-CI requirements, while ordinary local checks remain offline.

  Register all CLI routes explicitly so command filenames match their `Command` class names without changing hook, context, catalog, telemetry, plugin or MCP invocation paths. Both the Node 24 TypeScript checkout and compiled npm artifact use the same registration map. No host installation, database migration or new runtime dependency is introduced.
- ad85c48: Add ordered SQLite schema migration plus `evolution-record`, legacy `evolution-prove`, and `evolution-events` commands to the standalone aggregate-catalog helper for durable skill rename, merge, split, create, retire, update, and relink evidence. Events retain their sync run, package revisions, affected files, before and after state, validation, snapshot reference, verified package-byte or reverse-patch proof, host-link/worktree map, and explicit `.system` exclusion; the JSON fallback remains current-state only. These record skill-change evidence, not execution tasks; Beads remains the local task source of truth.
- 9b4f28d: Add explicit local lifecycle evidence for routed, activated, completed, not-applicable, blocked and abandoned skill attempts. `telemetry record` accepts the closed schema-2 envelope, and `telemetry catalog-observe` records complete redacted catalog inventories. Transactional migration 3 preserves the existing read and telemetry history, with canonical retry handling, a shared event-ID namespace and source/session conflict checks.

  Expose `telemetry lifecycle`, `overlap`, `inactivity` and `catalog-history`, with equivalent MCP tools `skill_lifecycle_record`, `skill_catalog_observe`, `skill_lifecycle_metrics`, `skill_routing_overlap`, `skill_catalog_inactivity` and `skill_catalog_history`. Queries require explicit UTC periods of at most 366 days, use reported attempts and catalog membership for their stated denominators, and return bounded pages. Catalog change details have their own cursor. Work and response limits fail explicitly instead of returning partial metrics; queries never create or migrate storage.

  The evidence is caller-reported and opt-in: reads do not imply activation, package digests and Git provenance are assertions, and no prompts, responses, arbitrary annotations, upload or background collection are accepted. Dedicated evidence databases are rejected by the portable `skills-catalog-index` helper during both synchronization and rebuild, including `--reset-history`, preserving their history rather than replacing it with a derived catalog.

  Bound MCP input lines to 1 MiB so complete catalog observations up to 256 KiB fit the transport; lifecycle events retain their 8 KiB limit. The lifecycle guide includes source-identity rules, event examples, CLI/MCP calls, ratio denominators and storage-upgrade recovery.
- 9fb7845: Add read-only bundled catalog access through `catalog search`, `catalog read`, `catalog overview` and the shared MCP tools `skill_catalog_search`, `skill_resource_read`, and `skill_catalog_overview`. Resolve the installed package independently of cwd/global skills, validate catalog identity and freshness, return content digests without inventing Git provenance, and limit retrieval to bounded `SKILL.md` and Markdown references. Returned instructions remain untrusted content and never execute automatically.

  Replace the pre-release `mcp usage` route with `mcp serve` and the Claude `i9-skill-usage` registration with `i9-skills`; manually copied clients must update their configuration. Initialization and catalog reads no longer need plugin data or create a database. Explicit records validate input before opening usage storage, rankings use existing storage read-only, and missing history is reported as unavailable. Preserve stdio backpressure/cancellation and bound serialized responses. This prepares checkout, clean-plugin and packed-package execution without publishing an npm version or claiming native host installation.
- 2f09346: Run Codex and Claude session hooks directly from the repository-root plugin on
  Node 24, without Git, build output, node_modules or a globally installed CLI.
  Discover and deduplicate plugin, project and global skills with bounded context
  and coverage warnings. Map Claude native Read attempts and successful entrypoint
  reads to persistent host-provided data with idempotent correlation and neutral
  failure handling. Codex tool-read telemetry remains unsupported; host trust and
  native installation testing are separate from direct runtime validation. Keep
  full YAML discovery in the prepared CLI and report unsupported foreign metadata
  in the dependency-free plugin parser.
- 0a629e1: Add explicit `telemetry record`, `telemetry rankings` and `telemetry trends` commands with typed session/read-attempt/read-observation events, UUID occurrence and correlation identities, atomic retry deduplication, UTC period queries and optional bounded metadata-only logs. Preserve existing MCP observations through a checksum-verified additive SQLite migration. Queries are read-only; the CLI does not install hooks, infer activation, transmit content or track tasks. Record the verified Node 24.19.0 development runtime in `.node-version`.
- 71724cd: Prepare the unified CLI for an explicitly built local package with a deliberate
  files allowlist and repository metadata. Checkout execution keeps native
  TypeScript; packed execution uses compiled JavaScript and the same launcher.
  Add a clean Node 24 node_modules artifact test without installing dependencies or
  running lifecycle scripts. Keep the package private and publishing unconfigured.
  Install the lockfile in validation CI before running dependency-based checks,
  and verify the compiled package there without publishing it.
- 95f9741: Make the repository root a Codex, Claude Code and Copilot plugin with host manifests referencing the single canonical `.agents/skills` collection and a root marketplace entry for each host. Map the existing observed-read MCP into Claude Code through a dependency-free Node 24 entrypoint and persist its dedicated SQLite database in host-provided plugin data; missing data paths fail closed. Codex and Copilot remain skills-only until their legacy MCP data-path behavior is verified. Project hook adapters remain separate until an installed-plugin handler is independently runnable. Keep `plugin prepare` as optional disposable staging rather than tracking a copied collection. Guard Wiki synchronization against a disabled Wiki and exclude `AGENTS.md` from mirrored pages, including stale copies.
- 71724cd: Add host-specific session configuration and context output for Codex, Claude
  Code, GitHub Copilot CLI and Gemini CLI through the same TypeScript context core.
  Use hook session-config --host, hook verify --host, and hook session-index --host.
  Generation is read-only and verification compares standalone JSON; no hooks are
  enabled. POSIX checkout configurations are fixture-tested. Native host execution,
  OpenCode's plugin adapter and automatic read telemetry for hosts other than
  the separately implemented Claude Read adapter remain unimplemented.
- e2cf434: Add `plugin prepare --output` with a no-write preview and explicit `--write`
  creation of a new local staging artifact. Include every current catalog package,
  licenses, portable Agent Plugins 1.0.0 and Codex compatibility manifests, and a
  deterministic SHA-256 integrity receipt. Derive package identity/version once,
  refuse stale or unsafe source trees, occupied destinations and hidden host-style
  discovery roots on both selected and canonical paths, and
  verify generation from the actual compiled npm package.

  Preserve source selection through allowed ancestor aliases. Reject empty source
  directories and prefixed output paths beyond the shared filesystem bounds during
  preview/preflight, before an incomplete artifact can be created.

  Document the inert future marketplace example and the dated source/history and
  remote-surface readiness audit. Preparation never installs, registers, enables,
  publishes or contacts an integration; native host ingestion remains untested and
  the npm package stays private.
- 80a124c: Clarify public repository security guidance and remove visibility-dependent
  assumptions from the implementation plans. Refresh the source/history and GitHub
  exposure assessment and document the separately verified main-protection policy.
  Build the compiled CLI during explicit npm preparation so an immutable Git-source
  `npx --package=... i9-skills` invocation can run without a global CLI installation.
  Document preparation side effects and preserve dependency-free plugin hooks.
  Allow ten minutes for the complete CI pipeline, retaining all regression,
  packaging and official-validator gates after the observed five-minute timeout.
  The npm package remains protected from accidental publication; public Git hosting
  does not publish a registry release or submit a marketplace listing.
- f06c2fb: Add `repo prepare-version` and `repo verify-release` for reviewable version
  preparation. Changesets generates the version and changelog; the adapter aligns
  the npm lockfile and Codex, Claude and Copilot plugin manifests, preserves other
  metadata, restores captured files after failure, and succeeds without changes
  when no notes remain.

  Provide a manually dispatched, default-branch-only workflow that creates or
  updates a draft version PR only when the local Changesets plan contains a package
  version bump. Empty-note-only input stays untouched for a later release.
  Release-note validation accepts consumed Changesets
  only when the strict verifier confirms the generated-only diff and recomputes
  the version and complete changelog from the base commit's notes and history.
  Generation requires explicit disabled formatter auto-detection; verification
  requires complete local Git history and uses isolated temporary state without
  fetching. Normal checks and review remain
  required. The workflow does not publish packages, tags, releases or marketplace
  entries; local release preparation requires source-checkout development
  dependencies.
- e9aab6e: Prepare the private npm package as `@i-9.ai/skills`, retaining the `i9-skills` executable. Verify the packed artifact from the actual scoped node_modules path and reconcile pending release intent with that identity. Document the experimental status and a future pinned npx invocation without publishing a registry release or installing host integrations.
- 87a250d: Add a local aggregate skill index that combines explicit `skills-catalog.json` manifests for cross-source lookup while preserving each repository manifest as canonical. The zero-dependency helper writes `skills-catalog.db` with Node.js built-in SQLite, retains sync runs, source observations, and normalized added, changed, and removed skill history with timestamps and retention limits, and provides `history` and `changes` commands. Rebuild reset protection remains explicit. Its deterministic `skills-catalog.index.json` fallback is current-state only. The helper rejects unsafe inputs and never changes source collections. This first public catalog and aggregate-index contract uses format version `1`, contains no manual lifecycle-status field or unpublished draft compatibility, and replaces the generic `catalog.json` manifest name across validation, session indexing, documentation, and authoring guidance without retaining an alias.
- 6835bce: Add read-only `skills observe` export from existing verified schema-2 snapshots,
  `skills report bump` and the matching `skill_bump_report` MCP tool. Reports compare
  explicitly pinned skill or collection inventories, reviewed contracts, source
  assertions and exact-content validation receipts. They recommend patch, minor or
  major only with sufficient complete evidence; missing, contradictory or hash-only
  compatibility evidence returns `undetermined`. Inputs and displayed pages are
  bounded, errors are redacted, and no versions, releases or evidence databases are
  changed. Source assertions and submitted validation remain unauthenticated and
  are never presented as remote Git verification or reexecuted checks.

  Add versioned `skills onboarding` and `skill_onboarding` MCP data with complete
  synthetic examples and a relocatable inspect, snapshot, audit, plan, evolve,
  verify and bump-report walkthrough. Reading the guide executes nothing. Explicit
  evolution remains catalog-only; official validation needs a prepared environment,
  behavioral evidence remains caller-supplied, and installation or publication
  requires its own authorization. The existing snapshot package is unchanged.
- 2235dc1: Add `skills memory summarize` and `skills memory retention` for an explicitly
  selected existing evidence database, collection, optional skill and bounded UTC
  window. Summaries preserve source identities, lifecycle counts and denominators,
  catalog coverage and weaker name/revision read receipts. Retention inspects an
  optional caller cutoff and counts mirrored occurrences only once.

  Both commands use a read-only snapshot with work, display and output limits. They
  do not create or migrate storage, record new signals, infer missing validation or
  approval receipts, persist policy, or delete history. Outside-window history and
  retention dependencies remain explicitly unassessed.
- cd68b5b: Add explicit `skill_read_record` and bounded `skill_read_rankings` tools to the local `mcp serve` interface, with idempotent native SQLite read evidence, checked migrations, and distinct-session period counts. Usage operations require a dedicated caller-owned database; read-only bundled catalog operations do not. The MCP installs no hooks and does not infer activation or publish an npm package.
- 71724cd: Expose catalog inspect, check and sync in the unified CLI with explicit
  collection/layout selection and a no-write sync preview. Add aggregate
  inspect/check/sync/rebuild commands over the existing bounded package helper.
  SQLite sync preserves history; rebuilding existing history still requires the
  explicit reset flag. No command selects or changes a global home collection
  implicitly. The detached catalog helper also supports inspect, help and preview.
- ad85c48: Unify repository tooling behind an oclif CLI with a thin bin launcher and Node 24
  TypeScript command, configuration, service, repository, validator, migration and transport layers.
  Centralize validated project selection and named local paths in ProjectConfiguration,
  keeping global discovery inputs separate.
  Add pinned Prettier formatting through `format` and `format:check`; the standard
  check verifies CLI source and its tests without rewriting distributed packages.
  Add dynamic project/global skill discovery through `context available-skills`,
  with canonical deduplication, source labels and disclosed coverage limits.

  Expose the session adapter through `hook session-index`, Codex configuration
  rendering/comparison through `hook session-config --host codex` and `hook verify --host codex`,
  and explicit read metrics through `mcp serve --db PATH`. Keep collection validation behavior, and remove the superseded standalone
  executables and transitional command aliases. Organize tests by unit layer
  and separate CLI/collection integration contracts. Automatic read collection is
  limited to the separately implemented optional Claude Read adapter; npm/plugin
  publication and consumer installation remain outside this local delivery.
- d46ffa7: Add first-invocation skill context adapters for Antigravity and Hermes using their documented, distinct contracts. Add `hook telemetry-config` and `hook observe --host claude` for explicit caller-selected usage storage: native Read attempts and successful SKILL.md reads have stable occurrence/correlation IDs, first-receipt retry deduplication and metadata-only persistence. Bash, implicit loading and reference files remain outside measurement coverage. Configuration generation installs nothing; native host execution and version-specific OpenCode plugins remain unverified.

### Patch Changes

- 7117aba: Update the architecture diagrams for the shared CLI and MCP, explicit lifecycle and catalog evidence, stateless skill-change reports, installed onboarding and separate version preparation. Document which calls are read-only, which explicit records may create or migrate storage, and which recommendations still require a maintainer decision. No runtime behavior or publication authority changes.
- 3bdd9c9: Correct collection and standalone authoring validation for standard named and numeric references in Markdown links, whitespace-obfuscated HTML URLs, nonportable filenames, malformed SVG namespaces and character references, extra Apache license clauses, non-global provenance IP literals, and impossible visual-guide review dates. Unknown named references remain literal and still require valid targets. Numeric HTML references apply C1 replacements and replace invalid Unicode scalar values; console device filenames `CONIN$` and `CONOUT$` are rejected case-insensitively. Automatic Apache recognition accepts canonical terms alone or with the stock appendix/application template; customized copyright notices remain unsupported and require explicit license/provenance review, without treating them as legally invalid or removing attribution to pass. A terminal DNS dot no longer creates a distinct source or synthesis contributor. Detect duplicate rendered icon samples despite changes to PNG compression, filters or non-color metadata, and stop global linked-package discovery at its package limit. Color-managed PNGs, including PNG 3 color and HDR mastering chunks, are explicitly unsupported: rerender or color-convert before exporting untagged pixels and updating the render receipt. These are structural checks, not legal clearance, network verification or perceptual artwork review.

  Make the observed-read MCP reject duplicate JSON keys, invalid UTF-8 and excessive JSON depth before recording evidence. Serialize responses so a stalled stdout peer pauses further requests, destroy a pending writable on input cancellation, and close storage on transport failure while handling late write errors and removing listeners. The default POSIX stdout pipe belongs to the server lifetime so cancellation can end a pending OS write; orderly EOF finishes responses before closing it. Windows retains Node's synchronous pipe semantics without a bounded cancellation guarantee. Both CLI and root-plugin entrypoints use the same bounded parser and transport without adding runtime dependencies.
- 158f3bb: ## Experimental distribution baseline

  Introduce I-9 Skills, a collection of 24 focused, agent-agnostic packages for building and improving reusable agent skills. Each package owns one responsibility, one primary output, a scoped Apache-2.0 license, and an explicit handoff boundary. The package remains private and experimental; local checks do not establish native host compatibility or production quality.

  ### What the collection provides

  - **Creation and quality:** discovery, authoritative domain research, synthesis, design, naming, authoring, evidence collection, independent evaluation, security review, and lifecycle decisions.
  - **Collection operations:** catalog synchronization, routing, installation, publication, migration, audits, refactoring plans, evidence-backed evolution, and measured optimization.
  - **Portable maturity decisions:** a lifecycle policy that uses each project's existing evidence and approval system, or returns a portable approval record when none exists.
  - **Complete package interfaces:** portable `SKILL.md` contracts, local references and templates, optional host metadata, plus distinct SVG and PNG interface assets.
  - **Public-readiness controls:** secret and personal-data hygiene, source provenance locks, full line-wrapped open-source and substantive proprietary license checks, deterministic catalog checks, and safe handling of external instructions and scripts.
  - **Cross-host use:** the portable package contract is the baseline; Codex receives optional UI metadata while other hosts can use the same Markdown and local resources.

  ### Commands and automation

  - `npm run check` validates the repository contract and its behavioral suite.
  - `npm run ci:official` runs the official Agent Skills validation profile.
  - `node bin/index.mjs catalog check --collection . --layout repository` detects catalog drift.
  - `node bin/index.mjs catalog sync --collection . --layout repository` regenerates only the schema-version-`1` `skills-catalog.json`; lifecycle evidence is recorded separately. Add `--dry-run` to preview.
  - Future installation selects an immutable reviewed revision and an explicitly authorized consumer scope. No installation or registry release follows from this baseline.

  ### Release-management foundation

  Adopt Changesets as the single pending release-note source. Version preparation renders approved notes into `CHANGELOG.md`; GitHub Actions validates pending entries without creating tags, releases, or publications.
- e445064: Make `skill-installation` self-contained with a bundled Node fallback that installs reviewed local Git package bytes at an immutable revision, invokes the caller's approved official validator, and returns a digest-bound receipt. Explicit replacement retains prior bytes outside discovery, while `verify` and `rollback` reject changed destinations. Include complete source-retrieval, command, recovery, and safety examples; the helper does not fetch sources, run setup, create host aliases, or install dependencies.
- 2604f0c: Rename the unpublished npm package to `@i-9.ai/skills`, retaining the `i9-skills`
  executable and the `i-9-ai/skills` GitHub repository. Align installed-package
  identity checks, packed tests, the lockfile and pending Changesets with that name.
  Simplify installation examples to use `npx skills` and the direct GitHub toolkit
  specifier without SHA placeholders or `--package`. Add Codex plugin installation
  through the repository marketplace and a local checkout, including verification,
  desktop discovery, updates and removal. Keep npm registry publication clearly
  identified as pending until the scoped package is actually available.
- ad85c48: Clarify the Codex session hook status as "Loading available skills overview" to describe its read-only dynamic metadata overview.
- 3a7a5c9: Preserve essential skill workflows and complete examples without an arbitrary
  500-line entrypoint rejection; metadata and bounded file-read checks remain.

  Reject special-file snapshot manifests, receipts and objects without blocking.
  Bound manifests/receipts to 8 MiB and individual files/objects to 64 MiB, retain
  concurrent content deduplication, and run snapshot restoration/corruption tests
  in the required npm check. Reconfirm Codex SessionStart and canonical instruction
  aliases against current official contracts; native host execution remains untested.

  Record the responsibility and overlap review for the meta-skill collection. Distinguish
  evidence collection from evaluation with a source-attributed stacked-document
  icon and matching PNG.
- e445064: Complete authoring validation for multiline Markdown links and embedded HTML resources, including poster and srcset URLs, with bounded link-location lookup. Reject single-label private source hosts, equivalent percent-encoded source duplicates, adapted sources without immutable revisions, unknown license declarations and truncated Apache terms.

  Host alias verification now rejects ambiguous JSON and unknown contract fields and reports links with unexpected external targets without aborting inspection. Lifecycle review has a qualitative pilot-to-stable default when no numeric threshold exists; migration requires a verifiable retained-history strategy rather than revision labels alone.

  Wiki synchronization preserves balanced link destinations, reference definitions and code examples. Visual-guide publication verifies the reviewed JSON/HTML hash pair before copying or publishing; regeneration and content review remain manual. Bundled icon receipts identify the exact Material sources and local adaptations. Composite icon guidance permits a subordinate provider mark when its rights and small-size readability are verified; it does not permit unauthorized or misleading marks.
- 99a74fd: Resolve aggregate-catalog output ancestors before creation so a symlink cannot redirect a derived index into its source collection; rejected in-source outputs no longer create directories. Snapshot pruning now rejects linked or non-directory trash and checks its identity before moving retained manifests, preserving their access to shared snapshot objects.
- f9ef3cb: Store new skills-snapshot captures as complete manifests backed by shared SHA-256 objects, reusing unchanged file and symlink-text bytes instead of repeating full copies. Preserve verification and restoration of existing schema-1 backups.

  Add explicit `--capture-link-target` preimage selection and `restore-preimage` for separately authorized recovery of linked files or packages, with permission checks and retained rollback. Ordinary restore changes link text only. Restored files are independent of shared objects; retention keeps objects and verifiable trashed manifests, without automatic garbage collection, encryption, or implicit target restoration.
- ad85c48: Add `skill-domain-research`, which produces a bounded evidence dossier by reconciling process-owner facts, reviewed skill claims, and current authoritative web sources. Legal, accounting, tax, regulatory, and other consequential research records jurisdiction, source/revision and consultation dates, conflicts, unknowns, and exact human specialist-confirmation gates; it distinguishes research findings from a qualified human's case-specific determination or advice.

  Make domain research mandatory in the authoring pipeline even when discovery finds candidate skills. Version 2 authoring manifests contain seven stages (`intake`, `discovery`, `domain-research`, `synthesis`, `design`, `authoring`, `evaluation`). Synthesis requires at least two distinct contributing packages; fewer contributors require a reasoned skip and direct design while retaining the required research dossier. Historical version 1 manifests are rejected as current readiness evidence.
- 960ccf4: Document the existing federated collection contract and add a reproducible two-owner synthetic consumer pilot. The fixture exercises source-qualified catalog discovery, package identity and same-name collision checks, a bounded artifact handoff, optional-companion fallback, and blocked or none results for missing capability, changed evidence or expanded authority. Run it with `node --test tests/integration/collection/federated-consumer.test.mjs`. This is deterministic integration evidence; it does not add an automatic router or installer, establish model or native-host behavior, or install a real consumer.
- d1134d8: Normalize blank-line indentation in newly generated release entries so multiline Changesets pass Git whitespace checks. Release verification reproduces the same canonical changelog; normalization preserves existing history and generated nonblank Markdown and code indentation.
- ad85c48: Make `skills-catalog` standalone and add an explicit global layout for `<root>/skills`. Global synchronization supports confined canonical-package links, nested real packages, fixed root output, atomic replacement, and byte-idempotent verification while excluding `.system`. Establish the first public catalog schema as version `1`, containing package identity and routing metadata without a manual lifecycle-status field or compatibility for unpublished drafts.
- 8cda142: Document a pinned MCP Inspector 2.8.0 CLI route for the Node 24 checkout:
  `tools/list`, `skill_catalog_search` and `skill_resource_read`, including literal
  JSON arguments, server/Inspector argument ordering, expected output, diagnostics
  and cleanup. Catalog inspection requires no evidence database; optional storage
  and a future published npm package remain separate routes. The guide records
  reviewed official source text and explicitly makes no Inspector execution claim.
- d15c461: Document isolated native Codex and Claude plugin installation, 24-skill discovery,
  SessionStart delivery, Claude MCP initialization, source-pin update/rollback and
  data-preserving uninstall. Include repeatable host commands and observed offline
  dependency warnings; distinguish the stubbed Codex turn from real-model behavior
  and local source replacement from hosted updates.
- be2d6c1: Complete `context available-skills` and session-hook overviews with current routing-entrypoint candidates, metadata-only availability, explicit unassessed route selection, and the meanings of later routing choices. Include bounded SKILL.md locators for on-demand inspection, preserve distinct same-name package identities in deterministic order, and retain omission and coverage notices. Session initialization does not establish package readiness, lifecycle status or activation, choose a route, inject package bodies, or modify skills. Bundled catalog overviews share the same guidance.
- 79323e6: Add an explicit portable runtime and setup contract for authored skills. Repository-owned helpers and packaged Node.js utilities require Node.js 24 or newer; small helpers may stay dependency-free JavaScript, while TypeScript or another runtime requires a documented benefit and runnable distribution path. Packages that need preparation can declare a bounded `metadata.setup` script with prerequisites, idempotence, side effects, and a fallback; setup remains opt-in and never runs during installation or activation.
- ae9e4b0: Refresh public-distribution guidance with dated source/history and GitHub exposure
  evidence, the native plugin rehearsal, and concrete owner actions for repository
  marketplaces, npm and public directories. Correct Wiki authentication guidance,
  record unresolved Wiki/Pages and main-protection status, and distinguish local
  stdio MCP support from a public remote-MCP submission.
- 37bb75a: Prepare public npm distribution by removing the private-package guard and
  declaring public registry access with the `latest` tag. Keep the single
  `i9-skills` executable, compiled runtime and bundled meta-skills. Version
  preparation and package upload remain explicit operations; source merges and
  session hooks never publish a package automatically.
  Document direct `npx @i-9.ai/skills` CLI/MCP examples for published builds and
  retain Git-source examples for unreleased development. Align the entry-path
  diagrams with compiled registry builds versus source preparation.
- 0a0ad26: Reconcile historical pull-request findings across the portable package helpers and collection CLI. Installation now isolates Git source verification from inherited repository/configuration overrides and rejects additional credential markers. Catalog discovery handles nested resource examples, unquoted YAML scalars and metadata indentation without requiring an English sentence in caller instructions; installed symlink entrypoints execute their alias and maintenance checks correctly.

  Bound repository catalog enumeration before sorting and count unique Git directory prefixes before installation staging. Maintenance proposals require a full commit identity or content digest instead of accepting arbitrary branch or release labels; release targets must first be resolved to their immutable identity. Rollback link/worktree mappings must match exactly the participating package names.

  Harden snapshot capture, verification and retention with shared entry/depth bounds, lossless UTF-8 link checks, duplicate-field rejection, complete-snapshot selection and safe legacy restoration. Restore reports comparable source/target content hashes separately from the whole snapshot identity. Aggregate evolution events reject duplicate affected file paths. Discovery discloses depth omissions and preserves Unicode when compacting descriptions.

  Collection validation checks decoded PNG limits, SVG namespace consistency, embedded UTF-16 hygiene and public source identities. Pair each maintained PNG with its SVG hash and recorded rendering; record exact Material icon sources and a pinned, licensed visual-guide font. Visual publication rejects HTML without a review receipt, and authoring link checks honor HTML base URLs and supported named entities. Official CI additionally validates a newly generated scaffold. These are bounded structural and regression checks, not proof of agent behavior or authorization to publish or install.
- 906f5bb: Document a fresh, independently inspected research chronology case that records depth and limits before source retrieval. Preserve the earlier failed process-fidelity run, distinguish observed event order from hash or timestamp claims, and retain the new case's incomplete research outcome. This is bounded evaluation evidence, not a new skill, runtime feature or general readiness claim.
- a6039da: Document the current seven-stage research pipeline pilot with frozen synthetic tasks, an independently graded task-only baseline and exact official-validator evidence. Both arms met the visible task cases, but pipeline readiness remains failed because research depth was recorded after retrieval; retain that chronology failure and its follow-up rather than treating structural checks as a readiness pass.
- ed14dc8: Fix Markdown link and quoted-fence validation, PNG chunk names, maintenance proposal intervals and targets, and bounded aggregate catalog queries. Validate required skill assets before plugin staging and require an explicit repository root with `repo validate --project PATH`. Update the pipeline and tooling diagrams, and simplify Wiki synchronization to use the workflow token while retaining source-link rewriting.
  Rename public Markdown documentation pages to title-cased filenames, with `Home.md` as the single index and Wiki entrypoint; update their inbound links.
- e445064: Reject duplicate JSON fields in aggregate catalog inputs and official-validator configuration, bound global catalog directory reads, and require distinct packages in evolution merge records. Accept source catalog paths containing `=` while refusing snapshot selections with parent or empty path components.

  Maintenance proposals now detect high-confidence credentials in text values and can return a blocked decision when the target is still unresolved. Claude session telemetry counts startup and clear separately. Repository validation skips local Beads and Codex operational state.
- fb9a555: Make design, authoring, evolution, optimization, and evaluation require complete ordinary task routes without relying on external lookup or assumed domain knowledge. Keep immediately usable normal examples in entrypoints, route independently needed topics through conditional bundled references, and choose file layout from co-usage and navigation cost. Preserve useful source procedures and examples when adapting templates; advisory context budgets never justify loss of required coverage. Distinguish actual recorded benchmarks from planned cases, scaffolds, and structural validation.
- e445064: Extract multi-collection lookup, SQLite synchronization history and the evidence-backed evolution ledger into the standalone `skills-catalog-index` package. `skills-catalog` now maintains only one collection's canonical inventory and hands off aggregate work explicitly.

  The existing `catalog aggregate` CLI routes and index formats remain unchanged. The new package includes its own read-only catalog decoder, runnable source examples and storage/recovery guidance, and works without an installed sibling. JSON remains a current-lookup fallback without SQLite history. Complete the collection's instruction index with the aggregate, host-compatibility and snapshot package boundaries.
- 1bee08f: Add an optional project-local Codex session index generated dynamically from current project and global skill entrypoints, with canonical-path deduplication and disclosed omissions. It provides the same bounded, read-only metadata map through a trusted SessionStart hook or `context available-skills`; it does not load whole package bodies, select a route, install packages, or modify the repository.
- f4d3e4b: Add `skills-host-compatibility` to verify declared repository-local aliases for one canonical skill collection. Its self-contained Node.js 24+ helper, `node scripts/verify_aliases.mjs <contract.json>`, reports missing, broken, wrong-target, copied, and undeclared aliases from an explicit bounded contract, including absent host directories and dangling links. Manual inspection remains available without Node.js. It reports structural alias defects and limits without inspecting global installations, changing repository links, or claiming provider runtime behavior.
- ad85c48: Add `skills-maintenance-scheduling` to turn an approved recurring maintenance goal for an explicit skill collection revision into a reviewable schedule proposal. The package covers existing and absent project schedulers, explicit configuration handoffs, maintenance routing, evidence ownership, stop conditions, and rollback. Its optional `node scripts/validate_proposal.mjs <proposal.json>` helper rejects unbounded targets, credential-bearing fields, automatic approval, cadence-derived authority, and unsupported configuration claims. It does not configure a scheduler, run maintenance, modify skills, install packages, merge, publish, or approve work.
- b16cff8: Add `skills-snapshot` for deterministic local collection or package snapshots, verification, explicit restore, and reversible retention cleanup. Routing now reports setup readiness without running setup, and installation records that declared setup remains explicitly pending.
- 81c35a6: Require native string event/source discriminators so malformed hook payloads cannot become successful-read evidence. Reject ambiguous uncreated non-ASCII diagnostic/data filenames and compare existing parent identities to prevent platform-specific Unicode aliases from bypassing log ownership checks.
- e103692: Align authoring run validation with the direct-to-design route for a single reviewed skill. Synthesis requires at least two distinct contributing packages; runs with fewer contributors must record a reasoned skip while retaining the mandatory domain research dossier.
- c491260: Reject diagnostic log and rotation paths that overlap the usage database, SQLite sidecars or event input. Canonical alias checks run before any writer opens, preventing configured log rotation from replacing selected data.
- 629435b: Make mirrored documentation links open rendered GitHub Wiki pages instead of raw
  Markdown. Preserve page-title spaces, fragments, references and code examples;
  keep copied assets and source-repository links at their existing destinations.
  Use canonical rendered Wiki links in the documentation source as well, without
  Markdown extensions or encoded spaces in page names.

  Refresh the Mermaid and interactive entry-path diagrams for native skill
  discovery, immutable Git-source CLI calls, bundled catalog MCP and local
  root-plugin hooks. Preserve the pinned font and reviewed source/artifact hashes.
  The diagrams distinguish metadata context and retrieval from activation/evidence
  recording; the registry CLI remains unpublished and hooks perform no download.

Released notable changes are recorded here. Original content is licensed under Apache-2.0; releases are separate from pull request delivery.

Pending release notes are recorded in `.changeset/` and become changelog entries only during an authorized version-preparation task. See [release management](docs/Release%20Management.md).
