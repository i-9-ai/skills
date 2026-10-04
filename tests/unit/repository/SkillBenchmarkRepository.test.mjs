// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { SkillBenchmarkRepository } from '../../../src/repository/SkillBenchmarkRepository.ts';
import { SkillBenchmarkService } from '../../../src/service/SkillBenchmarkService.ts';
import { fixture, run, write, importRun } from '../fixture/SkillBenchmarkFixture.mjs';

const repository = new SkillBenchmarkRepository();
const service = new SkillBenchmarkService();
const prepare = (target) => repository.prepare(target.suiteFile, target.skills, target.output);

test('freeze preserves complete bytes, uses the interoperable package digest and separates evaluator criteria', (t) => {
    const target = fixture(t);
    const original = fs.readFileSync(path.join(target.skills, 'example-skill/scripts/inert.mjs'));
    const result = prepare(target);
    assert.deepEqual(
        fs.readFileSync(path.join(target.output, 'packages/example-skill/scripts/inert.mjs')),
        original,
    );
    assert.deepEqual(
        fs.readFileSync(path.join(target.skills, 'example-skill/scripts/inert.mjs')),
        original,
    );
    assert.deepEqual(
        fs.readFileSync(path.join(target.output, 'cases/make-report/fixtures/inputs/facts.json')),
        fs.readFileSync(path.join(target.source, 'facts.json')),
    );
    const manifest = JSON.parse(fs.readFileSync(path.join(target.output, 'manifest.json')));
    const hash = createHash('sha256');
    for (const file of manifest.files.filter((file) =>
        file.path.startsWith('packages/example-skill/'),
    ))
        hash.update(`${file.path.slice('packages/example-skill/'.length)}\0${file.sha256}\n`);
    assert.equal(result.packages[0].tree_sha256, hash.digest('hex'));
    const executor = fs.readFileSync(
        path.join(target.output, 'cases/make-report/executor.json'),
        'utf8',
    );
    assert.doesNotMatch(executor, /criteria|oracle|critical|evaluator/);
    assert.match(executor, /"baseline_packages": \[\]/);
    assert.match(executor, /packages\/example-skill/);
    assert.equal(repository.load(target.output).manifest.benchmark_sha256, result.benchmark_sha256);
});

test('existing output and an output below the source remain untouched', (t) => {
    const target = fixture(t);
    write(target.output, 'keep.txt', 'Existing unrelated evidence.');
    assert.throws(() => prepare(target), /already exists/);
    assert.equal(
        fs.readFileSync(path.join(target.output, 'keep.txt'), 'utf8'),
        'Existing unrelated evidence.',
    );
    const inside = path.join(target.source, 'generated');
    assert.throws(() => repository.prepare(target.suiteFile, target.skills, inside), /outside/);
    assert.equal(fs.existsSync(inside), false);
});

test('a case without fixtures still has the declared empty executor input directory', (t) => {
    const target = fixture(t);
    target.suite.cases[0].fixtures = [];
    write(target.source, 'suite.json', target.suite);
    prepare(target);
    const inputs = path.join(target.output, 'cases/make-report/fixtures');
    assert.equal(fs.lstatSync(inputs).isDirectory(), true);
    assert.deepEqual(fs.readdirSync(inputs), []);
    assert.equal(repository.load(target.output).suite.cases[0].fixtures.length, 0);
});

test('traversal, symlinks and oversized fixtures fail before creating output', (t) => {
    for (const mode of ['traversal', 'symlink', 'oversized']) {
        const target = fixture(t);
        if (mode === 'traversal') target.suite.cases[0].fixtures[0].path = '../outside.txt';
        if (mode === 'symlink') {
            fs.unlinkSync(path.join(target.source, 'facts.json'));
            fs.symlinkSync(target.artifactFile, path.join(target.source, 'facts.json'));
        }
        if (mode === 'oversized')
            fs.writeFileSync(path.join(target.source, 'facts.json'), Buffer.alloc(4_194_305));
        write(target.source, 'suite.json', target.suite);
        assert.throws(() => prepare(target));
        assert.equal(fs.existsSync(target.output), false);
        assert.equal(
            fs.readFileSync(target.artifactFile, 'utf8'),
            'Synthetic retained report and grading evidence.\n',
        );
    }
});

test('symlink and hard-linked package resources are refused without modifying the source', (t) => {
    for (const mode of ['symlink', 'hardlink']) {
        const target = fixture(t);
        const link = path.join(target.skills, 'example-skill/borrowed.txt');
        if (mode === 'symlink') fs.symlinkSync(target.artifactFile, link);
        if (mode === 'hardlink') fs.linkSync(target.artifactFile, link);
        assert.throws(() => prepare(target), /link/);
        assert.equal(fs.existsSync(target.output), false);
        assert.equal(fs.lstatSync(link).isSymbolicLink(), mode === 'symlink');
    }
});

test('imports preserve artifact bytes, stay immutable and do not depend on later original outputs', (t) => {
    const target = fixture(t);
    const frozen = prepare(target);
    const value = run(target, frozen);
    const bytes = fs.readFileSync(target.artifactFile);
    const receipt = importRun(service, target, value);
    assert.equal(receipt.retained_artifacts, 1);
    const retained = path.join(target.output, 'runs/treatment-one/artifacts/report.md');
    assert.deepEqual(fs.readFileSync(retained), bytes);
    fs.writeFileSync(target.artifactFile, 'Changed external source after import.');
    assert.equal(repository.runs(target.output).length, 1);
    assert.deepEqual(fs.readFileSync(retained), bytes);
    const differentId = { ...value, id: 'replacement' };
    assert.throws(() => importRun(service, target, differentId), /already exists/);
    assert.equal(fs.existsSync(path.join(target.output, 'runs/replacement')), false);
});

test('artifact mismatch, pass without evidence and omitted criterion results are never imported', (t) => {
    const target = fixture(t);
    const frozen = prepare(target);
    for (const mode of ['mismatch', 'no-evidence', 'missing-criterion']) {
        const value = run(target, frozen, 'treatment', { id: `invalid-${mode}` });
        if (mode === 'mismatch') value.artifacts[0].sha256 = '0'.repeat(64);
        if (mode === 'no-evidence') value.criteria[0].evidence = [];
        if (mode === 'missing-criterion') value.criteria.pop();
        assert.throws(() => importRun(service, target, value));
        assert.deepEqual(fs.readdirSync(path.join(target.output, 'runs')), []);
    }
});

test('frozen package, criterion, imported run or artifact tampering blocks comparison', (t) => {
    for (const relative of [
        'packages/example-skill/SKILL.md',
        'suite.json',
        'runs/treatment-one/run.json',
        'runs/treatment-one/artifacts/report.md',
    ]) {
        const target = fixture(t);
        const frozen = prepare(target);
        importRun(service, target, run(target, frozen));
        fs.appendFileSync(path.join(target.output, relative), '\nChanged after freeze/import.\n');
        assert.throws(() => service.compare(target.output), /changed|mismatch/);
    }
});

test('unexpected retained files and symlink substitutions cannot enlarge the evidence set', (t) => {
    const target = fixture(t);
    const frozen = prepare(target);
    importRun(service, target, run(target, frozen));
    const extra = write(target.output, 'runs/treatment-one/artifacts/unlisted.md', 'Unlisted.');
    assert.throws(() => service.compare(target.output), /unexpected/);
    fs.unlinkSync(extra);
    const retained = path.join(target.output, 'runs/treatment-one/artifacts/report.md');
    fs.unlinkSync(retained);
    fs.symlinkSync(target.artifactFile, retained);
    assert.throws(() => service.compare(target.output), /symlink/);
});

test('duplicate JSON keys, executable case fields and overlapping target files fail before any output', (t) => {
    for (const mode of ['duplicate-key', 'executable-field', 'overlap']) {
        const target = fixture(t);
        if (mode === 'duplicate-key') {
            const bytes = fs.readFileSync(target.suiteFile, 'utf8');
            fs.writeFileSync(
                target.suiteFile,
                bytes.replace(
                    '"id": "synthetic-suite"',
                    '"id": "other-suite", "id": "synthetic-suite"',
                ),
            );
        }
        if (mode === 'executable-field') {
            target.suite.cases[0].command = 'This must never execute.';
            write(target.source, 'suite.json', target.suite);
        }
        if (mode === 'overlap') {
            target.suite.cases[0].fixtures.push({
                path: 'facts.json',
                target: 'inputs/facts.json/child.json',
            });
            write(target.source, 'suite.json', target.suite);
        }
        assert.throws(() => prepare(target));
        assert.equal(fs.existsSync(target.output), false);
        assert.equal(
            fs.existsSync(path.join(target.skills, 'example-skill/scripts/inert.mjs')),
            true,
        );
    }
});
