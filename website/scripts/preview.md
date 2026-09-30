# Loopback static preview

## Purpose and prerequisites

Serve an owned static build for local browser review with Node.js 24+. This is
not a production server or public preview service. Run the [build](build.md) first.

## Invocation and inputs

~~~sh
node website/scripts/preview.mjs
node website/scripts/preview.mjs --root .work/website-preview --port 4173
node website/scripts/preview.mjs --help
~~~

Default root is .work/website-preview under this checkout. Relative roots resolve
from the checkout. Ports must be integers from 1 to 65535. There is no host option:
the CLI always binds 127.0.0.1.

Open http://127.0.0.1:4173/, /pt-br/ or /es/. The process prints its local URL and
publication boundary. Ctrl-C or SIGTERM closes the server.

## Output and effects

No file changes, network requests, browser launches, installation or deployment.
Only files listed in the ownership marker are served, with hashes verified on
each request. Extra notes, build metadata and unowned files are not routes.

Only GET/HEAD are accepted. Malformed encoding, null/backslash/dot traversal,
symlink escape, missing/unowned files and changed artifacts are refused.
Responses include no-store, noindex, MIME protection and restrictive CSP.
All site resources are local; API connections, frames, objects and external
code are denied.

The server captures one marker at startup. Rebuild and restart for a new
candidate. Intended for a single local reviewer without concurrent output
mutation or hostile filesystem writers.

## Failure recovery and verification

If the port is occupied, choose another explicit port. If the marker is absent or
invalid, rebuild into a fresh directory. A 409 response means a generated file
changed after the marker: preserve/inspect it and rebuild a clean candidate.
A refused request never counts as successful rendering.

Run npm run site:test for disposable loopback/traversal/integrity fixtures.
Verify actual desktop/mobile rendering and interactions in a real browser.
Do not expose this process using tunnels or public hosting without separate
approval.
