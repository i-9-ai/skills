// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { SafeRoot } from '../../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { SkillBenchmarkRepository } from '../../../src/repository/SkillBenchmarkRepository.ts';
import { SkillBenchmarkService } from '../../../src/service/SkillBenchmarkService.ts';
import { digest, fixture, run, write, importRun } from '../fixture/SkillBenchmarkFixture.mjs';

const repository = new SkillBenchmarkRepository();
const service = new SkillBenchmarkService();
const prepare = (target) => repository.prepare(target.suiteFile, target.skills, target.output);

function largeArtifacts(target, count) {
    const bytes = Buffer.alloc(4_194_304, 0x42);
    const sha256 = digest(bytes);
    return Array.from({ length: count }, (_, index) => {
        const relative = `payload/part-${index}.bin`;
        write(target.artifacts, relative, bytes);
        return { path: relative, sha256, bytes: bytes.length };
    });
}

function largeRun(target, frozen, artifacts, variant, overrides = {}) {
    const value = run(target, frozen, variant, { artifacts, ...overrides });
    value.criteria = value.criteria.map((criterion) => ({
        ...criterion,
        evidence: [artifacts[0].path],
    }));
    return value;
}

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

test('preparation stops repeated fixture reads at the remaining aggregate budget', (t) => {
    const target = fixture(t);
    const sourceFile = write(target.source, 'large.bin', Buffer.alloc(4_194_304, 0x41));
    target.suite.cases[0].fixtures = Array.from({ length: 64 }, (_, index) => ({
        path: 'large.bin',
        target: `inputs/repeated-${index}.bin`,
    }));
    write(target.source, 'suite.json', target.suite);
    const originalRead = SafeRoot.prototype.readBytes;
    const readLimits = [];
    t.mock.method(SafeRoot.prototype, 'readBytes', function (relative, limit) {
        if (this.path === target.source && relative === 'large.bin') {
            readLimits.push(limit);
            // Bound the regression itself if the incremental guard is ever removed.
            assert.ok(readLimits.length <= 8, 'Preparation kept reading after its byte budget.');
        }
        return originalRead.call(this, relative, limit);
    });
    assert.throws(() => prepare(target), /exceeds/);
    assert.equal(readLimits.length, 8);
    assert.deepEqual(readLimits.slice(0, 7), Array(7).fill(4_194_304));
    assert.ok(readLimits[7] < 4_194_304);
    assert.equal(fs.existsSync(target.output), false);
    assert.equal(fs.statSync(sourceFile).size, 4_194_304);
});

test('selected packages cannot read payloads larger than the remaining preparation budget', (t) => {
    const target = fixture(t);
    const bytes = Buffer.alloc(4_194_304, 0x43);
    write(target.source, 'large.bin', bytes);
    write(target.skills, 'example-skill/large.bin', bytes);
    target.suite.cases[0].fixtures = Array.from({ length: 7 }, (_, index) => ({
        path: 'large.bin',
        target: `inputs/part-${index}.bin`,
    }));
    write(target.source, 'suite.json', target.suite);
    const originalRead = SafeRoot.prototype.readBytes;
    let packagePayloadReads = 0;
    t.mock.method(SafeRoot.prototype, 'readBytes', function (relative, limit) {
        if (this.path === path.join(target.skills, 'example-skill') && relative === 'large.bin')
            packagePayloadReads += 1;
        return originalRead.call(this, relative, limit);
    });
    assert.throws(() => prepare(target), /Tree exceeds/);
    assert.equal(packagePayloadReads, 0);
    assert.equal(fs.existsSync(target.output), false);
    assert.equal(fs.statSync(path.join(target.skills, 'example-skill/large.bin')).size, 4_194_304);
});

test('fixture destinations each consume inventory bytes while repeated package selection stays unique', (t) => {
    const target = fixture(t);
    target.suite.cases[0].fixtures.push({ path: 'facts.json', target: 'inputs/duplicate.json' });
    const second = structuredClone(target.suite.cases[0]);
    second.id = 'make-second-report';
    second.fixtures.pop();
    target.suite.cases.push(second);
    write(target.source, 'suite.json', target.suite);
    const frozen = prepare(target);
    const inventory = repository.load(target.output).manifest.files;
    const fixtureFiles = inventory.filter((file) => file.path.includes('/fixtures/'));
    assert.equal(frozen.packages.length, 1);
    assert.equal(inventory.filter((file) => file.path.startsWith('packages/')).length, 3);
    assert.equal(fixtureFiles.length, 3);
    const original = fs.readFileSync(path.join(target.source, 'facts.json'));
    assert.equal(
        fixtureFiles.reduce((total, file) => total + file.bytes, 0),
        original.length * 3,
    );
    for (const file of fixtureFiles)
        assert.deepEqual(fs.readFileSync(path.join(target.output, file.path)), original);
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

test('an import exceeding the aggregate payload budget is rejected before reading or writing it', (t) => {
    const target = fixture(t);
    target.suite.cases[0].limits.attempts = 2;
    write(target.source, 'suite.json', target.suite);
    const frozen = prepare(target);
    const artifacts = largeArtifacts(target, 6);
    importRun(
        service,
        target,
        largeRun(target, frozen, artifacts, 'baseline', { id: 'baseline-first' }),
    );
    importRun(
        service,
        target,
        largeRun(target, frozen, artifacts, 'treatment', { id: 'treatment-first' }),
    );
    const originalReceipt = fs.readFileSync(
        path.join(target.output, 'runs/baseline-first/receipt.json'),
    );
    const originalRead = SafeRoot.prototype.readBytes;
    let incomingReads = 0;
    t.mock.method(SafeRoot.prototype, 'readBytes', function (relative, limit) {
        if (this.path === target.artifacts) incomingReads += 1;
        return originalRead.call(this, relative, limit);
    });
    assert.throws(
        () =>
            importRun(
                service,
                target,
                largeRun(target, frozen, artifacts, 'baseline', {
                    id: 'oversized-append',
                    attempt: 2,
                }),
            ),
        /Comparison artifact scan exceeds/,
    );
    assert.equal(incomingReads, 0);
    assert.equal(fs.existsSync(path.join(target.output, 'runs/oversized-append')), false);
    assert.deepEqual(fs.readdirSync(path.join(target.output, 'runs')).sort(), [
        'baseline-first',
        'treatment-first',
    ]);
    assert.deepEqual(
        fs.readFileSync(path.join(target.output, 'runs/baseline-first/receipt.json')),
        originalReceipt,
    );
    assert.equal(repository.runs(target.output).length, 2);
    assert.equal(service.compare(target.output).coverage.imported_runs, 2);
});

test('full 32 MiB payloads remain verifiable at the 64 MiB aggregate ceiling with metadata overhead', (t) => {
    const target = fixture(t);
    const frozen = prepare(target);
    const artifacts = largeArtifacts(target, 8);
    const receipt = importRun(
        service,
        target,
        largeRun(target, frozen, artifacts, 'treatment', { id: 'full-payload' }),
    );
    const retained = path.join(target.output, 'runs/full-payload');
    assert.equal(receipt.retained_artifacts, 8);
    assert.ok(fs.statSync(path.join(retained, 'run.json')).size <= 524_288);
    assert.ok(fs.statSync(path.join(retained, 'receipt.json')).size <= 524_288);
    assert.equal(
        repository.runs(target.output)[0].artifacts.reduce((total, file) => total + file.bytes, 0),
        33_554_432,
    );
    assert.equal(service.compare(target.output).coverage.imported_runs, 1);
    for (const file of artifacts)
        assert.equal(
            digest(fs.readFileSync(path.join(retained, 'artifacts', file.path))),
            file.sha256,
        );
    importRun(
        service,
        target,
        largeRun(target, frozen, artifacts, 'baseline', { id: 'full-baseline' }),
    );
    assert.equal(service.compare(target.output).coverage.imported_runs, 2);
    fs.unlinkSync(path.join(target.artifacts, artifacts[0].path));
    assert.equal(repository.runs(target.output).length, 2);
});

test('metadata exceeding the serialized JSON ceiling is rejected before creating a run directory', (t) => {
    const target = fixture(t);
    target.suite.cases[0].criteria = Array.from({ length: 64 }, (_, index) => ({
        id: `criterion-${index}`,
        critical: index === 0,
        description: 'Synthetic criterion used only to test the metadata storage limit.',
    }));
    write(target.source, 'suite.json', target.suite);
    const frozen = prepare(target);
    const bytes = Buffer.from('X');
    const artifacts = Array.from({ length: 16 }, (_, index) => {
        const relative = `data/${'d'.repeat(240)}/${index}-${'p'.repeat(240)}.txt`;
        write(target.artifacts, relative, bytes);
        return { path: relative, sha256: digest(bytes), bytes: bytes.length };
    });
    const value = run(target, frozen, 'treatment', { id: 'oversized-metadata', artifacts });
    value.criteria = target.suite.cases[0].criteria.map((criterion) => ({
        id: criterion.id,
        verdict: 'pass',
        reason: 'Synthetic fixture only.',
        evidence: artifacts.map((file) => file.path),
    }));
    const minified = JSON.stringify(value);
    assert.ok(Buffer.byteLength(minified) <= 524_288);
    assert.ok(Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`) > 524_288);
    const runFile = write(target.root, 'oversized-metadata.json', minified);
    const originalRead = SafeRoot.prototype.readBytes;
    let artifactReads = 0;
    t.mock.method(SafeRoot.prototype, 'readBytes', function (relative, limit) {
        if (this.path === target.artifacts) artifactReads += 1;
        return originalRead.call(this, relative, limit);
    });
    assert.throws(
        () => service.importRun(target.output, runFile, target.artifacts),
        /JSON output exceeds 524288 bytes/,
    );
    assert.equal(artifactReads, 0);
    assert.deepEqual(fs.readdirSync(path.join(target.output, 'runs')), []);
    assert.equal(service.compare(target.output).coverage.imported_runs, 0);
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

test('separate metadata budgets do not hide unexpected root entries or substituted metadata', (t) => {
    for (const mode of ['root-sibling', 'run-symlink', 'receipt-symlink', 'run-directory']) {
        const target = fixture(t);
        const frozen = prepare(target);
        importRun(service, target, run(target, frozen));
        const directory = path.join(target.output, 'runs/treatment-one');
        if (mode === 'root-sibling') write(directory, 'unlisted.json', { unexpected: true });
        if (mode === 'run-symlink' || mode === 'receipt-symlink') {
            const file = path.join(directory, mode === 'run-symlink' ? 'run.json' : 'receipt.json');
            fs.unlinkSync(file);
            fs.symlinkSync(target.artifactFile, file);
        }
        if (mode === 'run-directory') {
            const file = path.join(directory, 'run.json');
            fs.unlinkSync(file);
            fs.mkdirSync(file);
        }
        assert.throws(
            () => service.compare(target.output),
            /unexpected|symlink|not a regular file/,
        );
    }
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
