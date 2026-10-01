// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repository = fileURLToPath(new URL('../../', import.meta.url));
test('clean synthetic Git preparation retains its SHA through npm packing and compiled CLI/MCP reads without Git metadata', (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-git-packed-receipt-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = join(root, 'home');
    const source = join(root, 'source');
    const caller = join(root, 'unrelated-caller');
    const installed = join(root, 'installed');
    for (const directory of [home, source, caller, installed]) mkdirSync(directory);
    const userConfig = join(root, 'user.npmrc');
    const globalConfig = join(root, 'global.npmrc');
    writeFileSync(userConfig, '');
    writeFileSync(globalConfig, '');
    const environment = {
        ...process.env,
        PATH: `${dirname(process.execPath)}:${process.env.PATH}`,
        HOME: home,
        XDG_CONFIG_HOME: home,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_TERMINAL_PROMPT: '0',
        NODE_DISABLE_COMPILE_CACHE: '1',
        npm_config_cache: join(root, 'npm-cache'),
        npm_config_userconfig: userConfig,
        npm_config_globalconfig: globalConfig,
        npm_config_update_notifier: 'false',
        npm_config_audit: 'false',
        npm_config_fund: 'false',
    };
    for (const name of Object.keys(environment))
        if (
            name.startsWith('GIT_') &&
            ![
                'GIT_CONFIG_GLOBAL',
                'GIT_CONFIG_SYSTEM',
                'GIT_CONFIG_NOSYSTEM',
                'GIT_TERMINAL_PROMPT',
            ].includes(name)
        )
            delete environment[name];
    const run = (command, args, cwd = source, input) => {
        const result = spawnSync(command, args, {
            cwd,
            env: environment,
            input,
            encoding: 'utf8',
            timeout: 30_000,
        });
        assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
        return result.stdout;
    };
    for (const path of [
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'tsconfig.build.json',
        'src',
        'bin',
        '.agents/skills',
        'skills-catalog.json',
        'docs',
        'README.md',
        'LICENSE',
        'NOTICE',
    ]) {
        if (!existsSync(join(repository, path))) continue;
        mkdirSync(dirname(join(source, path)), { recursive: true });
        cpSync(join(repository, path), join(source, path), { recursive: true });
    }
    writeFileSync(join(source, '.gitignore'), 'dist/\nnode_modules/\n');
    symlinkSync(join(repository, 'node_modules'), join(source, 'node_modules'), 'dir');
    const git = (args, cwd = source) =>
        run(
            'git',
            [
                '-c',
                'user.name=Synthetic Builder',
                '-c',
                'user.email=builder@example.test',
                '-c',
                'core.hooksPath=/dev/null',
                ...args,
            ],
            cwd,
        ).trim();
    git(['init', '--quiet', '--template=', '--initial-branch=main']);
    git(['remote', 'add', 'origin', 'https://github.com/i-9-ai/skills.git']);
    git(['add', '--all']);
    git(['commit', '--quiet', '--no-gpg-sign', '-m', 'Record synthetic package source']);
    const expected = git(['rev-parse', 'HEAD']);
    const packedValue = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', root]));
    const packed = Array.isArray(packedValue) ? packedValue[0] : packedValue['@i-9.ai/skills'];
    assert.ok(packed.files.some((file) => file.path === 'dist/source-receipt.json'));
    run(
        'tar',
        ['-xzf', join(root, packed.filename), '--strip-components=1', '-C', installed],
        root,
    );
    assert.equal(existsSync(join(installed, '.git')), false);
    assert.equal(existsSync(join(installed, 'src')), false);
    symlinkSync(join(repository, 'node_modules'), join(installed, 'node_modules'), 'dir');
    const receipt = JSON.parse(readFileSync(join(installed, 'dist/source-receipt.json'), 'utf8'));
    assert.deepEqual(receipt.source, {
        status: 'verified',
        git_sha: expected,
        verification: 'clean_git_checkout',
    });
    git(['init', '--quiet', '--template=', '--initial-branch=unrelated'], caller);
    writeFileSync(join(caller, 'unrelated'), 'An unrelated consumer source.\n');
    git(['add', '--all'], caller);
    git(['commit', '--quiet', '--no-gpg-sign', '-m', 'Record unrelated consumer source'], caller);
    assert.notEqual(git(['rev-parse', 'HEAD'], caller), expected);
    const launcher = join(installed, 'bin/index.mjs');
    const cli = JSON.parse(
        run(process.execPath, [launcher, 'catalog', 'search', '--limit', '1'], caller),
    );
    assert.equal(cli.provenance.source_ref, expected);
    assert.equal(cli.provenance.resolved_git_sha, expected);
    assert.equal(cli.provenance.source_provenance.status, 'asserted');
    assert.equal(cli.provenance.source_provenance.build_verification, 'verified');
    assert.equal(cli.provenance.source_provenance.integrity, 'verified');
    const input =
        [
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'synthetic-consumer', version: '1' },
                },
            },
            { jsonrpc: '2.0', method: 'notifications/initialized' },
            {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: { name: 'skill_catalog_search', arguments: { limit: 1 } },
            },
        ]
            .map((request) => JSON.stringify(request))
            .join('\n') + '\n';
    const responses = run(process.execPath, [launcher, 'mcp', 'serve'], caller, input)
        .trim()
        .split('\n')
        .map(JSON.parse);
    assert.deepEqual(
        responses.find((response) => response.id === 2).result.structuredContent.provenance,
        cli.provenance,
    );
    assert.equal(existsSync(join(home, '.agents')), false, 'catalog reads create no shared state');
});
