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
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repository = fileURLToPath(new URL('../../', import.meta.url));

test('the allowlisted artifact runs from node_modules on Node 24+ without TypeScript or development dependencies', (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-packed-cli-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const config = join(root, 'user.npmrc');
    const globalConfig = join(root, 'global.npmrc');
    writeFileSync(config, '');
    writeFileSync(globalConfig, '');
    const environment = {
        ...process.env,
        npm_config_cache: join(root, 'npm-cache'),
        npm_config_userconfig: config,
        npm_config_globalconfig: globalConfig,
        npm_config_update_notifier: 'false',
        npm_config_audit: 'false',
        npm_config_fund: 'false',
    };
    const run = (command, args, cwd = repository) => {
        const result = spawnSync(command, args, {
            cwd,
            env: environment,
            encoding: 'utf8',
            timeout: 30000,
        });
        assert.equal(result.status, 0, result.stderr);
        return result.stdout;
    };
    const packResult = JSON.parse(
        run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', root]),
    );
    const packed = Array.isArray(packResult) ? packResult[0] : packResult['i9-skills'];
    assert.equal(packed?.name, 'i9-skills');
    const names = packed.files.map((file) => file.path);
    assert.ok(names.includes('dist/index.js'));
    assert.ok(names.includes('bin/index.mjs'));
    assert.ok(names.includes('.agents/skills/beads-execution/SKILL.md'));
    for (const name of names) {
        assert.ok(!name.startsWith('/') && !name.split('/').includes('..'), name);
        assert.match(
            name,
            /^(?:bin\/index\.(?:mjs|md)|dist\/.*\.js|\.agents\/skills\/|skills-catalog\.json|docs\/|package\.json|README\.md|LICENSE|NOTICE)/,
        );
        assert.doesNotMatch(
            name,
            /^(?:src|tests|\.work|tmp|\.beads|\.codex|\.github|node_modules)\//,
        );
        assert.ok(!name.endsWith('.ts'), name);
        assert.ok(!name.split('/').includes('.DS_Store'), name);
    }

    const modules = join(root, 'consumer', 'node_modules');
    const installed = join(modules, 'i9-skills');
    mkdirSync(installed, { recursive: true });
    run(
        'tar',
        ['-xzf', join(root, packed.filename), '--strip-components=1', '-C', installed],
        root,
    );
    // Use only locked, already installed production dependencies; never install or fetch.
    const dependencies = run('npm', ['ls', '--omit=dev', '--all', '--parseable'])
        .trim()
        .split('\n')
        .slice(1);
    const sourceModules = join(repository, 'node_modules');
    for (const source of [...new Set(dependencies)]) {
        const relativePath = relative(sourceModules, resolve(source));
        assert.ok(relativePath && !relativePath.startsWith('..' + sep) && relativePath !== '..');
        const target = join(modules, relativePath);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(source, target, { recursive: true });
    }
    assert.equal(existsSync(join(modules, 'typescript')), false);
    assert.equal(existsSync(join(installed, 'src')), false);
    assert.equal(JSON.parse(readFileSync(join(installed, 'package.json'))).private, true);
    const launcher = join(installed, 'bin/index.mjs');
    assert.match(run(process.execPath, [launcher, '--help'], root), /TOPICS/);
    assert.match(
        run(
            process.execPath,
            [launcher, 'context', 'available-skills', '--project', root, '--no-global'],
            root,
        ),
        /No readable/,
    );
    const hooks = JSON.parse(
        run(process.execPath, [launcher, 'hook', 'session-config', '--host', 'gemini'], root),
    );
    assert.equal(hooks.hooks.SessionStart[0].hooks[0].timeout, 3000);
    const catalog = JSON.parse(
        run(
            process.execPath,
            [launcher, 'catalog', 'check', '--collection', installed, '--layout', 'repository'],
            root,
        ),
    );
    assert.ok(catalog.packages >= 25);
});
