# Description and activation optimization

Use this route when representative requests miss the skill or activate it for
another responsibility. Keep the package body and execution settings fixed
while comparing descriptions, unless a separately recorded scope change is
necessary. Description text states the outcome and distinguishing trigger; it
does not promise priority over user instructions or all competing skills.

1. Build a sanitized corpus of realistic positive requests, differently
   phrased positives, near misses, and true negatives. Include competing skills
   only when their installed identities and capabilities are known.
2. Record the expected selected skill or none for each request before trials.
   Split by task family into tuning, selection-validation, and untouched final
   acceptance. Paraphrases of one request should not leak across splits.
3. Observe the target host's actual selection behavior in a fresh context.
   If selection is not observable, mark it unavailable; manually judging the
   wording is an exploratory review, not a measured activation rate.
4. Record true/false positives and negatives, sample counts, and uncertainty.
   Report precision and recall only with their denominators; when a denominator
   is zero, report not applicable. A false positive on a critical authority
   boundary fails even if aggregate accuracy improves.
5. Change the smallest distinguishing phrase supported by tuning failures.
   Preserve specification and collection metadata limits. Select with the
   validation split, then test the retained description once on final cases.
6. Accept only the frozen improvement threshold without critical regression.
   Keep rejected descriptions and the baseline for rollback. Recheck affected
   functional cases if the trigger boundary changed the expected task route.

For example, an invoice-extraction skill should activate for extracting line
items from a supplied invoice and stay inactive for general tax advice or
finding an invoice provider. These are example labels, not recorded results.
Never tune by repeatedly exposing final-acceptance requests or make the
description so broad that it wins selection without doing the requested job.
