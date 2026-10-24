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
import { SkillPanelConfiguration } from '../../../src/config/SkillPanelConfiguration.ts';
import { SkillPanelService } from '../../../src/service/SkillPanelService.ts';

for (const globalEvolution of [false, true]) {
    test(
        'the shared stdio protocol carries retained candidate, exact approval and recovery for ' +
            (globalEvolution ? 'an enabled global' : 'a selected copy'),
        async (t) => {
            const f = skillPanelFixture(t);
            let target = 'example-skill';
            if (globalEvolution) {
                const global = join(f.root, 'global skills');
                fs.mkdirSync(global);
                fs.cpSync(f.skill, join(global, 'example-skill'), { recursive: true });
                f.entrypoint = join(global, 'example-skill', 'SKILL.md');
                f.service = new SkillPanelService(
                    new SkillPanelConfiguration(f.collection, f.state, global, true),
                );
                target = f.service.open({}).skills.find((entry) => entry.source === 'global').skill;
            }
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
            const done = new SkillMcpTransport({
                name: 'i9-skills',
                version: '0.0.0-test',
            }).startServer({ panel: f.service, close() {} }, input, output);
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
            input.write(
                JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
            );
            const tools = (await rpc('tools/list')).result.tools;
            assert.equal(tools.length, 9);
            for (const tool of tools)
                assert.equal(
                    tool.inputSchema.type,
                    'object',
                    `${tool.name} must advertise the MCP object input schema`,
                );
            const opening = tools.find((tool) => tool.name === 'skill_panel_open');
            assert.equal(opening.icons?.length, 2);
            assert.deepEqual(
                opening.icons.map((icon) => icon.theme),
                ['light', 'dark'],
            );
            const mark = fs.readFileSync(
                new URL('../../../assets/skill-panel-icon.svg', import.meta.url),
                'utf8',
            );
            assert.match(mark, /<title>I-9 Skills<\/title>/);
            assert.doesNotMatch(
                mark,
                /<(?:rect|script|text|image|foreignObject)\b|(?:href|onload)=/i,
            );
            // Near-white RGB can be classified as a luminance mask after SVG rasterization.
            // Neutral black/white keeps both themed images opaque in monochrome hosts.
            for (const [index, color] of ['#000000', '#FFFFFF'].entries()) {
                const icon = opening.icons[index];
                assert.equal(icon.mimeType, 'image/svg+xml');
                assert.equal(icon.src.split(',')[0], 'data:image/svg+xml;base64');
                assert.deepEqual(icon.sizes, ['any']);
                assert.equal(
                    Buffer.from(icon.src.split(',')[1], 'base64').toString('utf8'),
                    mark.replaceAll('currentColor', color),
                );
                assert.doesNotMatch(
                    Buffer.from(icon.src.split(',')[1], 'base64').toString('utf8'),
                    /currentColor/,
                );
            }
            assert.equal(
                tools.some((tool) => tool.name === 'skill_read_record'),
                false,
            );
            assert.equal(
                (await call('skill_read_record', {})).structuredContent.error.code,
                'unknown_tool',
            );
            assert.deepEqual(
                tools.find((tool) => tool.name === 'skill_panel_apply')._meta.ui.visibility,
                ['app'],
            );
            const resources = (await rpc('resources/list')).result.resources;
            assert.equal(resources.length, 1);
            assert.equal(
                (await rpc('resources/read', { uri: 'file:///not-selected' })).error.code,
                -32602,
            );
            const ui = await rpc('resources/read', { uri: resources[0].uri });
            assert.match(ui.result.contents[0].text, /Selected copies \+ optional global skills/);
            assert.match(ui.result.contents[0].text, /Diff &amp; approval/);
            const clientUi = await rpc('resources/read', {
                uri: resources[0].uri,
                _meta: { progressToken: 'fixture-resource', 'fixture/client': { request: 'read' } },
            });
            assert.equal(
                clientUi.error,
                undefined,
                'Reserved request metadata must not reject the fixed UI',
            );
            assert.equal(clientUi.result.contents[0].text, ui.result.contents[0].text);
            assert.deepEqual((await rpc('resources/templates/list')).result, {
                resourceTemplates: [],
            });
            assert.equal(opening.title, 'I-9 Skills');
            for (const invalid of [
                { uri: resources[0].uri, unrelated: true },
                { uri: resources[0].uri, _meta: null },
                { uri: resources[0].uri, _meta: [] },
                { uri: resources[0].uri, _meta: 'invalid' },
                { uri: 'file:///not-selected', _meta: { progressToken: 1 } },
            ])
                assert.equal((await rpc('resources/read', invalid)).error.code, -32602);
            assert.equal(
                (await call('skill_panel_open', {})).structuredContent.skills.some(
                    (entry) => entry.skill === target,
                ),
                true,
            );
            const inspection = (await call('skill_panel_inspect', { skill: target }))
                .structuredContent;
            assert.equal(inspection.text, f.before);
            assert.equal(fs.existsSync(f.state), false);
            const requested = (
                await call('skill_panel_request', { skill: target, kind: 'review', focus: null })
            ).structuredContent;
            assert.match(requested.instructions, /skill_panel_complete/);
            const proposal = (
                await call('skill_panel_propose', {
                    skill: target,
                    base_sha256: inspection.package_sha256,
                    after: f.after,
                    rationale: 'Explain the concrete required inputs.',
                })
            ).structuredContent;
            assert.equal(proposal.validation.local.status, 'passed');
            const completed = await call('skill_panel_complete', {
                request_id: requested.request.request_id,
                outcome: 'proposal',
                summary: 'Clarified required inputs.',
                proposal_id: proposal.proposal_id,
            });
            assert.equal(completed.structuredContent.result.outcome, 'proposal');
            const activity = (await call('skill_panel_activity', { skill: target }))
                .structuredContent;
            assert.equal(activity.requests[0].result.proposal_id, proposal.proposal_id);
            assert.equal(activity.proposals[0].proposal_id, proposal.proposal_id);
            const refused = await call('skill_panel_apply', {
                ...f.approval(proposal),
                approved: false,
            });
            assert.equal(refused.isError, true);
            assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);
            assert.equal(
                (await call('skill_panel_apply', f.approval(proposal))).structuredContent.status,
                'applied',
            );
            assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.after);
            assert.equal(
                (await call('skill_panel_recover', f.approval(proposal, 'recover')))
                    .structuredContent.status,
                'recovered',
            );
            assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), f.before);

            // Long escaped lines remain valid below 32 KiB; the text fallback must not
            // duplicate the full before/after/diff payload and overflow the MCP envelope.
            const escaped = String.fromCharCode(92, 34).repeat(15000);
            const largeBefore = f.before + '\n```text\n' + escaped + '\n```\n';
            const largeAfter =
                f.after + '\n```text\n' + escaped.split('').reverse().join('') + '\n```\n';
            fs.writeFileSync(f.entrypoint, largeBefore);
            const base = f.service.inspect({ skill: target }).package_sha256;
            const envelope = await rpc('tools/call', {
                name: 'skill_panel_propose',
                arguments: {
                    skill: target,
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
            const inspected = await call('skill_panel_proposal', {
                proposal_id: large.proposal_id,
            });
            assert.equal(inspected.isError, undefined);
            assert.equal(inspected.structuredContent.before, largeBefore);
            assert.equal(
                (await call('skill_panel_apply', f.approval(large))).structuredContent.status,
                'applied',
            );
            assert.equal(
                (await call('skill_panel_recover', f.approval(large, 'recover'))).structuredContent
                    .status,
                'recovered',
            );
            assert.equal(fs.readFileSync(f.entrypoint, 'utf8'), largeBefore);
            const manyBefore = f.before + 'x y\n'.repeat(4000);
            const manyAfter = f.before + 'x z\n'.repeat(4000);
            fs.writeFileSync(f.entrypoint, manyBefore);
            const manyResult = await rpc('tools/call', {
                name: 'skill_panel_propose',
                arguments: {
                    skill: target,
                    base_sha256: f.service.inspect({ skill: target }).package_sha256,
                    after: manyAfter,
                    rationale: 'Compare many short lines within the response budget.',
                },
            });
            assert.equal(manyResult.error, undefined);
            assert(Buffer.byteLength(JSON.stringify(manyResult)) < MAX_MCP_RESPONSE_BYTES);
            const many = manyResult.result.structuredContent;
            assert.equal(many.validation.local.status, 'passed');
            assert.equal(many.comparison.left, null);
            const reopened = await call('skill_panel_proposal', { proposal_id: many.proposal_id });
            assert.equal(reopened.structuredContent.before, manyBefore);
            assert.equal(reopened.structuredContent.after, manyAfter);
            if (globalEvolution)
                assert.equal(fs.readFileSync(join(f.skill, 'SKILL.md'), 'utf8'), f.before);
        },
    );
}

test('mcp serve validates paired explicit selections and the dependency-free plugin entrypoint uses the same server', (t) => {
    const f = skillPanelFixture(t);
    const global = join(f.root, 'global');
    fs.mkdirSync(join(global, 'personal-reference'), { recursive: true });
    fs.writeFileSync(
        join(global, 'personal-reference', 'SKILL.md'),
        '---\nname: personal-reference\ndescription: Read one global input.\n---\n\n# Personal reference\n',
    );
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
    const missingGlobal = spawnSync(
        process.execPath,
        [
            'bin/index.mjs',
            'mcp',
            'serve',
            '--panel-collection',
            f.collection,
            '--panel-state',
            f.state,
            '--panel-global-write',
        ],
        { cwd: root, env: environment, encoding: 'utf8', timeout: 10000 },
    );
    assert.notEqual(missingGlobal.status, 0);
    assert.match(missingGlobal.stderr, /requires --panel-global-collection/);
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
            '--panel-global-collection',
            global,
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
    assert.equal(results[2].result.structuredContent.skills[1].name, 'personal-reference');
    assert.equal(results[2].result.structuredContent.skills[1].read_only, true);
    assert.equal(fs.existsSync(f.state), false);
    assert.equal(fs.existsSync(join(f.root, '.agents')), false);
    fs.cpSync(f.skill, join(global, 'eligible-global'), { recursive: true });
    fs.writeFileSync(
        join(global, 'eligible-global', 'SKILL.md'),
        f.before.replaceAll('example-skill', 'eligible-global'),
    );
    const optedIn = spawnSync(
        process.execPath,
        [
            'src/transport/PluginMcpServer.ts',
            '--host',
            'codex',
            '--panel-collection',
            f.collection,
            '--panel-state',
            f.state,
            '--panel-global-collection',
            global,
            '--panel-global-write',
        ],
        {
            cwd: root,
            env: environment,
            input: frames.map(JSON.stringify).join('\n') + '\n',
            encoding: 'utf8',
            timeout: 10000,
        },
    );
    assert.equal(optedIn.status, 0, optedIn.stderr);
    const optedCatalog = optedIn.stdout.trim().split('\n').map(JSON.parse)[2]
        .result.structuredContent;
    assert.equal(
        optedCatalog.skills.find((entry) => entry.name === 'eligible-global').read_only,
        false,
    );
    assert.equal(
        fs.existsSync(f.state),
        false,
        'Enabling capability does not create state or approve a write',
    );
    const unsupported = spawnSync(
        process.execPath,
        [
            'src/transport/PluginMcpServer.ts',
            '--host',
            'codex',
            '--panel-collection',
            f.collection,
            '--panel-state',
            f.state,
            '--panel-global-write',
        ],
        { cwd: root, env: environment, encoding: 'utf8', timeout: 10000 },
    );
    assert.notEqual(
        unsupported.status,
        0,
        'The plugin selector cannot enable globals without a root',
    );
});
