// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { SkillBumpExampleConfiguration } from '../../../src/config/SkillBumpExampleConfiguration.ts';
import { SkillBumpReportService } from '../../../src/service/SkillBumpReportService.ts';
import {
    SkillBumpReportValidator,
    bumpDigest,
} from '../../../src/validator/SkillBumpReportValidator.ts';
import { repin, reversed } from '../fixture/SkillBumpFixture.mjs';
const service = new SkillBumpReportService();
const example = (kind) => SkillBumpExampleConfiguration.request(kind);
const invalid = (error) => error.code === 'invalid_input';

test('complete examples justify every recommendation without inferring compatibility from bytes', () => {
    for (const kind of ['patch', 'minor', 'major', 'undetermined']) {
        const request = example(kind),
            result = service.report(request);
        assert.equal(result.recommendation, kind);
        assert.equal(result.evidence_boundary.remote_git_verified, false);
        assert.equal(result.evidence_boundary.validation_reexecuted, false);
        assert.equal(
            result.assessment?.sha256 ?? null,
            request.assessment === null
                ? null
                : bumpDigest(new SkillBumpReportValidator().request(request).assessment),
        );
        if (request.assessment)
            assert.equal(
                result.changes[0].review.evidence_sha256,
                request.assessment.files[0].evidence_sha256,
            );
        assert.deepEqual(service.report(reversed(request)), result);
    }
    const request = example('major');
    request.assessment = null;
    assert.equal(service.report(request).recommendation, 'undetermined');
});

test('incomplete coverage, required candidate checks and unknown impacts remain undetermined', () => {
    const cases = [
        (request) => {
            request.assessment.coverage = 'partial';
        },
        (request) => {
            request.assessment.files = [];
        },
        (request) => {
            request.assessment.files[0].reason = 'undetermined';
        },
        (request) => {
            request.after.observation.contracts.coverage = 'partial';
            repin(request, 'after');
        },
        (request) => {
            request.after.observation.validation = request.after.observation.validation.filter(
                (item) => item.kind !== 'official',
            );
            repin(request, 'after');
        },
        (request) => {
            request.after.observation.validation.find((item) => item.kind === 'structural').status =
                'failed';
            repin(request, 'after');
        },
    ];
    for (const change of cases) {
        const request = example('patch');
        change(request);
        assert.equal(service.report(request).recommendation, 'undetermined');
    }
    const behavior = example('minor');
    behavior.after.observation.validation = behavior.after.observation.validation.filter(
        (item) => item.kind !== 'behavioral',
    );
    repin(behavior, 'after');
    assert.ok(service.report(behavior).insufficiencies.includes('candidate_behavioral_not_passed'));
    const repair = example('patch');
    repair.before.observation.validation[0].status = 'failed';
    repin(repair, 'before');
    assert.equal(service.report(repair).recommendation, 'patch');
});

test('required inputs, removed contracts and unchanged defining bytes contradict compatibility claims', () => {
    const required = example('minor');
    required.after.observation.contracts.entries.find((item) => item.id === 'format').required =
        true;
    repin(required, 'after');
    assert.ok(service.report(required).insufficiencies.includes('contradictory_contract_review'));
    const removed = example('major');
    removed.assessment.contracts[0].reason = 'compatible_correction';
    assert.equal(service.report(removed).recommendation, 'undetermined');
    const unsupported = example('patch');
    unsupported.after.observation.contracts.entries[0].signature_sha256 = 'a'.repeat(64);
    repin(unsupported, 'after');
    unsupported.assessment.contracts.push({
        id: unsupported.after.observation.contracts.entries[0].id,
        reason: 'compatible_addition',
        evidence_sha256: 'b'.repeat(64),
    });
    assert.ok(
        service
            .report(unsupported)
            .insufficiencies.includes('contract_change_without_changed_definition'),
    );
});

test('pagination preserves the complete recommendation and exact file/contract changes', () => {
    const request = example('major');
    const complete = service.report(request),
        first = service.report({ ...request, limit: 1 }),
        second = service.report({ ...request, limit: 1, offset: first.next_offset });
    assert.equal(first.recommendation, 'major');
    assert.equal(second.recommendation, 'major');
    assert.deepEqual([...first.changes, ...second.changes], complete.changes);
    assert.equal(second.next_offset, null);
    assert.deepEqual(first.assessment, second.assessment);
    const identical = {
        schema_version: 1,
        before: request.before,
        after: request.before,
        assessment: null,
    };
    assert.ok(service.report(identical).insufficiencies.includes('no_content_or_contract_changes'));
});

test('file-level claims require matching contract changes and required integrations cannot be optional', () => {
    for (const reason of [
        'contract_removed',
        'required_input_added',
        'optional_integration',
        'compatible_addition',
        'incompatible_contract',
    ]) {
        const request = example('patch');
        request.assessment.files[0].reason = reason;
        assert.ok(service.report(request).insufficiencies.includes('contradictory_file_review'));
    }
    const request = example('minor');
    const added = request.after.observation.contracts.entries.find((item) => item.id === 'format');
    added.kind = 'integration';
    added.required = true;
    repin(request, 'after');
    request.assessment.contracts[0].reason = 'optional_integration';
    assert.ok(service.report(request).insufficiencies.includes('contradictory_contract_review'));
    request.after.observation.contracts.entries.find((item) => item.id === 'format').required =
        false;
    repin(request, 'after');
    request.assessment.files[0].reason = 'optional_integration';
    assert.equal(service.report(request).recommendation, 'minor');
    const conflicting = example('major');
    conflicting.assessment.files[0].reason = 'compatible_correction';
    assert.ok(service.report(conflicting).insufficiencies.includes('contradictory_file_review'));
    conflicting.assessment.files[0].contracts = [];
    assert.ok(service.report(conflicting).insufficiencies.includes('unlinked_contract_review'));
    for (const kind of ['input', 'integration']) {
        const changed = example('minor');
        changed.after.observation.contracts.entries.find((item) => item.id === 'demonstrate').kind =
            kind;
        repin(changed, 'after');
        changed.assessment.contracts.push({
            id: 'demonstrate',
            reason: 'compatible_addition',
            evidence_sha256: 'a'.repeat(64),
        });
        changed.assessment.files[0].contracts.push('demonstrate');
        assert.ok(
            service.report(changed).insufficiencies.includes('contradictory_contract_review'),
        );
    }
});

test('content identity includes mode/type changes and provenance is independently reviewed', () => {
    const request = example('patch');
    request.after.observation.inventory.root_mode = 0o700;
    request.after.observation.inventory.entries[2] = {
        path: 'references/usage.md',
        type: 'directory',
        mode: 0o755,
    };
    const validator = new SkillBumpReportValidator();
    request.after.observation.content_identity = validator.contentIdentity(
        request.after.observation.subject,
        request.after.observation.inventory,
    );
    for (const receipt of request.after.observation.validation)
        receipt.content_sha256 = request.after.observation.content_identity.sha256;
    repin(request, 'after');
    request.assessment.files.push({
        path: '.',
        reason: 'compatible_correction',
        contracts: [],
        evidence_sha256: 'c'.repeat(64),
    });
    const result = service.report(request);
    assert.equal(result.counts.files.modified, 2);
    assert.equal(result.changes[0].key, '.');
    assert.equal(result.changes[1].before.type, 'file');
    assert.equal(result.changes[1].after.type, 'directory');
    request.after.observation.source = {
        repository: 'https://example.org/skills',
        source_ref: 'main',
        resolved_git_sha: 'a'.repeat(40),
    };
    repin(request, 'after');
    assert.ok(service.report(request).insufficiencies.includes('uncovered_changes'));
    request.assessment.provenance = {
        reason: 'compatible_correction',
        evidence_sha256: 'd'.repeat(64),
    };
    assert.equal(service.report(request).recommendation, 'patch');
});

test('stale pins, incompatible subjects, undefined review references and stale receipts are rejected', () => {
    const cases = [
        (request) => {
            request.before.sha256 = 'e'.repeat(64);
        },
        (request) => {
            request.assessment.after_sha256 = 'e'.repeat(64);
        },
        (request) => {
            request.assessment.files[0].path = 'unknown.md';
        },
        (request) => {
            request.assessment.files[0].contracts = ['unknown'];
        },
        (request) => {
            request.assessment.contracts = [
                { id: 'unknown', reason: 'contract_removed', evidence_sha256: 'a'.repeat(64) },
            ];
        },
        (request) => {
            request.after.observation.validation[0].content_sha256 = 'f'.repeat(64);
        },
        (request) => {
            request.after.observation.contracts.entries[0].files[0].sha256 = 'f'.repeat(64);
        },
        (request) => {
            request.after.observation.subject.skill = 'another-skill';
        },
    ];
    for (const change of cases) {
        const request = example('patch');
        change(request);
        assert.throws(() => service.report(request), invalid);
    }
});

test('collection comparisons include file additions and removals without treating either as semantic proof', () => {
    const request = example('patch');
    const validator = new SkillBumpReportValidator();
    for (const side of ['before', 'after']) {
        const observation = request[side].observation;
        observation.subject = { scope: 'collection', collection: 'synthetic', skill: null };
        if (side === 'after')
            observation.inventory.entries[2] = {
                path: 'references/new-guide.md',
                type: 'file',
                mode: 0o644,
                size: 10,
                sha256: 'a'.repeat(64),
            };
        observation.inventory = validator.inventory(observation.inventory);
        observation.content_identity = validator.contentIdentity(
            observation.subject,
            observation.inventory,
        );
        for (const receipt of observation.validation)
            receipt.content_sha256 = observation.content_identity.sha256;
        repin(request, side);
    }
    request.assessment.files.push({
        path: 'references/new-guide.md',
        reason: 'documentation_only',
        contracts: [],
        evidence_sha256: 'b'.repeat(64),
    });
    const result = service.report(request);
    assert.equal(result.subject.scope, 'collection');
    assert.equal(result.recommendation, 'patch');
    assert.deepEqual(result.counts.files, { added: 1, removed: 1, modified: 0 });
    request.assessment = null;
    assert.equal(service.report(request).recommendation, 'undetermined');
});
