// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { SkillQualityArtifactRepository } from '../../../src/repository/SkillQualityArtifactRepository.ts';

const invalid = (error) => error?.code === 'invalid_input';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'i9-official-artifact-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const roots = Object.fromEntries(
        ['installed', 'caller', 'selected_package'].map((name) => {
            const directory = path.join(root, name);
            fs.mkdirSync(directory);
            return [name, directory];
        }),
    );
    const data = path.join(root, 'external');
    fs.mkdirSync(data);
    return {
        root,
        roots,
        data,
        database: path.join(data, 'evidence.db'),
        output: path.join(data, 'new-artifact'),
    };
}
function request() {
    return {
        collection: 'demo',
        skill: 'example-skill',
        source: {
            repository: null,
            source_ref: null,
            resolved_git_sha: null,
            package_path: '.agents/skills/example-skill',
            package_sha256: 'b'.repeat(64),
        },
    };
}
function artifact() {
    return {
        schema_version: 1,
        event_id: '11111111-1111-4111-8111-111111111111',
        correlation_id: '22222222-2222-4222-8222-222222222222',
        occurred_at: '2026-10-04T00:00:00.000Z',
        ...request(),
        method: {
            name: 'skills-ref',
            version: '0.1.0',
            revision: 'c'.repeat(40),
            source_sha256: 'd'.repeat(64),
        },
        setup: 'completed',
        version_check: { status: 'matched', observed_version: '0.1.0' },
        process: { status: 'completed', exit_code: 0, signal: null },
        before: { package_sha256: 'b'.repeat(64), files: 2, bytes: 40 },
        after: { package_sha256: 'b'.repeat(64), files: 2, bytes: 40 },
        result: 'pass',
        reason: 'conformance_pass',
    };
}

test('constructor and selection are read-only; explicit retain writes one exact inert artifact, never a DB', (t) => {
    const selected = fixture(t);
    const repository = new SkillQualityArtifactRepository();
    const before = fs.readdirSync(selected.data);
    const token = repository.select(selected.database, selected.output, selected.roots);
    assert.deepEqual(fs.readdirSync(selected.data), before);
    const receipt = repository.retain(token, artifact(), request());
    assert.deepEqual(Object.keys(receipt), ['locator', 'sha256']);
    assert.equal(receipt.locator, 'official-quality.json');
    const bytes = fs.readFileSync(path.join(selected.output, receipt.locator));
    assert.equal(hash(bytes), receipt.sha256);
    const stored = JSON.parse(bytes);
    assert.equal(stored.result, 'pass');
    assert.equal(Object.hasOwn(stored, 'assurance'), false);
    assert.equal(bytes.toString().includes(selected.root), false);
    assert.deepEqual(fs.readdirSync(selected.output), [receipt.locator]);
    assert.equal(fs.existsSync(selected.database), false);
    assert.equal(fs.statSync(selected.output).mode & 0o077, 0);
    assert.equal(fs.statSync(path.join(selected.output, receipt.locator)).mode & 0o077, 0);
});

test('existing artifact roots of any kind are never replaced', (t) => {
    for (const kind of ['directory', 'file', 'link', 'broken-link']) {
        const selected = fixture(t);
        if (kind === 'directory') {
            fs.mkdirSync(selected.output);
            fs.writeFileSync(path.join(selected.output, 'sentinel'), 'preserve');
        }
        if (kind === 'file') fs.writeFileSync(selected.output, 'preserve');
        if (kind === 'link') fs.symlinkSync(selected.roots.caller, selected.output);
        if (kind === 'broken-link')
            fs.symlinkSync(path.join(selected.root, 'absent'), selected.output);
        const info = fs.lstatSync(selected.output);
        assert.throws(
            () =>
                new SkillQualityArtifactRepository().select(
                    selected.database,
                    selected.output,
                    selected.roots,
                ),
            invalid,
        );
        assert.equal(fs.lstatSync(selected.output).ino, info.ino);
        assert.equal(fs.existsSync(selected.database), false);
    }
});

test('parents must already be canonical non-linked directories without recursive creation', (t) => {
    const selected = fixture(t);
    const repository = new SkillQualityArtifactRepository();
    const missing = path.join(selected.root, 'absent');
    assert.throws(
        () => repository.select(path.join(missing, 'db'), selected.output, selected.roots),
        invalid,
    );
    assert.throws(
        () => repository.select(selected.database, path.join(missing, 'out'), selected.roots),
        invalid,
    );
    assert.equal(fs.existsSync(missing), false);
    const link = path.join(selected.root, 'alias');
    fs.symlinkSync(selected.data, link);
    assert.throws(
        () => repository.select(path.join(link, 'db'), selected.output, selected.roots),
        invalid,
    );
    assert.throws(
        () => repository.select(selected.database, path.join(link, 'out'), selected.roots),
        invalid,
    );
    assert.deepEqual(fs.readdirSync(selected.data), []);
});

test('DB/artifact overlap and every declared protected root are rejected before effects', (t) => {
    const selected = fixture(t);
    const repository = new SkillQualityArtifactRepository();
    const extra = path.join(selected.root, 'extra');
    fs.mkdirSync(extra);
    const roots = { ...selected.roots, additional: [extra] };
    for (const root of [...Object.values(selected.roots), extra]) {
        assert.throws(
            () => repository.select(path.join(root, 'db'), selected.output, roots),
            invalid,
        );
        assert.throws(
            () => repository.select(selected.database, path.join(root, 'out'), roots),
            invalid,
        );
    }
    assert.throws(() => repository.select(selected.output, selected.output, roots), invalid);
    assert.throws(
        () => repository.select(path.join(selected.output, 'db'), selected.output, roots),
        invalid,
    );
    assert.deepEqual(fs.readdirSync(selected.data), []);
});

test('absent artifact roots cannot reserve the database or any sidecar before setup or retention', (t) => {
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
        const selected = fixture(t);
        const repository = new SkillQualityArtifactRepository();
        const output = selected.database + suffix;
        assert.throws(() => repository.select(selected.database, output, selected.roots), invalid);
        assert.throws(
            () =>
                repository.select(
                    selected.database,
                    path.join(output, 'nested-artifact'),
                    selected.roots,
                ),
            invalid,
        );
        assert.equal(fs.existsSync(output), false, suffix);
        assert.deepEqual(fs.readdirSync(selected.data), [], suffix);
    }
});

test('a safe artifact sibling sharing a sidecar prefix remains an independent destination', (t) => {
    for (const filename of ['evidence.db-wal-observation', 'EVIDENCE.DB-WAL-observation']) {
        const selected = fixture(t);
        const output = path.join(selected.data, filename);
        const repository = new SkillQualityArtifactRepository();
        const retained = repository.retain(
            repository.select(selected.database, output, selected.roots),
            artifact(),
            request(),
        );
        assert.equal(hash(fs.readFileSync(path.join(output, retained.locator))), retained.sha256);
        for (const suffix of ['', '-journal', '-wal', '-shm'])
            assert.equal(fs.existsSync(selected.database + suffix), false, suffix);
    }
});

test('absent case variants of the database and sidecars are rejected at selection with no empty directory', (t) => {
    for (const filename of [
        'EVIDENCE.DB',
        'evidence.db-JOURNAL',
        'evidence.db-WAL',
        'evidence.db-SHM',
        'EvIdEnCe.Db-wAl',
    ]) {
        const selected = fixture(t);
        const output = path.join(selected.data, filename);
        assert.throws(
            () =>
                new SkillQualityArtifactRepository().select(
                    selected.database,
                    output,
                    selected.roots,
                ),
            invalid,
        );
        assert.equal(fs.existsSync(output), false, filename);
        assert.deepEqual(fs.readdirSync(selected.data), [], filename);
        for (const suffix of ['', '-journal', '-wal', '-shm'])
            assert.equal(fs.existsSync(selected.database + suffix), false, filename + suffix);
    }
});

test('absent normalized and case-folded names cannot claim reserved destination ancestors', (t) => {
    const selected = fixture(t);
    const database = path.join(selected.data, 'caf\u00e9.db');
    const repository = new SkillQualityArtifactRepository();
    for (const output of [
        path.join(selected.data, 'CAFE\u0301.DB-WAL'),
        path.join(selected.data, 'CAFE\u0301.DB-WAL', 'nested'),
    ]) {
        assert.throws(() => repository.select(database, output, selected.roots), invalid);
        assert.deepEqual(fs.readdirSync(selected.data), []);
    }
    const upperParent = path.join(selected.data, 'EVIDENCE.DB-WAL');
    assert.throws(
        () => repository.select(path.join(upperParent, 'evidence.db'), upperParent, selected.roots),
        invalid,
    );
    assert.equal(fs.existsSync(upperParent), false);
});

test('unsafe path aliases, unbounded paths and incomplete roots are rejected without DB/output effects', (t) => {
    const selected = fixture(t);
    const repository = new SkillQualityArtifactRepository();
    for (const bad of [
        'relative/db',
        selected.data + '/./db',
        selected.data + '//db',
        selected.data + '/../external/db',
        selected.database + '\n',
        '/' + 'x'.repeat(4096),
    ]) {
        assert.throws(() => repository.select(bad, selected.output, selected.roots), invalid);
        assert.throws(() => repository.select(selected.database, bad, selected.roots), invalid);
    }
    for (const roots of [
        {},
        { ...selected.roots, raw: 'forbidden' },
        { ...selected.roots, installed: path.join(selected.root, 'absent') },
    ])
        assert.throws(() => repository.select(selected.database, selected.output, roots), invalid);
    assert.deepEqual(fs.readdirSync(selected.data), []);
});

test('existing database and every sidecar must be regular single-link files; no contents are opened', (t) => {
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
        for (const kind of ['directory', 'symlink', 'hardlink']) {
            const selected = fixture(t);
            const filename = selected.database + suffix;
            const sentinel = path.join(selected.root, 'sentinel');
            fs.writeFileSync(sentinel, 'synthetic inert bytes');
            if (kind === 'directory') fs.mkdirSync(filename);
            if (kind === 'symlink') fs.symlinkSync(sentinel, filename);
            if (kind === 'hardlink') fs.linkSync(sentinel, filename);
            assert.throws(
                () =>
                    new SkillQualityArtifactRepository().select(
                        selected.database,
                        selected.output,
                        selected.roots,
                    ),
                invalid,
            );
            assert.equal(fs.readFileSync(sentinel, 'utf8'), 'synthetic inert bytes');
            assert.equal(fs.existsSync(selected.output), false);
        }
    }
    const selected = fixture(t);
    fs.writeFileSync(selected.database, 'synthetic non-SQLite sentinel');
    fs.writeFileSync(selected.database + '-wal', 'inert sidecar');
    const bytes = fs.readFileSync(selected.database);
    const repository = new SkillQualityArtifactRepository();
    repository.retain(
        repository.select(selected.database, selected.output, selected.roots),
        artifact(),
        request(),
    );
    assert.deepEqual(fs.readFileSync(selected.database), bytes);
});

test('invalid artifact or unregistered token causes no retention effects', (t) => {
    const selected = fixture(t);
    const repository = new SkillQualityArtifactRepository();
    const token = repository.select(selected.database, selected.output, selected.roots);
    const wrong = artifact();
    wrong.stdout = 'private output';
    assert.throws(() => repository.retain(token, wrong, request()), invalid);
    assert.throws(() => repository.retain({}, artifact(), request()), invalid);
    const stale = artifact();
    stale.before.package_sha256 = 'f'.repeat(64);
    assert.throws(() => repository.retain(token, stale, request()), invalid);
    assert.deepEqual(fs.readdirSync(selected.data), []);
});

test('preflight rechecks new output, directory identity and DB/sidecar path replacement before creation', (t) => {
    for (const change of ['output', 'parent', 'protected', 'database', 'sidecar']) {
        const selected = fixture(t);
        const repository = new SkillQualityArtifactRepository();
        const token = repository.select(selected.database, selected.output, selected.roots);
        if (change === 'output') {
            fs.mkdirSync(selected.output);
            fs.writeFileSync(path.join(selected.output, 'sentinel'), 'preserve');
        }
        if (change === 'parent') {
            fs.renameSync(selected.data, selected.data + '-old');
            fs.mkdirSync(selected.data);
        }
        if (change === 'protected') {
            fs.renameSync(
                selected.roots.selected_package,
                selected.roots.selected_package + '-old',
            );
            fs.mkdirSync(selected.roots.selected_package);
        }
        if (change === 'database') fs.writeFileSync(selected.database, 'new inert file');
        if (change === 'sidecar') fs.writeFileSync(selected.database + '-shm', 'new inert file');
        assert.throws(() => repository.retain(token, artifact(), request()), invalid);
        if (change !== 'output') assert.equal(fs.existsSync(selected.output), false);
        else
            assert.equal(
                fs.readFileSync(path.join(selected.output, 'sentinel'), 'utf8'),
                'preserve',
            );
    }
});

test('owned retained bytes survive a later persistence failure and cannot be overwritten or silently retried', (t) => {
    const selected = fixture(t);
    const repository = new SkillQualityArtifactRepository();
    const token = repository.select(selected.database, selected.output, selected.roots);
    const retained = repository.retain(token, artifact(), request());
    const file = path.join(selected.output, retained.locator);
    const bytes = fs.readFileSync(file);
    assert.throws(() => {
        throw new Error('synthetic later persistence failure');
    });
    assert.deepEqual(fs.readFileSync(file), bytes);
    assert.throws(() => repository.retain(token, artifact(), request()), invalid);
    assert.throws(
        () => repository.select(selected.database, selected.output, selected.roots),
        invalid,
    );
    assert.deepEqual(fs.readFileSync(file), bytes);
    assert.equal(fs.existsSync(selected.database), false);
});

test('a changed candidate may retain a blocked diagnostic but never receives an assurance tier', (t) => {
    const selected = fixture(t);
    const repository = new SkillQualityArtifactRepository();
    const value = artifact();
    value.after.package_sha256 = 'f'.repeat(64);
    value.result = 'blocked';
    value.reason = 'package_changed';
    const retained = repository.retain(
        repository.select(selected.database, selected.output, selected.roots),
        value,
        request(),
    );
    const stored = JSON.parse(fs.readFileSync(path.join(selected.output, retained.locator)));
    assert.equal(stored.reason, 'package_changed');
    assert.equal(Object.hasOwn(stored, 'assurance'), false);
});

test('up to eight explicit input files remain protected while sibling DB/artifact destinations stay valid', (t) => {
    const selected = fixture(t);
    const inputs = Array.from({ length: 8 }, (_, index) =>
        path.join(selected.data, 'request-' + index + '.json'),
    );
    for (const input of inputs) fs.writeFileSync(input, 'synthetic request sentinel');
    const repository = new SkillQualityArtifactRepository();
    const before = fs.readdirSync(selected.data);
    const token = repository.select(selected.database, selected.output, {
        ...selected.roots,
        input_files: inputs,
    });
    assert.deepEqual(fs.readdirSync(selected.data), before);
    const retained = repository.retain(token, artifact(), request());
    assert.equal(fs.existsSync(selected.database), false);
    for (const input of inputs)
        assert.equal(fs.readFileSync(input, 'utf8'), 'synthetic request sentinel');
    const stored = fs.readFileSync(path.join(selected.output, retained.locator));
    assert.equal(hash(stored), retained.sha256);
    assert.equal(stored.toString().includes(inputs[0]), false);
});

test('input-file selections are bounded canonical existing regular single-link files', (t) => {
    const selected = fixture(t);
    const input = path.join(selected.data, 'request.json');
    fs.writeFileSync(input, 'preserve input');
    const directory = path.join(selected.root, 'input-directory');
    fs.mkdirSync(directory);
    const link = path.join(selected.root, 'input-link');
    fs.symlinkSync(input, link);
    const linkedParent = path.join(selected.root, 'input-parent-link');
    fs.symlinkSync(selected.data, linkedParent);
    const repository = new SkillQualityArtifactRepository();
    for (const input_files of [
        null,
        'not-an-array',
        Array(9).fill(input),
        [undefined],
        ['relative/request.json'],
        [selected.data + '/./request.json'],
        ['/' + 'x'.repeat(4096)],
        [path.join(selected.root, 'absent')],
        [directory],
        [link],
        [path.join(linkedParent, 'request.json')],
    ]) {
        assert.throws(
            () =>
                repository.select(selected.database, selected.output, {
                    ...selected.roots,
                    input_files,
                }),
            invalid,
        );
        assert.equal(fs.existsSync(selected.database), false);
        assert.equal(fs.existsSync(selected.output), false);
        assert.equal(fs.readFileSync(input, 'utf8'), 'preserve input');
    }
    const hardlink = path.join(selected.root, 'input-hardlink');
    fs.linkSync(input, hardlink);
    assert.throws(
        () =>
            repository.select(selected.database, selected.output, {
                ...selected.roots,
                input_files: [input],
            }),
        invalid,
    );
    assert.equal(fs.existsSync(selected.output), false);
});

test('DB, every sidecar and the artifact destination cannot collide with an explicit input file', (t) => {
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
        const selected = fixture(t);
        const input = selected.database + suffix;
        fs.writeFileSync(input, 'preserve selected input');
        const before = fs.readdirSync(selected.data);
        assert.throws(
            () =>
                new SkillQualityArtifactRepository().select(selected.database, selected.output, {
                    ...selected.roots,
                    input_files: [input],
                }),
            invalid,
        );
        assert.deepEqual(fs.readdirSync(selected.data), before);
        assert.equal(fs.readFileSync(input, 'utf8'), 'preserve selected input');
        assert.equal(fs.existsSync(selected.output), false);
    }
    const selected = fixture(t);
    const input = path.join(selected.data, 'request.json');
    fs.writeFileSync(input, 'preserve input');
    assert.throws(
        () =>
            new SkillQualityArtifactRepository().select(selected.database, input, {
                ...selected.roots,
                input_files: [input],
            }),
        invalid,
    );
    assert.equal(fs.existsSync(selected.database), false);
    assert.equal(fs.readFileSync(input, 'utf8'), 'preserve input');
});

test('single-link inode aliases between explicit input files and DB/sidecars are rejected', (t) => {
    const selected = fixture(t);
    const input = path.join(selected.data, 'evidence.db');
    fs.writeFileSync(input, 'preserve input');
    const alias = path.join(selected.data, 'EVIDENCE.DB');
    if (!fs.existsSync(alias)) {
        t.skip('Disposable filesystem does not expose case aliases for regular single-link files');
        return;
    }
    assert.equal(fs.lstatSync(input).nlink, 1);
    assert.equal(fs.lstatSync(input).ino, fs.lstatSync(alias).ino);
    assert.notEqual(input, alias);
    assert.throws(
        () =>
            new SkillQualityArtifactRepository().select(alias, selected.output, {
                ...selected.roots,
                input_files: [input],
            }),
        invalid,
    );
    assert.equal(fs.readFileSync(input, 'utf8'), 'preserve input');
    assert.equal(fs.existsSync(selected.output), false);
    for (const suffix of ['-journal', '-wal', '-shm']) {
        const scenario = fixture(t);
        const sidecarInput = scenario.database + suffix;
        fs.writeFileSync(sidecarInput, 'preserve sidecar input');
        const databaseAlias = path.join(scenario.data, 'EVIDENCE.DB');
        assert.equal(fs.lstatSync(sidecarInput).nlink, 1);
        assert.equal(fs.lstatSync(sidecarInput).ino, fs.lstatSync(databaseAlias + suffix).ino);
        assert.throws(
            () =>
                new SkillQualityArtifactRepository().select(databaseAlias, scenario.output, {
                    ...scenario.roots,
                    input_files: [sidecarInput],
                }),
            invalid,
        );
        assert.equal(fs.readFileSync(sidecarInput, 'utf8'), 'preserve sidecar input');
        assert.equal(fs.existsSync(scenario.output), false);
    }
});

test('input file and its separate parent identities are rechecked before any retention effects', (t) => {
    for (const mutation of ['replaced', 'deleted', 'linked', 'parent-replaced']) {
        const selected = fixture(t);
        const parent = path.join(selected.root, 'separate-input-parent');
        fs.mkdirSync(parent);
        const input = path.join(parent, 'request.json');
        fs.writeFileSync(input, 'original request');
        const repository = new SkillQualityArtifactRepository();
        const token = repository.select(selected.database, selected.output, {
            ...selected.roots,
            input_files: [input],
        });
        if (mutation === 'replaced') {
            fs.renameSync(input, input + '.saved');
            fs.writeFileSync(input, 'different identity');
        }
        if (mutation === 'deleted') fs.unlinkSync(input);
        if (mutation === 'linked') {
            fs.renameSync(input, input + '.saved');
            fs.symlinkSync(input + '.saved', input);
        }
        if (mutation === 'parent-replaced') {
            fs.renameSync(parent, parent + '.saved');
            fs.mkdirSync(parent);
            fs.writeFileSync(input, 'replacement parent');
        }
        assert.throws(() => repository.retain(token, artifact(), request()), invalid);
        assert.equal(fs.existsSync(selected.database), false);
        assert.equal(fs.existsSync(selected.output), false);
    }
});
