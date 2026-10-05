# Bind native loaded-inventory envelopes to the pilot consumer

Related issue: [#90](https://github.com/i-9-ai/skills/issues/90).

## Objective

Allow the pilot Driver to verify the inventory evidence produced by the bundled
Codex and Claude observers without discarding its provenance or weakening native
acceptance. Actual observations exposed a producer/consumer mismatch: the
observer retains an inventory envelope, while the Driver compares the entire
envelope with a bare inventory.

## Scope and boundaries

Add one `NativePilotLoadedInventoryValidator`, delegate the loaded-evidence
decision from the Driver, and exercise both actual producer formats through that
consumer. Preserve the existing closed bare-inventory representation for its
explicit synthetic/adapter contract. Reject unknown fields, stale hashes,
unpermitted transformations and inconsistent source or independent-worker
records. Codex's executable-bit qualifier remains an adapter assertion. Claude's
scope remains selected manifest and registration; it does not establish a full
native-cache inventory or global absence.

Keep file-byte totals, source pins, gates, native acceptance, preservation,
offline confinement, the 60-second outer phase and 40-second native lifetime
unchanged. No new dependency, diagnostic public entrypoint, migration, automatic
installation, provider call, publication or release is introduced. Failed
observations remain failed and immutable.

## Sequence and evidence

1. Inspect the complete producer envelopes, source-snapshot types and consumers.
2. Define closed validation with exact source inventories and declared alias
   omissions; preserve independent evidence rather than reconstructing a receipt
   and claiming it was observed.
3. Add disposable actual-producer-to-Driver cases for both hosts, source A/B and
   restored A, plus rehashed malformed/provenance negatives and bare controls.
4. Run focused tests, strict types, source-free compiled tests, full repository
   checks, package checks, Changesets status and whitespace verification.
5. Obtain independent review of the exact integrated commit and complete private
   executable closure before fresh bounded native trials. Keep private captures,
   inspected-file hashes, failed results and exact owned cleanup evidence outside
   the public package.

## Acceptance and rollback

Matching closed producer records advance the synthetic Driver; mismatched or
unsupported records block. A passing suite establishes this contract correction,
not native lifecycle completion. The actual Codex/Claude evidence and remaining
unsupported limits must be reported separately in #90 and its task record.

Rollback restores the preceding Driver and removes the new validator and tests;
no persisted evidence or database migration is changed. Old captures and source
review receipts are preserved, with any superseded approval explicitly marked.
