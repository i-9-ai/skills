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
import { COMMANDS } from '../../src/index.ts';

const repository = fileURLToPath(new URL('../../', import.meta.url));

test('the allowlisted artifact runs from node_modules on Node 24+ without TypeScript or development dependencies', (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'i9-packed-cli-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const config = join(root, 'user.npmrc');
    const globalConfig = join(root, 'global.npmrc');
    const home = join(root, 'home');
    mkdirSync(home);
    writeFileSync(config, '');
    writeFileSync(globalConfig, '');
    const environment = {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: home,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_SYSTEM: '/dev/null',
        NODE_DISABLE_COMPILE_CACHE: '1',
        npm_config_cache: join(root, 'npm-cache'),
        npm_config_userconfig: config,
        npm_config_globalconfig: globalConfig,
        npm_config_update_notifier: 'false',
        npm_config_audit: 'false',
        npm_config_fund: 'false',
    };
    delete environment.PLUGIN_DATA;
    delete environment.CLAUDE_PLUGIN_DATA;
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
    const packed = Array.isArray(packResult) ? packResult[0] : packResult['@i-9-ai/skills'];
    assert.equal(packed?.name, '@i-9-ai/skills');
    const names = packed.files.map((file) => file.path);
    assert.ok(names.includes('dist/index.js'));
    assert.ok(names.includes('bin/index.mjs'));
    const sourceCatalog = JSON.parse(readFileSync(join(repository, 'skills-catalog.json')));
    for (const skill of sourceCatalog.skills) {
        assert.ok(names.includes(skill.path + '/SKILL.md'), skill.name);
    }
    for (const name of names) {
        assert.ok(!name.startsWith('/') && !name.split('/').includes('..'), name);
        assert.match(
            name,
            /^(?:bin\/index\.(?:mjs|md)|dist\/.*\.js|\.agents\/skills\/|skills-catalog\.json|docs\/|package\.json|README\.md|LICENSE|NOTICE)/,
        );
        assert.doesNotMatch(name, /^(?:src|tests|\.work|tmp|\.codex|\.github|node_modules)\//);
        assert.ok(!name.endsWith('.ts'), name);
        assert.ok(!name.split('/').includes('.DS_Store'), name);
    }

    const modules = join(root, 'consumer', 'node_modules');
    const installed = join(modules, '@i-9-ai', 'skills');
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
    for (const route of Object.keys(COMMANDS)) {
        const help = run(process.execPath, [launcher, ...route.split(':'), '--help'], root);
        assert.match(help, /USAGE/u, route);
        assert.ok(help.includes(`i9-skills ${route.replaceAll(':', ' ')}`), route);
    }
    const implicitValidation = spawnSync(process.execPath, [launcher, 'repo', 'validate'], {
        cwd: root,
        env: environment,
        encoding: 'utf8',
        timeout: 30000,
    });
    assert.notEqual(implicitValidation.status, 0);
    assert.match(implicitValidation.stderr, /Missing required flag project/);
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
    assert.equal(catalog.packages, sourceCatalog.skills.length);

    const search = JSON.parse(
        run(
            process.execPath,
            [launcher, 'catalog', 'search', '--query', 'skill-authoring', '--limit', '1'],
            root,
        ),
    );
    assert.deepEqual(
        search.skills.map((skill) => skill.name),
        ['skill-authoring'],
    );
    assert.equal(search.provenance.resolved_git_sha, null);
    const resource = JSON.parse(
        run(process.execPath, [launcher, 'catalog', 'read', '--skill', 'skill-authoring'], root),
    );
    assert.equal(
        resource.content,
        readFileSync(join(installed, '.agents/skills/skill-authoring/SKILL.md'), 'utf8'),
    );
    const overview = JSON.parse(
        run(process.execPath, [launcher, 'catalog', 'overview', '--max-entries', '1'], root),
    );
    assert.ok(overview.overview.length <= 4096);
    assert.match(overview.overview, /additional packages omitted/u);
    const mcp = spawnSync(process.execPath, [launcher, 'mcp', 'serve'], {
        cwd: root,
        env: environment,
        encoding: 'utf8',
        timeout: 30000,
        input:
            [
                { jsonrpc: '2.0', id: 1, method: 'initialize' },
                { jsonrpc: '2.0', method: 'notifications/initialized' },
                {
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'tools/call',
                    params: {
                        name: 'skill_catalog_search',
                        arguments: { query: 'skill-authoring' },
                    },
                },
                {
                    jsonrpc: '2.0',
                    id: 3,
                    method: 'tools/call',
                    params: {
                        name: 'skill_resource_read',
                        arguments: { skill: 'skill-authoring' },
                    },
                },
                {
                    jsonrpc: '2.0',
                    id: 4,
                    method: 'tools/call',
                    params: { name: 'skill_read_rankings' },
                },
            ]
                .map((request) => JSON.stringify(request))
                .join('\n') + '\n',
    });
    assert.equal(mcp.status, 0, mcp.stderr);
    const responses = mcp.stdout.trim().split('\n').map(JSON.parse);
    assert.equal(responses[1].result.structuredContent.skills[0].name, 'skill-authoring');
    assert.equal(responses[2].result.structuredContent.content, resource.content);
    assert.equal(responses[3].result.structuredContent.error.code, 'storage_unavailable');
    for (const directory of [installed, root, home])
        assert.equal(existsSync(join(directory, 'skill-usage.db')), false);

    const maintenanceRoot = join(root, 'maintenance-collection');
    const maintenanceSkills = join(maintenanceRoot, '.agents/skills');
    mkdirSync(maintenanceSkills, { recursive: true });
    cpSync(
        join(installed, '.agents/skills/skills-catalog'),
        join(maintenanceSkills, 'skills-catalog'),
        { recursive: true },
    );
    const maintenanceCall = (operation, flags = []) =>
        JSON.parse(
            run(
                process.execPath,
                [
                    launcher,
                    'collection',
                    operation,
                    '--collection',
                    maintenanceRoot,
                    '--layout',
                    'repository',
                    ...flags,
                ],
                root,
            ),
        );
    const audit = maintenanceCall('audit');
    assert.equal(audit.catalog.status, 'missing');
    assert.equal(audit.coverage.complete, true);
    const auditFile = join(root, 'maintenance-audit.json');
    writeFileSync(auditFile, JSON.stringify(audit));
    const maintenancePlan = maintenanceCall('plan', ['--audit', auditFile]);
    const planFile = join(root, 'maintenance-plan.json');
    writeFileSync(planFile, JSON.stringify(maintenancePlan));
    assert.equal(maintenanceCall('evolve', ['--plan', planFile]).status, 'preview');
    assert.equal(existsSync(join(maintenanceRoot, 'skills-catalog.json')), false);
    const maintained = maintenanceCall('evolve', [
        '--plan',
        planFile,
        '--apply',
        '--snapshot-store',
        join(root, 'maintenance-recovery'),
    ]);
    assert.equal(maintained.status, 'applied');
    assert.equal(maintained.verification.preimage, 'passed');
    assert.equal(existsSync(join(maintained.snapshot, 'maintenance-result.json')), true);
    assert.equal(maintenanceCall('audit').catalog.status, 'current');

    const releaseRoot = join(root, 'release-fixture');
    const releasePackage = { name: '@example/release-fixture', version: '1.0.0', private: true };
    const releaseFiles = {
        'package.json': releasePackage,
        'package-lock.json': {
            ...releasePackage,
            lockfileVersion: 3,
            packages: { '': releasePackage },
        },
        '.codex-plugin/plugin.json': { name: 'synthetic-plugin', version: '1.0.0' },
        '.claude-plugin/plugin.json': { name: 'synthetic-plugin', version: '1.0.0' },
        '.github/plugin/plugin.json': { name: 'synthetic-plugin', version: '1.0.0' },
        '.changeset/config.json': {
            commit: false,
            changelog: '@changesets/cli/changelog',
            format: false,
        },
    };
    const releaseBytes = new Map();
    for (const [file, document] of Object.entries(releaseFiles)) {
        const content = JSON.stringify(document, null, 2) + '\n';
        mkdirSync(dirname(join(releaseRoot, file)), { recursive: true });
        writeFileSync(join(releaseRoot, file), content);
        releaseBytes.set(file, content);
    }
    const releaseNote = '---\n"@example/release-fixture": patch\n---\n\nSynthetic fix.\n';
    writeFileSync(join(releaseRoot, '.changeset/synthetic.md'), releaseNote);
    releaseBytes.set('.changeset/synthetic.md', releaseNote);
    assert.equal(existsSync(join(modules, '@changesets/cli')), false);
    assert.equal(
        JSON.parse(
            run(
                process.execPath,
                [launcher, 'repo', 'verify-release', '--project', releaseRoot],
                root,
            ),
        ).aligned,
        true,
    );
    const missingDevelopmentDependencies = spawnSync(
        process.execPath,
        [launcher, 'repo', 'prepare-version', '--project', releaseRoot],
        { cwd: root, env: environment, encoding: 'utf8', timeout: 30000 },
    );
    assert.notEqual(missingDevelopmentDependencies.status, 0);
    assert.match(
        missingDevelopmentDependencies.stderr,
        /requires the pinned development dependencies/u,
    );
    for (const [file, content] of releaseBytes) {
        assert.equal(readFileSync(join(releaseRoot, file), 'utf8'), content);
    }
    assert.equal(existsSync(join(releaseRoot, 'CHANGELOG.md')), false);

    const plugin = join(root, 'i9-skills');
    const preparation = JSON.parse(
        run(process.execPath, [launcher, 'plugin', 'prepare', '--output', plugin, '--write'], root),
    );
    assert.equal(preparation.packages, sourceCatalog.skills.length);
    assert.equal(preparation.written, true);
    for (const skill of sourceCatalog.skills) {
        assert.deepEqual(
            readFileSync(join(plugin, 'skills', skill.name, 'SKILL.md')),
            readFileSync(join(installed, skill.path, 'SKILL.md')),
        );
    }
    assert.equal(existsSync(join(plugin, 'AGENTS.md')), false);
    assert.equal(existsSync(join(plugin, 'src')), false);
    assert.equal(existsSync(join(plugin, '.agents')), false);
    assert.equal(existsSync(join(root, '.agents/plugins/marketplace.json')), false);
});
