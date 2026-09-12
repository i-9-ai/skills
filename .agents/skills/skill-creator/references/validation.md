# Official package validation

Every authored or modified skill must pass `skills-ref validate <package-directory>`, the official command referenced by the [Agent Skills specification](https://agentskills.io/specification#validation). Inspect the package first in a stable, disposable workspace; do not execute its scripts merely to validate its frontmatter.

Use a trusted installation from the [official source repository](https://github.com/agentskills/agentskills/tree/69ef37e9424c0a7ea9dd2293b559e43ec8176379/skills-ref). The reviewed source pin is `69ef37e9424c0a7ea9dd2293b559e43ec8176379`, subdirectory `skills-ref`, package version `0.1.0`, requiring Python 3.11+. Its [source archive](https://codeload.github.com/agentskills/agentskills/tar.gz/69ef37e9424c0a7ea9dd2293b559e43ec8176379) has SHA-256 `0c9eabbe602095c4f4d771ee55bf74f6bc7e1c770f25d4fe29ce9802981daa20`. Later versions require their own source review. Do not infer official identity from a similarly named registry package.

If a verified installation is already available, invoke it with the selected package directory and retain the command, source/version identity, exit status, diagnostic, and candidate identity in the evaluation evidence. Re-run after any package change. In a shell, quote the directory; in a script, pass it as an argument array without a shell.

If the tool is unavailable, authoring and manual inspection may continue, but official validation remains `not-run` and readiness is `blocked`. Provide an environment handoff identifying the required source, runtime, and isolated installation; install dependencies only within existing task authority. Never replace this check with the optional custom helper or a manual frontmatter check.

An official pass establishes the format checks implemented by that version. It does not establish safe scripts, licensing compatibility, a useful procedure, or cross-agent behavior. Also inspect `LICENSE`, resource links, source rights, public hygiene, and the single-responsibility boundary; test executable helpers and run the frozen behavioral evaluation.
