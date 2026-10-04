# Missing-artifact recovery

SPDX-License-Identifier: Apache-2.0

Example: a caller requests behavioral review of `skill-beta` and supplies
`evidence/prior-output.md`, but that reference is unavailable. Preserve the
identity and requested review, mark the artifact missing and ask the owner
for the actual output or a corrected authorized reference. Never manufacture
a successful run or delete the missing-evidence section.

If two packages share a name, record their distinct source and package references.
A name match does not transfer validation or review evidence between sources.
Resolve the intended identity before the reviewer uses either package's evidence.
