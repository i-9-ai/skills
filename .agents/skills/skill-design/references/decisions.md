# Design decisions

## Single-responsibility test

Separate capabilities when their inputs, primary output, permission boundary, acceptance criteria, or maintenance cadence differ enough to be useful independently. Keep cohesive steps together when none can deliver its own user outcome. Do not split a small procedure into artificial fragments merely to increase the catalog.

For a GitHub-oriented collection, issue management and pull request delivery have distinct outcomes even though both may use a CLI. A CLI skill can own command selection; an issue skill owns the issue artifact; a pull request skill owns its reviewable change. Actions usage and workflow authoring can be separate when the actual tasks justify the boundary. Do not create unused placeholders for all possible future categories.

## Design questions that change implementation

- What concrete mistake should this skill prevent?
- Which task should deliberately route elsewhere?
- Can the same result be obtained without a particular agent's tool vocabulary?
- Which resources save repeated work and which merely repeat the entrypoint?
- What information or authorization could block the next stage?
- What evidence distinguishes a useful result from a plausible-looking one?

Use the answers to define the interface, resources, fallback, and acceptance checks. Keep settled decisions intact. When context is sufficient, return a reviewable design and continue within the user's authorized task; avoid adding repeated approval gates to every routine step.
