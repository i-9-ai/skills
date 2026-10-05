import assert from 'node:assert/strict';
import {
    appendFileSync,
    linkSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    renameSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { NativePilotConfiguration } from '../../../src/config/NativePilotConfiguration.ts';
import {
    NativePilotInventoryRepository,
    pilotDigest,
} from '../../../src/repository/NativePilotInventoryRepository.ts';

function fixture(t) {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'i9-loaded-json-read-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const repository = new NativePilotInventoryRepository();
    const file = join(root, 'inventory.json');
    const put = (text) => {
        writeFileSync(file, text);
        return { bytes: Buffer.byteLength(text), sha256: pilotDigest(text) };
    };
    return { root, repository, file, put };
}

function sizedJson(bytes) {
    const prefix = '{"padding":"';
    const suffix = '"}';
    return prefix + ' '.repeat(bytes - prefix.length - suffix.length) + suffix;
}

test('generic metadata keeps its exact 1 MiB cap while loaded evidence has a separate fixed cap', (t) => {
    const { repository, file, put } = fixture(t);
    const limit = 1_048_576;
    const receipt = put(sizedJson(limit));
    assert.equal(repository.readJson(file).padding.length, limit - 14);
    appendFileSync(file, ' ');
    assert.throws(() => repository.readJson(file), /bounded ordinary file/);
    const extended = readFileSync(file);
    assert.equal(
        repository.readLoadedInventoryJson(file, {
            bytes: receipt.bytes + 1,
            sha256: pilotDigest(extended),
        }).padding.length,
        limit - 14,
    );
    assert.equal(NativePilotConfiguration.limits.output_bytes, limit);
    assert.equal(NativePilotConfiguration.limits.observe_ms, 60_000);
    assert.equal(NativePilotConfiguration.observation.native_lifetime_ms, 40_000);
});

test('loaded reader accepts exactly 32 MiB and rejects the next byte even with a smaller claimed size', (t) => {
    const { repository, file, put } = fixture(t);
    const limit = NativePilotConfiguration.limits.loaded_inventory_bytes;
    assert.equal(limit, 33_554_432);
    const receipt = put(sizedJson(limit));
    assert.equal(repository.readLoadedInventoryJson(file, receipt).padding.length, limit - 14);
    appendFileSync(file, ' ');
    assert.throws(
        () => repository.readLoadedInventoryJson(file, { ...receipt, bytes: limit + 1 }),
        /bounded verified evidence receipt/,
    );
    assert.throws(() => repository.readLoadedInventoryJson(file, receipt), /bounded ordinary file/);
});

test('malformed or contradictory evidence receipts cannot authorize parsing', (t) => {
    const { repository, file, put } = fixture(t);
    const receipt = put('{"known":true}');
    for (const expected of [
        undefined,
        null,
        { ...receipt, bytes: -1 },
        { ...receipt, bytes: Number.NaN },
        { ...receipt, bytes: Number.MAX_SAFE_INTEGER + 1 },
        { ...receipt, sha256: receipt.sha256.toUpperCase() },
        { ...receipt, sha256: 'invalid' },
    ])
        assert.throws(
            () => repository.readLoadedInventoryJson(file, expected),
            /bounded verified evidence receipt/,
        );
    assert.throws(
        () => repository.readLoadedInventoryJson(file, { ...receipt, bytes: receipt.bytes - 1 }),
        /differ from their verified evidence receipt/,
    );
    assert.throws(
        () =>
            repository.readLoadedInventoryJson(file, {
                ...receipt,
                sha256: pilotDigest('different'),
            }),
        /differ from their verified evidence receipt/,
    );
    const invalid = put('not JSON');
    assert.throws(() => repository.readLoadedInventoryJson(file, invalid), SyntaxError);
});

test('neither JSON route follows file aliases or accepts multiply linked files', (t) => {
    const { root, repository, file, put } = fixture(t);
    const receipt = put('{"known":true}');
    const alias = join(root, 'alias.json');
    symlinkSync('inventory.json', alias);
    for (const read of [
        () => repository.readJson(alias),
        () => repository.readLoadedInventoryJson(alias, receipt),
    ])
        assert.throws(read, /bounded ordinary file/);

    linkSync(file, join(root, 'hardlink.json'));
    assert.throws(() => repository.readJson(file), /bounded ordinary file/);
    assert.throws(() => repository.readLoadedInventoryJson(file, receipt), /bounded ordinary file/);
});

test('loaded evidence rejects a linked parent before opening the selected file', (t) => {
    const { root, repository } = fixture(t);
    const actual = join(root, 'actual');
    mkdirSync(actual);
    const content = '{"known":true}';
    writeFileSync(join(actual, 'inventory.json'), content);
    const alias = join(root, 'parent');
    symlinkSync('actual', alias);
    assert.throws(
        () =>
            repository.readLoadedInventoryJson(join(alias, 'inventory.json'), {
                bytes: Buffer.byteLength(content),
                sha256: pilotDigest(content),
            }),
        /canonical|linked/i,
    );
});

for (const route of ['generic', 'loaded'])
    test(`${route} JSON rejects an identity replacement after the first byte verification`, (t) => {
        const { repository, file, put } = fixture(t);
        const content = '{"known":true}';
        const receipt = put(content);
        const original = repository.file.bind(repository);
        t.mock.method(repository, 'file', (path, limit) => {
            const observed = original(path, limit);
            renameSync(path, path + '.before');
            writeFileSync(path, content);
            return observed;
        });
        assert.throws(
            () =>
                route === 'loaded'
                    ? repository.readLoadedInventoryJson(file, receipt)
                    : repository.readJson(file),
            /changed while opening/,
        );
    });

for (const route of ['generic', 'loaded'])
    test(`${route} JSON rejects a same-length in-place write after the first byte verification`, (t) => {
        const { repository, file, put } = fixture(t);
        const content = '{"known":true}';
        const replacement = '{"known":null}';
        assert.equal(Buffer.byteLength(content), Buffer.byteLength(replacement));
        const receipt = put(content);
        const original = repository.file.bind(repository);
        t.mock.method(repository, 'file', (path, limit) => {
            const observed = original(path, limit);
            writeFileSync(path, replacement);
            return observed;
        });
        assert.throws(
            () =>
                route === 'loaded'
                    ? repository.readLoadedInventoryJson(file, receipt)
                    : repository.readJson(file),
            /changed while opening|changed while reading/,
        );
    });
