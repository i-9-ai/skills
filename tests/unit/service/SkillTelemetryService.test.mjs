import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SkillTelemetryService } from '../../../src/service/SkillTelemetryService.ts';
import { SkillReadRepository } from '../../../src/repository/SkillReadRepository.ts';

test('diagnostic destinations and rotation archives cannot change selected database/input files', async (t) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'i9-log-ownership-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const db = path.join(root, 'usage.db');
    new SkillReadRepository(db).close();
    const event = {
        schema_version: 1,
        event_type: 'session.started',
        event_id: randomUUID(),
        correlation_id: randomUUID(),
        occurred_at: '2026-09-19T00:00:00.000Z',
        source_host: 'manual',
        source_adapter: 'cli',
        session: 'opaque',
        payload: {},
    };
    const input = path.join(root, 'event.json');
    fs.writeFileSync(input, JSON.stringify(event));
    const beforeDb = fs.readFileSync(db);
    const beforeInput = fs.readFileSync(input);
    const alias = path.join(root, 'alias');
    fs.symlinkSync(root, alias);
    for (const log of [
        db,
        db + '-wal',
        db + '-shm',
        db + '-journal',
        input,
        path.join(alias, 'usage.db'),
        path.join(alias, 'event.json'),
    ]) {
        await assert.rejects(new SkillTelemetryService().record(db, input, log), /overlap/);
        assert.deepEqual(fs.readFileSync(db), beforeDb);
        assert.deepEqual(fs.readFileSync(input), beforeInput);
    }
    const log = path.join(root, 'diagnostic.jsonl');
    fs.writeFileSync(log, 'x'.repeat(1_048_576));
    for (const suffix of ['.1', '.2', '.3']) {
        const rotatedDb = log + suffix;
        fs.copyFileSync(db, rotatedDb);
        await assert.rejects(new SkillTelemetryService().record(rotatedDb, input, log), /overlap/);
        assert.deepEqual(fs.readFileSync(rotatedDb), beforeDb);
        assert.equal(fs.statSync(log).size, 1_048_576);
        fs.unlinkSync(rotatedDb);
        fs.copyFileSync(input, rotatedDb);
        await assert.rejects(new SkillTelemetryService().record(db, rotatedDb, log), /overlap/);
        assert.deepEqual(fs.readFileSync(rotatedDb), beforeInput);
        assert.deepEqual(fs.readFileSync(db), beforeDb);
        fs.unlinkSync(rotatedDb);
    }
    const missingDb = path.join(root, 'new.db');
    await assert.rejects(
        new SkillTelemetryService().record(missingDb, input, missingDb + '-journal'),
        /overlap/,
    );
    assert.ok(!fs.existsSync(missingDb));
    const upperLog = path.join(root, 'TELEMETRY.LOG');
    fs.writeFileSync(upperLog, 'x'.repeat(1_048_576));
    const lowerDb = path.join(root, 'telemetry.log.3');
    await assert.rejects(new SkillTelemetryService().record(lowerDb, input, upperLog), /overlap/);
    assert.ok(!fs.existsSync(lowerDb));
    assert.equal(fs.statSync(upperLog).size, 1_048_576);
    await assert.rejects(
        new SkillTelemetryService().record(db, input, path.join(root, 'USAGE.DB')),
        /overlap/,
    );
    assert.deepEqual(fs.readFileSync(db), beforeDb);
    const upperSidecar = path.join(root, 'FUTURE.DB-WAL');
    await assert.rejects(
        new SkillTelemetryService().record(path.join(root, 'future.db'), input, upperSidecar),
        /overlap/,
    );
    assert.ok(!fs.existsSync(path.join(root, 'future.db')));
    const unicodeLog = path.join(root, 'stra\u00dfe.log');
    fs.writeFileSync(unicodeLog, 'x'.repeat(1_048_576));
    const foldedDb = path.join(root, 'STRASSE.LOG.3');
    await assert.rejects(
        new SkillTelemetryService().record(foldedDb, input, unicodeLog),
        /ASCII|overlap/,
    );
    assert.ok(!fs.existsSync(foldedDb));
    assert.equal(fs.statSync(unicodeLog).size, 1_048_576);
});
