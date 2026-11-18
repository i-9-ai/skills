// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { fixture, period, lifecycle } from '../../unit/fixture/SkillEvidenceFixture.mjs';
import { SkillEvidenceService } from '../../../src/service/SkillEvidenceService.ts';
import { SkillRoutingPackageRepository } from '../../../src/repository/SkillRoutingPackageRepository.ts';

const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));

function prepare(t) {
    const target = fixture(t);
    const selections = ['alpha', 'beta'].map((skill) => {
        const directory = path.join(target.root, '.agents', 'skills', skill);
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(
            path.join(directory, 'SKILL.md'),
            `---\nname: ${skill}\ndescription: A synthetic routing package.\n---\n# Procedure\n\nProduce the requested synthetic result.\n`,
        );
        return { collection: 'project', path: directory };
    });
    const decision = {
        correlation_id: randomUUID(),
        session: randomUUID(),
        occurred_at: '2026-09-19T12:00:00.000Z',
        source_host: 'manual',
        source_adapter: 'explicit-routing',
        selections,
    };
    return { ...target, decision };
}

function run(target, args, input) {
    return spawnSync(process.execPath, [launcher, ...args], {
        cwd: target.root,
        env: target.environment,
        input: input === undefined ? undefined : JSON.stringify(input),
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 3 * 1024 * 1024,
    });
}
function okay(result) {
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}
const routeArgs = (database) => ['telemetry', 'route', '--db', database, '--file', '-'];
const overlapArgs = (database) => [
    'telemetry',
    'overlap',
    '--db',
    database,
    '--from',
    period.from,
    '--until',
    period.until,
];
function mcp(target, name, arguments_) {
    const messages =
        [
            { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
            { jsonrpc: '2.0', method: 'notifications/initialized' },
            {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: { name, arguments: arguments_ },
            },
        ]
            .map(JSON.stringify)
            .join('\n') + '\n';
    const result = spawnSync(
        process.execPath,
        [launcher, 'mcp', 'serve', '--db', target.database],
        {
            cwd: target.root,
            env: target.environment,
            input: messages,
            encoding: 'utf8',
            timeout: 15000,
        },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim().split('\n').map(JSON.parse).at(-1).result;
}

test('overview to explicit CLI decision, MCP retry and CLI/MCP overlap preserves one correlation per decision', (t) => {
    const target = prepare(t);
    const overview = run(target, [
        'context',
        'available-skills',
        '--project',
        target.root,
        '--no-global',
    ]);
    assert.equal(overview.status, 0, overview.stderr);
    assert.match(overview.stdout, /skill_routing_record/);
    assert.match(overview.stdout, /telemetry route --file decision.json/);
    assert.equal(fs.existsSync(target.database), false);
    const receipt = okay(run(target, routeArgs(target.database), target.decision));
    assert.equal(receipt.recorded, true);
    assert.equal(receipt.correlation_id, target.decision.correlation_id);
    assert.equal(new Set(receipt.events.map((event) => event.event_id)).size, 2);
    assert.deepEqual(
        receipt.events.map((event) => event.skill),
        ['alpha', 'beta'],
    );
    assert(receipt.events.every((event) => event.recorded && event.source.repository === null));
    const retry = mcp(target, 'skill_routing_record', {
        ...target.decision,
        selections: [...target.decision.selections].reverse(),
    });
    assert.equal(retry.structuredContent.recorded, false);
    const next = {
        ...target.decision,
        correlation_id: randomUUID(),
        selections: [target.decision.selections[0]],
    };
    assert.equal(okay(run(target, routeArgs(target.database), next)).recorded, true);
    const report = okay(run(target, overlapArgs(target.database)));
    assert.deepEqual(mcp(target, 'skill_routing_overlap', period).structuredContent, report);
    assert.equal(report.rows.length, 1);
    assert.equal(report.rows[0].joint_decisions, 1);
    assert.equal(report.rows[0].union_decisions, 2);
    assert.equal(report.rows[0].overlap.rate, 0.5);
    const db = new DatabaseSync(target.database, { readOnly: true });
    try {
        assert.deepEqual(
            {
                ...db
                    .prepare(
                        'SELECT count(*) AS events, count(DISTINCT correlation_id) AS decisions FROM lifecycle_events',
                    )
                    .get(),
            },
            { events: 3, decisions: 2 },
        );
        assert.equal(db.prepare('SELECT count(*) AS count FROM usage_reads').get().count, 0);
        assert.equal(
            db
                .prepare(
                    "SELECT count(*) AS count FROM lifecycle_events WHERE event_type != 'skill.routed'",
                )
                .get().count,
            0,
        );
        assert(
            !JSON.stringify(db.prepare('SELECT envelope FROM usage_events').all()).includes(
                target.root,
            ),
        );
    } finally {
        db.close();
    }
});

test('malformed, ambiguous, duplicate and unavailable selections fail before database creation with redacted diagnostics', (t) => {
    const target = prepare(t);
    target.database = path.join(target.root, 'uncreated', 'usage.db');
    const invalid = [
        { ...target.decision, prompt: 'private request' },
        { ...target.decision, selections: [] },
        { ...target.decision, selections: Array(25).fill(target.decision.selections[0]) },
        { ...target.decision, correlation_id: 'not-a-uuid' },
        { ...target.decision, selections: [{ collection: 'project', path: 'relative/path' }] },
        {
            ...target.decision,
            selections: [...target.decision.selections, target.decision.selections[0]],
        },
        {
            ...target.decision,
            selections: [
                target.decision.selections[0],
                { collection: 'project', path: path.join(target.root, 'missing') },
            ],
        },
    ];
    for (const decision of invalid) {
        const result = run(target, routeArgs(target.database), decision);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Invalid input/);
        assert(!result.stderr.includes(target.root));
        assert.equal(
            mcp(target, 'skill_routing_record', decision).structuredContent.error.code,
            'invalid_input',
        );
    }
    assert.equal(fs.existsSync(path.dirname(target.database)), false);
});

test('storage stays outside selected packages and unsafe package entries never reach the writer', (t) => {
    const target = prepare(t);
    const inside = path.join(target.decision.selections[0].path, 'state', 'usage.db');
    const result = run(target, routeArgs(inside), target.decision);
    assert.notEqual(result.status, 0);
    assert(!result.stderr.includes(target.root));
    assert.equal(fs.existsSync(path.dirname(inside)), false);
    target.database = inside;
    assert.equal(
        mcp(target, 'skill_routing_record', target.decision).structuredContent.error.code,
        'storage_unavailable',
    );
    assert.equal(fs.existsSync(path.dirname(inside)), false);
    target.database = path.join(target.root, 'usage.db');
    fs.symlinkSync(
        path.join(target.decision.selections[0].path, 'SKILL.md'),
        path.join(target.decision.selections[1].path, 'unsafe-link'),
    );
    assert.notEqual(run(target, routeArgs(target.database), target.decision).status, 0);
    assert.equal(fs.existsSync(target.database), false);
});

test('changed membership, session, timestamp or package bytes cannot rewrite a retained decision', (t) => {
    const target = prepare(t);
    okay(run(target, routeArgs(target.database), target.decision));
    const before = fs.readFileSync(target.database);
    for (const change of [
        { selections: [target.decision.selections[0]] },
        { session: randomUUID() },
        { occurred_at: '2026-09-19T12:01:00.000Z' },
    ]) {
        const result = run(target, routeArgs(target.database), { ...target.decision, ...change });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Evidence conflicts/);
        assert.deepEqual(fs.readFileSync(target.database), before);
    }
    fs.appendFileSync(
        path.join(target.decision.selections[1].path, 'SKILL.md'),
        '\nChanged instructions.\n',
    );
    assert.notEqual(run(target, routeArgs(target.database), target.decision).status, 0);
    assert.deepEqual(fs.readFileSync(target.database), before);
});

test('a conflict on the second selected member rolls back the entire decision', (t) => {
    const target = prepare(t);
    const member = new SkillRoutingPackageRepository().inspect(target.decision.selections[1].path);
    new SkillEvidenceService().recordLifecycle(
        target.database,
        lifecycle('skill.activated', {
            correlation_id: target.decision.correlation_id,
            session: target.decision.session,
            occurred_at: target.decision.occurred_at,
            payload: {
                collection: 'project',
                skill: member.skill,
                reason: null,
                source: { ...member.source, package_sha256: 'f'.repeat(64) },
            },
        }),
    );
    const before = fs.readFileSync(target.database);
    const result = run(target, routeArgs(target.database), target.decision);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Evidence conflicts/);
    assert.deepEqual(fs.readFileSync(target.database), before);
    assert.deepEqual(okay(run(target, overlapArgs(target.database))).rows, []);
});

test('concurrent decision retries commit one batch and the default database is shared agent state', async (t) => {
    const target = prepare(t);
    const environment = {
        ...target.environment,
        I9_AGENT_STATE_ROOT: path.join(target.root, 'agent-state'),
    };
    const args = [launcher, 'telemetry', 'route', '--file', '-'];
    const results = await Promise.all(
        Array.from(
            { length: 2 },
            () =>
                new Promise((resolve, reject) => {
                    const child = spawn(process.execPath, args, {
                        cwd: target.root,
                        env: environment,
                        stdio: ['pipe', 'pipe', 'pipe'],
                    });
                    let stdout = '',
                        stderr = '';
                    const timeout = setTimeout(() => {
                        child.kill();
                        reject(new Error('Routing writer timed out'));
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
                    child.stdin.end(JSON.stringify(target.decision));
                }),
        ),
    );
    assert.deepEqual(results.map((result) => okay(result).recorded).sort(), [false, true]);
    assert.equal(fs.existsSync(target.database), false);
    const db = new DatabaseSync(path.join(environment.I9_AGENT_STATE_ROOT, 'skills-usage.db'), {
        readOnly: true,
    });
    try {
        assert.equal(db.prepare('SELECT count(*) AS count FROM lifecycle_events').get().count, 2);
    } finally {
        db.close();
    }
});
