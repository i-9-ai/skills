// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import {
    inventory,
    maintenanceFixture,
    repository,
} from '../../unit/fixture/CollectionMaintenanceFixture.mjs';

function cli(target, operation, flags = [], nodeArguments = []) {
    return spawnSync(
        process.execPath,
        [
            ...nodeArguments,
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

test('CLI reports receipt failure with nonzero exit while preserving the verified applied outcome', (t) => {
    const target = maintenanceFixture(t);
    const planFile = join(target.root, 'plan.json');
    fs.writeFileSync(planFile, JSON.stringify(target.plan()));
    const fault = join(target.root, 'receipt-fault.mjs');
    fs.writeFileSync(
        fault,
        `import fs from 'node:fs';
import { basename } from 'node:path';
const write = fs.writeFileSync;
fs.writeFileSync = (filename, ...args) => {
    const result = write(filename, ...args);
    if (typeof filename === 'string' && basename(filename) === 'maintenance-result.json') {
        throw new Error('Synthetic receipt confirmation failure');
    }
    return result;
};
`,
    );
    const response = cli(
        target,
        'evolve',
        ['--plan', planFile, '--apply', '--snapshot-store', target.store],
        ['--import', pathToFileURL(fault).href],
    );
    assert.equal(response.status, 1, response.stderr);
    const { receipt, ...terminal } = JSON.parse(response.stdout);
    assert.equal(receipt, 'unavailable');
    assert.equal(terminal.status, 'applied');
    assert.equal(terminal.applied, true);
    assert.equal(terminal.verification.catalog, 'passed');
    assert.equal(fs.existsSync(target.catalogFile), true);
    assert.deepEqual(
        JSON.parse(fs.readFileSync(join(terminal.snapshot, 'maintenance-result.json'), 'utf8')),
        terminal,
    );
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
