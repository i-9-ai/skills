// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';
import { main } from '../../../.github/scripts/package-availability.mjs';

test('availability runs after official publication with action-derived exact versions and read-only permissions', () => {
    const workflow = parse(readFileSync(new URL('../../../.github/workflows/release.yml', import.meta.url), 'utf8'));
    const publish = workflow.jobs.publish;
    const action = publish.steps.find((step) => step.id === 'publish');
    assert.equal(action.uses, 'changesets/action/publish@ae32849d5ba541f9ae29e40e22a623bc13562f51');
    assert.deepEqual(action.with, {
        'pack-dir-artifact-id': '${{ needs.pack.outputs.pack-dir-artifact-id }}',
        'create-github-releases': true,
        'push-git-tags': true,
    });
    assert.deepEqual(publish.outputs, {
        published: '${{ steps.publish.outputs.published }}',
        'published-packages': '${{ steps.publish.outputs.published-packages }}',
    });
    assert.deepEqual(publish.permissions, { contents: 'write', 'id-token': 'write' });

    const availability = workflow.jobs.availability;
    assert.equal(availability.needs, 'publish');
    assert.equal(availability.if, "needs.publish.outputs.published == 'true'");
    assert.equal(availability['timeout-minutes'], 20);
    assert.deepEqual(availability.permissions, { contents: 'read' });
    assert.equal(availability.steps[0].with.ref, '${{ github.sha }}');
    assert.equal(availability.steps[0].with['persist-credentials'], false);
    const check = availability.steps.at(-1);
    assert.equal(check.name, 'Verify public npm metadata and tarball availability');
    assert.equal(check.run, 'node .github/scripts/package-availability.mjs');
    assert.deepEqual(check.env, {
        PUBLISHED_PACKAGES: '${{ needs.publish.outputs.published-packages }}',
    });
    assert.doesNotMatch(JSON.stringify(availability),
        /secrets\.|id-token|npm ci|npm install|npm publish|continue-on-error|GH_TOKEN|NPM_TOKEN|NODE_AUTH_TOKEN/u);
});

test('the thin launcher forwards action output and manifest without selecting a dist-tag', async () => {
    const identity = { name: '@example/fixture', version: '1.2.3' };
    const published = JSON.stringify([identity]);
    const result = { status: 'available', installed_runtime: 'not_checked' };
    let calls = 0;
    assert.equal(await main(published, identity, {
        async verifyPublished(output, expected) {
            calls += 1;
            assert.equal(output, published);
            assert.equal(expected, identity);
            return result;
        },
    }), result);
    assert.equal(calls, 1);
});

test('launcher input errors fail without network, credentials or unbounded diagnostics', () => {
    const sentinel = ['synthetic', 'credential', 'sentinel'].join('-');
    const script = fileURLToPath(new URL('../../../.github/scripts/package-availability.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script], {
        cwd: dirname(script),
        env: { PATH: dirname(process.execPath), PUBLISHED_PACKAGES: 'not-json', NPM_TOKEN: sentinel },
        encoding: 'utf8', timeout: 5000, maxBuffer: 8192,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    const diagnostic = JSON.parse(result.stderr);
    assert.equal(diagnostic.status, 'rejected');
    assert.equal(diagnostic.installed_runtime, 'not_checked');
    assert.equal(diagnostic.error.code, 'invalid_publication_output');
    assert.equal(diagnostic.error.attempts, 0);
    assert.equal(result.stderr.includes(sentinel), false);
});
