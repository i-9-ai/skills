# Naming conventions

## Domain and affinity first

Use `<domain>-<responsibility>` as the default. Add a subject or qualifier when it distinguishes an independently useful task. Related names should sort together and reveal their domain without requiring the description. Preserve the caller's established vocabulary unless it obscures the actual responsibility or collides with an existing name.

For skill-related work, start with `skill` or `skills`. For GitHub work, start with `github`, such as `github-issue` or `github-action`, instead of placing the domain after a generic verb. These examples explain grouping; they do not mandate a GitHub taxonomy or require creating unused skills.

## Cardinality and scope

Use singular when the contract primarily handles one unit; use plural when a collection or comparison of units is central. Choose from the responsibility, not from whether an implementation happens to loop. A fixed domain name such as `github` stays fixed; a subject such as `issue` can express cardinality when relevant.

| Responsibility | Example name | Reason |
| --- | --- | --- |
| Author one skill package | `skill-authoring` | One target package |
| Design one skill's boundaries | `skill-design` | One design |
| Decide one skill's name | `skill-naming` | One naming decision |
| Discover and qualify candidate skills | `skills-discovery` | A set of candidates |
| Synthesize contributions from several skills | `skills-synthesis` | Multiple source packages |
| Evaluate one candidate skill | `skill-evaluator` | One candidate; preserve an accepted role name |
| Prepare one GitHub issue | `github-issue` | Domain and one issue artifact |
| Triage a queue of GitHub issues | `github-issues-triage` | The queue is the primary unit |

Prefer a concrete responsibility to an implementation label or an umbrella such as `factory`, `manager`, or `utils`. A role noun can be appropriate when already established and unambiguous. Avoid aesthetic renames that add migration cost without improving meaning. Do not add a provider name unless that provider is the actual task domain.

## Technical identity

The [Agent Skills specification](https://agentskills.io/specification#name-field) requires a name of 1–64 characters, lowercase alphanumeric characters and hyphens, no leading/trailing or consecutive hyphens, and a matching package directory name. It allows Unicode lowercase alphanumerics. For a conservative portable English profile, choose ASCII words, start with a letter, and join words with single hyphens; this profile is narrower than the specification.

Keep the slug, directory, and invocation references aligned. A display title may use spaces and capitalization. Put extra discovery terms in the description or optional metadata instead of making the slug a list of synonyms. Avoid promotional claims, unexplained abbreviations, and revision suffixes unless a real external version is part of the task's identity.

## Collision decisions

Check exact identifiers first, then misleadingly similar names and overlapping meanings within the intended installation. A technically different slug can still create routing confusion. Report the actual sources and date of the check; registry search results do not establish ownership, availability everywhere, or global uniqueness.

Prefer a meaningful domain or responsibility qualifier when an existing generic name has a different purpose. If the caller explicitly chose a colliding name, explain the conflict and offer a bounded alternative. A rename decision must identify affected consumers and their transition needs; it cannot authorize replacing an installed skill or rewriting external benchmark identities.
