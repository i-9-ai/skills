# Public package availability

`package-availability.mjs` is the thin Node.js 24+ entrypoint for
`PackageAvailabilityRepository`. TypeScript keeps the injected HTTP, clock and
wait contracts explicitly checked with the rest of the repository; Node's native
type stripping runs the source directly without a build or additional dependency.

The release workflow runs the `availability` job after the official Changesets
publish job reports `published: true`. Its **Verify public npm metadata and tarball
availability** step passes `published-packages` as `PUBLISHED_PACKAGES`. These
outputs are documented by the pinned official
[publish action definition](https://github.com/changesets/action/blob/ae32849d5ba541f9ae29e40e22a623bc13562f51/publish/action.yml).
The array must contain exactly the name and version in the reviewed checkout's
`package.json`. The probe never substitutes `latest` or another dist-tag.

```sh
PUBLISHED_PACKAGES='[{"name":"@i-9.ai/skills","version":"<reviewed-version>"}]' \
  node .github/scripts/package-availability.mjs
```

Use the exact action output in place of the example version. Missing, malformed,
oversized or unrelated publication output fails before any HTTP request.

The probe issues anonymous GET requests to the public npm registry. It reads the
exact-version metadata, requires the same name and version, and downloads only the
canonical npm HTTPS tarball URL for that identity. It rejects user information,
query strings, fragments, other origins and redirects. No npm command,
configuration, cookie, credential, OIDC token or user state is consulted. The job
has `contents: read` and no publication permission.

The total deadline is 15 minutes, each metadata or tarball request has at most
15 seconds including its body, retries wait at most 10 seconds, and at most 91
attempts are permitted. Metadata is limited to 512 KiB and compressed tarballs to
64 MiB, including chunked responses. HTTP 404, 408, 425, 429, 5xx and transport
failures are retried within those bounds. Other HTTP responses, malformed metadata,
identity disagreements, invalid URLs or integrity disagreements fail immediately.
The workflow job timeout is 20 minutes.

Metadata must advertise one canonical SHA-512 integrity value. The probe verifies
the actual downloaded bytes against it and rejects an integrity value that changes
between attempts. This proves agreement with the observed registry metadata; it
does not authenticate the package against an independent artifact or inspect
archive contents.

Success prints bounded JSON with `status: available`, the exact package identity,
verified metadata, tarball URL, integrity, byte count, attempts and elapsed time.
A failure prints a fixed diagnostic JSON object and exits nonzero. A visibility
timeout reports `status: timeout` separately from a successful publication. No
failure republishes, changes versions or tags, or suppresses a failing check.

Every report includes `installed_runtime: not_checked`. The availability job does
not install dependencies or execute downloaded package code. A separate isolated
CLI/MCP consumer check after a real release is required to establish executable
consumer delivery. Local regression tests inject HTTP responses, clocks and waits
and never contact the registry.
