# Portable native pilot template layout

Related issue: [#90](https://github.com/i-9-ai/skills/issues/90).
Review: [PR97 template compatibility](https://github.com/i-9-ai/skills/pull/97#discussion_r4190001605).

## Objective and scope

Make the bundled native pilot template an inspectable draft in both the source
checkout and compiled npm artifact. Leave `runtime_layout` unresolved until the
caller explicitly selects the layout of the running CLI and reviewed inputs.
Retain exact layout validation for resolved contracts; do not infer authority or
convert source entrypoints into compiled entrypoints automatically.

## Implementation and validation

1. Reproduce the incompatible distributed asset with the existing npm tarball
   packaging test, which runs without source or development dependencies.
2. Set the bundled and fixture templates' layout to null. Report it as a missing
   execution gate and reject any resolved layout different from the running CLI.
3. Test inspection of the unchanged installed draft, explicit completion of all
   null fields with synthetic compiled selections, and mismatched-layout refusal.
   Cover the corresponding source draft and resolved contracts in unit tests.
4. Explain `compiled-js` for npm and `source-ts` for checkout execution, including
   matching observer entrypoints and reviewed executable trees.
5. Run Node 24 repository and packaging checks, Changeset validation and an
   independent exact-commit review before merging the focused fix.

## Authority, acceptance and rollback

Only disposable synthetic inputs and existing dependencies are used. This fix
does not run Docker, native clients or providers, modify installed profiles,
publish packages or release PR94. Keep that release draft until its refreshed
candidate includes the fix and passes release validation. Template inspection
and synthetic resolution prove interface compatibility, not native acceptance.

Accept when both runtimes can inspect the draft and accept explicitly matching
completed contracts while refusing wrong layouts. Revert this focused change to
restore the previous contract; preserve earlier failed evidence unchanged.
