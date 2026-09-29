// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import {
    inventory,
    maintenanceFixture,
    repository,
} from '../../unit/fixture/CollectionMaintenanceFixture.mjs';

function cli(target, operation, flags = []) {
    return spawnSync(
        process.execPath,
        [
            join(repository, 'bin/index.mjs'),
            'collection',
            operation,
            '--collection',
            target.collection,
            '--layout',
            target.selection.layout,
            ...flags,
        ],
        {
            cwd: target.home,
            env: target.environment,
            encoding: 'utf8',
            timeout: 20_000,
            maxBuffer: 1_048_576,
        },
    );
}

test('CLI audit and plan can be reviewed before a deliberate catalog-only application', (t) => {
    const target = maintenanceFixture(t);
    const before = inventory(target.collection);
    const audit = cli(target, 'audit');
    assert.equal(audit.status, 0, audit.stderr);
    assert.equal(JSON.parse(audit.stdout).catalog.status, 'missing');
    assert.equal(audit.stdout.includes(target.collection), false);
    const auditFile = join(target.root, 'selected audit.json');
    fs.writeFileSync(auditFile, audit.stdout);
    const plan = cli(target, 'plan', ['--audit', auditFile]);
    assert.equal(plan.status, 0, plan.stderr);
    const planFile = join(target.root, 'selected plan.json');
    fs.writeFileSync(planFile, plan.stdout);
    const preview = cli(target, 'evolve', ['--plan', planFile]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(JSON.parse(preview.stdout).status, 'preview');
    assert.deepEqual(inventory(target.collection), before);
    const applied = cli(target, 'evolve', [
        '--plan',
        planFile,
        '--apply',
        '--snapshot-store',
        target.store,
    ]);
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(JSON.parse(applied.stdout).verification.catalog, 'passed');
    assert.equal(fs.existsSync(target.catalogFile), true);
    assert.deepEqual(fs.readdirSync(target.home), []);
});

test('CLI documents every operation and rejects incomplete input without writes', (t) => {
    const target = maintenanceFixture(t);
    for (const operation of ['audit', 'plan', 'evolve']) {
        const help = cli(target, operation, ['--help']);
        assert.equal(help.status, 0, help.stderr);
        assert.match(help.stdout, /EXAMPLES/);
    }
    const before = inventory(target.root);
    for (const [operation, flags] of [
        ['audit', ['--unknown']],
        ['plan', []],
        ['evolve', []],
        ['evolve', ['--plan', join(target.root, 'missing')]],
    ]) {
        const failed = cli(target, operation, flags);
        assert.notEqual(failed.status, 0);
    }
    assert.deepEqual(inventory(target.root), before);
});
