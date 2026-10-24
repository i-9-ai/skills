# Functional local skill-change panel pilot

Related: issue106 and draft PR107. This extends the existing panel proposal and
the shared MCP implementation; it does not introduce a second server product.

## Outcome and scope

Deliver one testable vertical workflow using a real, explicitly selected skill:
live catalog and entrypoint inspection, a supplied evolution candidate, an exact
before/after diff, local structural validation, explicit approval, guarded
application and guarded recovery. Use a private copy of a repository skill for
the operator pilot; canonical and globally installed packages remain unchanged
unless separately selected and approved in the workflow.

The first candidate changes only `SKILL.md`, preserves the package name and
leaves all other package files intact. The candidate is supplied by the operator
or authoring agent; this backend does not call a model or pretend to generate
changes. Conformance, semantic quality and behavioral evaluation remain distinct.
Local helper validation must be labeled accurately and cannot substitute for an
official validator result or certify readiness for publication.

## Design and authority

- Extend `SkillMcpService`/`SkillMcpTransport`; share the existing discovery,
  portable metadata, safe filesystem and package-fingerprint contracts.
- Expose the UI and mutation workflow only when both collection and external
  proposal-state directories are selected explicitly. Normal MCP operation,
  initialization and panel inspection create no state or telemetry.
- Accept bounded closed inputs. Restrict packages to direct ordinary children
  of the selected collection; reject symlinks, hardlinks, traversal, renamed
  identities, stale source bytes and modified proposal artifacts.
- Store immutable before/candidate bytes and a bound receipt outside the
  collection before application. Present the exact diff, limits and performed
  validation before approval. An approval binds the proposal ID, original
  package fingerprint and candidate hash; reset or edits invalidate UI consent.
- Application and recovery are app-only advertised tools. They require explicit
  approval assertions and unchanged exact bytes. These assertions do not
  authenticate a human against an arbitrary MCP client; the trusted host and
  operator remain the authority boundary. No autonomous application by a model.
- Recheck the selected package and proposal immediately before a single guarded
  entrypoint replacement. Retain recovery evidence on partial failure and never
  overwrite intervening edits during recovery. Require a stable owned workspace;
  do not claim hostile concurrent mutation is race-proof.
- Keep the existing local lab identity for testing the shared implementation.
  Do not restart Codex, interrupt other tasks, add product network listeners, provider
  credentials, hooks, account connectors or broader filesystem selections.

## Implementation sequence

1. Add focused configuration, validation, filesystem and workflow components in
   the existing singular N-layer directories; add optional MCP/CLI selection.
2. Adapt the reviewed visual design into a packaged MCP Apps resource with real
   data, editable candidate input, diff/checks and explicit apply/recover actions.
   Keep unsupported/standalone bridge state honest and bounded.
3. Add disposable unit, protocol and installed-package tests for the complete
   flow and refusals. Do not touch the real home or installed skills in tests.
   A temporary loopback-only development host may relay the existing stdio
   protocol for browser verification of a private copy. It is test scaffolding,
   requires a same-origin request token and is never shipped or native evidence.
4. Prepare a private real-skill copy and point the existing lab at the shared
   server. Continue independent tests if refreshing the host needs the operator;
   do not imply that installation reloads an already active process.
5. Update the operator documentation, affected diagrams, release intent and
   English/PT-BR/Spanish website availability wording without advertising an
   unpublished pilot as a generally available skill editor.
6. Run `npm ci`, affected tests, `npm run check`, Changeset and tarball checks.
   Obtain independent exact-commit review, fix findings and update the same PR.

## Observable acceptance and retained evidence

The selected skill is read from disk with its actual content/fingerprint. A real
candidate yields the exact diff and measured local validation. A missing approval,
stale package, invalid candidate or tampered receipt cannot write the entrypoint.
Approved application changes only the intended bytes; recovery restores the
preserved preimage and refuses intervening edits. Retrying an already completed
operation must not replay a destructive write. Tests retain identities, outcomes
and meaningful limits; the operator pilot records actual rather than simulated
host observations. Native UI, protocol simulation and repository tests are
reported separately.

## Rollback and remaining gates

Remove the optional UI and panel configuration/tool descriptors to disable the
pilot while retaining caller proposal/recovery data. Existing catalog and
telemetry operations continue unchanged. No automatic cleanup deletes recovery
state. Package publication, public plugin submission, production deployment,
security changes and expansion of access remain outside this authorization.

The root, source, command, tests and website contracts retain their existing
ownership. Update their child indexes only for the new durable workflow boundary.
