# Approved synthetic design

SPDX-License-Identifier: Apache-2.0

The process owner approved this design for the fictional task. The package's
only responsibility is preparing review intake. Its only primary output is a
review-intake record. The valid name `skill-review-intake` is fixed for this
exercise; no other package with that name is present in the supplied inputs.

Activate when a maintainer asks to prepare a review request for one identified
skill. Do not activate to judge quality, approve a release, install a package
or perform the skill's domain task.

The ordinary route records the supplied package reference and review kind,
checks whether the requested evidence is present, lists missing information,
records the actions actually authorized and names the next review handoff.
Missing data produces an incomplete intake, never an invented fact or a
quality verdict. The record is written to a caller-selected path outside the
installed package.

Keep the ordinary procedure and a complete normal example in `SKILL.md`. A
reusable Markdown intake template may be bundled under `assets/`. Give a clear
loading condition for that template. Include examples for missing evidence and
a request that exceeds intake authority. No executable helper, external service,
provider integration or automatic setup is needed.

The target profile requires `SKILL.md` and the supplied full Apache license.
Additional references are justified only when they serve the intake procedure.
Do not require this repository, its catalog or a global home path at runtime.
