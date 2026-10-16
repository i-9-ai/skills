// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
    MAX_MCP_RESPONSE_BYTES,
    SkillMcpTransport,
} from '../../../src/transport/SkillMcpTransport.ts';
import { skillPanelFixture } from '../../unit/fixture/SkillPanelFixture.mjs';

test('the shared stdio protocol carries real catalog, retained candidate, approval, apply and recovery', async (t) => {
    const f = skillPanelFixture(t);
    const input = new PassThrough();
    const output = new PassThrough();
    const pending = new Map();
    let buffer = '';
    let nextId = 0;
    output.on('data', (chunk) => {
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
            const message = JSON.parse(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            const request = pending.get(message.id);
            if (request) {
                clearTimeout(request.timer);
                pending.delete(message.id);
                request.resolve(message);
            }
        }
    });
    const done = new SkillMcpTransport({ name: 'i9-skills', version: '0.0.0-test' }).startServer(
        { panel: f.service, close() {} },
        input,
        output,
    );
    const rpc = (method, params = {}) =>
        new Promise((resolve, reject) => {
            const id = ++nextId;
            const timer = setTimeout(
                () => reject(new Error('Fixture protocol response missing')),
                5000,
            );
            pending.set(id, { resolve, timer });
            input.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
        });
    t.after(async () => {
        for (const value of pending.values()) clearTimeout(value.timer);
        input.end();
        await done;
    });
    const call = async (name, arguments_) =>
        (await rpc('tools/call', { name, arguments: arguments_ })).result;
    const init = await rpc('initialize');
    assert.deepEqual(init.result.capabilities.resources, {});
    input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const tools = (await rpc('tools/list')).result.tools;
    assert.equal(tools.length, 6);
    assert.equal(
        tools.some((tool) => tool.name === 'skill_read_record'),
        false,
    );
    assert.equal(
        (await call('skill_read_record', {})).structuredContent.error.code,
        'unknown_tool',
    );
    assert.deepEqual(tools.find((tool) => tool.name === 'skill_panel_apply')._meta.ui.visibility, [
        'app',
    ]);
    const resources = (await rpc('resources/list')).result.resources;
    assert.equal(resources.length, 1);
    assert.equal((await rpc('resources/read', { uri: 'file:///not-selected' })).error.code, -32602);
    const ui = await rpc('resources/read', { uri: resources[0].uri });
    assert.match(ui.result.contents[0].text, /Live selected files/);
    assert.equal(
        (await call('skill_panel_open', {})).structuredContent.skills[0].skill,
        'example-skill',
    );
    const inspection = (await call('skill_panel_inspect', { skill: 'example-skill' }))
        .structuredContent;
    assert.equal(inspection.text, f.before);
    assert.equal(fs.existsSync(f.state), false);
    const proposal = (
        await call('skill_panel_propose', {
            skill: 'example-skill',
            base_sha256: inspection.package_sha256,
            after: f.after,
            rationale: 'Explain the concrete required inputs.',
        })
    ).structuredContent;
    assert.equal(proposal.validation.local.status, 'passed');
    const refused = await call('skill_panel_apply', { ...f.approval(proposal), approved: false });
    assert.equal(refused.isError, true);
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);
    assert.equal(
        (await call('skill_panel_apply', f.approval(proposal))).structuredContent.status,
        'applied',
    );
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.after);
    assert.equal(
        (await call('skill_panel_recover', f.approval(proposal, 'recover'))).structuredContent
            .status,
        'recovered',
    );
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);

    // Long escaped lines remain valid below 32 KiB; the text fallback must not
    // duplicate the full before/after/diff payload and overflow the MCP envelope.
    const escaped = String.fromCharCode(92, 34).repeat(15000);
    const largeBefore = f.before + '\n```text\n' + escaped + '\n```\n';
    const largeAfter = f.after + '\n```text\n' + escaped.split('').reverse().join('') + '\n```\n';
    fs.writeFileSync(f.entrypoint, largeBefore);
    const base = f.inspect().package_sha256;
    const envelope = await rpc('tools/call', {
        name: 'skill_panel_propose',
        arguments: {
            skill: 'example-skill',
            base_sha256: base,
            after: largeAfter,
            rationale: 'Review the bounded escaped-text candidate.',
        },
    });
    assert.equal(envelope.error, undefined);
    assert(Buffer.byteLength(JSON.stringify(envelope)) <= MAX_MCP_RESPONSE_BYTES);
    assert(envelope.result.content[0].text.length < 200);
    const large = envelope.result.structuredContent;
    assert.equal(large.before, largeBefore);
    assert.equal(large.after, largeAfter);
    assert.equal(large.validation.local.status, 'passed');
    const inspected = await call('skill_panel_proposal', { proposal_id: large.proposal_id });
    assert.equal(inspected.isError, undefined);
    assert.equal(inspected.structuredContent.before, largeBefore);
    assert.equal(
        (await call('skill_panel_apply', f.approval(large))).structuredContent.status,
        'applied',
    );
    assert.equal(
        (await call('skill_panel_recover', f.approval(large, 'recover'))).structuredContent.status,
        'recovered',
    );
    assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), largeBefore);
});

test('mcp serve validates paired explicit selections and the dependency-free plugin entrypoint uses the same server', (t) => {
    const f = skillPanelFixture(t);
    const root = new URL('../../../', import.meta.url).pathname;
    const environment = {
        ...process.env,
        HOME: f.root,
        USERPROFILE: f.root,
        NODE_DISABLE_COMPILE_CACHE: '1',
    };
    const missing = spawnSync(
        process.execPath,
        ['bin/index.mjs', 'mcp', 'serve', '--panel-collection', f.collection],
        { cwd: root, env: environment, encoding: 'utf8', timeout: 10000 },
    );
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Select both/);
    const frames = [
        { jsonrpc: '2.0', id: 1, method: 'initialize' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'resources/list' },
        {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'skill_panel_open', arguments: {} },
        },
    ];
    const run = spawnSync(
        process.execPath,
        [
            'src/transport/PluginMcpServer.ts',
            '--host',
            'codex',
            '--panel-collection',
            f.collection,
            '--panel-state',
            f.state,
        ],
        {
            cwd: root,
            env: environment,
            input: frames.map(JSON.stringify).join('\n') + '\n',
            encoding: 'utf8',
            timeout: 10000,
        },
    );
    assert.equal(run.status, 0, run.stderr);
    const results = run.stdout.trim().split('\n').map(JSON.parse);
    assert.equal(results[1].result.resources.length, 1);
    assert.equal(results[2].result.structuredContent.skills[0].skill, 'example-skill');
    assert.equal(fs.existsSync(f.state), false);
    assert.equal(fs.existsSync(join(f.root, '.agents')), false);
});
