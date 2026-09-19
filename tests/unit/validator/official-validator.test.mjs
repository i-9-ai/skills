// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { OfficialValidator } from '../../../src/validator/OfficialValidator.ts';

const config = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'))
    .config.officialSkillValidator;

test('rejects unpinned source identity, duplicate dependencies, and argument-like versions', () => {
    assert.throws(
        () =>
            new OfficialValidator().officialRequirements({
                ...config,
                source: 'https://example.org/skills-ref',
            }),
        /pinned/,
    );
    assert.throws(
        () => new OfficialValidator().officialRequirements({ ...config, sha256: 'unknown' }),
        /pinned/,
    );
    assert.throws(
        () =>
            new OfficialValidator().officialRequirements({
                ...config,
                version: `${config.version}\n`,
            }),
        /pinned/,
    );
    assert.throws(
        () => new OfficialValidator().officialRequirements({ ...config, version: 1 }),
        /pinned/,
    );
    assert.throws(
        () =>
            new OfficialValidator().officialRequirements({
                ...config,
                sha256: `${config.sha256}\n`,
            }),
        /pinned/,
    );
    assert.throws(
        () =>
            new OfficialValidator().officialRequirements({
                ...config,
                wheels: [...config.wheels, config.wheels[0]],
            }),
        /unique/,
    );
    const wheels = [{ ...config.wheels[0], version: '1 --extra-index-url=https://example.org' }];
    assert.throws(
        () => new OfficialValidator().officialRequirements({ ...config, wheels }),
        /unique/,
    );
});
