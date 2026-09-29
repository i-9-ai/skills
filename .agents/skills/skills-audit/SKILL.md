---
name: skills-audit
description: Use to audit a collection of installed or authored skills for inventory, provenance, validation, policy, and drift, producing one findings report.
license: Apache-2.0
metadata:
  author: i-9-ai
  tags: "skills, audit, compliance"
  source: original
  source_url: "https://github.com/i-9-ai/skills"
  reasoning-effort: high
---

# Skills Audit

## Responsibility and inputs

Audit a bounded collection of skills and produce one evidence-linked findings report. Accept the collection root or catalog, audit policy, expected host projections, provenance records, validation requirements, and an explicit scope revision.

## Procedure

1. Freeze the audit scope: collection path, catalog version, package inventory, revision, exclusions, and policy version.
2. Derive the actual package inventory from canonical `SKILL.md` entrypoints. Compare it with the catalog without allowing the catalog to define reality.
3. Check package identity, single-responsibility boundaries, required licenses, provenance, host metadata and icons, official validation evidence, broken references, duplicate assets, and unauthorized drift.
4. Verify that cited evidence matches the audited bytes and remains within its validity window. Do not infer passing behavior from structural conformance.
5. Classify each supported finding by severity, confidence, affected package, evidence, impact, and responsible remediation skill. Suppress secrets and personal data from the report.
6. Return coverage, findings, clean checks, limitations, and a reproducible scope handle. Do not repair packages during the audit.

## Tools and authority

Use read-only inventory, checksum, validation, and comparison tools. Network checks, private sources, and host configuration inspection require explicit scope and authority. Audit access does not authorize edits, installation, publication, or disclosure.

## Output and evaluation

The primary output is one collection audit report. Pass when every in-scope package has a disposition, findings are evidence-backed and actionable, clean areas are distinguished from untested areas, and rerunning against the same bytes yields the same inventory.
