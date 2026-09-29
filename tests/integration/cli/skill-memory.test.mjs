// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SkillEvidenceService } from '../../../src/service/SkillEvidenceService.ts';
import { SkillMemoryService } from '../../../src/service/SkillMemoryService.ts';
import { fixture, lifecycle, period } from '../../unit/fixture/SkillEvidenceFixture.mjs';
import { memoryQuery } from '../../unit/fixture/SkillMemoryFixture.mjs';

const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));
const periodFlags = ['--collection', 'demo', '--from', period.from, '--until', period.until];

function run(target, args) {
    return spawnSync(process.execPath, [launcher, ...args], {
        cwd: target.root,
        env: target.environment,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 128 * 1024,
    });
}

test('both memory commands expose help and return the same bounded read-only reports as the service', (t) => {
    const target = fixture(t);
    new SkillEvidenceService().recordLifecycle(target.database, lifecycle());
    const before = fs.readFileSync(target.database);
    const files = fs.readdirSync(target.root).sort();
    for (const operation of ['summarize', 'retention']) {
        const help = run(target, ['skills', 'memory', operation, '--help']);
        assert.equal(help.status, 0, help.stderr);
        assert.match(help.stdout, /--collection/);
        assert.match(help.stdout, /--db/);
        assert.match(help.stdout, /--from/);
        assert.match(help.stdout, /--until/);
        const extra = operation === 'retention' ? ['--cutoff', '2026-09-15T00:00:00.000Z'] : [];
        const result = run(target, [
            'skills',
            'memory',
            operation,
            '--db',
            target.database,
            ...periodFlags,
            ...extra,
        ]);
        assert.equal(result.status, 0, result.stderr);
        const query = {
            ...memoryQuery,
            ...(operation === 'retention' ? { cutoff: extra[1] } : {}),
        };
        assert.deepEqual(
            JSON.parse(result.stdout),
            new SkillMemoryService()[operation](target.database, query),
        );
        assert.ok(Buffer.byteLength(result.stdout) <= 65537);
        assert.equal(result.stdout.includes(target.database), false);
    }
    assert.deepEqual(fs.readFileSync(target.database), before);
    assert.deepEqual(fs.readdirSync(target.root).sort(), files);
    assert.deepEqual(fs.readdirSync(target.environment.HOME), []);
});

test('CLI rejects unrecognized mutation flags and never creates a missing database or directory', (t) => {
    const target = fixture(t);
    const absent = path.join(target.root, 'uncreated', 'evidence.db');
    const base = ['skills', 'memory', 'retention', '--db', absent, ...periodFlags];
    for (const flags of [
        ['--apply'],
        ['--delete'],
        ['--vacuum'],
        ['--limit', '101'],
        ['--cutoff', period.until],
    ]) {
        const result = run(target, [...base, ...flags]);
        assert.notEqual(result.status, 0);
        assert.equal(result.stdout, '');
    }
    const missing = run(target, base);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Usage operation unavailable/);
    assert.equal(missing.stderr.includes(absent), false);
    const required = run(target, ['skills', 'memory', 'summarize', '--db', absent]);
    assert.notEqual(required.status, 0);
    assert.match(required.stderr, /Missing required flag/);
    assert.equal(fs.existsSync(path.dirname(absent)), false);
    assert.deepEqual(fs.readdirSync(target.root), ['home']);
});
