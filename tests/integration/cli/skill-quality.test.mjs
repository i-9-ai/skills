// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fixture, assertion, query, reversed } from '../../unit/fixture/SkillQualityFixture.mjs';
const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));
function setup(t) {
    const target = fixture(t);
    const caller = path.join(target.root, 'caller');
    fs.mkdirSync(caller);
    return {
        ...target,
        caller,
        environment: {
            ...process.env,
            I9_AGENT_STATE_ROOT: path.join(target.root, 'isolated-state'),
            I9_SKILLS_USAGE_DB: path.join(target.root, 'isolated-state', 'fallback.db'),
        },
    };
}
function run(target, args, input) {
    const index = args.indexOf('--db');
    assert.ok(index >= 0, 'Every test invocation must explicitly select --db');
    const database = args[index + 1];
    assert.ok(typeof database === 'string' && path.isAbsolute(database));
    const selected = path.relative(target.root, database);
    assert.ok(
        selected && !selected.startsWith('..') && !path.isAbsolute(selected),
        'Database must stay inside the owned fixture root',
    );
    return spawnSync(process.execPath, [launcher, ...args], {
        cwd: target.caller,
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
    const input =
        [
            { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
            { jsonrpc: '2.0', method: 'notifications/initialized' },
            ...calls.map((call, index) => ({ jsonrpc: '2.0', id: index + 2, ...call })),
        ]
            .map(JSON.stringify)
            .join('\n') + '\n';
    const result = run(target, ['mcp', 'serve', '--db', target.database], input);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout
        .trim()
        .split('\n')
        .map(JSON.parse)
        .slice(1)
        .map((row) => row.result);
}
const call = (name, value) => ({ method: 'tools/call', params: { name, arguments: value } });
const inspectArgs = (target) => [
    'skills',
    'quality',
    'inspect',
    '--db',
    target.database,
    '--collection',
    query.collection,
    '--from',
    query.from,
    '--until',
    query.until,
];
test('quality CLI/MCP record and read-only inspection share canonical outputs and idempotence', (t) => {
    const target = setup(t);
    const value = assertion();
    const first = okay(
        run(
            target,
            ['skills', 'quality', 'record', '--db', target.database, '--file', '-'],
            JSON.stringify(value),
        ),
    );
    assert.equal(first.assurance, 'caller_assertion');
    assert.equal(first.recorded, true);
    const retry = mcp(target, [call('skill_quality_record', { receipt: reversed(value) })])[0]
        .structuredContent;
    assert.deepEqual(retry, { ...first, recorded: false });
    const before = fs.readFileSync(target.database);
    const cli = okay(run(target, inspectArgs(target)));
    assert.deepEqual(mcp(target, [call('skill_quality_inspect', query)])[0].structuredContent, cli);
    assert.deepEqual(fs.readFileSync(target.database), before);
    assert.equal(fs.existsSync(target.environment.I9_AGENT_STATE_ROOT), false);
});
test('tool discovery includes closed quality inputs without initialization state', (t) => {
    const target = setup(t);
    const result = mcp(target, [{ method: 'tools/list' }])[0];
    const tools = result.tools.filter((item) => item.name.startsWith('skill_quality_'));
    assert.equal(tools.length, 2);
    assert.equal(tools[0].inputSchema.additionalProperties, false);
    assert.equal(
        tools[0].inputSchema.properties.receipt.properties.payload.properties.assurance,
        undefined,
    );
    assert.equal(fs.existsSync(target.database), false);
});
test('CLI/MCP reject supplied assurance and protected DB paths before creating state; missing inspect stays read-only', (t) => {
    const target = setup(t);
    const value = assertion();
    value.payload.assurance = 'verified_retained_benchmark';
    assert.notEqual(
        run(
            target,
            ['skills', 'quality', 'record', '--db', target.database, '--file', '-'],
            JSON.stringify(value),
        ).status,
        0,
    );
    assert.equal(mcp(target, [call('skill_quality_record', { receipt: value })])[0].isError, true);
    assert.equal(fs.existsSync(target.database), false);
    assert.notEqual(run(target, inspectArgs(target)).status, 0);
    assert.equal(fs.existsSync(target.database), false);
    const protectedDb = path.join(target.caller, 'state', 'evidence.db');
    assert.notEqual(
        run(
            target,
            ['skills', 'quality', 'record', '--db', protectedDb, '--file', '-'],
            JSON.stringify(assertion()),
        ).status,
        0,
    );
    target.database = protectedDb;
    assert.equal(
        mcp(target, [call('skill_quality_record', { receipt: assertion() })])[0].isError,
        true,
    );
    assert.equal(fs.existsSync(path.dirname(protectedDb)), false);
});
