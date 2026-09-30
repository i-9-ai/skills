# Research chronology pilot

A fresh case on 29 September 2026 followed the required order: select research
depth and limits, freeze the plan, obtain independent acknowledgment, then
retrieve sources. An independent reviewer inspected the retained execution
records and confirmed that order. **The chronology criterion passed; the research
itself remained `blocked_external_research`.** One successful process check does
not establish general pipeline readiness.

This case addresses [issue #39](https://github.com/i-9-ai/skills/issues/39).
The earlier [research pipeline pilot](https://github.com/i-9-ai/skills/wiki/Research-Pipeline-Pilot) and its
failed process-fidelity result remain unchanged. This is a separate execution,
not a retrospective repair of that run.

## Frozen case and procedure

The executor received one fictional claim: a matching package digest and author
field establish authenticated provenance. The task was to investigate that
claim, identify missing evidence and produce a research dossier. It did not ask
for a new skill, a working verifier or approval of a real package.

The actual `skill-domain-research` package was exported from commit
`863a5cd76c5c1828f29027270a041bb84fff170d` into a disposable location outside
both the repository and caller workspace. All nine package files were matched
to the committed bytes. No external reference skill was supplied; the research
skill provided procedure, not authority for cryptographic claims.

Before any domain retrieval, the executor recorded:

- **Extended depth**, because the subject affects security, terms were ambiguous,
  and applicability depended on current primary sources.
- Three questions: what a digest match establishes, what an expected-source
  verification workflow requires, and how to classify the owner's assertion.
- Primary-source classes: an issuing body, an implementation's verification
  documentation and a provenance specification. Candidate families were NIST,
  Sigstore and SLSA.
- A limit of four queries, twelve explicit retrieval operations, six unique
  primary pages or documents, twenty research minutes, one challenge pass and
  at most one correction pass. Failed requests consumed the applicable bounds.
- A stop when the budget or deadline was reached, or indispensable evidence
  remained inaccessible. Search excerpts could locate candidates but could not
  substitute for inspecting them.

The coordinator read the complete frozen plan, independently recomputed its
hash and recorded acknowledgment before the executor verified that acknowledgment
and started retrieval.

## What established the order

The [evaluation record](assets/research-chronology-pilot/evaluation.json) separates
byte identity, observed chronology and semantic coverage. Its anchors refer to
the retained native records inspected by the independent reviewer:

| Order | Observed evidence |
| --- | --- |
| 1 | The executor wrote and froze the plan; the tool returned its SHA-256. |
| 2 | The coordinator's file-read result contained the complete frozen plan and preparation record. |
| 3 | The coordinator recomputed the hashes and wrote an explicit acknowledgment. |
| 4 | The executor read and verified that acknowledgment and unchanged plan before any domain query. |
| 5 | The first native web invocation began at the recorded `22:05:03.741Z`; its results followed. |
| 6 | Six web invocations produced the search/open record; the later dossier and artifact manifest were sealed afterwards. |

The reviewer compared exported trace rows to their original native records and
inspected the fresh-case prefix for earlier domain retrieval. None was present
in that retained prefix. The incoming coordination-message body was encrypted;
it was not reconstructed or used as plaintext evidence. The visible
acknowledgment decision and its actual pre-retrieval verification establish the
observed boundary.

These are local execution records, not a signed external timestamp service.
Hashes identify bytes; caller-written times and a later-completed dossier alone
cannot prove those bytes existed before retrieval. Raw session records remain
outside the public repository. The public record supports review of the stated
findings and identifiers, but does not let an outside reader independently
replay private trace inspection.

## Research result and limits

The case consumed four queries, eight explicit retrieval operations and six
unique candidate pages or documents. The first-to-last retrieval bracket was
301 seconds; the first-retrieval-to-seal interval was approximately 706 seconds. These are
unsigned recorded-clock calculations, not inference latency or billing data.

Two NIST landing pages were inspected. The
[Secure Hash Standard record](https://csrc.nist.gov/pubs/fips/180-4/upd1/final)
describes the change-detection purpose of digests; the
[Digital Signature Standard record](https://csrc.nist.gov/pubs/fips/186-5/final)
describes signature purposes including signatory authentication. The dossier
kept these as narrow abstract-level statements and recorded the visible
revision/correction notices. It did not claim to have read the full standards,
errata or an operational verification recipe.

Other requested sources returned restricted-URL or internal tool errors. These
were tool outcomes, not conclusions about the publishers' access policies. No
alternate retrieval channel was used to bypass them. The independent reviewer
checked the second NIST page against the original retained tool result when a
later fetch failed; that later failure does not change the original observation.

The input did not establish the expected digest's origin, byte coverage,
authenticated identity or acceptance policy. With the required workflow sources
unread, the executor retained these as unknowns and stopped with
`blocked_external_research`. It did not declare the owner's sufficiency claim
proven, invent a verifier procedure or mark the research stage passed.

## Independent verdict

| Dimension | Result | Boundary |
| --- | --- | --- |
| Artifact integrity | Pass | Sixteen retained artifacts matched their hashes; nine package files also matched Git bytes. |
| Pre-retrieval planning | Pass | Actual retained sequence shows depth, limits, acknowledgment and verification before the first domain call. |
| Budget and stop behavior | Pass | Four queries, eight retrievals and six candidates independently recounted; unresolved indispensable sources remained a blocker. |
| Narrow source fit | Supported | Only the two inspected landing-page purposes and visible status notes were used. |
| Semantic completeness | Blocked | No inspected source supplied the indispensable verification workflow. |
| Structural validation | Separate | No skill or runtime code changed in this case; hashes and chronology are not an official package-validation result. |
| General improvement | Not established | One correction case, without a baseline, held-out tasks or production execution. |

The existing procedure was sufficient to express the required order. This case
provides one observed compliant sequence while preserving both the previous
failure and the new research limitation. A later dossier with identical fields
but no prior-plan execution evidence would still fail the chronology criterion.
