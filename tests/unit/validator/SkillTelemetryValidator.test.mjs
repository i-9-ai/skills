import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SkillTelemetryValidator } from '../../../src/validator/SkillTelemetryValidator.ts';

test('telemetry excludes unknown types, content and noncanonical identifiers', () => {
    const validator = new SkillTelemetryValidator();
    const event = {
        schema_version: 1,
        event_type: 'session.started',
        event_id: randomUUID(),
        correlation_id: randomUUID(),
        occurred_at: '2026-09-19T00:00:00.000Z',
        source_host: 'manual',
        source_adapter: 'test',
        session: 'opaque',
        payload: {},
    };
    assert.deepEqual(validator.event(event), event);
    for (const change of [
        { schema_version: 2 },
        { event_type: 'skill.activated' },
        { event_id: 'not-uuid' },
        { correlation_id: 'short' },
        { session: '/private/session' },
        { prompt: 'content' },
        { payload: { transcript: 'content' } },
        { occurred_at: '2026-09-19' },
        { source_host: 'bad/source' },
    ])
        assert.throws(() => validator.event({ ...event, ...change }));
    const read = {
        ...event,
        event_type: 'skill.read.observed',
        payload: { collection: 'demo', skill: 'skill-authoring', revision: 'unknown' },
    };
    assert.deepEqual(validator.event(read), read);
    assert.throws(() =>
        validator.event({ ...read, payload: { ...read.payload, path: '/private/file' } }),
    );
});
