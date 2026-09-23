# Distribution adapters

Use an adapter only after the portable publication gates have passed. An adapter distributes an already approved package; it does not create release authority, run package instructions, or replace the independent read-back in the publication procedure.

## Portable Git baseline

Publish the approved revision in a public Git repository with `SKILL.md`, package resources, `LICENSE`, and immutable revision evidence. This is the baseline distribution channel because it does not require a registry-specific manifest or lock consumers into one host.

## Skills CLI and skills.sh

Use the [Skills CLI documentation](https://www.skills.sh/docs/cli) to confirm the current distribution and installation workflow. Publish only a public, approved revision that the CLI can enumerate, then independently verify installation from the intended immutable source. Treat registry indexing and rankings as discovery signals, not quality or security evidence.

## Google Agent Registry

Use the [Google Agent Registry skill registration documentation](https://docs.cloud.google.com/agent-registry/register-skills) when the approved destination is that registry. Confirm the target project, registry identity, access policy, and release revision before invoking the documented registration command. Read back the registry record and verify that it identifies the approved package rather than a mutable workspace.

## Adding another adapter

Add a destination only after recording its official documentation, authorization model, immutable identity or equivalent revision evidence, package format compatibility, public-readback method, and rollback or deprecation path. Keep the adapter here as a short conditional reference; do not add vendor-specific requirements to the portable package contract.
