# Bound complete native loaded-inventory reads

Related issue: [#90](https://github.com/i-9-ai/skills/issues/90).

## Objective and evidence

Read the complete inventory envelope produced by the existing native observer
without confusing it with small request or review metadata. A retained Claude
diagnostic produced a 1,197,393-byte envelope containing six matching source
inventories. The driver selected the generic 1 MiB JSON reader and rejected the
file before the closed loaded-inventory validator. This explains the captured
failure; it does not turn that failed run into a pass.

## Scope and boundaries

- Add a purpose-specific loaded-inventory JSON reader with a fixed 32 MiB cap,
  matching the existing ordinary evidence-file cap. Keep generic JSON metadata
  reads at 1 MiB. Callers cannot supply a larger limit.
- Read bounded ordinary files through a no-follow descriptor, reject hardlinks
  and detected changes, and reconcile the bytes with the verified digest before
  parsing. Preserve the complete closed-envelope validator and source, count,
  manifest, alias and inventory-identity checks.
- Route only the driver's retained loaded-inventory read through the new method.
  Keep command output, observation deadlines, native lifetime and total evidence
  bounds unchanged. No dependencies or distributed skill changes are needed.
- Keep the public unsupported Claude absence gate and private diagnostic status
  unchanged. Do not modify immutable prototypes, previous captures or results.

## Implementation and verification

1. Add the named fixed bound and the repository reader; wire the driver to it.
2. Add synthetic tests for a complete six-inventory producer envelope larger than
   1 MiB through the driver, rejection beyond the dedicated cap, generic-reader
   rejection above 1 MiB, and malformed or changed loaded evidence. Tests must
   use disposable data and never read an installed skill or launch a native host.
3. Run the affected unit tests, type and formatting checks, `npm run check`,
   packaging verification, `npm run changeset:status` and `git diff --check`.
4. Obtain independent review on the exact commit and retain the failed native
   evidence separately. A new private composition and native run require fresh
   complete source pins, compiled-byte review and isolated request review.

## Authority, acceptance and rollback

Repository edits, isolated synthetic checks and retained-byte inspection are in
scope. This plan grants no real-profile installation, provider use, release,
marketplace update, migration relaxation or broader cleanup authority. The
existing disposable native pilot authorization remains limited to newly reviewed
fixed inputs and owned isolated resources.

Accept only if a truthful large envelope reaches the existing closed validator,
unknown or contradictory envelopes remain rejected, and the generic limit is
unchanged. Report synthetic verification separately from new native observations.
Revert this focused commit to remove the reader and restore its former call;
preserve all retained evidence and failed-run records during rollback.
