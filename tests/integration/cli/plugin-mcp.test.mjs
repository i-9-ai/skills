// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    catalogFixture,
    digest,
    repository,
    snapshot,
    write,
} from '../../unit/fixture/InstalledCatalogFixture.mjs';

const tools = [
    'skill_bump_report',
    'skill_catalog_history',
    'skill_catalog_inactivity',
    'skill_catalog_observe',
    'skill_catalog_overview',
    'skill_catalog_search',
    'skill_lifecycle_metrics',
    'skill_lifecycle_record',
    'skill_onboarding',
    'skill_read_rankings',
    'skill_read_record',
    'skill_resource_read',
    'skill_routing_overlap',
];
const observedRead = {
    event_id: 'synthetic-observed-read',
    collection: 'i9-skills',
    skill: 'alpha-guide',
    revision: 'sha256:synthetic',
    session: 'opaque-synthetic-session',
    occurred_at: '2026-09-29T12:00:00.000Z',
};

function messages(calls) {
    return (
        [
            { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
            { jsonrpc: '2.0', method: 'notifications/initialized' },
            ...calls.map((call, index) => ({ jsonrpc: '2.0', id: index + 2, ...call })),
        ]
            .map((message) => JSON.stringify(message))
            .join('\n') + '\n'
    );
}

function call(name, args = {}) {
    return { method: 'tools/call', params: { name, arguments: args } };
}

function run(target, calls, environment = {}, invocation) {
    const result = spawnSync(
        invocation?.command ?? process.execPath,
        invocation?.args ?? [
            join(target.installed, 'src/transport/PluginMcpServer.ts'),
            '--host',
            'claude',
        ],
        {
            cwd: target.caller,
            env: { ...target.environment, ...environment },
            input: messages(calls),
            encoding: 'utf8',
            timeout: 10000,
            maxBuffer: 4 * 1024 * 1024,
        },
    );
    assert.equal(result.status, 0, result.stderr || String(result.error));
    const rows = result.stdout
        .trim()
        .split('\n')
        .map((line) => {
            assert.ok(Buffer.byteLength(line) <= 1024 * 1024);
            return JSON.parse(line);
        });
    assert.deepEqual(
        rows.map((row) => row.id),
        Array.from({ length: calls.length + 1 }, (_, index) => index + 1),
    );
    assert.equal(result.stdout.includes('private-request-sentinel'), false);
    assert.equal(result.stderr.includes(target.root), false);
    return rows;
}

function successful(row) {
    assert.equal(row.result?.isError, undefined, JSON.stringify(row));
    return row.result.structuredContent;
}

function error(row, code) {
    assert.equal(row.result.isError, true);
    assert.equal(row.result.structuredContent.error.code, code);
    assert.ok(row.result.structuredContent.error.message.length < 512);
}

test('installed MCP preserves a leading UTF-8 BOM in returned resource provenance', (t) => {
    const target = catalogFixture(t, { runtime: true });
    const bytes = Buffer.from('\ufeff# BOM reference\r\n\nExact source bytes.\n', 'utf8');
    write(target.installed, '.agents/skills/alpha-guide/references/bom.md', bytes);
    const before = snapshot(target.root);
    const result = successful(
        run(target, [
            call('skill_resource_read', { skill: 'alpha-guide', resource: 'references/bom.md' }),
        ])[1],
    );
    const returned = Buffer.from(result.content, 'utf8');
    assert.deepEqual(returned, bytes);
    assert.equal(result.byte_length, returned.length);
    assert.equal(result.content_sha256, digest(returned));
    assert.deepEqual(snapshot(target.root), before);
});

test('a clean installed MCP discovers and reads only its bundled catalog without DATA or state writes', (t) => {
    const target = catalogFixture(t, { runtime: true });
    const before = snapshot(target.root);
    const rows = run(target, [
        { method: 'tools/list' },
        call('skill_catalog_search', { query: 'alpha-guide', limit: 1 }),
        call('skill_resource_read', { skill: 'alpha-guide', resource: 'references/example.md' }),
        call('skill_catalog_overview', { max_entries: 1 }),
        call('skill_read_rankings'),
        call('skill_read_record', { prompt: 'private-request-sentinel' }),
        call('skill_catalog_search', { query: 'decoy-guide' }),
    ]);
    assert.equal(rows[0].result.serverInfo.name, 'i9-skills');
    assert.equal(rows[0].result.serverInfo.version, '9.8.7');
    assert.equal(rows[0].result.protocolVersion, '2025-11-25');
    assert.deepEqual(rows[1].result.tools.map((tool) => tool.name).sort(), tools);
    const listed = Object.fromEntries(rows[1].result.tools.map((tool) => [tool.name, tool]));
    for (const name of ['skill_catalog_search', 'skill_resource_read', 'skill_catalog_overview']) {
        assert.equal(listed[name].inputSchema.additionalProperties, false);
        assert.equal(listed[name].annotations.readOnlyHint, true);
    }
    assert.equal(listed.skill_catalog_search.inputSchema.properties.query.maxLength, 200);
    assert.equal(listed.skill_catalog_search.inputSchema.properties.limit.maximum, 50);
    assert.equal(listed.skill_catalog_search.inputSchema.properties.offset.maximum, 256);
    assert.equal(listed.skill_catalog_overview.inputSchema.properties.max_entries.maximum, 24);
    const search = successful(rows[2]);
    assert.deepEqual(
        search.skills.map((skill) => skill.name),
        ['alpha-guide'],
    );
    assert.equal(search.provenance.package_version, '9.8.7');
    assert.equal(rows[0].result.serverInfo.version, search.provenance.package_version);
    assert.equal(search.provenance.resolved_git_sha, null);
    assert.match(successful(rows[3]).content, /ação, café/u);
    assert.match(successful(rows[4]).overview, /additional packages omitted/u);
    error(rows[5], 'storage_unavailable');
    error(rows[6], 'invalid_input');
    assert.equal(successful(rows[7]).total, 0);
    for (const directory of ['node_modules', '.git', 'dist'])
        assert.equal(fs.existsSync(join(target.installed, directory)), false);
    assert.deepEqual(snapshot(target.root), before);
});

test('plugin MCP initialization succeeds without a catalog and creates no selected state', (t) => {
    const target = catalogFixture(t, { runtime: true });
    fs.rmSync(join(target.installed, 'skills-catalog.json'));
    const before = snapshot(target.root);
    const rows = run(target, [{ method: 'tools/list' }], {
        I9_SKILLS_USAGE_DB: join(target.data, 'skills-usage.db'),
    });

    assert.equal(rows[0].result.serverInfo.version, '9.8.7');
    assert.equal(rows[0].result.protocolVersion, '2025-11-25');
    assert.deepEqual(rows[1].result.tools.map((tool) => tool.name).sort(), tools);
    assert.equal(fs.existsSync(target.data), false);
    assert.deepEqual(snapshot(target.root), before);
});

for (const [label, changes] of [
    ['version', { version: 'malformed-version' }],
    ['package', { name: '@unrelated/skills' }],
    ['repository', { repository: { url: 'https://example.test/unrelated.git' } }],
]) {
    test(`plugin MCP rejects malformed installed ${label} before accepting explicit writes`, (t) => {
        const target = catalogFixture(t, { runtime: true });
        const manifest = JSON.parse(fs.readFileSync(join(target.installed, 'package.json')));
        write(target.installed, 'package.json', JSON.stringify({ ...manifest, ...changes }));
        const before = snapshot(target.root);
        const result = spawnSync(
            process.execPath,
            [join(target.installed, 'src/transport/PluginMcpServer.ts'), '--host', 'claude'],
            {
                cwd: target.caller,
                env: {
                    ...target.environment,
                    I9_SKILLS_USAGE_DB: join(target.data, 'skills-usage.db'),
                },
                input: messages([call('skill_read_record', observedRead)]),
                encoding: 'utf8',
                timeout: 10000,
            },
        );

        assert.ifError(result.error);
        assert.equal(result.status, 1);
        assert.equal(result.stdout, '');
        assert.match(result.stderr, /verify the runtime and host selector/);
        assert.equal(result.stderr.includes(target.root), false);
        assert.equal(fs.existsSync(target.data), false);
        assert.deepEqual(snapshot(target.root), before);
    });
}

test('invalid recording and unavailable rankings never initialize a selected DATA directory', (t) => {
    const target = catalogFixture(t, { runtime: true });
    const before = snapshot(target.root);
    const rows = run(
        target,
        [
            call('skill_read_record', { ...observedRead, prompt: 'private-request-sentinel' }),
            call('skill_read_rankings'),
            call('skill_catalog_search', {}),
        ],
        { I9_SKILLS_USAGE_DB: join(target.data, 'skill-usage.db') },
    );
    error(rows[1], 'invalid_input');
    error(rows[2], 'storage_unavailable');
    assert.equal(successful(rows[3]).total, 5);
    assert.equal(fs.existsSync(target.data), false);
    assert.deepEqual(snapshot(target.root), before);
});

test('explicit observed reads initialize safe data once and later rankings leave it unchanged', (t) => {
    const target = catalogFixture(t, { runtime: true });
    const protectedBefore = [target.installed, target.caller, target.home].map(snapshot);
    const environment = {
        I9_SKILLS_USAGE_DB: join(target.data, 'skill-usage.db'),
        PLUGIN_DATA: target.installed,
    };
    const first = run(
        target,
        [
            call('skill_read_record', observedRead),
            call('skill_read_record', observedRead),
            call('skill_read_rankings'),
        ],
        environment,
    );
    assert.equal(successful(first[1]).recorded, true);
    assert.equal(successful(first[2]).recorded, false);
    assert.equal(successful(first[3]).rows[0].reads, 1);
    assert.equal(successful(first[3]).rows[0].sessions, 1);
    assert.equal(fs.existsSync(join(target.data, 'skill-usage.db')), true);
    const stored = snapshot(target.data);
    fs.chmodSync(join(target.data, 'skill-usage.db'), 0o400);
    fs.chmodSync(target.data, 0o500);
    try {
        const later = run(
            target,
            [call('skill_read_rankings'), call('skill_resource_read', { skill: 'alpha-guide' })],
            environment,
        );
        assert.equal(successful(later[1]).rows[0].reads, 1);
        successful(later[2]);
    } finally {
        fs.chmodSync(target.data, 0o700);
        fs.chmodSync(join(target.data, 'skill-usage.db'), 0o600);
    }
    assert.deepEqual(snapshot(target.data), stored);
    assert.deepEqual([target.installed, target.caller, target.home].map(snapshot), protectedBefore);
});

test('an invalid existing database is unavailable rather than reset or reported as empty history', (t) => {
    const target = catalogFixture(t, { runtime: true });
    fs.mkdirSync(target.data, { recursive: true });
    fs.writeFileSync(join(target.data, 'skill-usage.db'), 'Preserve this non-database sentinel.\n');
    const before = snapshot(target.root);
    const rows = run(target, [call('skill_read_rankings'), call('skill_catalog_search')], {
        I9_SKILLS_USAGE_DB: join(target.data, 'skill-usage.db'),
    });
    error(rows[1], 'storage_unavailable');
    assert.equal(successful(rows[2]).total, 5);
    assert.deepEqual(snapshot(target.root), before);
});

for (const location of ['plugin', 'caller', 'linked', 'relative', 'empty']) {
    test(`plugin recording rejects ${location} DATA without affecting catalog access`, (t) => {
        const target = catalogFixture(t, { runtime: true });
        let data = join(
            location === 'plugin' ? target.installed : target.caller,
            'forbidden-state',
        );
        if (location === 'linked') {
            const outside = join(target.root, 'outside-state');
            fs.mkdirSync(outside);
            data = join(target.root, 'linked-state');
            fs.symlinkSync(outside, data, 'dir');
        }
        if (location === 'relative') data = 'relative-state';
        if (location === 'empty') data = '';
        const before = snapshot(target.root);
        const rows = run(
            target,
            [call('skill_read_record', observedRead), call('skill_catalog_search')],
            {
                I9_SKILLS_USAGE_DB: data
                    ? location === 'relative'
                        ? data
                        : join(data, 'skill-usage.db')
                    : data,
            },
        );
        error(rows[1], 'storage_unavailable');
        assert.equal(successful(rows[2]).total, 5);
        assert.deepEqual(snapshot(target.root), before);
    });
}

test('closed catalog inputs fail with redacted categories and the server handles subsequent valid calls', (t) => {
    const target = catalogFixture(t, { runtime: true });
    const invalid = [
        call('skill_catalog_search', { query: 'a'.repeat(201) }),
        call('skill_catalog_search', { limit: 51 }),
        call('skill_catalog_search', { extra: 'private-request-sentinel' }),
        call('skill_resource_read', {
            skill: 'alpha-guide',
            resource: '../private-request-sentinel.md',
        }),
        call('skill_catalog_overview', { max_entries: 25 }),
    ];
    const before = snapshot(target.root);
    const rows = run(target, [
        ...invalid,
        call('unknown-private-request-sentinel'),
        call('skill_catalog_search', { query: 'beta-guide' }),
    ]);
    for (const row of rows.slice(1, invalid.length + 1)) error(row, 'invalid_input');
    error(rows[invalid.length + 1], 'unknown_tool');
    assert.deepEqual(
        successful(rows.at(-1)).skills.map((skill) => skill.name),
        ['beta-guide'],
    );
    assert.deepEqual(snapshot(target.root), before);
});

test('Claude plugin registration launches the same installed MCP without precreating host data', (t) => {
    const target = catalogFixture(t, { runtime: true });
    const registration = JSON.parse(fs.readFileSync(join(repository, 'mcp/claude.json'), 'utf8'));
    assert.deepEqual(Object.keys(registration.mcpServers), ['i9-skills']);
    const server = registration.mcpServers['i9-skills'];
    assert.equal(server.command, 'node');
    const invocation = {
        command: server.command,
        args: server.args.map((argument) =>
            argument.replaceAll('${CLAUDE_PLUGIN_ROOT}', target.installed),
        ),
    };
    const rows = run(
        target,
        [call('skill_catalog_search', { query: 'alpha-guide' })],
        {},
        invocation,
    );
    assert.equal(successful(rows[1]).total, 1);
    assert.equal(fs.existsSync(target.data), false);
});
