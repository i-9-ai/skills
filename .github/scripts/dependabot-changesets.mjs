// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const notePath = /^\.changeset\/(?!README\.md$)[a-zA-Z0-9_-]+\.md$/u;
const manifestPath = /^(?:package\.json|package-lock\.json)$/u;
const actionPath = /^\.github\/workflows\/[^/]+\.ya?ml$/u;
const shaPattern = /^[a-f0-9]{40}$/u;

export function planChangeset(pr, files, packageName) {
    if (files.length !== pr.changed_files) throw new Error('Incomplete pull request file list.');
    if (files.some(file => file.status !== 'removed' && notePath.test(file.filename))) {
        return { skipped: 'The pull request already contains a Changeset.' };
    }
    if (!files.length || files.some(file => !manifestPath.test(file.filename) && !actionPath.test(file.filename))) {
        return { skipped: 'The pull request contains unsupported changes; review its release intent manually.' };
    }
    const npm = files.some(file => manifestPath.test(file.filename));
    return {
        path: `.changeset/dependabot-${pr.number}.md`,
        content: npm
            ? `---\n${JSON.stringify(packageName)}: patch\n---\n\nUpdate npm dependencies in the root manifest and lockfile (Dependabot PR #${pr.number}).\n`
            : `---\n---\n\nUpdate pinned GitHub Actions dependencies (Dependabot PR #${pr.number}); no package release is required.\n`,
    };
}

export async function ensureDependabotChangeset({
    event, eventName, repository, token, packageName,
    apiUrl = 'https://api.github.com', graphqlUrl = 'https://api.github.com/graphql',
    fetchImpl = globalThis.fetch,
}) {
    if (!/^[\w.-]+\/[\w.-]+$/u.test(repository) || !token || !packageName) {
        throw new Error('Repository, token and trusted package name are required.');
    }
    async function request(url, body, allowMissing = false) {
        const response = await fetchImpl(url, {
            method: body ? 'POST' : 'GET',
            headers: {
                authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
                'content-type': 'application/json', 'user-agent': 'i9-dependabot-changesets',
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(30_000),
        });
        if (allowMissing && response.status === 404) return null;
        if (!response.ok) throw new Error(`GitHub API request failed (HTTP ${response.status}).`);
        return response.json();
    }
    const rest = path => request(`${apiUrl}/repos/${repository}${path}`);
    let number;
    let expectedHead;
    if (eventName === 'workflow_dispatch') {
        if (!/^[1-9]\d*$/u.test(event.inputs?.['pull-request'] ?? '')) throw new Error('A positive pull request number is required.');
        number = Number(event.inputs['pull-request']);
        if (!Number.isSafeInteger(number)) throw new Error('Invalid pull request number.');
    } else if (eventName === 'workflow_run') {
        const run = event.workflow_run;
        if (run?.event !== 'pull_request' || run.actor?.login !== 'dependabot[bot]' ||
            run.head_repository?.full_name !== repository || !shaPattern.test(run.head_sha)) {
            return { skipped: 'The completed run is not a same-repository Dependabot contribution.' };
        }
        expectedHead = run.head_sha;
        // GitHub may omit associated PRs from workflow_run; resolve that SHA as inert metadata.
        const associated = run.pull_requests?.length ? run.pull_requests
            : await rest(`/commits/${expectedHead}/pulls?per_page=100`);
        if (associated.length !== 1) return { skipped: 'The completed run does not identify exactly one pull request.' };
        number = associated[0].number;
        if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid associated pull request number.');
    } else {
        throw new Error('Unsupported workflow event.');
    }
    const pr = await rest(`/pulls/${number}`);
    if (pr.number !== number || pr.state !== 'open' || pr.user?.login !== 'dependabot[bot]' ||
        pr.user.type !== 'Bot' || pr.head?.repo?.full_name !== repository ||
        pr.base?.repo?.full_name !== repository || pr.base.ref !== 'main' ||
        !pr.head.ref.startsWith('dependabot/') || !shaPattern.test(pr.head.sha)) {
        return { skipped: 'The live pull request is not an eligible open Dependabot branch.' };
    }
    if (expectedHead && pr.head.sha !== expectedHead) return { skipped: 'The completed run is stale.' };
    if (!Number.isSafeInteger(pr.changed_files) || pr.changed_files < 1 || pr.changed_files > 3000) {
        throw new Error('Unsupported pull request file count.');
    }
    const files = [];
    for (let page = 1; files.length < pr.changed_files; page++) {
        const batch = await rest(`/pulls/${number}/files?per_page=100&page=${page}`);
        if (!Array.isArray(batch) || !batch.length) throw new Error('Incomplete pull request file list.');
        files.push(...batch);
    }
    const plan = planChangeset(pr, files, packageName);
    if (plan.skipped) return plan;
    const existing = await request(`${apiUrl}/repos/${repository}/contents/${plan.path}?ref=${pr.head.sha}`, undefined, true);
    if (existing !== null) return { skipped: 'The generated Changeset path already exists; it will not be overwritten.' };
    const result = await request(graphqlUrl, {
        query: `mutation($input: CreateCommitOnBranchInput!) {
            createCommitOnBranch(input: $input) { commit { oid url } }
        }`,
        variables: { input: {
            branch: { repositoryNameWithOwner: repository, branchName: pr.head.ref },
            expectedHeadOid: pr.head.sha,
            message: { headline: `chore: add Changeset for Dependabot PR #${number}` },
            fileChanges: { additions: [{ path: plan.path, contents: Buffer.from(plan.content).toString('base64') }] },
        } },
    });
    if (result.errors?.length || !result.data?.createCommitOnBranch?.commit?.oid) {
        throw new Error('Changeset commit failed; the branch may have advanced. Rerun against its current head.');
    }
    return { created: plan.path, commit: result.data.createCommitOnBranch.commit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const result = await ensureDependabotChangeset({
            event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
            eventName: process.env.GITHUB_EVENT_NAME,
            repository: process.env.GITHUB_REPOSITORY,
            token: process.env.GITHUB_TOKEN,
            packageName: JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).name,
            apiUrl: process.env.GITHUB_API_URL,
            graphqlUrl: process.env.GITHUB_GRAPHQL_URL,
        });
        console.log(JSON.stringify(result));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
