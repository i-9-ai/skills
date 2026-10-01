import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { LIMITS, main, scanRepository } from '../../../.github/scripts/secret-scan.mjs';
import { verifyTrustedPublish } from '../../../.github/scripts/trusted-publish-check.mjs';

const repository = process.cwd();

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'i9-workflow-security-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
    for (const name of Object.keys(env)) {
        if (name.startsWith('GIT_') && !['GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL'].includes(name)) {
            delete env[name];
        }
    }
    function git(args, input) {
        const result = spawnSync('git', args, { cwd: root, env, input, encoding: 'utf8' });
        assert.equal(result.status, 0, 'the disposable Git fixture must be valid');
        return result.stdout.trim();
    }
    git(['init', '-q']);
    function commit(content = 'Harmless documentation placeholder: EXAMPLE_TOKEN\n') {
        writeFileSync(join(root, 'example.txt'), content);
        git(['add', '--', 'example.txt']);
        git(['-c', 'user.name=Synthetic Test', '-c', 'user.email=test@example.invalid',
            'commit', '-qm', 'Record synthetic content']);
        return git(['rev-parse', 'HEAD']);
    }
    const base = commit();
    const binary = join(root, 'fake-detector');
    function detector(body = 'process.exit(0);') {
        writeFileSync(binary, `#!${process.execPath}\n${body}\n`, { mode: 0o700 });
        chmodSync(binary, 0o700);
    }
    detector();
    return { root, env, git, commit, base, binary, detector };
}

test('bounded scans require the exact checkout and complete event history', t => {
    const input = fixture(t);
    assert.deepEqual(scanRepository({ ...input, head: input.base, base: input.base }), {
        commits: 0, files: 1, bytes: 50, bounded_history: false,
    });
    for (const head of ['HEAD', '-option', 'a'.repeat(40)]) {
        assert.throws(() => scanRepository({ ...input, head, base: input.base }),
            /full lowercase|checkout does not match/u);
    }
    assert.throws(() => scanRepository({ ...input, head: input.base, base: 'f'.repeat(40) }),
        /input is unavailable/u);
    assert.throws(() => main([], { SCAN_EVENT: 'pull_request', SCAN_HEAD_SHA: input.base }),
        /complete base commit/u);
    assert.throws(() => main([], { SCAN_EVENT: 'push', SCAN_HEAD_SHA: input.base }),
        /before commit/u);
    assert.throws(() => main(['--unbounded'], { SCAN_EVENT: 'push' }), /Unsupported/u);
});

test('history scans include introduced and subsequently removed content without logging child output', t => {
    const input = fixture(t);
    input.commit('Introduced synthetic marker.\n');
    const head = input.commit('Removed the synthetic marker.\n');
    const marker = ['ghp', 'A'.repeat(36)].join('_');
    input.detector(`process.stderr.write(${JSON.stringify(marker)}); process.exit(process.argv[2] === 'git' ? 10 : 0);`);
    assert.throws(() => scanRepository({ ...input, head, base: input.base }), error => {
        assert.match(error.message, /Credential pattern detected in commit content/u);
        assert.ok(!error.message.includes(marker));
        return true;
    });
    assert.equal(input.git(['status', '--porcelain', '--untracked-files=no']), '');
});

test('the tracked head tree is scanned even when no new commits are selected', t => {
    const input = fixture(t);
    input.detector(`
        const fs = require('node:fs');
        const path = require('node:path');
        if (process.argv[2] === 'dir') {
            const content = fs.readFileSync(path.join(process.argv[3], 'example.txt'), 'utf8');
            process.exit(content.includes('EXAMPLE_TOKEN') ? 10 : 2);
        }
        process.exit(0);
    `);
    assert.throws(() => scanRepository({ ...input, head: input.base, base: input.base }),
        /Credential pattern detected in the tracked tree/u);
});

test('scanner errors and excessive output fail without echoing the child diagnostics', t => {
    const input = fixture(t);
    const marker = 'Sensitive-looking synthetic diagnostic';
    for (const body of [
        `process.stderr.write(${JSON.stringify(marker)}); process.exit(2);`,
        `process.stdout.write('x'.repeat(${LIMITS.outputBytes + 1024}));`,
    ]) {
        input.detector(body);
        assert.throws(() => scanRepository({ ...input, head: input.base, base: input.base }), error => {
            assert.equal(error.message, 'Secret detector failed or exceeded its resource boundary.');
            assert.ok(!error.message.includes(marker));
            return true;
        });
    }
});

test('large tracked blobs fail instead of being silently skipped', t => {
    const input = fixture(t);
    const head = input.commit('x'.repeat(LIMITS.blobBytes + 1));
    assert.throws(() => scanRepository({ ...input, head, base: head }), /8 MiB scan boundary/u);
});

test('a large event range fails while an explicit history audit reports its bounded cutoff', t => {
    const input = fixture(t);
    const tree = input.git(['rev-parse', `${input.base}^{tree}`]);
    const blob = input.git(['rev-parse', `${tree}:example.txt`]);
    let stream = '';
    for (let index = 1; index <= LIMITS.commits + 1; index += 1) {
        stream += `commit refs/heads/scan-fixture\nmark :${index}\n` +
            'committer Synthetic Test <test@example.invalid> 1790880000 +0000\n' +
            'data 17\nSynthetic commit\n\n' +
            (index === 1 ? `from ${input.base}\n` : `from :${index - 1}\n`) +
            `deleteall\nM 100644 ${blob} example.txt\n\n`;
    }
    input.git(['fast-import', '--quiet'], stream);
    input.git(['checkout', '-q', 'scan-fixture']);
    const head = input.git(['rev-parse', 'HEAD']);
    assert.throws(() => scanRepository({ ...input, head, base: input.base }), /exceeds 500 commits/u);
    const result = scanRepository({ ...input, head, base: undefined });
    assert.equal(result.commits, LIMITS.commits);
    assert.equal(result.bounded_history, true);
});

function publisherInput() {
    return {
        pkg: {
            name: '@i-9.ai/skills', private: false,
            repository: { url: 'git+https://github.com/i-9-ai/skills.git' },
            publishConfig: { registry: 'https://registry.npmjs.org/', access: 'public' },
        },
        env: {
            GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'i-9-ai/skills',
            GITHUB_REF: 'refs/heads/main',
            GITHUB_WORKFLOW_REF: 'i-9-ai/skills/.github/workflows/release.yml@refs/heads/main',
            ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.invalid/oidc',
            ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-presence-marker',
        },
        nodeVersion: '24.21.0', npmVersion: '11.19.0',
    };
}

test('OIDC prerequisite verification reports presence without asserting server binding or printing credentials', () => {
    const input = publisherInput();
    const result = verifyTrustedPublish(input);
    assert.equal(result.oidc_environment, true);
    assert.equal(result.server_binding_verified, false);
    assert.ok(!JSON.stringify(result).includes(input.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN));
    assert.equal(verifyTrustedPublish({ ...input, npmVersion: '11.5.1' }).npm, '11.5.1');
    for (const npmVersion of ['11.5.0', '10.9.0', 'latest', '11.5.1-preview']) {
        assert.throws(() => verifyTrustedPublish({ ...input, npmVersion }), /npm 11\.5\.1/u);
    }
    assert.throws(() => verifyTrustedPublish({ ...input, nodeVersion: '22.14.0' }), /Node 24/u);
});

test('OIDC prerequisites reject mismatched identity, missing permission and stored token fallback', () => {
    const input = publisherInput();
    for (const [key, value] of [
        ['GITHUB_REPOSITORY', 'example/fork'], ['GITHUB_REF', 'refs/heads/feature'],
        ['GITHUB_WORKFLOW_REF', 'i-9-ai/skills/.github/workflows/other.yml@refs/heads/main'],
        ['ACTIONS_ID_TOKEN_REQUEST_TOKEN', ''], ['ACTIONS_ID_TOKEN_REQUEST_URL', ''],
        ['NPM_TOKEN', 'synthetic-token'], ['NODE_AUTH_TOKEN', 'synthetic-token'],
    ]) {
        assert.throws(() => verifyTrustedPublish({ ...input, env: { ...input.env, [key]: value } }), error => {
            assert.ok(!error.message.includes(value) || value === '');
            return true;
        });
    }
    for (const pkg of [
        { ...input.pkg, private: true },
        { ...input.pkg, repository: { url: 'git+https://github.com/example/fork.git' } },
        { ...input.pkg, publishConfig: { registry: 'https://example.invalid/', access: 'public' } },
    ]) assert.throws(() => verifyTrustedPublish({ ...input, pkg }), /manifest does not match/u);
});

function workflow(name) {
    return parse(readFileSync(join(repository, '.github/workflows', `${name}.yml`), 'utf8'));
}

test('credential scanning has read-only event-head checks and a checksum-pinned zero-secret detector', () => {
    const definition = workflow('secret-scanning');
    assert.deepEqual(Object.keys(definition.on), ['pull_request', 'push', 'workflow_dispatch']);
    assert.deepEqual(definition.on.push.branches, ['main']);
    assert.deepEqual(definition.permissions, { contents: 'read' });
    const job = definition.jobs['secret-scanning'];
    assert.equal(job['timeout-minutes'], 10);
    assert.equal(job.steps[0].with.ref, '${{ github.event.pull_request.head.sha || github.sha }}');
    assert.equal(job.steps[0].with['persist-credentials'], false);
    assert.equal(job.steps[0].with['fetch-depth'], 0);
    const source = JSON.stringify(definition);
    assert.match(source, /gitleaks_8\.30\.1_linux_x64\.tar\.gz/u);
    assert.match(source, /551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb/u);
    assert.match(source, /sha256sum --check --status/u);
    assert.match(source, /secret-scan\.mjs --self-test/u);
    assert.doesNotMatch(source, /secrets\.|pull_request_target|upload-artifact|continue-on-error/u);
    const scan = job.steps.at(-1);
    assert.equal(scan.env.SCAN_BASE_SHA, '${{ github.event.pull_request.base.sha || github.event.before }}');
    assert.equal(scan.env.SCAN_HEAD_SHA, '${{ github.event.pull_request.head.sha || github.sha }}');
});

test('updated official action pins preserve current-head validation and scoped OIDC preflight', () => {
    const pins = {
        'actions/checkout': '3d3c42e5aac5ba805825da76410c181273ba90b1',
        'actions/setup-node': '820762786026740c76f36085b0efc47a31fe5020',
        'actions/setup-python': '5fda3b95a4ea91299a34e894583c3862153e4b97',
    };
    for (const name of ['validate', 'changesets', 'sync-wiki', 'release', 'secret-scanning']) {
        for (const job of Object.values(workflow(name).jobs)) {
            for (const step of job.steps) {
                const action = step.uses?.split('@')[0];
                if (pins[action]) assert.equal(step.uses, `${action}@${pins[action]}`);
                if (action === 'actions/checkout') assert.equal(step.with['persist-credentials'], false);
                if (action === 'actions/setup-node') assert.equal(step.with['node-version'], '24');
            }
        }
    }
    const validate = workflow('validate').jobs.validate;
    assert.match(validate.steps.find(step => step.name.includes('canonical skill')).run, /npm run ci:official/u);
    const publish = workflow('release').jobs.publish;
    const preflight = publish.steps.findIndex(step => step.run === 'node .github/scripts/trusted-publish-check.mjs');
    const upload = publish.steps.findIndex(step => step.uses?.startsWith('changesets/action/publish@'));
    assert.ok(preflight >= 0 && preflight < upload);
    assert.deepEqual(publish.permissions, { contents: 'write', 'id-token': 'write' });
});
