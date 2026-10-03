// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { ReleaseReferenceRunner } from '../../../src/transport/ReleaseReferenceRunner.ts';
import { ReleaseReferenceValidator } from '../../../src/validator/ReleaseReferenceValidator.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const receiptFile = '.changeset/github-references.json';
const noteFile = '.changeset/synthetic-feature.md';
const pluginFiles = [
    '.codex-plugin/plugin.json',
    '.claude-plugin/plugin.json',
    '.github/plugin/plugin.json',
];
const references = new ReleaseReferenceValidator();
const history =
    '# @example/release-fixture\n\n## 1.2.3\n\n### Patch Changes\n\n- Preserve existing history.  \n\n```text\n  Keep indentation.\n```\n\n## 1.2.2\n\n- Preserve the earlier release.\n';
const note =
    '---\n"@example/release-fixture": minor\n---\n\nIntroduce `repo compare` for #42.\n\nPreserve **Markdown** and [usage guidance](https://example.test/usage).\n\n- Verify inputs.\n- Keep existing behavior.\n\n```sh\nexample repo compare --base "$BASE"\n```\n';

function write(root, file, value) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), value);
}

function writeJson(root, file, value) {
    write(root, file, JSON.stringify(value, null, 2) + '\n');
}

function json(root, file) {
    return JSON.parse(readFileSync(join(root, file), 'utf8'));
}

function files(root) {
    return Object.fromEntries(
        readdirSync(root, { recursive: true, withFileTypes: true })
            .filter(
                (entry) =>
                    entry.isFile() && !relative(root, entry.parentPath).split('/').includes('.git'),
            )
            .map((entry) => {
                const path = join(entry.parentPath, entry.name);
                return [relative(root, path), readFileSync(path, 'utf8')];
            })
            .sort(([left], [right]) => left.localeCompare(right)),
    );
}

function fixture(t) {
    const temporary = mkdtempSync(join(tmpdir(), 'i9-github-release-test-'));
    const root = join(temporary, 'project');
    const home = join(temporary, 'home');
    mkdirSync(root);
    mkdirSync(home);
    t.after(() => rmSync(temporary, { recursive: true, force: true }));

    const pkg = {
        name: '@example/release-fixture',
        version: '1.2.3',
        private: true,
        license: 'Apache-2.0',
        description: 'Synthetic GitHub release fixture.',
    };
    writeJson(root, 'package.json', pkg);
    writeJson(root, 'package-lock.json', {
        name: pkg.name,
        version: pkg.version,
        lockfileVersion: 3,
        requires: true,
        packages: { '': { name: pkg.name, version: pkg.version, license: pkg.license } },
    });
    for (const [index, file] of pluginFiles.entries()) {
        writeJson(root, file, {
            name: `synthetic-plugin-${index}`,
            version: pkg.version,
            description: 'Preserve host metadata.',
            metadata: { host: index },
        });
    }
    writeJson(root, '.changeset/config.json', {
        changelog: ['@changesets/changelog-github', { repo: 'example/release' }],
        commit: false,
        format: false,
        fixed: [],
        linked: [],
        access: 'restricted',
        baseBranch: 'main',
        updateInternalDependencies: 'patch',
        privatePackages: { version: true, tag: false },
        ignore: [],
    });
    write(root, '.changeset/README.md', '# Synthetic release notes\n');
    write(root, 'implementation.ts', 'export const behavior = 1;\n');
    write(root, 'CHANGELOG.md', history);
    write(root, noteFile, note);
    write(
        root,
        '.env',
        `GITHUB_TOKEN=${['synthetic', 'file', 'token'].join('-')}\nGITHUB_SERVER_URL=https://example.test/forbidden\nGITHUB_GRAPHQL_URL=https://example.test/forbidden\n`,
    );

    const environment = Object.fromEntries(
        Object.entries(process.env).filter(
            ([key]) =>
                !key.startsWith('GIT_') && !key.startsWith('GITHUB_') && key !== 'NODE_OPTIONS',
        ),
    );
    Object.assign(environment, {
        HOME: home,
        XDG_CONFIG_HOME: home,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        NODE_DISABLE_COMPILE_CACHE: '1',
        CI: 'true',
        NO_COLOR: '1',
    });
    const target = { root, home, temporary, environment };
    writeHarness(target);
    git(target, ['init', '--quiet', '--initial-branch=main']);
    target.noteCommit = commit(target, 'Introduce synthetic note and complete history');
    write(
        root,
        '.changeset/synthetic-fix.md',
        '---\n"@example/release-fixture": patch\n---\n\nRetain direct-commit diagnostics.\n\nInclude the recovery procedure.\n',
    );
    target.base = commit(target, 'Record a second synthetic note');
    return target;
}

function git(target, args) {
    const result = spawnSync(
        'git',
        [
            '-c',
            'user.name=Synthetic Reviewer',
            '-c',
            'user.email=reviewer@example.test',
            '-c',
            'core.hooksPath=/dev/null',
            ...args,
        ],
        { cwd: target.root, env: target.environment, encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    return result.stdout.trim();
}

function commit(target, message) {
    git(target, ['add', '--all']);
    git(target, ['commit', '--quiet', '--no-gpg-sign', '-m', message]);
    return git(target, ['rev-parse', 'HEAD']);
}

function successful(result) {
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    return JSON.parse(result.stdout);
}

function writeHarness(target) {
    const preload = `
import fs from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { basename } from 'node:path';
const originalRead = fs.readFile;
fs.readFile = function (path, ...args) {
    if (basename(String(path)) === '.env') {
        appendFileSync(process.env.I9_TEST_ENV_READS, String(path) + '\\n');
        throw new Error('Test forbids reading .env');
    }
    return originalRead.call(this, path, ...args);
};
globalThis.fetch = async function (input, init) {
    appendFileSync(process.env.I9_TEST_CALLS, JSON.stringify({input: String(input), query: JSON.parse(init.body).query}) + '\\n');
    if (process.env.I9_TEST_PROVIDER === 'offline') throw new Error('Test forbids native network during replay');
    if (process.env.I9_TEST_PROVIDER === 'failure') return new Response(JSON.stringify({errors: [{message: 'Synthetic provider failure'}]}), {status: 200});
    if (String(input) !== 'https://api.github.com/graphql') throw new Error('Unexpected provider endpoint');
    const query = JSON.parse(init.body).query;
    const repo = {isPrivate: process.env.I9_TEST_PROVIDER === 'private'};
    const anonymous = ['null-author', 'null-user'].includes(process.env.I9_TEST_PROVIDER);
    const pullAuthor = anonymous ? null : process.env.I9_TEST_PROVIDER === 'bots'
        ? {login: 'dependabot[bot]', url: 'https://github.com/apps/dependabot'}
        : {login: 'synthetic-pr-author', url: 'https://github.com/synthetic-pr-author'};
    const commitAuthor = anonymous ? null : process.env.I9_TEST_PROVIDER === 'bots'
        ? {login: 'github-actions[bot]', url: 'https://github.com/apps/github-actions'}
        : {login: 'synthetic-commit-author', url: 'https://github.com/synthetic-commit-author'};
    for (const match of query.matchAll(/commit__([a-f0-9]{40}):/g)) {
        const sha = match[1];
        const associated = sha === process.env.I9_TEST_NOTE_COMMIT;
        repo['commit__' + sha] = {
            commitUrl: 'https://github.com/example/release/commit/' + sha,
            associatedPullRequests: {nodes: associated ? [{number: 17, url: 'https://github.com/example/release/pull/17', mergedAt: process.env.I9_TEST_PROVIDER === 'bots' ? '2026-01-02T03:04:05.123+00:00' : '2026-01-02T03:04:05Z', author: pullAuthor}] : []},
            author: process.env.I9_TEST_PROVIDER === 'null-author' ? null : {user: commitAuthor},
        };
    }
    for (const match of query.matchAll(/pull__(\\d+):/g)) {
        const number = Number(match[1]);
        repo['pull__' + number] = {
            url: 'https://github.com/example/release/pull/' + number,
            author: pullAuthor,
            mergeCommit: {commitUrl: 'https://github.com/example/release/commit/' + 'a'.repeat(40), abbreviatedOid: 'aaaaaaa'},
        };
    }
    return new Response(JSON.stringify({data: {repo__0: repo}}), {status: 200});
};
`;
    write(target.temporary, 'provider.mjs', preload);
    write(
        target.temporary,
        'service.mjs',
        `
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ReleaseVersionRepository } from ${JSON.stringify(pathToFileURL(join(repository, 'src/repository/ReleaseVersionRepository.ts')).href)};
import { ReleaseVersionService } from ${JSON.stringify(pathToFileURL(join(repository, 'src/service/ReleaseVersionService.ts')).href)};
const require = createRequire(${JSON.stringify(pathToFileURL(join(repository, 'package.json')).href)});
const runner = (root, environment) => {
    const result = spawnSync(process.execPath, ['--import', ${JSON.stringify(pathToFileURL(join(target.temporary, 'provider.mjs')).href)}, '--import', ${JSON.stringify(pathToFileURL(join(repository, 'src/transport/ReleaseReferenceRunner.ts')).href)}, require.resolve('@changesets/cli/bin.js'), 'version'], {cwd: root, env: {...environment, NODE_OPTIONS: ''}, encoding: 'utf8', timeout: 30000});
    if (result.status !== 0) throw new Error([result.stdout, result.stderr].filter(Boolean).join('\\n') || String(result.error));
};
try {
    const service = new ReleaseVersionService(new ReleaseVersionRepository(process.env.I9_TEST_ROOT, runner));
    console.log(JSON.stringify(process.env.I9_TEST_OPERATION === 'prepare' ? service.prepare() : service.verify(process.env.I9_TEST_BASE)));
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
`,
    );
}

function service(target, operation, provider = 'success') {
    const environment = {
        ...target.environment,
        I9_TEST_ROOT: target.root,
        I9_TEST_BASE: target.base,
        I9_TEST_OPERATION: operation,
        I9_TEST_PROVIDER: provider,
        I9_TEST_CALLS: join(target.temporary, 'calls.jsonl'),
        I9_TEST_ENV_READS: join(target.temporary, 'env-reads.log'),
        I9_TEST_NOTE_COMMIT: target.noteCommit,
        GITHUB_SERVER_URL: 'https://example.test/forbidden',
        GITHUB_GRAPHQL_URL: 'https://example.test/forbidden',
    };
    if (operation === 'prepare')
        environment.GITHUB_TOKEN = ['synthetic', 'provider', 'token'].join('-');
    return spawnSync(process.execPath, [join(target.temporary, 'service.mjs')], {
        cwd: target.root,
        env: environment,
        encoding: 'utf8',
        timeout: 60000,
    });
}

function calls(target) {
    const path = join(target.temporary, 'calls.jsonl');
    return existsSync(path)
        ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
        : [];
}

function preparedFixture(t) {
    const target = fixture(t);
    assert.deepEqual(successful(service(target, 'prepare')), {
        version: '1.3.0',
        changed: true,
        notes: 2,
    });
    target.receipt = json(target.root, receiptFile);
    target.changelog = readFileSync(join(target.root, 'CHANGELOG.md'), 'utf8');
    commit(target, 'Record synthetic GitHub version preparation');
    return target;
}

function rawReceipt(identity, exchanges) {
    const payload = { ...identity, exchanges };
    return {
        ...payload,
        sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    };
}

function unusedExchange() {
    const sha = 'c'.repeat(40);
    return {
        query:
            'query {\n  repo__0: repository(\n    owner: "example",\n    name: "release"\n  ) {\n' +
            `    commit__${sha}: object(expression: "${sha}") {\n      ... on Commit {\n        ...CommitFragment\n      }\n    }\n` +
            '  }\n}\n' +
            ReleaseReferenceValidator.commitFragment,
        data: {
            repo__0: {
                [`commit__${sha}`]: {
                    commitUrl: `https://github.com/example/release/commit/${sha}`,
                    associatedPullRequests: { nodes: [] },
                    author: { user: null },
                },
            },
        },
    };
}

function referenceIdentity() {
    return {
        schema_version: 1,
        base: 'b'.repeat(40),
        generator: '@changesets/changelog-github',
        generator_version: '1.0.1',
        repo: 'example/release',
    };
}

function request(exchange) {
    return {
        method: 'POST',
        headers: { Authorization: `Token ${['synthetic', 'request', 'token'].join('-')}` },
        body: JSON.stringify({ query: exchange.query }),
    };
}

test('official GitHub renderer records PR, direct commit and complete Markdown for offline verification', (t) => {
    const target = preparedFixture(t);
    const before = files(target.root);
    const providerCalls = calls(target);
    assert.ok(
        providerCalls.length > 0,
        'preparation must resolve references through the fake provider',
    );
    assert.ok(providerCalls.every((call) => call.input === 'https://api.github.com/graphql'));
    assert.ok(providerCalls.every((call) => /\bisPrivate\b/u.test(call.query)));
    assert.match(target.changelog, /\[#17\]\(https:\/\/github\.com\/example\/release\/pull\/17\)/u);
    assert.ok(
        target.changelog.includes('https://github.com/example/release/commit/' + target.noteCommit),
    );
    assert.ok(
        target.changelog.includes('https://github.com/example/release/commit/' + target.base),
    );
    assert.match(target.changelog, /Thanks \[@synthetic-pr-author\]/u);
    assert.match(target.changelog, /Thanks \[@synthetic-commit-author\]/u);
    assert.match(target.changelog, /Introduce `repo compare` for \[#42\]/u);
    assert.match(target.changelog, /Preserve \*\*Markdown\*\* and \[usage guidance\]/u);
    assert.match(target.changelog, /example repo compare --base "\$BASE"/u);
    assert.ok(target.changelog.endsWith(history.slice(history.indexOf('## 1.2.3'))));
    assert.equal(target.receipt.base, target.base);
    assert.equal(target.receipt.repo, 'example/release');
    assert.equal(target.receipt.generator_version, '1.0.1');
    assert.equal(JSON.stringify(target.receipt).includes('isPrivate'), false);
    assert.doesNotMatch(JSON.stringify(target.receipt), /token|Authorization/u);

    assert.equal(successful(service(target, 'verify', 'offline')).prepared, true);
    assert.deepEqual(calls(target), providerCalls, 'replay must not invoke the native provider');
    assert.equal(existsSync(join(target.temporary, 'env-reads.log')), false);
    assert.deepEqual(files(target.root), before, 'verification preserves every selected file');
    assert.equal(git(target, ['status', '--porcelain']), '');
});

const receiptMutations = [
    ['missing', (target) => rmSync(join(target.root, receiptFile))],
    [
        'tampered data without a new digest',
        (target) => {
            const receipt = json(target.root, receiptFile);
            const data = receipt.exchanges[0].data.repo__0;
            const commit = Object.values(data).find((entry) => entry.commitUrl);
            commit.author.user = {
                login: 'tampered-author',
                url: 'https://github.com/tampered-author',
            };
            writeJson(target.root, receiptFile, receipt);
        },
    ],
    [
        'duplicate exchanges',
        (target) => {
            const { sha256, exchanges, ...identity } = json(target.root, receiptFile);
            writeJson(target.root, receiptFile, rawReceipt(identity, [...exchanges, exchanges[0]]));
        },
    ],
    [
        'unused selector evidence',
        (target) => {
            const { sha256, exchanges, ...identity } = json(target.root, receiptFile);
            writeJson(
                target.root,
                receiptFile,
                references.seal(identity, [...exchanges, unusedExchange()]),
            );
        },
    ],
    [
        'missing selector evidence',
        (target) => {
            const { sha256, exchanges, ...identity } = json(target.root, receiptFile);
            writeJson(target.root, receiptFile, references.seal(identity, []));
        },
    ],
    [
        'unrelated base identity',
        (target) => {
            const { sha256, exchanges, ...identity } = json(target.root, receiptFile);
            writeJson(
                target.root,
                receiptFile,
                references.seal({ ...identity, base: 'a'.repeat(40) }, exchanges),
            );
        },
    ],
];

for (const [label, mutate] of receiptMutations) {
    test(`offline release verification rejects ${label}`, (t) => {
        const target = preparedFixture(t);
        mutate(target);
        commit(target, 'Record invalid synthetic reference evidence');
        const before = files(target.root);
        const providerCalls = calls(target);
        const result = service(target, 'verify', 'offline');
        assert.notEqual(result.status, 0, result.stdout);
        assert.match(result.stderr, /reference|receipt|evidence|artifact|GitHub|changelog/iu);
        assert.deepEqual(files(target.root), before);
        assert.deepEqual(calls(target), providerCalls);
    });
}

test('offline release verification rejects changed generated PR attribution', (t) => {
    const target = preparedFixture(t);
    write(
        target.root,
        'CHANGELOG.md',
        target.changelog.replace('synthetic-pr-author', 'invented-author'),
    );
    commit(target, 'Record altered synthetic generated attribution');
    const before = files(target.root);
    const result = service(target, 'verify', 'offline');
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /changelog/iu);
    assert.deepEqual(files(target.root), before);
});

test('explicit PR metadata is rendered by the official generator and replayed offline', (t) => {
    const target = fixture(t);
    write(target.root, noteFile, note + '\nPR: #23\n');
    target.base = commit(target, 'Record an explicit synthetic PR reference');
    successful(service(target, 'prepare'));
    const receipt = json(target.root, receiptFile);
    const changelog = readFileSync(join(target.root, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /\[#23\]\(https:\/\/github\.com\/example\/release\/pull\/23\)/u);
    assert.ok(receipt.exchanges.some((exchange) => exchange.query.includes('pull__23:')));
    assert.doesNotMatch(changelog, /PR: #23/u);
    commit(target, 'Record an explicit PR version preparation');
    const providerCalls = calls(target);
    assert.equal(successful(service(target, 'verify', 'offline')).prepared, true);
    assert.deepEqual(calls(target), providerCalls);
});

test('official renderer preserves bot authors and fractional timestamp reference evidence', (t) => {
    const target = fixture(t);
    successful(service(target, 'prepare', 'bots'));
    const changelog = readFileSync(join(target.root, 'CHANGELOG.md'), 'utf8');
    assert.ok(changelog.includes('Thanks [@dependabot[bot]](https://github.com/apps/dependabot)!'));
    assert.ok(
        changelog.includes(
            'Thanks [@github-actions[bot]](https://github.com/apps/github-actions)!',
        ),
    );
    assert.ok(
        JSON.stringify(json(target.root, receiptFile)).includes('2026-01-02T03:04:05.123+00:00'),
    );
    commit(target, 'Record synthetic bot attribution');
    const providerCalls = calls(target);
    assert.equal(successful(service(target, 'verify', 'offline')).prepared, true);
    assert.deepEqual(calls(target), providerCalls);
});

for (const provider of ['null-author', 'null-user']) {
    test(`official renderer accepts ${provider} without inventing attribution`, (t) => {
        const target = fixture(t);
        successful(service(target, 'prepare', provider));
        const changelog = readFileSync(join(target.root, 'CHANGELOG.md'), 'utf8');
        assert.match(changelog, /\[#17\]/u);
        assert.doesNotMatch(changelog, /Thanks|\[@/u);
        commit(target, 'Record references without an available author');
        const providerCalls = calls(target);
        assert.equal(successful(service(target, 'verify', 'offline')).prepared, true);
        assert.deepEqual(calls(target), providerCalls);
    });
}

test('replay rejects reused queries and refuses completion after failure without contacting a provider', async () => {
    const exchange = unusedExchange();
    const identity = {
        schema_version: 1,
        base: 'b'.repeat(40),
        generator: '@changesets/changelog-github',
        generator_version: '1.0.1',
        repo: 'example/release',
    };
    let providerCalls = 0;
    const runner = new ReleaseReferenceRunner(
        'replay',
        references.seal(identity, [exchange]),
        () => {
            providerCalls += 1;
            throw new Error('Test forbids native provider calls');
        },
    );
    const init = { method: 'POST', body: JSON.stringify({ query: exchange.query }) };
    assert.deepEqual(await (await runner.fetch('https://api.github.com/graphql', init)).json(), {
        data: exchange.data,
    });
    await assert.rejects(runner.fetch('https://api.github.com/graphql', init), /Duplicate/u);
    assert.throws(() => runner.complete(), /Incomplete|unused/u);
    assert.equal(providerCalls, 0);
});

test('recording adds bounded provider controls and stores public data without authentication', async () => {
    const exchange = unusedExchange();
    const init = request(exchange);
    let observed;
    const runner = new ReleaseReferenceRunner(
        'record',
        references.seal(referenceIdentity(), []),
        (url, options) => {
            observed = { url, ...options };
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: { repo__0: { isPrivate: false, ...exchange.data.repo__0 } },
                    }),
                ),
            );
        },
    );
    await runner.fetch('https://api.github.com/graphql', init);
    const receipt = runner.complete();
    assert.equal(observed.url, 'https://api.github.com/graphql');
    assert.equal(observed.redirect, 'error');
    assert.equal(observed.signal.aborted, false);
    assert.equal(new Headers(observed.headers).get('Authorization'), init.headers.Authorization);
    assert.match(JSON.parse(observed.body).query, /\bisPrivate\b/u);
    assert.equal(receipt.exchanges[0].query, exchange.query);
    assert.deepEqual(receipt.exchanges[0].data, exchange.data);
    assert.doesNotMatch(
        JSON.stringify(receipt),
        /Authorization|synthetic-request-token|isPrivate/u,
    );
    assert.deepEqual(references.receipt(receipt), receipt);
    assert.throws(
        () => references.receipt({ ...receipt, token: init.headers.Authorization }),
        /Invalid/u,
    );
});

const invalidProviders = [
    ['unsuccessful HTTP', () => new Response('', { status: 503 }), /unsuccessful/u],
    [
        'declared oversized response',
        () =>
            new Response('{}', {
                headers: { 'content-length': String(ReleaseReferenceValidator.maximumBytes + 1) },
            }),
        /byte limit/u,
    ],
    [
        'streamed oversized response',
        () => new Response(' '.repeat(ReleaseReferenceValidator.maximumBytes + 1)),
        /byte limit/u,
    ],
    [
        'provider error payload',
        () => new Response(JSON.stringify({ errors: [{ message: 'Synthetic error' }] })),
        /Invalid/u,
    ],
    ['malformed JSON', () => new Response('{'), /JSON/u],
    [
        'native fetch failure',
        () => {
            throw new Error('Synthetic provider failure');
        },
        /request failed/u,
    ],
];

for (const [label, response, message] of invalidProviders) {
    test(`reference recording rejects ${label} and cannot complete partial evidence`, async () => {
        const exchange = unusedExchange();
        let providerCalls = 0;
        const runner = new ReleaseReferenceRunner(
            'record',
            references.seal(referenceIdentity(), []),
            () => {
                providerCalls += 1;
                return Promise.resolve(response());
            },
        );
        await assert.rejects(
            runner.fetch('https://api.github.com/graphql', request(exchange)),
            message,
        );
        assert.throws(() => runner.complete(), /Incomplete|unused/u);
        assert.equal(providerCalls, 1);
    });
}

for (const provider of ['failure', 'private']) {
    test(`GitHub ${provider} response rolls preparation back including the prior receipt`, (t) => {
        const target = fixture(t);
        const previous = references.seal(
            {
                schema_version: 1,
                base: 'b'.repeat(40),
                generator: '@changesets/changelog-github',
                generator_version: '1.0.1',
                repo: 'example/release',
            },
            [],
        );
        writeJson(target.root, receiptFile, previous);
        target.base = commit(target, 'Record a prior synthetic reference receipt');
        const before = files(target.root);
        const result = service(target, 'prepare', provider);
        assert.notEqual(result.status, 0, result.stdout);
        assert.deepEqual(
            files(target.root),
            before,
            'failed preparation restores all release artifacts',
        );
        assert.deepEqual(json(target.root, receiptFile), previous);
        assert.ok(calls(target).length > 0);
    });
}

test('GitHub preparation without an explicit token does not load credentials from .env', (t) => {
    const target = fixture(t);
    const fabricated = ['synthetic', 'env', 'token'].join('-');
    write(
        target.root,
        '.env',
        `GITHUB_TOKEN=${fabricated}\nGITHUB_GRAPHQL_URL=https://example.test/forbidden\n`,
    );
    target.base = commit(target, 'Record synthetic file-based credential input');
    const before = files(target.root);
    const result = spawnSync(
        process.execPath,
        [join(repository, 'bin/index.mjs'), 'repo', 'prepare-version', '--project', target.root],
        { cwd: target.root, env: target.environment, encoding: 'utf8', timeout: 30000 },
    );
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /requires an existing GITHUB_TOKEN/iu);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(fabricated, 'u'));
    assert.deepEqual(files(target.root), before);
    assert.equal(calls(target).length, 0);
});
