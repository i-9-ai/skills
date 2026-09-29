// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { period } from './SkillEvidenceFixture.mjs';

export const memoryQuery = { ...period, collection: 'demo' };
export const read = (options = {}) => ({
    event_id: randomUUID(),
    collection: 'demo',
    skill: 'example-skill',
    revision: 'revision-a',
    session: randomUUID(),
    occurred_at: '2026-09-10T00:00:00.000Z',
    ...options,
});
export const telemetry = (eventType = 'skill.read.observed', options = {}) => ({
    schema_version: 1,
    event_type: eventType,
    event_id: randomUUID(),
    correlation_id: randomUUID(),
    occurred_at: '2026-09-15T00:00:00.000Z',
    source_host: 'manual',
    source_adapter: 'test',
    session: randomUUID(),
    payload:
        eventType === 'session.started'
            ? {}
            : {
                  collection: 'demo',
                  skill: 'example-skill',
                  revision: 'revision-a',
              },
    ...options,
});
