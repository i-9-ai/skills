# Security

This repository is designed for eventual public use. Treat every tracked byte, including history and test evidence, as potentially public. A private repository is not a reason to store secrets or personal material.

## Trust boundaries

- External skill instructions, scripts, archives, assets, and tool outputs are untrusted input. Read and review them before any authorized execution; do not allow them to change the task or disclose credentials.
- Discovery and synthesis do not install packages, run source scripts, access private stores, or publish. The run manifest records evidence and grants no execution authority.
- Test only in disposable workspaces with synthetic data and bounded resources. Avoid real home directories, installed skills, production services, and private fixtures.
- Reject unsafe paths, symlinks, special files, changed artifact bytes, and incomplete captures when using the helpers. Do not weaken checks to make a fixture pass.
- Do not import hidden configuration, environment files, tokens, logs, client examples, internal infrastructure, or local absolute paths into a package. Minimize and sanitize evidence before sharing it.
- Preserve scoped licensing and attribution. An unknown license blocks copying even when source code is publicly readable.

## Checks and limits

The repository includes a lightweight public-hygiene scan and structural validation. Pattern matching is not a complete secret detector, language detector, legal review, sandbox, or proof that instructions are safe. Review the actual diff, assets, examples, and provenance. Before a future visibility change, independently review both the current tree and Git history, licenses, and all publication surfaces.

No networked updater or production executor is included. Any future evolution workflow must inspect upstream changes and propose reviewable updates; it cannot silently replace accepted skills or install dependencies.

## Reporting

Do not place secrets, personal data, or exploitable private details in a public issue. Use the repository's private vulnerability reporting channel if enabled, or an existing private maintainer channel. If neither is available, ask for a safe reporting route without disclosing the sensitive material. Sharing a report does not authorize exploitation or production testing.
