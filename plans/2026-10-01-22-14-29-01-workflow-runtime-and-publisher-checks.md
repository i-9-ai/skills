# Workflow runtime and publisher checks

Related: [issue #57](https://github.com/i-9-ai/skills/issues/57) and
[issue #66](https://github.com/i-9-ai/skills/issues/66).

## Objective and scope

Use official action releases that declare Node 24 and make the existing npm OIDC
publication prerequisites observable before the official Changesets upload.
Update validation, Changesets-note validation and Wiki synchronization. The
release and website workflows already use current checkout/setup-node pins;
preserve their delivery boundaries and publication mechanism.

## Reviewed revisions and compatibility

| Action | Previous revision | Reviewed release and immutable revision |
| --- | --- | --- |
| checkout | `11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2) | [v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| setup-node | `49933ea5288caeca8642d1e84afbd3f7d6820020` (v4.4.0) | [v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0), `820762786026740c76f36085b0efc47a31fe5020` |
| setup-python | `a26af69be951a213d495a4c3e4e4022e16d87065` (v5.6.0) | [v7.0.0](https://github.com/actions/setup-python/releases/tag/v7.0.0), `5fda3b95a4ea91299a34e894583c3862153e4b97` |

Inspect the pinned `action.yml` files and official release/README notes. All
declare `runs.using: node24`; checkout's newer credential storage remains disabled
with `persist-credentials: false`, and fork safety changes do not require an
unsafe-checkout override for ordinary `pull_request` validation. Hosted runners
supply the supported runner runtime (Node 24 actions require runner 2.327.1+).
Keep the job application runtime at Node 24, Python 3.12 solely for official
validation, current-head refs, existing permissions and validation coverage.

## Publication diagnosis and implementation

[Run 36925711979](https://github.com/i-9-ai/skills/actions/runs/36925711979) at
`c5a981b947b934252ee3ac3b942828e62a71b72d` used Node `24.21.0`, npm `11.19.0`,
the official Changesets CLI `3.0.2` and action revision
`ae32849d5ba541f9ae29e40e22a623bc13562f51`. Its upload failed with `ENEEDAUTH`.
The observed runtime exceeds npm's OIDC minimum (npm 11.5.1, Node 22.14.0).
Changesets delegates to `npm publish` and preserves OIDC environment variables;
the manifest already selects the public registry and matching repository URL.
The failure does not justify a speculative npm upgrade or stored token fallback.

Add a CI-only, zero-dependency prerequisite helper that checks the runtime,
public package/registry/repository metadata, default-branch workflow identity,
OIDC variable presence and absence of a configured publication-token fallback.
It must never request or print an OIDC token and must not claim to verify the npm
server-side binding. Add rejection tests with synthetic environments. Document
the exact `i-9-ai / skills / release.yml / no environment / npm publish` binding
and the observed failure's unresolved provider boundary.

The authenticated publisher configuration, release retry, npm upload, tag/release
creation, Wiki publication and branch-policy edits remain authorized actions for
the coordinating delivery workflow, never effects of these local helpers. No
new credential, npm package dependency or provider permission is introduced.

Primary evidence: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
and [Changesets Actions](https://github.com/changesets/action/tree/ae32849d5ba541f9ae29e40e22a623bc13562f51).

## Validation and rollback

Run focused synthetic workflow/prerequisite tests, the existing release workflow
tests, repository checks, Changesets status and whitespace checks. Require live
validation and note checks on the exact PR head; action manifest inspection is
structural evidence, not a completed provider run or npm upload.

Rollback restores the previous immutable action pins and removes the prerequisite
helper, tests and step. Preserve existing version alignment, packed-artifact
publication, job-scoped OIDC permissions and all unrelated changes.
