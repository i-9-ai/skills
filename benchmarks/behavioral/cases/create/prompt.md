# Create a focused review-intake skill

Work only in this case's disposable fixture workspace. All paths below are
relative to that workspace. The supplied material is fictional and licensed;
it is not a description of a real organization's process.

Use `inputs/brief.json`, `inputs/design.md`, `inputs/process-policy.md`,
`inputs/research.md` and `inputs/LICENSE` to create the portable package
`deliverables/skill-review-intake/`. The process owner has approved the name,
single responsibility and design. Implement that design rather than expanding
it into a general skill-management coordinator.

The package should teach an agent to produce one review-intake record for a
skill. It records the request and missing evidence; it does not evaluate the
skill, approve it, install it, edit a catalog or execute a migration. Include
the ordinary procedure and connected examples so another agent can use the
package without this workspace or a web lookup. This target collection requires
a portable `SKILL.md`, a full `LICENSE` and useful bundled resources; host icons
and provider metadata are optional.

Preserve all supplied inputs. You may create files under `deliverables/` and
`output/` only. Do not download dependencies, access a real home directory,
modify installed packages or publish anything. Candidate companion skills may
be used only if the executor has explicitly made them available.

Write `output/authoring-record.md` describing the delivered package, source
reuse, checks actually performed and unresolved handoffs. Distinguish local
structure, official conformance and behavioral evaluation. If a required tool
or companion is unavailable, retain completed artifacts and report that stage
as blocked or not run; never invent a passed result or a current web source.
