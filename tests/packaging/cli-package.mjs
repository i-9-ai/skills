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
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { COMMANDS } from '../../src/index.ts';
import { treeBytes } from '../unit/fixture/SkillBumpFixture.mjs';
import {
    catalog as evidenceCatalog,
    follow,
    lifecycle,
    member,
    period,
} from '../unit/fixture/SkillEvidenceFixture.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));

test('clean source prepares an allowlisted artifact that runs from node_modules without development dependencies', (t) => {
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
    // A Git consumer starts with tracked source, never the checkout's ignored dist.
    // Reuse existing build dependencies without installing or fetching anything.
    const cleanSource = join(root, 'source');
    mkdirSync(cleanSource);
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
    ]) {
        const target = join(cleanSource, path);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(join(repository, path), target, { recursive: true });
    }
    symlinkSync(join(repository, 'node_modules'), join(cleanSource, 'node_modules'), 'dir');
    assert.equal(existsSync(join(cleanSource, 'dist')), false);
    const packResult = JSON.parse(
        run('npm', ['pack', '--json', '--pack-destination', root], cleanSource),
    );
    assert.equal(existsSync(join(cleanSource, 'dist/index.js')), true);
    const packed = Array.isArray(packResult) ? packResult[0] : packResult['@i-9.ai/skills'];
    assert.equal(packed?.name, '@i-9.ai/skills');
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
    const installed = join(modules, '@i-9.ai', 'skills');
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

    const evidenceRoot = join(root, 'evidence');
    mkdirSync(evidenceRoot);
    const evidenceDatabase = join(evidenceRoot, 'usage.db');
    const evidenceWrite = (operation, event) => {
        const input = join(evidenceRoot, 'event.json');
        writeFileSync(input, JSON.stringify(event));
        return JSON.parse(
            run(
                process.execPath,
                [launcher, 'telemetry', operation, '--db', evidenceDatabase, '--file', input],
                root,
            ),
        );
    };
    const route = lifecycle('skill.routed', { occurred_at: '2026-09-18T00:00:00.000Z' });
    const observation = evidenceCatalog([member(), member('unrouted')], {
        occurred_at: period.from,
    });
    assert.equal(evidenceWrite('catalog-observe', observation).added, 2);
    assert.equal(evidenceWrite('record', route).recorded, true);
    assert.equal(evidenceWrite('record', route).recorded, false);
    evidenceWrite('record', follow(route, 'skill.activated', '2026-09-19T00:00:00.000Z'));
    evidenceWrite('record', follow(route, 'skill.completed', '2026-09-20T00:00:00.000Z'));

    const queryPairs = [
        ['lifecycle', 'skill_lifecycle_metrics'],
        ['overlap', 'skill_routing_overlap'],
        ['inactivity', 'skill_catalog_inactivity'],
        ['catalog-history', 'skill_catalog_history'],
    ];
    const cliEvidence = queryPairs.map(([operation]) =>
        JSON.parse(
            run(
                process.execPath,
                [
                    launcher,
                    'telemetry',
                    operation,
                    '--db',
                    evidenceDatabase,
                    '--from',
                    period.from,
                    '--until',
                    period.until,
                ],
                root,
            ),
        ),
    );
    assert.deepEqual(cliEvidence[0].rows[0].completion_rate, {
        numerator: 1,
        denominator: 1,
        rate: 1,
    });
    assert.deepEqual(
        cliEvidence[2].rows.map((row) => row.skill),
        ['unrouted'],
    );
    const evidenceBefore = readFileSync(evidenceDatabase);
    const evidenceMcp = spawnSync(
        process.execPath,
        [launcher, 'mcp', 'serve', '--db', evidenceDatabase],
        {
            cwd: root,
            env: environment,
            encoding: 'utf8',
            timeout: 30000,
            input:
                [
                    { jsonrpc: '2.0', id: 1, method: 'initialize' },
                    { jsonrpc: '2.0', method: 'notifications/initialized' },
                    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
                    ...queryPairs.map(([, name], index) => ({
                        jsonrpc: '2.0',
                        id: index + 3,
                        method: 'tools/call',
                        params: { name, arguments: period },
                    })),
                    {
                        jsonrpc: '2.0',
                        id: 7,
                        method: 'tools/call',
                        params: { name: 'skill_read_rankings' },
                    },
                ]
                    .map((request) => JSON.stringify(request))
                    .join('\n') + '\n',
        },
    );
    assert.equal(evidenceMcp.status, 0, evidenceMcp.stderr);
    const evidenceResponses = evidenceMcp.stdout.trim().split('\n').map(JSON.parse);
    const toolNames = evidenceResponses[1].result.tools.map((tool) => tool.name);
    for (const name of [
        'skill_lifecycle_record',
        'skill_catalog_observe',
        ...queryPairs.map(([, name]) => name),
    ])
        assert.ok(toolNames.includes(name), name);
    assert.deepEqual(
        evidenceResponses.slice(2, 6).map((response) => response.result.structuredContent),
        cliEvidence,
    );
    assert.deepEqual(evidenceResponses[6].result.structuredContent.rows, []);
    assert.deepEqual(readFileSync(evidenceDatabase), evidenceBefore);

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

    // Exercise the installed guide itself, not a checkout-only approximation.
    const onboardingRoot = join(root, 'onboarding-workspace');
    mkdirSync(onboardingRoot);
    const installedBefore = treeBytes(installed);
    const homeBefore = treeBytes(home);
    const guide = JSON.parse(run(process.execPath, [launcher, 'skills', 'onboarding'], root));
    assert.equal(guide.guide_version, 'onboarding-v1');
    assert.equal(guide.fixture.synthetic, true);
    for (const file of guide.fixture.files) {
        const target = resolve(onboardingRoot, file.path);
        assert.ok(target.startsWith(onboardingRoot + sep));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.content, { flag: 'wx' });
    }
    const expand = (value) =>
        value.replaceAll('<installed-root>', installed).replaceAll('<workspace>', onboardingRoot);
    const observedStages = [];
    for (const section of guide.sections) {
        if (section.id === 'bump') {
            writeFileSync(
                join(onboardingRoot, 'comparison.json'),
                JSON.stringify({
                    schema_version: 1,
                    before: JSON.parse(readFileSync(join(onboardingRoot, 'before.json'))),
                    after: JSON.parse(readFileSync(join(onboardingRoot, 'after.json'))),
                    assessment: null,
                }),
            );
        }
        for (const command of section.commands) {
            if (command.effect === 'prepared_ci_only') continue;
            assert.equal(command.argv[0], 'node');
            const output = run(process.execPath, command.argv.slice(1).map(expand), home);
            const result = JSON.parse(output);
            if (command.stdout_file) writeFileSync(expand(command.stdout_file), output);
            if (section.id === 'evolve') assert.equal(result.status, 'applied');
            if (section.id === 'bump') {
                assert.equal(result.recommendation, 'undetermined');
                assert.equal(result.changes[0].key, 'skills-catalog.json');
                assert.ok(result.insufficiencies.includes('candidate_official_not_passed'));
            }
        }
        observedStages.push(section.id);
    }
    assert.deepEqual(observedStages, [
        'inspect',
        'snapshot',
        'audit',
        'plan',
        'evolve',
        'verify',
        'bump',
    ]);
    const examples = guide.examples.map((example) => {
        assert.equal(example.synthetic, true);
        const request = join(onboardingRoot, `${example.name}.json`);
        writeFileSync(request, JSON.stringify(example.request));
        const result = JSON.parse(
            run(process.execPath, [launcher, 'skills', 'report', 'bump', '--file', request], home),
        );
        assert.equal(result.recommendation, example.name);
        return result;
    });
    const unusedDatabase = join(onboardingRoot, 'never-created.db');
    const onboardingMcp = spawnSync(
        process.execPath,
        [launcher, 'mcp', 'serve', '--db', unusedDatabase],
        {
            cwd: home,
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
                        params: { name: 'skill_onboarding', arguments: {} },
                    },
                    ...guide.examples.map((example, index) => ({
                        jsonrpc: '2.0',
                        id: index + 3,
                        method: 'tools/call',
                        params: { name: 'skill_bump_report', arguments: example.request },
                    })),
                ]
                    .map((request) => JSON.stringify(request))
                    .join('\n') + '\n',
        },
    );
    assert.equal(onboardingMcp.status, 0, onboardingMcp.stderr);
    const onboardingResponses = onboardingMcp.stdout.trim().split('\n').map(JSON.parse);
    assert.deepEqual(onboardingResponses[1].result.structuredContent, guide);
    assert.deepEqual(
        onboardingResponses.slice(2).map((item) => item.result.structuredContent),
        examples,
    );
    assert.equal(existsSync(unusedDatabase), false);
    assert.deepEqual(treeBytes(installed), installedBefore);
    assert.deepEqual(treeBytes(home), homeBefore);

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
