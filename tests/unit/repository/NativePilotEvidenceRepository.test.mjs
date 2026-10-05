import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    closeSync,
    ftruncateSync,
    mkdirSync,
    mkdtempSync,
    openSync,
    realpathSync,
    rmSync,
    writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativePilotConfiguration } from '../../../src/config/NativePilotConfiguration.ts';
import { NativePilotEvidenceRepository } from '../../../src/repository/NativePilotEvidenceRepository.ts';
import { NativePilotObservationEvidenceRepository } from '../../../src/repository/NativePilotObservationEvidenceRepository.ts';
import { NativePilotContainerWorkerRepository } from '../../../src/repository/NativePilotContainerWorkerRepository.ts';
import { containerFixture } from '../../helpers/NativePilotContainerFixture.mjs';

function owned(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-native-evidence-bound-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    return root;
}

function retained(root, path, bytes, kind) {
    const fd = openSync(join(root, path), 'wx', 0o600);
    const hash = createHash('sha256'),
        chunk = Buffer.alloc(65_536, 'x');
    try {
        let remaining = bytes;
        while (remaining) {
            const selected = chunk.subarray(0, Math.min(chunk.length, remaining));
            const count = writeSync(fd, selected);
            hash.update(selected.subarray(0, count));
            remaining -= count;
        }
    } finally {
        closeSync(fd);
    }
    return { path, bytes, sha256: hash.digest('hex'), kind };
}

test('retention bytes above the ordinary cap verify without admitting another file kind or a wrong digest', (t) => {
    const root = owned(t),
        repository = new NativePilotEvidenceRepository();
    const receipt = retained(
        root,
        'encoded-export.json',
        NativePilotConfiguration.limits.file_bytes + 1,
        'retention',
    );
    repository.verify(root, [receipt]);
    assert.throws(
        () => repository.verify(root, [{ ...receipt, kind: 'state' }]),
        /file-kind byte bound/,
    );
    assert.throws(() => repository.verify(root, [{ ...receipt, kind: 'unrecognized' }]), /Unknown/);
    assert.throws(
        () => repository.verify(root, [{ ...receipt, sha256: '0'.repeat(64) }]),
        /receipt/,
    );
    assert.equal(
        new NativePilotObservationEvidenceRepository(root).read(receipt).length,
        receipt.bytes,
    );
});

test('encoded retention exact limit is hash-verified and its next byte is refused before file access', (t) => {
    const root = owned(t),
        repository = new NativePilotEvidenceRepository();
    const receipt = retained(
        root,
        'export-exact.json',
        NativePilotConfiguration.retention.encoded_bytes,
        'retention',
    );
    repository.verify(root, [receipt]);
    assert.throws(
        () => repository.verify(root, [{ ...receipt, bytes: receipt.bytes + 1 }]),
        /file-kind byte bound/,
    );
});

test('worker and inert export decoder agree on the ordinary 32 MiB per-entry class', (t) => {
    const f = containerFixture(t);
    f.controller.files.stage();
    const worker = new NativePilotContainerWorkerRepository(f.controller.files.request);
    const root = join(f.root, 'retained-ordinary');
    mkdirSync(root);
    const fd = openSync(join(root, 'ordinary'), 'wx', 0o600);
    const limit = NativePilotConfiguration.retention.file_bytes;
    try {
        ftruncateSync(fd, limit);
        assert.equal(worker.snapshot(root, false)[0].bytes, limit);
        ftruncateSync(fd, limit + 1);
        assert.throws(() => worker.snapshot(root, true), /oversized retained file/);
    } finally {
        closeSync(fd);
    }
    const decoder = new NativePilotObservationEvidenceRepository(root);
    assert.throws(
        () =>
            decoder.decode({
                path: 'ordinary',
                kind: 'file',
                bytes: limit + 1,
                sha256: '0'.repeat(64),
                target: null,
                base64: '',
            }),
        /projection_export_file/,
    );
});

test('one shared control reserve cannot be spent once for retention and again for ordinary evidence', (t) => {
    const root = owned(t),
        repository = new NativePilotEvidenceRepository();
    const MiB = 1_048_576;
    const make = (retention, ordinary) => {
        const rows = [];
        let index = 0;
        for (const [kind, total, limit] of [
            ['retention', retention, 96 * MiB],
            ['state', ordinary, 32 * MiB],
        ]) {
            let remaining = total;
            while (remaining) {
                const bytes = Math.min(remaining, limit);
                rows.push({ path: 'ledger-' + index++, kind, bytes, sha256: '0'.repeat(64) });
                remaining -= bytes;
            }
        }
        return rows;
    };
    let reads = 0;
    repository.inventory.file = (path, limit) => {
        reads++;
        const row = current.find((row) => join(root, row.path) === path);
        assert.ok(row.bytes <= limit);
        return { bytes: row.bytes, sha256: row.sha256, executable: false };
    };
    let current = make(96 * MiB, 256 * MiB);
    repository.verify(root, current);
    current = make(128 * MiB, 224 * MiB);
    repository.verify(root, current);
    reads = 0;
    current = make(128 * MiB, 256 * MiB);
    assert.throws(() => repository.verify(root, current), /phase exceeds/);
    assert.equal(reads, 0);
    current = make(96 * MiB, 256 * MiB + 1);
    assert.throws(() => repository.verify(root, current), /phase exceeds/);
    assert.equal(reads, 0);
});

test('controller refuses an oversized file declaration or encoded payload before decoding', (t) => {
    const f = containerFixture(t);
    f.controller.files.stage();
    for (const [bytes, base64] of [
        [NativePilotConfiguration.retention.file_bytes + 1, ''],
        [0, 'eA=='],
    ]) {
        const bundle = f.bundle();
        Object.assign(bundle.roots[0].entries[0], { bytes, base64 });
        assert.throws(
            () => f.controller.files.retain(JSON.stringify(bundle)),
            /Invalid retained file/,
        );
    }
});
