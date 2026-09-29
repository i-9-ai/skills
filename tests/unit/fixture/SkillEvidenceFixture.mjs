// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const period = { from: '2026-09-01T00:00:00.000Z', until: '2026-10-01T00:00:00.000Z' };
export const source = {
    repository: 'https://example.org/skills',
    source_ref: null,
    resolved_git_sha: 'a'.repeat(40),
    package_path: 'skills/example-skill',
    package_sha256: 'b'.repeat(64),
};
export const lifecycle = (type = 'skill.activated', options = {}) => ({
    schema_version: 2,
    event_type: type,
    event_id: randomUUID(),
    correlation_id: randomUUID(),
    occurred_at: '2026-09-19T12:00:00.000Z',
    source_host: 'manual',
    source_adapter: 'test',
    session: randomUUID(),
    payload: { collection: 'demo', skill: 'example-skill', source: { ...source }, reason: null },
    ...options,
});
export const member = (skill = 'example-skill', options = {}) => ({
    skill,
    package_path: `skills/${skill}`,
    package_sha256: 'b'.repeat(64),
    metadata_sha256: 'c'.repeat(64),
    ...options,
});
export const catalog = (skills = [member()], options = {}) => ({
    ...lifecycle(),
    event_type: 'catalog.observed',
    session: null,
    occurred_at: '2026-08-31T00:00:00.000Z',
    payload: {
        collection: 'demo',
        source: {
            repository: source.repository,
            source_ref: null,
            resolved_git_sha: source.resolved_git_sha,
        },
        catalog_sha256: 'd'.repeat(64),
        skills,
    },
    ...options,
});
export const follow = (event, type, occurredAt, reason = null) => ({
    ...event,
    event_id: randomUUID(),
    event_type: type,
    occurred_at: occurredAt,
    payload: { ...event.payload, reason },
});
export const reversed = (value) =>
    Array.isArray(value)
        ? value.map(reversed)
        : value && typeof value === 'object'
          ? Object.fromEntries(
                Object.entries(value)
                    .reverse()
                    .map(([key, child]) => [key, reversed(child)]),
            )
          : value;
export function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-evidence-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    return {
        root,
        database: path.join(root, 'usage.db'),
        environment: {
            PATH: process.env.PATH,
            HOME: home,
            TMPDIR: root,
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: '/dev/null',
            NODE_OPTIONS: '--disable-warning=ExperimentalWarning',
        },
    };
}
