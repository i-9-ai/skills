// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    SkillEvidenceValidator,
    lifecycleReasons,
} from '../../../src/validator/SkillEvidenceValidator.ts';
import { SkillEvidenceService } from '../../../src/service/SkillEvidenceService.ts';
import { lifecycle, catalog, member, period, reversed } from '../fixture/SkillEvidenceFixture.mjs';
const validator = new SkillEvidenceValidator();
const invalid = (error) => error.code === 'invalid_input';

test('closed lifecycle reasons, canonical field ordering, and source identities are enforced', () => {
    const everyReason = [null, ...new Set(Object.values(lifecycleReasons).flat())];
    for (const [type, reasons] of Object.entries(lifecycleReasons)) {
        for (const reason of reasons.length ? reasons : [null]) {
            const event = lifecycle(type);
            event.payload.reason = reason;
            assert.deepEqual(validator.lifecycle(event), validator.lifecycle(reversed(event)));
        }
        const bad = lifecycle(type);
        bad.payload.reason = 'private-prose';
        assert.throws(() => validator.lifecycle(bad), invalid);
        for (const reason of everyReason) {
            const candidate = lifecycle(type);
            candidate.payload.reason = reason;
            const allowed = reasons.length ? reasons.includes(reason) : reason === null;
            if (!allowed) assert.throws(() => validator.lifecycle(candidate), invalid);
        }
    }
    const event = lifecycle();
    event.payload.source.repository = 'https://EXAMPLE.org.:443/skills/';
    assert.equal(
        validator.lifecycle(event).payload.source.repository,
        'https://example.org/skills',
    );
    event.payload.source = { ...event.payload.source, repository: null, resolved_git_sha: null };
    assert.equal(validator.lifecycle(event).payload.source.repository, null);
});

test('private, malformed, oversized and unknown evidence is rejected before a writer selector runs', () => {
    const good = lifecycle();
    const bad = [
        { ...good, prompt: 'private-sentinel' },
        { ...good, event_id: 'not-a-uuid' },
        { ...good, session: 'a-user-name' },
        { ...good, occurred_at: '2026-02-30T00:00:00.000Z' },
        { ...good, source_adapter: '/private/path' },
        { ...good, payload: { ...good.payload, reason: 'private-sentinel'.repeat(1000) } },
        ...[
            'http://example.org/skills',
            'https://127.0.0.1/skills',
            'https://example.org/skills?key=x',
            `https://${['name', 'pass'].join(':')}@example.org/skills`,
            'https://example.org/skills#fragment',
            'https://example.org/skills?',
            'https://example.org/skills#',
        ].map((repository) => ({
            ...good,
            payload: { ...good.payload, source: { ...good.payload.source, repository } },
        })),
        ...['/private/file', '../outside', 'CONOUT$.txt'].map((package_path) => ({
            ...good,
            payload: { ...good.payload, source: { ...good.payload.source, package_path } },
        })),
        {
            ...good,
            payload: {
                ...good.payload,
                source: { ...good.payload.source, package_sha256: 'unknown' },
            },
        },
        {
            ...good,
            payload: { ...good.payload, source: { ...good.payload.source, repository: null } },
        },
        {
            ...good,
            payload: {
                ...good.payload,
                source: { ...good.payload.source, resolved_git_sha: null, source_ref: 'main' },
            },
        },
    ];
    let opened = 0;
    for (const value of bad)
        assert.throws(
            () =>
                new SkillEvidenceService().recordLifecycle(() => {
                    opened += 1;
                    return '/never';
                }, value),
            invalid,
        );
    assert.equal(opened, 0);
});

test('complete catalog assertions are sorted, bounded and metadata-only', () => {
    const event = catalog([member('beta'), member('alpha')]);
    assert.equal(validator.catalog(event).payload.skills[0].skill, 'alpha');
    assert.deepEqual(validator.catalog(event), validator.catalog(reversed(event)));
    assert.equal(validator.catalog(catalog([])).payload.skills.length, 0);
    for (const value of [
        catalog([member(), member()]),
        catalog(Array.from({ length: 257 }, (_, index) => member(`skill-${index}`))),
        catalog([{ ...member(), description: 'private-sentinel' }]),
        { ...event, session: lifecycle().session },
    ])
        assert.throws(() => validator.catalog(value), invalid);
    const large = catalog([member()]);
    large.payload.private = 'x'.repeat(262144);
    assert.throws(() => validator.catalog(large), invalid);
});

test('new queries require bounded periods and explicit compatible pagination modes', () => {
    assert.equal(validator.query(period, 'lifecycle').limit, 20);
    for (const value of [
        {},
        { ...period, until: period.from },
        { ...period, until: '2028-01-01T00:00:00.000Z' },
        { ...period, limit: 101 },
        { ...period, path: '/private' },
        { ...period, interval: 'year' },
    ])
        assert.throws(() => validator.query(value, 'lifecycle'), invalid);
    for (const value of [
        { ...period, after_skill: 'example-skill' },
        { ...period, after_sequence: 1, observation_sequence: 2 },
    ])
        assert.throws(() => validator.query(value, 'history'), invalid);
    assert.equal(
        validator.query(
            { ...period, observation_sequence: 1, after_skill: 'example-skill' },
            'history',
        ).observation_sequence,
        1,
    );
});
