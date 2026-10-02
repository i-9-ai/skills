// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SkillBumpExampleConfiguration } from '../../../src/config/SkillBumpExampleConfiguration.ts';
import { SkillBumpReportService } from '../../../src/service/SkillBumpReportService.ts';
import { SkillOnboardingService } from '../../../src/service/SkillOnboardingService.ts';
import {
    bumpFixture,
    repository,
    repin,
    treeBytes,
    validator,
} from '../../unit/fixture/SkillBumpFixture.mjs';

function invoke(target, args, input, installed = repository) {
    return spawnSync(process.execPath, [path.join(installed, 'bin/index.mjs'), ...args], {
        cwd: target.root,
        env: target.environment,
        encoding: 'utf8',
        input,
        timeout: 20000,
        maxBuffer: 5 * 1024 * 1024,
    });
}
function mcp(target, calls, installed = repository) {
    const input =
        [
            { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
            { jsonrpc: '2.0', method: 'notifications/initialized' },
            ...calls.map((call, i) => ({
                jsonrpc: '2.0',
                id: i + 2,
                method: 'tools/call',
                params: call,
            })),
        ]
            .map((value) => JSON.stringify(value))
            .join('\n') + '\n';
    const result = invoke(
        target,
        ['mcp', 'serve', '--db', path.join(target.root, 'never-created.db')],
        input,
        installed,
    );
    assert.equal(result.status, 0, result.stderr);
    const rows = result.stdout
        .trim()
        .split('\n')
        .map((line) => {
            assert.ok(Buffer.byteLength(line) <= 1024 * 1024);
            return JSON.parse(line);
        });
    assert.equal(rows.length, calls.length + 1);
    return rows.slice(1).map((row) => row.result);
}

test('CLI and MCP produce identical bump reports and versioned guide data without storage effects', (t) => {
    const target = bumpFixture(t),
        before = treeBytes(target.root);
    const examples = SkillBumpExampleConfiguration.examples();
    const results = mcp(target, [
        ...examples.map((example) => ({ name: 'skill_bump_report', arguments: example.request })),
        { name: 'skill_onboarding', arguments: {} },
        { name: 'skill_bump_report', arguments: { prompt: 'private-sentinel' } },
        { name: 'skill_onboarding', arguments: { path: 'private-sentinel' } },
    ]);
    for (const [index, example] of examples.entries()) {
        const cli = target.run(
            ['skills', 'report', 'bump', '--file', '-'],
            JSON.stringify(example.request),
        );
        assert.equal(cli.recommendation, example.name);
        assert.deepEqual(results[index].structuredContent, cli);
        assert.deepEqual(JSON.parse(results[index].content[0].text), cli);
    }
    const guide = target.run(['skills', 'onboarding']);
    assert.deepEqual(results[4].structuredContent, guide);
    assert.deepEqual(guide, new SkillOnboardingService().guide());
    assert.equal(guide.guide_version, 'onboarding-v1');
    assert.deepEqual(
        guide.sections.map((section) => section.id),
        ['inspect', 'snapshot', 'audit', 'plan', 'evolve', 'verify', 'bump'],
    );
    for (const result of results.slice(5)) {
        assert.equal(result.isError, true);
        assert.equal(result.structuredContent.error.code, 'invalid_input');
        assert.equal(JSON.stringify(result).includes('private-sentinel'), false);
    }
    assert.equal(fs.existsSync(path.join(target.root, 'never-created.db')), false);
    assert.deepEqual(treeBytes(target.root), before);
});

test('large bounded comparisons cross the former 64 KiB ingress boundary with CLI/MCP parity', (t) => {
    const target = bumpFixture(t),
        request = SkillBumpExampleConfiguration.request('patch');
    for (const side of ['before', 'after']) {
        const observation = request[side].observation;
        for (let i = 0; i < 650; i++)
            observation.inventory.entries.push({
                path: `unchanged-${String(i).padStart(4, '0')}.md`,
                type: 'file',
                mode: 0o644,
                size: 1,
                sha256: 'a'.repeat(64),
            });
        observation.inventory = validator.inventory(observation.inventory);
        observation.content_identity = validator.contentIdentity(
            observation.subject,
            observation.inventory,
        );
        for (const receipt of observation.validation)
            receipt.content_sha256 = observation.content_identity.sha256;
        repin(request, side);
    }
    const bytes = JSON.stringify(request);
    assert.ok(Buffer.byteLength(bytes) > 65536 && Buffer.byteLength(bytes) < 768 * 1024);
    const cli = target.run(['skills', 'report', 'bump', '--file', '-'], bytes);
    assert.deepEqual(
        mcp(target, [{ name: 'skill_bump_report', arguments: request }])[0].structuredContent,
        cli,
    );
    assert.equal(cli.recommendation, 'patch');
    assert.equal(cli.counts.total_changes, 1);
    const oversized = { ...request, private: 'private-sentinel'.repeat(40000) };
    assert.ok(
        Buffer.byteLength(JSON.stringify(oversized)) > 768 * 1024 &&
            Buffer.byteLength(JSON.stringify(oversized)) < 1024 * 1024 - 1024,
    );
    const rejected = mcp(target, [
        { name: 'skill_bump_report', arguments: oversized },
        { name: 'skill_onboarding', arguments: { section: 'inspect' } },
    ]);
    assert.equal(rejected[0].structuredContent.error.code, 'invalid_input');
    assert.equal(rejected[1].structuredContent.guide_version, 'onboarding-v1');
    assert.equal(JSON.stringify(rejected).includes('private-sentinel'), false);
});

test('CLI rejects duplicate fields, invalid UTF-8, unsafe files, invalid flags and oversized input without echoing content', (t) => {
    const target = bumpFixture(t),
        request = SkillBumpExampleConfiguration.request('patch');
    const input = path.join(target.root, 'comparison.json');
    fs.writeFileSync(input, JSON.stringify(request));
    const link = path.join(target.root, 'private-sentinel-link.json');
    fs.symlinkSync(input, link);
    const hardlink = path.join(target.root, 'private-sentinel-hardlink.json');
    fs.linkSync(input, hardlink);
    const before = treeBytes(target.root);
    for (const [args, body] of [
        [
            ['skills', 'report', 'bump', '--file', '-'],
            '{"schema_version":1,"schema_version":1,"prompt":"private-sentinel"}',
        ],
        [['skills', 'report', 'bump', '--file', '-'], Buffer.from([0xff])],
        [['skills', 'report', 'bump', '--file', '-'], ' '.repeat(768 * 1024 + 1)],
        [['skills', 'report', 'bump', '--file', link]],
        [['skills', 'report', 'bump', '--file', hardlink]],
        [
            [
                'skills',
                'report',
                'bump',
                '--file',
                path.join(target.root, 'private-sentinel-missing'),
            ],
        ],
        [['skills', 'report', 'bump', '--file', '-', '--limit', '101'], JSON.stringify(request)],
        [['skills', 'onboarding', '--section', 'unregistered']],
        [['skills', 'bump', '--file', '-'], JSON.stringify(request)],
    ]) {
        const result = invoke(target, args, body);
        assert.notEqual(result.status, 0);
        assert.equal((result.stdout + result.stderr).includes('private-sentinel'), false);
    }
    assert.deepEqual(treeBytes(target.root), before);
});

test('registered observation production verifies explicit snapshots and remains independent of caller provenance', (t) => {
    const target = bumpFixture(t),
        snapshot = target.capture('before');
    const before = treeBytes(target.root);
    const selected = target.run([
        'skills',
        'observe',
        '--snapshot',
        snapshot,
        '--subject',
        path.join(target.root, 'subject.json'),
    ]);
    assert.deepEqual(validator.pin(selected.observation), selected);
    assert.equal(selected.observation.source.resolved_git_sha, null);
    assert.deepEqual(treeBytes(target.root), before);
    const result = invoke(target, [
        'skills',
        'observe',
        '--snapshot',
        path.join(target.root, 'private-sentinel'),
        '--subject',
        path.join(target.root, 'subject.json'),
    ]);
    assert.notEqual(result.status, 0);
    assert.equal((result.stdout + result.stderr).includes('private-sentinel'), false);
});

function relocate(target) {
    const installed = path.join(target.root, 'relocated artifact');
    for (const resource of ['src', 'bin', '.agents/skills', 'package.json', 'skills-catalog.json'])
        fs.cpSync(path.join(repository, resource), path.join(installed, resource), {
            recursive: true,
        });
    const userconfig = path.join(target.root, 'user.npmrc'),
        globalconfig = path.join(target.root, 'global.npmrc');
    fs.writeFileSync(userconfig, '');
    fs.writeFileSync(globalconfig, '');
    // npm supplies its own CLI path in npm-run tests; it need not live beside Node.
    const npmEntry = process.env.npm_execpath;
    const npmArgs = ['ls', '--omit=dev', '--all', '--parseable'];
    const npm = spawnSync(
        npmEntry ? process.execPath : 'npm',
        npmEntry ? [npmEntry, ...npmArgs] : npmArgs,
        {
            cwd: repository,
            env: {
                ...target.environment,
                PATH: process.env.PATH ?? target.environment.PATH,
                npm_config_userconfig: userconfig,
                npm_config_globalconfig: globalconfig,
                npm_config_update_notifier: 'false',
                npm_config_audit: 'false',
                npm_config_fund: 'false',
            },
            encoding: 'utf8',
            timeout: 15000,
        },
    );
    assert.equal(npm.status, 0, npm.stderr);
    const moduleRoot = path.join(repository, 'node_modules');
    for (const source of new Set(
        npm.stdout
            .trim()
            .split('\n')
            .filter((item) => item.startsWith(moduleRoot + path.sep)),
    ))
        fs.cpSync(source, path.join(installed, 'node_modules', path.relative(moduleRoot, source)), {
            recursive: true,
        });
    return installed;
}

test('relocated source runtime executes the self-contained guide through real maintenance and snapshot commands offline', (t) => {
    const target = bumpFixture(t),
        installed = relocate(target);
    fs.writeFileSync(path.join(target.home, 'package.json'), '{"name":"decoy","version":"9.9.9"}');
    const guide = target.run(['skills', 'onboarding'], undefined, installed);
    const installedBefore = treeBytes(installed),
        homeBefore = treeBytes(target.home);
    const stages = [];
    for (const section of guide.sections) {
        if (section.id === 'bump') {
            const read = (name) => JSON.parse(fs.readFileSync(path.join(target.root, name)));
            fs.writeFileSync(
                path.join(target.root, 'comparison.json'),
                JSON.stringify({
                    schema_version: 1,
                    before: read('before.json'),
                    after: read('after.json'),
                    assessment: null,
                }),
            );
        }
        for (const command of section.commands) {
            if (command.effect === 'prepared_ci_only') continue;
            const expanded = command.argv.map((argument) =>
                argument
                    .replaceAll('<installed-root>', installed)
                    .replaceAll('<workspace>', target.root),
            );
            const result = spawnSync(process.execPath, expanded.slice(1), {
                cwd: target.home,
                env: target.environment,
                encoding: 'utf8',
                timeout: 20000,
                maxBuffer: 5 * 1024 * 1024,
            });
            assert.equal(result.status, 0, `${section.id}: ${result.stderr}`);
            const output = JSON.parse(result.stdout);
            if (command.stdout_file)
                fs.writeFileSync(
                    command.stdout_file.replaceAll('<workspace>', target.root),
                    result.stdout,
                );
            if (section.id === 'bump') {
                assert.equal(output.recommendation, 'undetermined');
                assert.equal(output.changes[0].key, 'skills-catalog.json');
                assert.ok(output.insufficiencies.includes('candidate_official_not_passed'));
            }
        }
        stages.push(section.id);
    }
    assert.equal(stages.length, 7);
    for (const example of guide.examples) {
        assert.equal(example.synthetic, true);
        const expected = new SkillBumpReportService().report(example.request);
        assert.deepEqual(
            target.run(
                ['skills', 'report', 'bump', '--file', '-'],
                JSON.stringify(example.request),
                installed,
            ),
            expected,
        );
        assert.deepEqual(
            mcp(target, [{ name: 'skill_bump_report', arguments: example.request }], installed)[0]
                .structuredContent,
            expected,
        );
    }
    assert.deepEqual(
        mcp(target, [{ name: 'skill_onboarding', arguments: {} }], installed)[0].structuredContent,
        guide,
    );
    assert.deepEqual(treeBytes(installed), installedBefore);
    assert.deepEqual(treeBytes(target.home), homeBefore);
    assert.equal(fs.existsSync(path.join(target.root, 'never-created.db')), false);
});
