import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PluginDataRepository } from '../../../src/repository/PluginDataRepository.ts';

function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-sidecar-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const database = path.join(root, 'usage.db');
    fs.writeFileSync(database, 'unchanged primary evidence');
    return { root, database };
}

// Model a pathname lookup that returns the old inode after SQLite unlinks it.
function unlinkDuringInspection(filename, replace = () => {}) {
    let calls = 0;
    return {
        inspect(selected) {
            if (selected !== filename) return fs.lstatSync(selected);
            calls++;
            if (calls > 1) return fs.lstatSync(selected);

            const previous = fs.lstatSync(selected);
            fs.unlinkSync(selected);
            replace();
            previous.nlink = 0;
            return previous;
        },
        calls: () => calls,
    };
}

for (const method of ['prepareDatabase', 'verifyDatabase']) {
    test(`${method} accepts a removed SQLite sidecar after one fresh inspection`, async (t) => {
        for (const suffix of ['-journal', '-wal', '-shm']) {
            await t.test(suffix, (t) => {
                const { database } = fixture(t);
                const sidecar = database + suffix;
                fs.writeFileSync(sidecar, 'temporary SQLite state');
                const before = fs.readFileSync(database);
                const race = unlinkDuringInspection(sidecar);

                assert.equal(
                    new PluginDataRepository(race.inspect)[method](database, []),
                    database,
                );
                assert.equal(race.calls(), 2);
                assert.equal(fs.existsSync(sidecar), false);
                assert.deepEqual(fs.readFileSync(database), before);
            });
        }
    });
}

test('a recreated sidecar must satisfy the current regular single-link contract', (t) => {
    const { database } = fixture(t);
    const sidecar = database + '-journal';
    fs.writeFileSync(sidecar, 'first generation');
    const race = unlinkDuringInspection(sidecar, () => {
        fs.writeFileSync(sidecar, 'new generation');
    });

    assert.equal(new PluginDataRepository(race.inspect).prepareDatabase(database, []), database);
    assert.equal(race.calls(), 2);
    assert.equal(fs.readFileSync(sidecar, 'utf8'), 'new generation');
});

test('reinspection rejects unsafe replacements without modifying them', async (t) => {
    for (const replacement of ['symlink', 'hardlink', 'directory']) {
        await t.test(replacement, (t) => {
            const { root, database } = fixture(t);
            const sidecar = database + '-journal';
            const other = path.join(root, 'unrelated');
            fs.writeFileSync(other, 'preserved unrelated content');
            fs.writeFileSync(sidecar, 'first generation');
            const race = unlinkDuringInspection(sidecar, () => {
                if (replacement === 'symlink') return fs.symlinkSync(other, sidecar);
                if (replacement === 'hardlink') return fs.linkSync(other, sidecar);
                fs.mkdirSync(sidecar);
            });

            assert.throws(
                () => new PluginDataRepository(race.inspect).prepareDatabase(database, []),
                /regular and non-linked/,
            );
            assert.equal(race.calls(), 2);
            assert.equal(fs.readFileSync(other, 'utf8'), 'preserved unrelated content');
            assert.equal(fs.existsSync(sidecar), true);
        });
    }
});

test('reinspection preserves non-ENOENT filesystem errors', (t) => {
    const { database } = fixture(t);
    const sidecar = database + '-journal';
    fs.writeFileSync(sidecar, 'first generation');
    const race = unlinkDuringInspection(sidecar);
    const denied = Object.assign(new Error('fixture inspection denied'), { code: 'EACCES' });
    let calls = 0;
    const inspect = (filename) => {
        if (filename === sidecar && ++calls === 2) throw denied;
        return race.inspect(filename);
    };

    assert.throws(
        () => new PluginDataRepository(inspect).prepareDatabase(database, []),
        (error) => error === denied,
    );
    assert.equal(calls, 2);
});

test('a second zero-link observation is rejected without another retry', (t) => {
    const { database } = fixture(t);
    const sidecar = database + '-journal';
    fs.writeFileSync(sidecar, 'temporary SQLite state');
    let calls = 0;
    const inspect = (filename) => {
        const info = fs.lstatSync(filename);
        if (filename === sidecar) {
            calls++;
            info.nlink = 0;
        }
        return info;
    };

    assert.throws(
        () => new PluginDataRepository(inspect).prepareDatabase(database, []),
        /regular and non-linked/,
    );
    assert.equal(calls, 2);
});

test('a zero-link primary database is rejected without reinspection', (t) => {
    const { database } = fixture(t);
    const race = unlinkDuringInspection(database);

    assert.throws(
        () => new PluginDataRepository(race.inspect).prepareDatabase(database, []),
        /regular and non-linked/,
    );
    assert.equal(race.calls(), 1);
});

test('initial linked or non-file sidecars are rejected without reinspection', async (t) => {
    for (const kind of ['symlink', 'hardlink', 'directory']) {
        await t.test(kind, (t) => {
            const { root, database } = fixture(t);
            const sidecar = database + '-journal';
            const other = path.join(root, 'unrelated');
            fs.writeFileSync(other, 'preserved unrelated content');
            if (kind === 'symlink') fs.symlinkSync(other, sidecar);
            if (kind === 'hardlink') fs.linkSync(other, sidecar);
            if (kind === 'directory') fs.mkdirSync(sidecar);
            let calls = 0;
            const inspect = (filename) => {
                if (filename === sidecar) calls++;
                return fs.lstatSync(filename);
            };

            assert.throws(
                () => new PluginDataRepository(inspect).prepareDatabase(database, []),
                /regular and non-linked/,
            );
            assert.equal(calls, 1);
        });
    }
});
