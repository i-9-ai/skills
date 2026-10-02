# SQLite sidecar stability and repository closeout

## Outcome and evidence

Resolve issue #80 using operation evidence rather than speculative writer retries.
A synchronized disposable experiment released eight imported writers per fresh
database. One of 96 writes failed because `lstat` returned a regular SQLite
rollback journal with `nlink=0` during concurrent removal. The filesystem
validator rejected that transient identity before opening SQLite; no native
SQLite error accompanied the failure. This does not explain every possible
`storage_unavailable` result.

## Scope and boundaries

- Re-observe only an initially regular, non-symlink SQLite sidecar with zero
  links, once. Missing paths retain their existing accepted semantics; a
  present replacement must satisfy all existing file checks.
- Never tolerate zero links on the primary database, symlinks, hardlinks,
  special files, repeated invalid observations or other filesystem errors.
- Keep migrations, evidence conflict detection, SQLite lock timeout and public
  error redaction unchanged. Add an injectable stat seam for deterministic
  tests without modifying process-global filesystem functions.
- Reconcile outstanding GitHub/Beads repository requirements. Explicitly
  deferred global work and independent module creation remain outside scope.
- No new dependency, workflow, host configuration, storage location, remote
  MCP, user-home mutation or public submission change is included.

## Implementation and verification

1. Add focused rejection/acceptance regressions for unlink, safe recreation,
   unsafe replacement, primary database removal and one-observation bounds.
   Confirm each concurrent MCP writer response alongside persisted totals.
2. Apply the narrow filesystem correction and repeat the synchronized
   reproduction with disposable state.
3. After explicit `npm ci` with Node 24+, run `npm run check`, packed-runtime
   verification, Changesets status and whitespace checks. Keep the official
   validator result on the exact PR head.
4. Obtain independent exact-commit review, fix pertinent findings, and follow
   the existing authorized PR/Changesets publication workflow. Close Beads
   tasks only with inspected acceptance evidence.

## Rollback and limits

Revert the correction if its file rejection contract regresses; retain the
deterministic tests and diagnosis when planning a replacement. No evidence
database is reset, copied or repaired. These checks assume stable owned
directories and do not establish hostile-race confinement. A single bounded
re-observation can still reject a continuously changing sidecar.
