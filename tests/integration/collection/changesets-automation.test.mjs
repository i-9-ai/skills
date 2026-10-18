// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';

const repository = process.cwd();
const pkg = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8'));
const plugins = ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json', '.github/plugin/plugin.json'];

test('official Changesets versioning synchronizes lock and all plugin versions in a disposable package', t => {
    const root = mkdtempSync(join(tmpdir(), 'i9-changesets-automation-'));
    t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));
    function write(file, value) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
    }
    const identity = { name: '@example/fixture', version: '1.0.0', private: true };
    write('package.json', { ...identity, files: pkg.files, scripts: { 'version:packages': pkg.scripts['version:packages'] } });
    write('.github/scripts/version-packages.mjs', readFileSync(join(repository, '.github/scripts/version-packages.mjs'), 'utf8'));
    cpSync(join(repository, 'node_modules'), join(root, 'node_modules'), { recursive: true });
    write('package-lock.json', { ...identity, lockfileVersion: 3, packages: { '': identity } });
    write('.changeset/config.json', {
        changelog: ['@changesets/changelog-github', { repo: 'example/fixture' }], commit: false, format: false,
        fixed: [], linked: [], access: 'restricted', baseBranch: 'main',
        updateInternalDependencies: 'patch', privatePackages: { version: true, tag: false }, ignore: [],
    });
    write('.changeset/example.md', '---\n"@example/fixture": minor\n---\n\nAdd the synthetic capability.\n\nKeep the second paragraph.\n\n```sh\n  example --help\n```\n');
    const history = '## 1.0.0\n\nPreserve previous history.  \n  \n```text\n  Retain indentation.\n```\n';
    write('CHANGELOG.md', '# Fixture\n\n' + history);
    write('github-fixture.mjs', `
        import assert from 'node:assert/strict';
        globalThis.fetch = async (url, options) => {
            assert.equal(String(url), 'https://api.github.com/graphql');
            const { query } = JSON.parse(options.body);
            const commits = [...query.matchAll(/commit__([a-f0-9]+):/g)];
            assert.ok(commits.length > 0);
            return new Response(JSON.stringify({ data: { repo__0: Object.fromEntries(commits.map(([, sha]) => [
                'commit__' + sha, {
                    commitUrl: 'https://github.com/example/fixture/commit/' + sha,
                    author: { user: { login: 'fixture-user', url: 'https://github.com/fixture-user' } },
                    associatedPullRequests: { nodes: [] },
                },
            ])) } }));
        };
    `);
    for (const file of plugins) write(file, { name: 'fixture-plugin', version: '1.0.0', description: 'Retain this field.' });
    write('npmrc', '');
    write('global-npmrc', '');
    const env = {
        ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith('npm_config_'))),
        PATH: `${join(repository, 'node_modules/.bin')}:${process.env.PATH}`,
        npm_config_offline: 'true', npm_config_cache: join(root, 'cache'),
        npm_config_userconfig: join(root, 'npmrc'), npm_config_globalconfig: join(root, 'global-npmrc'),
        npm_config_audit: 'false', npm_config_fund: 'false',
        npm_config_update_notifier: 'false',
        NODE_OPTIONS: '--import=' + pathToFileURL(join(root, 'github-fixture.mjs')).href,
        GITHUB_TOKEN: 'synthetic-local-only', GITHUB_GRAPHQL_URL: 'https://api.github.com/graphql',
        GITHUB_SERVER_URL: 'https://github.com',
        GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    };
    for (const args of [['init', '-q', '--initial-branch=main'], ['add', '.'],
        ['-c', 'user.name=Synthetic Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Fixture']]) {
        const result = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
    }
    const result = spawnSync('npm', ['run', 'version:packages'], {
        cwd: root, env, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const read = file => JSON.parse(readFileSync(join(root, file), 'utf8'));
    assert.equal(read('package.json').version, '1.1.0');
    assert.equal(read('package-lock.json').version, '1.1.0');
    assert.equal(read('package-lock.json').packages[''].version, '1.1.0');
    for (const file of plugins) assert.deepEqual(read(file), {
        name: 'fixture-plugin', version: '1.1.0', description: 'Retain this field.',
    });
    assert.equal(existsSync(join(root, '.changeset/example.md')), false);
    const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /## 1\.1\.0/u);
    assert.match(changelog, /Add the synthetic capability\./u);
    assert.match(changelog, /Keep the second paragraph\./u);
    assert.match(changelog, / {4}example --help/u);
    assert.match(changelog, /https:\/\/github\.com\/example\/fixture\/commit\//u);
    assert.ok(changelog.startsWith('# Fixture\n\n'));
    assert.ok(changelog.endsWith(history), 'published history remains byte-identical');
    const whitespace = spawnSync('git', ['diff', '--check', 'HEAD'], {
        cwd: root, env, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(whitespace.status, 0, whitespace.stdout + whitespace.stderr);
    const status = spawnSync(join(repository, 'node_modules/.bin/changeset'), ['status', '--since=main'], {
        cwd: root, env, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(status.status, 1, 'the generated version no longer has pending notes');
    const validation = parse(readFileSync(join(repository, '.github/workflows/changesets.yml'), 'utf8'));
    const noteCheck = validation.jobs.changesets.steps.find(step => step.name === 'Validate Changesets');
    assert.equal(noteCheck.if, "github.head_ref != 'changeset-release/main'");
    const pack = spawnSync('npm', ['pack', '--json', '--ignore-scripts'], {
        cwd: root, env, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(pack.status, 0, pack.stderr);
    const packed = JSON.parse(pack.stdout);
    const tarball = (Array.isArray(packed) ? packed[0] : packed[identity.name]).filename;
    for (const file of ['package.json', '.codex-plugin/plugin.json']) {
        const unpack = spawnSync('tar', ['-xOf', tarball, `package/${file}`], {
            cwd: root, env, encoding: 'utf8', timeout: 5000,
        });
        assert.equal(unpack.status, 0, unpack.stderr);
        assert.equal(JSON.parse(unpack.stdout).version, '1.1.0');
    }
});

test('version and publish paths use official actions and the existing npm publisher identity', () => {
    const workflow = parse(readFileSync(join(repository, '.github/workflows/release.yml'), 'utf8'));
    assert.deepEqual(workflow.on, { push: { branches: ['main'] } });
    const jobs = workflow.jobs;
    assert.equal(jobs.version.needs, 'select-mode');
    assert.equal(jobs.version.if, "needs.select-mode.outputs.mode == 'version'");
    const version = jobs.version.steps.find(step => step.uses?.startsWith('changesets/action/version@'));
    assert.equal(version.with.script, 'npm run version:packages');
    assert.equal(jobs.pack.if, "needs.select-mode.outputs.mode == 'publish'");
    assert.equal(jobs.publish.needs, 'pack');
    const pack = jobs.pack.steps.find(step => step.id === 'pack');
    assert.equal(pack.with['publish-plan-artifact-id'], '${{ needs.select-mode.outputs.publish-plan-artifact-id }}');
    const publish = jobs.publish.steps.find(step => step.id === 'publish');
    assert.equal(publish.with['pack-dir-artifact-id'], '${{ needs.pack.outputs.pack-dir-artifact-id }}');
    assert.equal(pkg.scripts['release:prepare'], undefined);
    assert.equal(pkg.scripts['release:verify'], undefined);
});
