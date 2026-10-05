import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
    existsSync,
    linkSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { NativePilotStateSnapshotRepository } from '../../../src/repository/NativePilotStateSnapshotRepository.ts';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-native-state-fixture-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = join(root, 'home');
    const outputRoot = join(root, 'output');
    mkdirSync(home);
    mkdirSync(outputRoot);
    return {
        home,
        outputRoot,
        repository: new NativePilotStateSnapshotRepository({ home, outputRoot }),
    };
}
function update(repository, sql) {
    const database = new DatabaseSync(repository.databasePath);
    try {
        database.exec(sql);
    } finally {
        database.close();
    }
}

test('absent read-only snapshots never create source storage and distinguish the absence branch', (t) => {
    const { home, repository } = fixture(t);
    const before = repository.snapshot('before');
    const after = repository.snapshot('after');
    assert.equal(existsSync(join(home, '.agents')), false);
    assert.equal(before.exists, false);
    assert.equal(repository.readOnlyPreservation(before, after), 'absence_preserved');
    assert.throws(() => repository.snapshot('before'), /EEXIST/);
});

test('explicit baseline seed retains original payload and unchanged read-only source bytes', (t) => {
    const { outputRoot, repository } = fixture(t);
    const id = randomUUID();
    repository.seed(id);
    const original = readFileSync(repository.databasePath);
    const before = repository.snapshot('before');
    const after = repository.snapshot('after');
    assert.equal(before.status, 'captured');
    assert.equal(before.migrations.length, 3);
    assert.equal(before.tables.find((table) => table.name === 'usage_events').rows.length, 1);
    assert.equal(before.tables.find((table) => table.name === 'usage_reads').rows.length, 1);
    assert.deepEqual(readFileSync(repository.databasePath), original);
    assert.equal(repository.readOnlyPreservation(before, after), 'existing_unchanged');
    for (const artifact of repository.artifacts('before')) {
        const bytes = readFileSync(join(outputRoot, artifact.path));
        assert.equal(bytes.length, artifact.bytes);
        assert.equal(sha(bytes), artifact.sha256);
    }
    assert.equal(
        sha(readFileSync(join(outputRoot, 'before-sqlite-copy/skills-usage.db'))),
        sha(original),
    );
    const copy = new DatabaseSync(join(outputRoot, 'before-sqlite-copy/skills-usage.db'), {
        readOnly: true,
    });
    try {
        const row = copy.prepare('SELECT event_id,envelope FROM usage_events').get();
        assert.equal(row.event_id, id);
        assert.deepEqual(JSON.parse(row.envelope), {
            fixture: 'native-pilot-prior-history',
            run_id: id,
            value: 'preserve-original-payload',
        });
    } finally {
        copy.close();
    }
    assert.throws(() => repository.seed(randomUUID()), /preexisting/);
    assert.deepEqual(readFileSync(repository.databasePath), original);
});

test('a supported explicit A-to-B schema upgrade retains prior rows but is not read-only or native rollback proof', (t) => {
    const { repository } = fixture(t);
    repository.seed(randomUUID());
    const before = repository.snapshot('before');
    const qualitySql = readFileSync(
        new URL('../../fixtures/native-pilot/quality-v4.sql', import.meta.url),
        'utf8',
    );
    assert.equal(
        sha(qualitySql),
        '0a32f907ceb2cd1ac5214a9d8e72723274a7575cd7c3c9a622caf9c36c3e33b3',
    );
    assert.equal(typeof qualitySql, 'string');
    const database = new DatabaseSync(repository.databasePath);
    try {
        database.exec(qualitySql);
        database.prepare('INSERT INTO usage_migrations VALUES(?,?)').run(4, sha(qualitySql));
    } finally {
        database.close();
    }
    const after = repository.snapshot('after');
    assert.equal(after.status, 'captured');
    assert.equal(after.migrations.length, 4);
    assert.equal(repository.preserved(before, after), true);
    assert.equal(repository.readOnlyPreservation(before, after), 'blocked');
    assert.equal(Object.hasOwn(after, 'native_rollback_compatible'), false);
});

test('retained report substitution is caught before returning its receipt', (t) => {
    const { repository, outputRoot } = fixture(t);
    repository.snapshot('before');
    const path = join(outputRoot, 'before-state.json');
    const original = readFileSync(path, 'utf8');
    writeFileSync(path, original.replace('absent', 'ABSENT'));
    assert.throws(() => repository.artifacts('before'), /artifact_changed/);
});

test('writer append preserves prior history but cannot pass the read-only unchanged gate', (t) => {
    const { repository } = fixture(t);
    repository.seed(randomUUID());
    const before = repository.snapshot('before');
    update(
        repository,
        "INSERT INTO usage_events VALUES('new-event','fixture','2026-10-04','fixture','new-payload')",
    );
    const after = repository.snapshot('after');
    assert.equal(repository.preserved(before, after), true);
    assert.equal(repository.readOnlyPreservation(before, after), 'blocked');
});

test('changed or deleted payload does not pass prior-history preservation', (t) => {
    const { repository } = fixture(t);
    repository.seed(randomUUID());
    const before = repository.snapshot('before');
    update(repository, "UPDATE usage_events SET envelope='changed-original-payload'");
    const changed = repository.snapshot('changed');
    assert.equal(repository.preserved(before, changed), false);
    update(repository, 'DELETE FROM usage_events');
    const removed = repository.snapshot('removed');
    assert.equal(repository.preserved(before, removed), false);
});

test('newer or altered migration ledger is retained blocked without resetting source', (t) => {
    const { outputRoot, repository } = fixture(t);
    repository.seed(randomUUID());
    update(
        repository,
        "INSERT INTO usage_migrations VALUES(9,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')",
    );
    const original = readFileSync(repository.databasePath);
    const snapshot = repository.snapshot('newer');
    assert.equal(snapshot.status, 'blocked');
    assert.deepEqual(readFileSync(repository.databasePath), original);
    assert.equal(
        sha(readFileSync(join(outputRoot, 'newer-sqlite-copy/skills-usage.db'))),
        sha(original),
    );
    assert.equal(repository.readOnlyPreservation(snapshot, snapshot), 'blocked');
});

test('unsafe source links, hardlinks and orphan sidecars are refused without opening a database', (t) => {
    const { home, outputRoot, repository } = fixture(t);
    const external = join(outputRoot, 'external');
    writeFileSync(external, 'inert sentinel');
    mkdirSync(join(home, '.agents'));
    symlinkSync(external, repository.databasePath);
    assert.throws(() => repository.snapshot('linked'), /unsafe_file/);
    rmSync(repository.databasePath);
    linkSync(external, repository.databasePath);
    assert.throws(() => repository.snapshot('hardlinked'), /unsafe_file/);
    rmSync(repository.databasePath);
    writeFileSync(repository.databasePath + '-wal', 'not a database');
    assert.throws(() => repository.seed(randomUUID()), /orphan_sidecar/);
    assert.equal(existsSync(repository.databasePath), false);
    assert.equal(readFileSync(external, 'utf8'), 'inert sentinel');
});

test('WAL snapshots retain main/WAL bytes and query only a separate disposable copy', (t) => {
    const { outputRoot, repository } = fixture(t);
    repository.seed(randomUUID());
    const writer = new DatabaseSync(repository.databasePath);
    t.after(() => writer.close());
    writer.exec(
        "PRAGMA journal_mode=WAL; INSERT INTO usage_events VALUES('wal-event','fixture','2026-10-04','fixture','wal-payload')",
    );
    const original = new Map(
        ['', '-wal', '-shm'].map((suffix) => [
            suffix,
            readFileSync(repository.databasePath + suffix),
        ]),
    );
    const snapshot = repository.snapshot('wal');
    assert.equal(snapshot.status, 'captured');
    assert.equal(snapshot.tables.find((table) => table.name === 'usage_events').rows.length, 2);
    for (const [suffix, bytes] of original) {
        assert.deepEqual(readFileSync(repository.databasePath + suffix), bytes);
        assert.deepEqual(
            readFileSync(join(outputRoot, 'wal-sqlite-copy/skills-usage.db' + suffix)),
            bytes,
        );
    }
});

test('copied valid ledger and table names cannot hide changed CREATE TABLE SQL', (t) => {
    const { repository, outputRoot } = fixture(t);
    repository.seed(randomUUID());
    const before = repository.snapshot('before');
    update(repository, 'ALTER TABLE usage_events ADD COLUMN unexpected_payload TEXT');
    const original = readFileSync(repository.databasePath);
    const after = repository.snapshot('altered');
    assert.equal(after.schema_version, 2);
    assert.equal(after.status, 'blocked');
    assert.deepEqual(
        after.schema.filter((s) => s.type === 'table').map((s) => s.name),
        before.schema.filter((s) => s.type === 'table').map((s) => s.name),
    );
    assert.notEqual(
        after.schema.find((s) => s.name === 'usage_events').sql_sha256,
        before.schema.find((s) => s.name === 'usage_events').sql_sha256,
    );
    assert.deepEqual(readFileSync(repository.databasePath), original);
    assert.deepEqual(
        readFileSync(join(outputRoot, 'altered-sqlite-copy/skills-usage.db')),
        original,
    );
    assert.equal(repository.preserved(before, after), false);
});

test('removed issued index and added trigger are unsupported even with unchanged migration checksums', (t) => {
    const { repository } = fixture(t);
    repository.seed(randomUUID());
    update(repository, 'DROP INDEX usage_events_period');
    assert.equal(repository.snapshot('removed-index').status, 'blocked');
    update(
        repository,
        'CREATE INDEX usage_events_period ON usage_events(occurred_at, event_type); CREATE TRIGGER unexpected_trigger AFTER INSERT ON usage_events BEGIN SELECT 1; END',
    );
    const original = readFileSync(repository.databasePath);
    assert.equal(repository.snapshot('added-trigger').status, 'blocked');
    assert.deepEqual(readFileSync(repository.databasePath), original);
});
