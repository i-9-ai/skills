// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

const workflow = parse(
    fs.readFileSync(new URL('../../../.github/workflows/validate.yml', import.meta.url), 'utf8'),
);
const command = workflow.jobs.validate.steps.find((step) =>
    step.name.startsWith('Validate every canonical skill and inspect'),
).run;

const preparation = workflow.jobs.validate.steps.find((step) =>
    step.name.startsWith('Prepare an explicit exact-revision quality request'),
);
const requestProgram = /<<'NODE'\n([\s\S]+)\nNODE/u.exec(preparation.run)?.[1];
assert.ok(requestProgram, 'the actual workflow must expose its request construction');
assert.equal(
    preparation.env.QUALITY_HEAD_REPOSITORY,
    '${{ github.event.pull_request.head.repo.html_url }}',
);
assert.equal(preparation.env.QUALITY_EVENT_REPOSITORY, '${{ github.event.repository.html_url }}');

for (const scenario of [
    {
        label: 'fork head identity',
        event: 'pull_request',
        ref: 'feature/quality',
        repository: 'https://github.com/example/fork',
        expectedRef: 'feature/quality',
    },
    {
        label: 'push identity',
        event: 'push',
        ref: 'main',
        repository: 'https://github.com/i-9-ai/skills',
        expectedRef: 'main',
    },
    {
        label: 'manual identity',
        event: 'workflow_dispatch',
        ref: 'main',
        repository: 'https://github.com/i-9-ai/skills',
        expectedRef: 'main',
    },
    {
        label: 'plus in valid Git ref',
        event: 'pull_request',
        ref: 'feature+quality',
        repository: 'https://github.com/example/fork',
        expectedRef: null,
    },
    {
        label: 'non-ASCII Git ref',
        event: 'pull_request',
        ref: 'feature/qualidade-á',
        repository: 'https://github.com/example/fork',
        expectedRef: null,
    },
    {
        label: 'long Git ref',
        event: 'pull_request',
        ref: 'feature/' + 'a'.repeat(128),
        repository: 'https://github.com/example/fork',
        expectedRef: null,
    },
    {
        label: 'missing fork repository never uses base identity',
        event: 'pull_request',
        ref: 'feature/quality',
        repository: null,
        expectedRef: null,
    },
]) {
    test('official CI request: ' + scenario.label, (t) => {
        const root = fs.realpathSync(
            fs.mkdtempSync(path.join(os.tmpdir(), 'i9-quality-ci-source-')),
        );
        t.after(() => fs.rmSync(root, { recursive: true, force: true }));
        const environmentFile = path.join(root, 'environment');
        fs.writeFileSync(environmentFile, '');
        const sha = 'a'.repeat(40);
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', requestProgram], {
            cwd: path.resolve('.'),
            env: {
                ...process.env,
                GITHUB_EVENT_NAME: scenario.event,
                QUALITY_SOURCE_SHA: sha,
                QUALITY_SOURCE_REF: scenario.ref,
                QUALITY_HEAD_REPOSITORY:
                    scenario.event === 'pull_request'
                        ? (scenario.repository ?? '')
                        : 'https://github.com/unselected/head',
                QUALITY_EVENT_REPOSITORY: 'https://github.com/i-9-ai/skills',
                RUNNER_TEMP: root,
                GITHUB_ENV: environmentFile,
            },
            encoding: 'utf8',
            timeout: 10_000,
        });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 0, result.stderr);
        const retainedRoot = fs
            .readFileSync(environmentFile, 'utf8')
            .split('\n')
            .find((line) => line.startsWith('I9_OFFICIAL_QUALITY_ROOT='))
            ?.split('=')[1];
        assert.ok(retainedRoot?.startsWith(root + path.sep));
        const request = JSON.parse(
            fs.readFileSync(path.join(retainedRoot, 'request.json'), 'utf8'),
        );
        assert.equal(request.source.repository, scenario.repository);
        assert.equal(request.source.source_ref, scenario.expectedRef);
        assert.equal(request.source.resolved_git_sha, scenario.repository ? sha : null);
        assert.equal(request.source.package_path, '.agents/skills/skill-authoring');
        assert.match(request.source.package_sha256, /^[a-f0-9]{64}$/u);
        assert.equal(fs.existsSync(path.join(retainedRoot, 'evidence.db')), false);
    });
}

for (const scenario of [
    {
        label: 'successful observation is inspected',
        validation: 0,
        database: true,
        inspection: 0,
        exit: 0,
    },
    {
        label: 'failed conformance is still inspected',
        validation: 1,
        database: true,
        inspection: 0,
        exit: 1,
    },
    {
        label: 'original validation failure survives query failure',
        validation: 2,
        database: true,
        inspection: 7,
        exit: 2,
    },
    {
        label: 'query failure fails successful validation',
        validation: 0,
        database: true,
        inspection: 7,
        exit: 7,
    },
    {
        label: 'setup failure without a receipt creates no query',
        validation: 1,
        database: false,
        inspection: 0,
        exit: 1,
    },
    {
        label: 'success without its promised database is rejected',
        validation: 0,
        database: false,
        inspection: 0,
        exit: 1,
    },
]) {
    test('official CI: ' + scenario.label, (t) => {
        const root = fs.realpathSync(
            fs.mkdtempSync(path.join(os.tmpdir(), 'i9-quality-workflow-')),
        );
        t.after(() => fs.rmSync(root, { recursive: true, force: true }));
        const executables = path.join(root, 'mock-bin');
        fs.mkdirSync(executables);
        fs.writeFileSync(
            path.join(executables, 'npm'),
            '#!/bin/sh\n' +
                'if [ "$TEST_CREATE_DB" = 1 ]; then printf "synthetic" > "$I9_OFFICIAL_QUALITY_ROOT/evidence.db"; fi\n' +
                'exit "$TEST_VALIDATION_STATUS"\n',
            { mode: 0o700 },
        );
        fs.writeFileSync(
            path.join(executables, 'node'),
            '#!/bin/sh\n' +
                'printf "%s\\n" "$*" >> "$TEST_QUERY_LOG"\n' +
                'exit "$TEST_INSPECTION_STATUS"\n',
            { mode: 0o700 },
        );
        const queryLog = path.join(root, 'queries.log');
        const result = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', '-c', command], {
            cwd: root,
            env: {
                ...process.env,
                PATH: executables + ':/usr/bin:/bin',
                I9_OFFICIAL_QUALITY_ROOT: root,
                I9_OFFICIAL_QUALITY_FROM: '2026-10-04T00:00:00.000Z',
                I9_OFFICIAL_QUALITY_UNTIL: '2026-10-05T00:00:00.000Z',
                TEST_CREATE_DB: scenario.database ? '1' : '0',
                TEST_VALIDATION_STATUS: String(scenario.validation),
                TEST_INSPECTION_STATUS: String(scenario.inspection),
                TEST_QUERY_LOG: queryLog,
            },
            encoding: 'utf8',
            timeout: 5000,
        });
        assert.equal(result.error, undefined);
        assert.equal(result.status, scenario.exit, result.stderr);
        assert.equal(fs.existsSync(queryLog), scenario.database);
        if (scenario.database) {
            const calls = fs.readFileSync(queryLog, 'utf8').trim().split('\n');
            assert.equal(calls.length, 1);
            assert.ok(calls[0].includes('skills quality inspect --collection i9-skills'));
            assert.ok(calls[0].endsWith('--db ' + path.join(root, 'evidence.db')));
        }
        assert.equal(fs.existsSync(path.join(root, 'observation')), false);
    });
}
