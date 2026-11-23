// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { ensureDependabotChangeset, planChangeset } from '../../../.github/scripts/dependabot-changesets.mjs';

const repository = 'example/fixture';
const sha = 'a'.repeat(40);
const file = filename => ({ filename, status: 'modified' });

function fixture({ files = [file('package.json'), file('package-lock.json')], pr = {}, event, responses = {} } = {}) {
    const pull = {
        number: 123, state: 'open', user: { login: 'dependabot[bot]', type: 'Bot' },
        head: { ref: 'dependabot/npm_and_yarn/example', sha, repo: { full_name: repository } },
        base: { ref: 'main', repo: { full_name: repository } }, changed_files: files.length,
        ...pr,
    };
    const calls = [];
    const options = {
        repository, token: 'synthetic-local-only', packageName: '@example/fixture',
        eventName: event ? 'workflow_run' : 'workflow_dispatch',
        event: event ?? { inputs: { 'pull-request': '123' } },
        fetchImpl: async (url, request) => {
            const path = new URL(url).pathname + new URL(url).search;
            const body = request.body ? JSON.parse(request.body) : undefined;
            calls.push({ path, body, method: request.method });
            assert.equal(request.headers.authorization, 'Bearer synthetic-local-only');
            if (Object.hasOwn(responses, path)) return responses[path]();
            if (path === `/repos/${repository}/pulls/123`) return Response.json(pull);
            if (path.startsWith(`/repos/${repository}/pulls/123/files?`)) {
                const page = Number(new URL(url).searchParams.get('page'));
                return Response.json(files.slice((page - 1) * 100, page * 100));
            }
            if (path === `/repos/${repository}/contents/.changeset/dependabot-123.md?ref=${sha}`) return new Response(null, { status: 404 });
            if (path === '/graphql') return Response.json({ data: { createCommitOnBranch: { commit: { oid: 'b'.repeat(40), url: 'https://example.invalid/commit' } } } });
            assert.fail(`Unexpected request: ${path}`);
        },
    };
    return { options, pull, calls, run: () => ensureDependabotChangeset(options) };
}

function completedRun(overrides = {}) {
    return { workflow_run: {
        event: 'pull_request', actor: { login: 'dependabot[bot]' },
        head_repository: { full_name: repository }, head_sha: sha,
        pull_requests: [{ number: 123 }], ...overrides,
    } };
}

test('npm updates atomically add one package patch note to the expected branch head', async () => {
    const state = fixture();
    const result = await state.run();
    assert.equal(result.created, '.changeset/dependabot-123.md');
    const writes = state.calls.filter(call => call.method === 'POST');
    assert.equal(writes.length, 1);
    const input = writes[0].body.variables.input;
    assert.equal(input.expectedHeadOid, sha);
    assert.deepEqual(input.branch, { repositoryNameWithOwner: repository, branchName: state.pull.head.ref });
    assert.equal(input.fileChanges.additions.length, 1);
    assert.equal(input.fileChanges.deletions, undefined);
    const note = input.fileChanges.additions[0];
    assert.equal(note.path, result.created);
    assert.match(Buffer.from(note.contents, 'base64').toString(), /^---\n"@example\/fixture": patch\n---\n/u);
    assert.equal(state.calls.some(call => /artifacts|archive|zipball/u.test(call.path)), false);
});

test('Actions-only updates produce an empty Changeset and npm development updates use the same patch policy', () => {
    const actions = planChangeset({ number: 123, changed_files: 1 }, [file('.github/workflows/validate.yml')], '@example/fixture');
    assert.match(actions.content, /^---\n---\n/u);
    assert.match(actions.content, /no package release/u);
    assert.match(planChangeset({ number: 123, changed_files: 1 }, [file('package-lock.json')], '@example/fixture').content, /: patch\n/u);
});

test('repeated runs and maintainer notes do not create or overwrite notes', async () => {
    for (const name of ['.changeset/dependabot-123.md', '.changeset/maintainer-note.md']) {
        const state = fixture({ files: [file('package.json'), { filename: name, status: 'added' }] });
        assert.match((await state.run()).skipped, /already contains/u);
        assert.equal(state.calls.some(call => call.method === 'POST'), false);
    }
    const state = fixture({ responses: {
        [`/repos/${repository}/contents/.changeset/dependabot-123.md?ref=${sha}`]: () => Response.json({ type: 'file' }),
    } });
    assert.match((await state.run()).skipped, /not be overwritten/u);
    assert.equal(state.calls.some(call => call.method === 'POST'), false);
});

test('human, fork, wrong-base, closed and unsupported-file contributions cannot mutate', async () => {
    for (const pr of [
        { user: { login: 'fixture-user', type: 'User' } },
        { head: { ref: 'dependabot/example', sha, repo: { full_name: 'other/fork' } } },
        { head: { ref: 'feature/example', sha, repo: { full_name: repository } } },
        { base: { ref: 'other', repo: { full_name: repository } } },
        { state: 'closed' },
    ]) {
        const state = fixture({ pr });
        assert.ok((await state.run()).skipped);
        assert.equal(state.calls.some(call => call.method === 'POST'), false);
    }
    const state = fixture({ files: [file('src/example.ts')] });
    assert.match((await state.run()).skipped, /unsupported changes/u);
    assert.equal(state.calls.some(call => call.method === 'POST'), false);
});

test('stale and non-Dependabot completed runs cannot mutate', async () => {
    for (const overrides of [{ head_sha: 'c'.repeat(40) }, { actor: { login: 'fixture-user' } },
        { event: 'push' }, { head_repository: { full_name: 'other/fork' } }, { pull_requests: [{ number: 123 }, { number: 124 }] }]) {
        const state = fixture({ event: completedRun(overrides) });
        assert.ok((await state.run()).skipped);
        assert.equal(state.calls.some(call => call.method === 'POST'), false);
    }
});

test('completed runs resolve missing PR associations and paginate all changed files', async () => {
    const state = fixture({
        event: completedRun({ pull_requests: [] }),
        files: Array.from({ length: 101 }, (_, index) => file(`.github/workflows/example-${index}.yml`)),
        responses: { [`/repos/${repository}/commits/${sha}/pulls?per_page=100`]: () => Response.json([{ number: 123 }]) },
    });
    assert.ok((await state.run()).created);
    assert.ok(state.calls.some(call => call.path.endsWith('page=2')));
});

test('incomplete file lists, HTTP errors and atomic head conflicts fail visibly', async () => {
    const incomplete = fixture({ pr: { changed_files: 3 } });
    await assert.rejects(incomplete.run, /Incomplete/u);
    const failed = fixture({ responses: { [`/repos/${repository}/pulls/123`]: () => new Response(null, { status: 403 }) } });
    await assert.rejects(failed.run, /HTTP 403/u);
    const raced = fixture({ responses: { '/graphql': () => Response.json({ errors: [{ message: 'Expected head changed' }] }) } });
    await assert.rejects(raced.run, /branch may have advanced/u);
    assert.equal(raced.calls.filter(call => call.method === 'POST').length, 1, 'no automatic retry against an unreviewed head');
});

test('invalid manual PR numbers and unsupported events never reach GitHub', async () => {
    for (const value of ['0', '-1', '1; arbitrary', '9007199254740992']) {
        const state = fixture();
        state.options.event.inputs['pull-request'] = value;
        await assert.rejects(state.run, /pull request number/u);
        assert.equal(state.calls.length, 0);
    }
    const state = fixture();
    state.options.eventName = 'push';
    await assert.rejects(state.run, /Unsupported workflow event/u);
});

test('workflow privilege is confined to trusted follow-up code without contribution checkout or installs', () => {
    const workflow = parse(readFileSync('.github/workflows/dependabot-changesets.yml', 'utf8'));
    assert.deepEqual(workflow.on.workflow_run, { workflows: ['Validate pending release notes'], types: ['completed'] });
    assert.equal(workflow.on.pull_request_target, undefined);
    assert.deepEqual(workflow.permissions, {});
    const job = workflow.jobs.changeset;
    assert.deepEqual(job.permissions, { contents: 'write', 'pull-requests': 'read' });
    const checkout = job.steps.find(step => step.uses?.startsWith('actions/checkout@'));
    assert.equal(checkout.with.ref, '${{ github.sha }}');
    assert.equal(checkout.with['persist-credentials'], false);
    assert.match(job.if, /github\.ref_name == github\.event\.repository\.default_branch/u);
    assert.deepEqual(job.steps.filter(step => step.run).map(step => step.run), ['node .github/scripts/dependabot-changesets.mjs']);
    assert.equal(job.steps.find(step => step.uses?.startsWith('actions/setup-node@')).with['package-manager-cache'], false);
});

test('the official Changesets CLI accepts both generated note types in disposable repositories', t => {
    const cli = resolve('node_modules/@changesets/cli/bin.js');
    for (const filename of ['package.json', '.github/workflows/validate.yml']) {
        const root = mkdtempSync(join(tmpdir(), 'i9-dependabot-notes-'));
        t.after(() => rmSync(root, { recursive: true, force: true }));
        mkdirSync(join(root, '.changeset'));
        const identity = { name: '@example/fixture', version: '1.0.0', private: true };
        writeFileSync(join(root, 'package.json'), JSON.stringify(identity));
        writeFileSync(join(root, '.changeset/config.json'), JSON.stringify({
            changelog: false, commit: false, fixed: [], linked: [], access: 'restricted', baseBranch: 'main',
            updateInternalDependencies: 'patch', ignore: [], privatePackages: { version: true, tag: false },
        }));
        const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
        for (const args of [['init', '-q', '--initial-branch=main'], ['add', '.'],
            ['-c', 'user.name=Synthetic Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Fixture']]) {
            const result = spawnSync('git', args, { cwd: root, env, encoding: 'utf8', timeout: 5000 });
            assert.equal(result.status, 0, result.stderr);
        }
        const note = planChangeset({ number: 123, changed_files: 1 }, [file(filename)], identity.name);
        writeFileSync(join(root, note.path), note.content);
        const result = spawnSync(process.execPath, [cli, 'status', '--since=main'], { cwd: root, env, encoding: 'utf8', timeout: 10000 });
        assert.equal(result.status, 0, result.stdout + result.stderr);
    }
});
