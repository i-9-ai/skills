# Repository version preparation

The official Changesets version action calls `npm run version:packages`, which
runs `version-packages.mjs`. This repository-only script is not a consumer CLI
command and is not included in the npm package.

Use Node.js 24+ and explicitly installed locked dependencies. The script resolves
this repository from its own location, runs the installed Changesets CLI, updates
the npm lockfile without lifecycle scripts, and copies the resulting package
version into the Codex, Claude and Copilot root plugin manifests. Other plugin
fields remain unchanged. The GitHub changelog generator uses the action's
existing `GITHUB_TOKEN`; the script does not acquire credentials.

```sh
npm run version:packages
```

Invocation changes the changelog, pending Changesets, package/lock metadata and
the three plugin manifests. Run it only through automation or in a disposable
rehearsal checkout. It does not create a commit, push, install a consumer or
publish. A failed child command stops preparation; discard the disposable
checkout and diagnose the failed step before a new rehearsal.

Verify with the focused Changesets automation tests, including plugin alignment
and the generated version-PR boundary, plus repository and package checks.
