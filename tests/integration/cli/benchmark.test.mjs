// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { digest, fixture, run, write } from '../../unit/fixture/SkillBenchmarkFixture.mjs';

const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));

function cli(target, args) {
    return spawnSync(process.execPath, [launcher, ...args], {
        cwd: target.root,
        encoding: 'utf8',
        timeout: 15_000,
        env: { PATH: process.env.PATH, HOME: target.root, NO_COLOR: '1', NODE_NO_WARNINGS: '1' },
    });
}

test('registered CLI prepares, imports and reads verified fixture evidence without creating home state', (t) => {
    const target = fixture(t);
    const prepared = cli(target, [
        'benchmark',
        'prepare',
        '--suite',
        target.suiteFile,
        '--skills-root',
        target.skills,
        '--output',
        target.output,
    ]);
    assert.equal(prepared.status, 0, prepared.stderr);
    const frozen = JSON.parse(prepared.stdout);
    const value = run(target, frozen);
    const runFile = write(target.root, 'external-run.json', value);
    const imported = cli(target, [
        'benchmark',
        'import-run',
        '--benchmark',
        target.output,
        '--run',
        runFile,
        '--artifacts',
        target.artifacts,
    ]);
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(JSON.parse(imported.stdout).execution_kind, 'fixture');
    const record = path.join(target.output, 'runs/treatment-one/run.json');
    const before = fs.readFileSync(record);
    assert.equal(JSON.parse(imported.stdout).run_sha256, digest(before));
    assert.equal(
        digest(fs.readFileSync(path.join(target.output, 'runs/treatment-one/artifacts/report.md'))),
        value.artifacts[0].sha256,
    );
    const duplicate = cli(target, [
        'benchmark',
        'import-run',
        '--benchmark',
        target.output,
        '--run',
        runFile,
        '--artifacts',
        target.artifacts,
    ]);
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /already exists/);
    assert.deepEqual(fs.readFileSync(record), before);
    const compared = cli(target, ['benchmark', 'compare', '--benchmark', target.output]);
    assert.equal(compared.status, 0, compared.stderr);
    const result = JSON.parse(compared.stdout);
    assert.equal(result.coverage.fixture_runs, 1);
    assert.equal(result.coverage.missing_runs, 1);
    assert.equal(result.coverage.declared_agent_pairs, 0);
    assert.equal(result.comparison_status, 'incomplete');
    assert.deepEqual(fs.readFileSync(record), before);
    assert.equal(fs.existsSync(path.join(target.root, '.agents')), false);
    assert.equal(fs.existsSync(path.join(target.root, '.codex')), false);
});

test('CLI rejects tampered retained evidence and missing flags with nonzero status', (t) => {
    const target = fixture(t);
    const prepared = cli(target, [
        'benchmark',
        'prepare',
        '--suite',
        target.suiteFile,
        '--skills-root',
        target.skills,
        '--output',
        target.output,
    ]);
    assert.equal(prepared.status, 0, prepared.stderr);
    const value = run(target, JSON.parse(prepared.stdout));
    const runFile = write(target.root, 'external-run.json', value);
    const imported = cli(target, [
        'benchmark',
        'import-run',
        '--benchmark',
        target.output,
        '--run',
        runFile,
        '--artifacts',
        target.artifacts,
    ]);
    assert.equal(imported.status, 0, imported.stderr);
    const retained = path.join(target.output, 'runs/treatment-one/artifacts/report.md');
    fs.appendFileSync(retained, 'Modified evidence.');
    const compared = cli(target, ['benchmark', 'compare', '--benchmark', target.output]);
    assert.notEqual(compared.status, 0);
    assert.match(compared.stderr, /identity mismatch/);
    assert.match(fs.readFileSync(retained, 'utf8'), /Modified evidence/);
    const missing = cli(target, ['benchmark', 'prepare']);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Missing required flag/);
});

test('CLI help exposes one canonical route and rejects unsafe case paths before writing', (t) => {
    const target = fixture(t);
    for (const route of ['prepare', 'import-run', 'compare']) {
        const help = cli(target, ['benchmark', route, '--help']);
        assert.equal(help.status, 0, help.stderr);
        assert.match(help.stdout, new RegExp(`benchmark ${route}`));
    }
    target.suite.cases[0].prompt = '../outside.md';
    write(target.source, 'suite.json', target.suite);
    const outside = write(target.root, 'outside.md', 'Unrelated sentinel preserved.');
    const rejected = cli(target, [
        'benchmark',
        'prepare',
        '--suite',
        target.suiteFile,
        '--skills-root',
        target.skills,
        '--output',
        target.output,
    ]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /traversal/);
    assert.equal(fs.existsSync(target.output), false);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'Unrelated sentinel preserved.');
});
