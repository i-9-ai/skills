// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { digest, fixture, run, write } from '../../unit/fixture/SkillBenchmarkFixture.mjs';

const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));

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

test('documented source corpus prepares with every retained fixture in a disposable collection', (t) => {
    const target = fixture(t);
    const corpus = path.join(target.root, 'source-corpus');
    fs.cpSync(path.join(repository, 'benchmarks/behavioral/cases'), path.join(corpus, 'cases'), {
        recursive: true,
    });
    for (const name of ['suite.json', 'LICENSE']) {
        fs.copyFileSync(
            path.join(repository, 'benchmarks/behavioral', name),
            path.join(corpus, name),
        );
    }
    const suite = JSON.parse(fs.readFileSync(path.join(corpus, 'suite.json'), 'utf8'));
    const packages = new Set(suite.cases.flatMap((item) => item.skills));
    for (const name of packages) {
        fs.cpSync(path.join(repository, '.agents/skills', name), path.join(target.skills, name), {
            recursive: true,
        });
    }

    const prepared = cli(target, [
        'benchmark',
        'prepare',
        '--suite',
        path.join(corpus, 'suite.json'),
        '--skills-root',
        target.skills,
        '--output',
        target.output,
    ]);
    assert.equal(prepared.status, 0, prepared.stderr);
    assert.match(JSON.parse(prepared.stdout).benchmark_sha256, /^[0-9a-f]{64}$/);
    const manifest = JSON.parse(fs.readFileSync(path.join(target.output, 'manifest.json'), 'utf8'));
    for (const item of suite.cases) {
        for (const input of item.fixtures) {
            const expected = fs.readFileSync(path.join(corpus, input.path));
            const relative = `cases/${item.id}/fixtures/${input.target}`;
            const record = manifest.files.find((entry) => entry.path === relative);
            assert.equal(record?.sha256, digest(expected), relative);
            assert.deepEqual(
                fs.readFileSync(path.join(target.output, relative)),
                expected,
                relative,
            );
        }
    }
    assert.equal(fs.existsSync(path.join(target.root, '.agents')), false);
    assert.equal(fs.existsSync(path.join(target.root, '.codex')), false);
});
