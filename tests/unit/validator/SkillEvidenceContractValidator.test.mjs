// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { SkillEvidenceContractValidator } from '../../../src/validator/SkillEvidenceContractValidator.ts';
import { SkillEvidenceValidator as After } from '../../../src/validator/SkillEvidenceValidator.ts';
import { SkillPackageTreeValidator } from '../../../src/validator/SkillPackageTreeValidator.ts';
import { issuedBytes } from '../fixture/IssuedSkillEvidenceBytes.mjs';
import { assertion, reversed } from '../fixture/SkillQualityFixture.mjs';

test('shared extraction preserves existing canonical lifecycle/catalog/query bytes and source identity', () => {
    const source = assertion().payload.source;
    source.repository = 'https://EXAMPLE.org./skills/';
    const envelope = {
        schema_version: 2,
        event_type: 'skill.activated',
        event_id: '11111111-1111-4111-8111-111111111111',
        correlation_id: '22222222-2222-4222-8222-222222222222',
        occurred_at: '2026-09-19T12:00:00.000Z',
        source_host: 'manual',
        source_adapter: 'test',
        session: '33333333-3333-4333-8333-333333333333',
        payload: { collection: 'demo', skill: 'example-skill', source, reason: null },
    };
    const after = new After();
    for (const input of [envelope, reversed(envelope)])
        assert.equal(JSON.stringify(after.lifecycle(input)), issuedBytes.lifecycle_json);
    const catalog = {
        ...envelope,
        event_type: 'catalog.observed',
        session: null,
        payload: {
            collection: 'demo',
            source: {
                repository: source.repository,
                source_ref: null,
                resolved_git_sha: source.resolved_git_sha,
            },
            catalog_sha256: 'c'.repeat(64),
            skills: [
                {
                    skill: 'example-skill',
                    package_path: source.package_path,
                    package_sha256: source.package_sha256,
                    metadata_sha256: 'd'.repeat(64),
                },
            ],
        },
    };
    assert.equal(JSON.stringify(after.catalog(reversed(catalog))), issuedBytes.catalog_json);
    for (const kind of ['lifecycle', 'overlap', 'inactivity', 'history']) {
        const query = {
            from: '2026-09-01T00:00:00.000Z',
            until: '2026-10-01T00:00:00.000Z',
            collection: 'demo',
        };
        assert.equal(JSON.stringify(after.query(query, kind)), issuedBytes.query_json[kind]);
    }
    const normalized = after.lifecycle(envelope).payload.source;
    assert.equal(SkillEvidenceContractValidator.sourceKey(normalized), issuedBytes.source_key);
    assert.equal(SkillEvidenceContractValidator.identityKey(normalized), issuedBytes.identity_key);
});

test('shared extraction preserves rejection of private/authenticated/invalid source declarations', () => {
    for (const repository of [
        'https://127.0.0.1/skills',
        `https://${['synthetic-user', 'synthetic-password'].join(':')}@example.org/skills`,
        'https://example.org/skills?x=1',
    ]) {
        const value = assertion();
        const event = {
            ...value,
            event_type: 'skill.activated',
            session: value.correlation_id,
            payload: {
                collection: 'demo',
                skill: 'example-skill',
                source: { ...value.payload.source, repository },
                reason: null,
            },
        };
        assert.throws(
            () => new After().lifecycle(event),
            (error) => error.code === 'invalid_input',
        );
    }
});

test('common digest preserves exact historical UTF-8 ordering and all resources', () => {
    const files = ['SKILL.md', 'LICENSE', 'references/é.md', 'references/中.md'].map(
        (path, index) => ({
            path,
            sha256: createHash('sha256').update(String(index)).digest('hex'),
            bytes: index + 1,
        }),
    );
    const actual = new SkillPackageTreeValidator().digest([...files].reverse());
    assert.equal(actual, issuedBytes.tree_sha256);
    assert.notEqual(actual, new SkillPackageTreeValidator().digest(files.slice(0, -1)));
    assert.throws(
        () => new SkillPackageTreeValidator().digest([...files, files[0]]),
        (error) => error.code === 'invalid_input',
    );
    assert.throws(
        () => new SkillPackageTreeValidator().digest([{ ...files[0], path: '../SKILL.md' }]),
        (error) => error.code === 'invalid_input',
    );
    assert.throws(
        () => new SkillPackageTreeValidator().digest([{ ...files[0], bytes: 4_194_305 }]),
        (error) => error.code === 'invalid_input',
    );
});
