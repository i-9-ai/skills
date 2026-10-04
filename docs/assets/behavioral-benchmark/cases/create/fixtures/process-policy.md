# Synthetic review-intake process

SPDX-License-Identifier: Apache-2.0

This policy was authored for this benchmark. The fictional process owner grants
reuse under the supplied Apache-2.0 license. It contains no customer facts,
personal records or external source excerpts.

## Intake facts

Each request names one skill, its caller-selected package reference and one
review kind: `structure`, `behavior` or `portability`. A reason and supporting
artifact references may be supplied. Preserve their meaning without copying
secrets or private task transcripts into a reusable package.

Record these sections in the intake:

1. Supplied package identity and review kind.
2. Evidence available and evidence missing.
3. Scope of the requested review and actions authorized.
4. Status: `ready_for_review`, `incomplete` or `outside_intake_scope`.
5. The next reviewer handoff and any question that blocks it.

`ready_for_review` means enough intake information is present. It never means
the skill passed validation or that publication was approved.

## Evidence requested by review kind

For `structure`, request the package tree and recorded structural checks. For
`behavior`, request representative task inputs, expected observable outcomes
and actual prior outputs when available. For `portability`, request the proposed
consumer layout, runtime prerequisites and evidence of references that remain
usable outside the source checkout.

An absent artifact is listed as missing. Do not claim it was opened or checked.
An unavailable package identity or unsupported review kind leaves the intake
incomplete and names the specific information needed from the caller.

## Ordinary examples

A request identifies `skill-alpha` at `candidate/skill-alpha`, selects
`structure`, supplies a package tree and asks for intake only. Produce a
`ready_for_review` record preserving that scope; do not produce a validation
verdict.

A request identifies `skill-beta`, selects `behavior` and supplies only a short
description. Produce an `incomplete` record listing task cases and observed
outputs as missing; do not invent benchmark results.

A request says to approve and globally install `skill-gamma`, without package
identity or approval authority. Record `outside_intake_scope`, retain the known
request and route the missing identity and installation decision to the owner.
Do not install anything.
