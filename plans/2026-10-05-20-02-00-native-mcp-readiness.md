# Observe bounded native MCP readiness

Related issue: [#90](https://github.com/i-9-ai/skills/issues/90).

## Objective

Allow a selected native MCP server to finish startup before observing its tools
and resources. A retained Codex trial returned `starting` on its first status
query at restored A, which the observer correctly refused as a connected server.
The new behavior waits for evidence of readiness rather than accepting that
intermediate state.

## Scope and boundaries

Change only the selected Codex observer's readiness orchestration and relevant
synthetic regressions. Reconcile the private executable proposal with the public
observation service by responsibility; do not copy a differently named private
class into the repository. Retain every issued request and response. A successful
result still requires a complete paginated inventory, exactly one selected
server, valid identity and metadata, and an observed `connected` status.

Bound all additional observations within the existing RPC request limit,
native lifetime, selected-child deadline and outer phase. Reject terminal,
unknown, inconsistent or stale evidence; `starting` alone never passes. Do not
extend a timeout, bypass failure, add a provider operation or change public
schema 2, resource bounds, account paths, installation authority or Claude's
unsupported absence gate. Old failed captures remain immutable.

## Sequence and validation

1. Reconcile the retained failure with raw status and process evidence.
2. Inspect the pinned native protocol and define bounded readiness transitions.
3. Test immediate readiness, delayed readiness, permanent startup, terminal and
   malformed responses, pagination, selected identity and deadline exhaustion.
4. Run focused source and compiled checks, strict types, formatting, repository
   and clean-package tests, Changesets status and whitespace verification.
5. Independently review the complete private executable closure and the exact
   public commit before fresh native trials. Record actual repeated outcomes,
   retained-evidence review and precise remaining limitations separately.

## Acceptance and rollback

Synthetic delayed startup must advance only after confirmed connection.
Unsupported or exhausted observations remain blocked. Source checks do not
establish native lifecycle completion. Report actual trials in #90 and Beads
without rewriting an older failed result or claiming a hosted upgrade.

Rollback restores the preceding readiness method and removes its new tests.
No persisted-state migration, dependency or publication is introduced, and
retained captures remain available for diagnosis.
