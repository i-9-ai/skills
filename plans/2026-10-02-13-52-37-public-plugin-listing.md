# Public plugin listing correction

## Objective and scope

Resolve the observed public-submission findings for I-9 Skills: a subtitle over
30 characters, a missing app icon, and an inaccessible privacy-policy page.
Use the current portable root manifest's OpenAI interface extension and retain
the complete compatibility listing. Bundle one existing product mark as a
square PNG; provide public privacy and license-based terms pages on the current
GitHub Pages site. The support channel remains the repository issue tracker.
The user confirmed `https://skills.i-9.ai` as the public site domain.

The user subsequently supplied a portal security-risk finding for
`skills-usage-setup`, with no diagnostic cause. Its generic configuration writer
can persist caller-supplied commands. Preserve that opt-in package in the complete
repository/npm distribution, improve explicit command review before writes, and
exclude the whole package from this narrower public profile with a named reason
in both receipts and documentation. Do not claim that a review digest prevents
malicious commands or that exclusion guarantees provider approval. A closed
metadata-observer descriptor is a separately tracked hardening follow-up.

The public artifact remains skills-only. The repository plugin's local stdio
MCP and lifecycle hooks are retained in their existing distribution, rather
than represented as a hosted server. No endpoint, publisher verification,
legal attestation or provider approval is invented.

## Implementation and authority

The instruction map remains root `AGENTS.md` → `src/AGENTS.md` for projection
and validation, `tests/AGENTS.md` for disposable fixtures, `website/AGENTS.md`
for static policy presentation, `plans/AGENTS.md` for this migration record,
and `.agents/AGENTS.md` → `.agents/skills/AGENTS.md` → the usage-setup entrypoint
for its portable procedure. Retain all these scopes; add this record to the
existing plans index and update the existing source projection summary.
The ordinary product-icon directory needs no separate instruction contract.

1. Verify current official package/listing requirements and actual source.
2. Correct canonical metadata, bounded asset loading and public projection.
3. Add readable static policy pages and links using the existing site build.
4. Verify package, manifest, ZIP inventory and negative cases in fixtures.
5. Obtain independent review on the exact commit; use the already authorized
   PR/merge and Pages deployment flow. Prepare a new, separate public ZIP.

No new dependency, hosted backend, tracker, consumer installation or portal
upload is included. Release changes continue through Changesets. The user owns
any submission attestations. The Beads tracking task is `i9-skills-l8n`.

## Validation and evidence

After explicit `npm ci` with Node.js 24, run repository checks, Changeset status,
package verification and `git diff --check`. Test invalid/linked/absent assets,
listing length/URLs, deterministic ZIP contents and preserved component
exclusions. Inspect the icon at small size and the policy at mobile/desktop
widths. Verify the deployed HTTPS policy contents, not merely its status code,
then inspect both manifests and referenced icon in the actual new archive.
Portal revalidation and review remain unverified until performed there.

## Rollback

Revert this feature commit and redeploy the previous site. Keep earlier public
artifacts unchanged for comparison. No evidence database or installed profile
is migrated or deleted by this correction.
