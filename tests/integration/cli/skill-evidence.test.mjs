// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { SkillEvidenceService } from '../../../src/service/SkillEvidenceService.ts';
import {
    fixture,
    lifecycle,
    follow,
    catalog,
    member,
    period,
    reversed,
} from '../../unit/fixture/SkillEvidenceFixture.mjs';

const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));
const service = new SkillEvidenceService();
const periodFlags = ['--from', period.from, '--until', period.until];
const request = (name, args) => ({ method: 'tools/call', params: { name, arguments: args } });
const messages = (calls) =>
    [
        ...[
            { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
            { jsonrpc: '2.0', method: 'notifications/initialized' },
        ],
        ...calls.map((call, index) => ({ jsonrpc: '2.0', id: index + 2, ...call })),
    ]
        .map(JSON.stringify)
        .join('\n') + '\n';

function run(target, args, input) {
    return spawnSync(process.execPath, [launcher, ...args], {
        cwd: target.root,
        env: target.environment,
        input,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 3 * 1024 * 1024,
    });
}
function okay(result) {
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}
function mcp(target, calls) {
    const result = run(target, ['mcp', 'serve', '--db', target.database], messages(calls));
    assert.equal(result.status, 0, result.stderr);
    return result.stdout
        .trim()
        .split('\n')
        .map(JSON.parse)
        .slice(1)
        .map((row) => row.result);
}
function concurrent(target, args, input) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [launcher, ...args], {
            cwd: target.root,
            env: target.environment,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '',
            stderr = '';
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error('Synthetic writer exceeded its test deadline'));
        }, 15000);
        child.stdout.on('data', (chunk) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk;
        });
        child.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.on('close', (status) => {
            clearTimeout(timeout);
            resolve({ status, stdout, stderr });
        });
        child.stdin.end(input);
    });
}
const recordArgs = (database) => ['telemetry', 'record', '--db', database, '--file', '-'];

test('CLI and MCP share canonical lifecycle/catalog writes and every bounded query', (t) => {
    const target = fixture(t);
    const route = lifecycle('skill.routed', { occurred_at: '2026-09-18T00:00:00.000Z' });
    assert.equal(
        okay(run(target, recordArgs(target.database), JSON.stringify(route))).recorded,
        true,
    );
    const activation = follow(route, 'skill.activated', '2026-09-19T00:00:00.000Z');
    const peer = {
        ...route,
        event_id: randomUUID(),
        payload: {
            ...route.payload,
            skill: 'peer',
            source: { ...route.payload.source, package_path: 'skills/peer' },
        },
    };
    const results = mcp(target, [
        request('skill_lifecycle_record', reversed(route)),
        request('skill_lifecycle_record', activation),
        request('skill_lifecycle_record', peer),
    ]);
    assert.deepEqual(
        results.map((row) => row.structuredContent.recorded),
        [false, true, true],
    );
    okay(
        run(
            target,
            recordArgs(target.database),
            JSON.stringify(follow(activation, 'skill.completed', '2026-09-20T00:00:00.000Z')),
        ),
    );
    const observation = catalog([member(), member('peer')], { occurred_at: period.from });
    const receipt = okay(
        run(
            target,
            ['telemetry', 'catalog-observe', '--db', target.database, '--file', '-'],
            JSON.stringify(observation),
        ),
    );
    assert.equal(receipt.added, 2);
    const retry = reversed(observation);
    retry.payload.skills.reverse();
    assert.equal(
        mcp(target, [request('skill_catalog_observe', retry)])[0].structuredContent.recorded,
        false,
    );
    const before = fs.readFileSync(target.database);
    for (const [command, name] of [
        ['lifecycle', 'skill_lifecycle_metrics'],
        ['overlap', 'skill_routing_overlap'],
        ['inactivity', 'skill_catalog_inactivity'],
        ['catalog-history', 'skill_catalog_history'],
    ]) {
        const cli = okay(
            run(target, ['telemetry', command, '--db', target.database, ...periodFlags]),
        );
        assert.deepEqual(mcp(target, [request(name, period)])[0].structuredContent, cli);
    }
    const detail = okay(
        run(target, [
            'telemetry',
            'catalog-history',
            '--db',
            target.database,
            ...periodFlags,
            '--observation-sequence',
            String(receipt.sequence),
            '--limit',
            '1',
        ]),
    );
    assert.deepEqual(
        mcp(target, [
            request('skill_catalog_history', {
                ...period,
                observation_sequence: receipt.sequence,
                limit: 1,
            }),
        ])[0].structuredContent,
        detail,
    );
    assert.equal(detail.truncated, true);
    assert.deepEqual(fs.readFileSync(target.database), before);
    const collision = mcp(target, [
        request('skill_read_record', {
            event_id: route.event_id,
            collection: 'demo',
            skill: 'example-skill',
            revision: 'unknown',
            session: 'legacy',
            occurred_at: route.occurred_at,
        }),
    ])[0];
    assert.equal(collision.structuredContent.error.code, 'evidence_conflict');
    assert.deepEqual(fs.readFileSync(target.database), before);
});

test('invalid CLI bytes and MCP private fields fail before storage and never echo input', (t) => {
    const target = fixture(t);
    target.database = path.join(target.root, 'uncreated', 'usage.db');
    const secret = ['private', randomUUID()].join('-');
    for (const input of [
        JSON.stringify({ ...lifecycle(), prompt: secret }),
        '{"schema_version":2,"schema_version":2}',
        Buffer.from([0xc3, 0x28]),
        ' '.repeat(8193),
    ]) {
        const result = run(target, recordArgs(target.database), input);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Invalid input/);
        assert.equal(result.stderr.includes(secret), false);
        assert.equal(result.stderr.includes(target.database), false);
    }
    const result = run(
        target,
        ['telemetry', 'catalog-observe', '--db', target.database, '--file', '-'],
        ' '.repeat(262145),
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid input/);
    const responses = mcp(target, [
        request('skill_lifecycle_record', { ...lifecycle(), prompt: secret }),
        request('skill_catalog_observe', { ...catalog(), task: secret }),
        request('skill_lifecycle_metrics', { ...period, database: secret }),
    ]);
    for (const response of responses)
        assert.equal(response.structuredContent.error.code, 'invalid_input');
    assert.equal(JSON.stringify(responses).includes(secret), false);
    assert.equal(fs.existsSync(path.dirname(target.database)), false);
});

test('independent lifecycle writers serialize distinct events, identical retries and conflicts', async (t) => {
    const target = fixture(t);
    const distinct = await Promise.all(
        Array.from({ length: 4 }, () =>
            concurrent(target, recordArgs(target.database), JSON.stringify(lifecycle())),
        ),
    );
    assert.ok(distinct.every((result) => okay(result).recorded));
    const duplicate = lifecycle();
    const retries = await Promise.all(
        [duplicate, reversed(duplicate)].map((event) =>
            concurrent(target, recordArgs(target.database), JSON.stringify(event)),
        ),
    );
    assert.deepEqual(retries.map((result) => okay(result).recorded).sort(), [false, true]);
    const conflict = lifecycle();
    const contenders = [
        conflict,
        {
            ...conflict,
            payload: {
                ...conflict.payload,
                source: { ...conflict.payload.source, package_sha256: 'e'.repeat(64) },
            },
        },
    ];
    const conflicts = await Promise.all(
        contenders.map((event) =>
            concurrent(target, recordArgs(target.database), JSON.stringify(event)),
        ),
    );
    assert.equal(conflicts.filter((result) => result.status === 0).length, 1);
    assert.match(conflicts.find((result) => result.status !== 0).stderr, /Evidence conflicts/);
    assert.equal(
        service
            .query(target.database, 'lifecycle', period)
            .rows.reduce((total, row) => total + row.activated_attempts, 0),
        6,
    );
    const db = new DatabaseSync(target.database, { readOnly: true });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM usage_events').get().count, 6);
    db.close();
});

test('a locked evidence writer fails within the busy bound without partial rows or private paths', (t) => {
    const target = fixture(t);
    service.recordLifecycle(target.database, lifecycle());
    const db = new DatabaseSync(target.database);
    const before = fs.readFileSync(target.database);
    db.exec('BEGIN IMMEDIATE');
    try {
        const start = performance.now();
        const result = run(target, recordArgs(target.database), JSON.stringify(lifecycle()));
        const elapsed = performance.now() - start;
        assert.notEqual(result.status, 0);
        assert.ok(elapsed >= 4500 && elapsed < 12000, `bounded busy failure took ${elapsed}ms`);
        assert.match(result.stderr, /Usage operation unavailable/);
        assert.equal(result.stderr.includes(target.database), false);
    } finally {
        db.exec('ROLLBACK');
        db.close();
    }
    assert.deepEqual(fs.readFileSync(target.database), before);
    assert.equal(service.query(target.database, 'lifecycle', period).rows[0].activated_attempts, 1);
});

test('catalog aggregate CLI reset preserves the complete dedicated evidence database', (t) => {
    const target = fixture(t);
    const output = path.join(target.root, 'index');
    fs.mkdirSync(output);
    target.database = path.join(output, 'skills-catalog.db');
    service.recordLifecycle(target.database, lifecycle());
    service.recordCatalog(target.database, catalog());
    const sourceRoot = path.join(target.root, 'source');
    fs.mkdirSync(sourceRoot);
    const source = path.join(sourceRoot, 'skills-catalog.json');
    fs.writeFileSync(
        source,
        JSON.stringify({
            schema_version: 1,
            skills: [
                {
                    name: 'example-skill',
                    path: 'skills/example-skill',
                    description: 'Synthetic catalog fixture.',
                    tags: [],
                },
            ],
        }),
    );
    const before = fs.readFileSync(target.database);
    const result = run(target, [
        'catalog',
        'aggregate',
        'rebuild',
        '--source',
        `demo=${source}`,
        '--output',
        output,
        '--format',
        'sqlite',
        '--reset-history',
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /dedicated evidence databases/);
    assert.deepEqual(fs.readFileSync(target.database), before);
    assert.deepEqual(fs.readdirSync(output), ['skills-catalog.db']);
});

test('catalog detail responses fail with a bounded error and can be paged below the MCP byte limit', (t) => {
    const target = fixture(t);
    const skills = Array.from({ length: 100 }, (_, index) =>
        member(`skill-${String(index).padStart(3, '0')}`, {
            package_path: `skills/${'p'.repeat(900)}/${index}`,
        }),
    );
    const first = catalog(skills, { occurred_at: period.from });
    first.payload.source.repository = `https://example.org/${'r'.repeat(1900)}`;
    service.recordCatalog(target.database, first);
    const second = {
        ...first,
        event_id: randomUUID(),
        occurred_at: '2026-09-02T00:00:00.000Z',
        payload: {
            ...first.payload,
            skills: skills.map((skill) => ({ ...skill, metadata_sha256: 'e'.repeat(64) })),
        },
    };
    assert.ok(Buffer.byteLength(JSON.stringify(second)) > 64 * 1024);
    const recorded = mcp(target, [request('skill_catalog_observe', second)]);
    const receipt = recorded[0].structuredContent;
    assert.equal(receipt.recorded, true);
    assert.equal(
        mcp(target, [request('skill_catalog_observe', second)])[0].structuredContent.recorded,
        false,
    );
    const query = { ...period, observation_sequence: receipt.sequence };
    const results = mcp(target, [
        request('skill_catalog_history', { ...query, limit: 100 }),
        request('skill_catalog_history', { ...query, limit: 1 }),
    ]);
    assert.equal(results[0].structuredContent.error.code, 'response_too_large');
    assert.equal(results[1].structuredContent.changes.length, 1);
    assert.equal(results[1].structuredContent.truncated, true);
});
