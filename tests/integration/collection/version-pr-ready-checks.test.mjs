// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';

const protectedWorkflows = [
    { file: 'validate', name: 'Validate skill collection', job: 'validate' },
    { file: 'changesets', name: 'Validate pending release notes', job: 'changesets' },
    { file: 'secret-scanning', name: 'Detect credential patterns', job: 'secret-scanning' },
];

for (const expected of protectedWorkflows) {
    test(`${expected.file} checks a ready version PR while preserving existing contribution boundaries`, () => {
        const definition = parse(readFileSync(
            new URL(`../../../.github/workflows/${expected.file}.yml`, import.meta.url), 'utf8',
        ));

        assert.deepEqual(definition.on.pull_request, {
            types: ['opened', 'synchronize', 'reopened', 'ready_for_review'],
        });
        assert.deepEqual(definition.on.push, { branches: ['main'] });
        assert.deepEqual(Object.keys(definition.on), expected.file === 'secret-scanning'
            ? ['pull_request', 'push', 'workflow_dispatch'] : ['pull_request', 'push']);
        if (expected.file === 'secret-scanning') assert.equal(definition.on.workflow_dispatch, null);

        assert.equal(definition.name, expected.name);
        assert.deepEqual(Object.keys(definition.jobs), [expected.job]);
        assert.deepEqual(definition.permissions, { contents: 'read' });
        const job = definition.jobs[expected.job];
        assert.equal(job.name, undefined);
        assert.equal(job.permissions, undefined);
        assert.equal(job.if, undefined);

        const checkout = job.steps.find((step) => step.uses?.startsWith('actions/checkout@'));
        assert.equal(checkout.with.ref, '${{ github.event.pull_request.head.sha || github.sha }}');
        assert.equal(checkout.with['persist-credentials'], false);
        assert.equal(checkout.with['fetch-depth'], 0);
        assert.doesNotMatch(JSON.stringify(definition),
            /pull_request_target|secrets\.|id-token|GH_TOKEN|NPM_TOKEN|NODE_AUTH_TOKEN|continue-on-error/u);
    });
}
