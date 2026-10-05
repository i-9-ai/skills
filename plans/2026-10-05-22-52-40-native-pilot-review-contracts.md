# Reconcile native pilot contracts after independent review

Related issue: [#90](https://github.com/i-9-ai/skills/issues/90).

## Objective

Correct the three pertinent findings on the bounded native pilot pull request.
Reject unsupported architectures before preparation, preserve equivalent measured
network isolation outcomes, and make retained-evidence limits coherent from the
controller through the projector and driver.

## Scope and boundaries

- The current native observers support Linux ARM64. Contracts selecting AMD64
  must fail before creating a pilot output or starting a container. This change
  does not add or claim AMD64 support.
- Both `ENETUNREACH` and `EHOSTUNREACH` establish the existing unreachable-network
  condition only when the measured interfaces and routes also prove isolation.
  Other errors or successful external connections remain rejected.
- Reconcile retention-specific file and aggregate limits with the bounded export
  producer. Keep generic metadata JSON limits and complete receipt validation.
  The implementation must account for raw exports plus derived evidence without
  introducing caller-controlled bounds or an unbounded read.
- Ordinary exported files retain the existing 32 MiB class, now enforced by
  worker admission and growth checks and by controller size/base64 checks before
  decoding. Combined decoded exports remain 64 MiB; encoded exports remain
  96 MiB. A phase has at most 128 receipts and a 352 MiB ceiling: one encoded
  export, three possible copies of decoded data, one 32 MiB loaded inventory and
  a shared 32 MiB control reserve. Retention above 96 MiB and ordinary evidence
  above 224 MiB share that reserve rather than receiving independent allowances.
- Preserve the public unsupported Claude gate, private diagnostic qualifications,
  immutable captures and frozen private compositions. No release, installed
  profile change, provider access, publication or broader cleanup is authorized.

## Implementation and validation

1. Restrict the contract platform predicate to the implemented architecture.
   Exercise rejection of a fully consistent but unsupported AMD64 selection.
2. Use the accepted unreachable-network result set in the preflight projection.
   Test both accepted errors and unrelated results through the real projector.
3. Trace producer, controller, projector and driver retention bounds. Add tests
   for valid larger exports and for per-file and aggregate overflow, preserving
   rejection of tampered receipts and unchanged generic JSON limits.
4. Run affected synthetic suites, types, formatting, the complete repository
   check, packaging checks, Changeset status and whitespace validation.
5. Obtain independent review of the exact resulting commit and reconcile remote
   review findings before merge. Native evidence remains a separate assurance.

## Acceptance and rollback

Accept when unsupported contracts cannot start preparation, isolation outcomes
remain consistent, bounded producer exports reach receipt verification, and all
rejection tests pass. Revert the focused correction to restore the earlier
contract. Preserve retained evidence and failed attempts during rollback.
