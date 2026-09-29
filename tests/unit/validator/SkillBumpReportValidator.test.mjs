// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { SkillBumpExampleConfiguration } from '../../../src/config/SkillBumpExampleConfiguration.ts';
import {
    SkillBumpReportValidator,
    MAX_BUMP_REQUEST_BYTES,
} from '../../../src/validator/SkillBumpReportValidator.ts';
const validator = new SkillBumpReportValidator();
const invalid = (error) => error.code === 'invalid_input';

test('closed observations reject private/unbounded data and malformed source identities', () => {
    const base = SkillBumpExampleConfiguration.request('patch').before.observation;
    for (const value of [
        { ...base, prompt: 'private-sentinel' },
        { ...base, source: { ...base.source, repository: 'https://localhost/source' } },
        {
            ...base,
            source: {
                repository: 'https://example.org/source?',
                source_ref: null,
                resolved_git_sha: null,
            },
        },
        {
            ...base,
            source: { repository: null, source_ref: 'main', resolved_git_sha: 'a'.repeat(40) },
        },
        {
            ...base,
            inventory: {
                ...base.inventory,
                entries: [
                    {
                        path: '../outside',
                        type: 'file',
                        size: 0,
                        mode: 420,
                        sha256: 'a'.repeat(64),
                    },
                ],
            },
        },
        { ...base, validation: [...base.validation, base.validation[0]] },
        {
            ...base,
            inventory: {
                ...base.inventory,
                entries: [...base.inventory.entries, base.inventory.entries[0]],
            },
        },
        {
            ...base,
            inventory: {
                ...base.inventory,
                entries: [
                    {
                        path: 'SKILL.md',
                        type: 'symlink',
                        mode: 511,
                        target_sha256: 'a'.repeat(64),
                        target_is_absolute: true,
                        target: '/private-sentinel',
                    },
                ],
            },
        },
    ])
        assert.throws(() => validator.observation(value), invalid);
});

test('input, inventory, scalar and paging bounds reject incomplete or oversized comparisons', () => {
    for (const paging of [{ limit: null }, { offset: null }])
        assert.throws(
            () =>
                validator.request({ ...SkillBumpExampleConfiguration.request('patch'), ...paging }),
            { code: 'invalid_input' },
        );
    const request = SkillBumpExampleConfiguration.request('patch');
    for (const value of [
        { ...request, note: 'x'.repeat(MAX_BUMP_REQUEST_BYTES) },
        { ...request, limit: 101 },
        { ...request, offset: -1 },
        { ...request, offset: 4097 },
    ])
        assert.throws(() => validator.request(value), invalid);
    assert.throws(
        () =>
            validator.inventory({
                root_mode: 0o755,
                entries: Array.from({ length: 1025 }, (_, index) => ({
                    path: `file-${index}`,
                    type: 'directory',
                    mode: 0o755,
                })),
            }),
        invalid,
    );
    assert.throws(
        () =>
            validator.inventory({
                root_mode: 0o755,
                entries: [
                    {
                        path: 'parent/file',
                        type: 'file',
                        mode: 0o644,
                        sha256: 'a'.repeat(64),
                        size: 1,
                    },
                ],
            }),
        invalid,
    );
    assert.throws(() => validator.inventory({ root_mode: 0o7777, entries: [] }), invalid);
});
