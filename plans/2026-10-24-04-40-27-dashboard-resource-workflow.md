# Dashboard resource workflow and public explanation

## Objective

Make the local dashboard useful for understanding an entire skill package and
reviewing retained work, while explaining the actual distribution path on the
promotion site. Continues PR #107 and issue #106.

## Scope and authority

1. Fix the confirmed PR finding: an interrupted proposal without a committed
   receipt must not hide all valid history. Preserve incomplete evidence and
   capacity bounds; malformed committed receipts still fail closed.
2. Add a read-only package file selector to the source reader. Reuse the existing
   revision-bound resource API, make coverage and unsupported files explicit,
   reject stale responses and never execute resources.
3. Surface reported reading coverage for reviews with no proposal as well.
4. Add a dedicated EN/PT-BR/ES dashboard explanation to the website with its
   local-pilot availability, actual workflow, limits and documented setup path.
   This extends the site's architectural contract; no invented product proof.
5. Exercise meaningful synthetic workflows, independent exact-commit review,
   full Node24 checks, packed runtime and official CI. Update the private lab
   only through its existing supported installation flow, preserving state.

No real skill application/recovery, permission expansion, external-file access,
public upload, deployment, release or merge is implied. Actual changes still
require exact operator approval. Supporting files remain read only.

## Follow-on work

Track diff-block navigation, clearer review progress and portable consumer
onboarding as subsequent bounded tasks. Native operator acceptance and public
organization eligibility remain explicit existing gates. An hourly thread
follow-up continues authorized work without duplicate writers or repeated
unchanged notifications, and pauses when only human/provider gates remain.

## Validation and rollback

After explicit npm ci on Node24+, run focused repository/view/protocol/site
tests, npm run check, npm run changeset:status, npm run package:check and
git diff --check. Test incomplete preparation in one skill alongside valid
history in another, ordinary/corrupt/linked receipt handling, resource selection,
stale and failed reads, legacy/partial coverage and unchanged approval gates.
Verify rendered desktop/narrow layouts and all site locales. Keep screenshots
and logs private; never read real installed skills in automated tests.

Rollback reverts source, documentation and site changes together. Preserve
retained requests/proposals and previous lab artifacts; never delete incomplete
evidence as a repair or silently expand write support.
