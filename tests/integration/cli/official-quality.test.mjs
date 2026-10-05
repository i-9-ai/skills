// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(new URL('../../../bin/index.mjs', import.meta.url));
const qualityFlags = ['quality-request', 'quality-db', 'quality-output'];

function fixture(t) {
    const root = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'i9-official-quality-cli-')),
    );
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const caller = path.join(root, 'caller');
    const project = path.join(root, 'project');
    const tools = path.join(root, 'guard-tools');
    const runtime = path.join(project, '.work', 'validation-env', 'bin');
    for (const directory of [caller, tools, runtime]) fs.mkdirSync(directory, { recursive: true });
    const sentinel = path.join(root, 'unexpected-official-process');
    // These are inert Node guards, never Python, pip or the official validator.
    // Both absolute prepared-environment executables and PATH lookups are guarded.
    const guard =
        '#!' +
        process.execPath +
        '\n' +
        "require('node:fs').writeFileSync(" +
        JSON.stringify(sentinel) +
        ", 'Unexpected official setup or validation.\\n', { flag: 'wx' });\n" +
        "process.stderr.write('Official process guard was invoked.\\n');\nprocess.exit(97);\n";
    for (const name of ['python', 'python3', 'pip', 'pip3', 'skills-ref']) {
        fs.writeFileSync(path.join(tools, name), guard, { mode: 0o700 });
        fs.writeFileSync(path.join(runtime, name), guard, { mode: 0o700 });
    }
    const request = path.join(root, 'request.json');
    fs.writeFileSync(request, '{"unrecognized":true}\n');
    const database = path.join(root, 'evidence.db');
    const output = path.join(root, 'new-observation');
    const state = path.join(root, 'uncreated-agent-state');
    return {
        root,
        caller,
        project,
        tools,
        sentinel,
        request,
        database,
        output,
        state,
        environment: {
            ...process.env,
            PATH: tools + path.delimiter + (process.env.PATH ?? ''),
            I9_AGENT_STATE_ROOT: state,
            I9_SKILLS_USAGE_DB: path.join(root, 'uncreated-fallback.db'),
            NODE_NO_WARNINGS: '1',
            NODE_DISABLE_COMPILE_CACHE: '1',
        },
    };
}

function snapshot(root) {
    const entries = [];
    function visit(filename) {
        const info = fs.lstatSync(filename);
        const identity = {
            path: path.relative(root, filename),
            dev: info.dev,
            ino: info.ino,
            mode: info.mode,
            nlink: info.nlink,
            size: info.size,
            mtime: info.mtimeMs,
            ctime: info.ctimeMs,
        };
        if (info.isSymbolicLink()) {
            entries.push({ ...identity, kind: 'link', target: fs.readlinkSync(filename) });
        } else if (info.isDirectory()) {
            entries.push({ ...identity, kind: 'directory' });
            for (const name of fs.readdirSync(filename).sort()) visit(path.join(filename, name));
        } else if (info.isFile()) {
            entries.push({
                ...identity,
                kind: 'file',
                sha256: createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),
            });
        } else {
            throw new Error('Unexpected synthetic fixture entry');
        }
    }
    visit(root);
    return entries;
}

function run(target, args) {
    // Every invocation selects a disposable project. The actual default official route is never run.
    assert.ok(args.includes('--help') || args.some((value) => value.startsWith('--quality-')));
    return spawnSync(
        process.execPath,
        [launcher, 'repo', 'validate-official', '--project', target.project, ...args],
        {
            cwd: target.caller,
            env: target.environment,
            encoding: 'utf8',
            timeout: 15_000,
            maxBuffer: 1_048_576,
        },
    );
}

function rejectedWithoutEffects(target, args, expectedDiagnostic = /Invalid input/i) {
    const before = snapshot(target.root);
    const result = run(target, args);
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    assert.ok(
        Number.isInteger(result.status) && result.status !== 0,
        result.stdout + result.stderr,
    );
    assert.equal(result.stdout, '', 'Rejected selections must not render conformance results');
    const diagnostic = result.stderr
        .replace(/^\s*›\s*/gmu, '')
        .replace(/\s+/gu, ' ')
        .trim();
    assert.match(diagnostic, expectedDiagnostic);
    assert.doesNotMatch(result.stderr, /Official process guard was invoked/);
    assert.equal(fs.existsSync(target.sentinel), false, 'Official setup must not be attempted');
    assert.deepEqual(
        snapshot(target.root),
        before,
        'All owned input, output and storage state stays unchanged',
    );
    assert.equal(fs.existsSync(target.state), false);
    assert.equal(fs.existsSync(target.environment.I9_SKILLS_USAGE_DB), false);
    return result;
}

function allOptions(target, request = target.request) {
    return [
        '--quality-request',
        request,
        '--quality-db',
        target.database,
        '--quality-output',
        target.output,
    ];
}

function invalidRequest() {
    return {
        collection: 'demo',
        skill: 'example-skill',
        source: {
            repository: 'https://example.org/skills',
            source_ref: null,
            resolved_git_sha: null,
            package_path: '.agents/skills/example-skill',
            package_sha256: 'b'.repeat(64),
        },
    };
}

test('official help exposes the three explicit quality selections without creating state', (t) => {
    const target = fixture(t);
    const before = snapshot(target.root);
    const result = run(target, ['--help']);
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    for (const flag of qualityFlags) assert.match(result.stdout, new RegExp('--' + flag + '\\b'));
    assert.equal(fs.existsSync(target.sentinel), false);
    assert.deepEqual(snapshot(target.root), before);
});

for (let mask = 1; mask < 7; mask++) {
    const selected = qualityFlags.filter((_, index) => mask & (1 << index));
    test('rejects partial official quality selection: ' + selected.join(', '), (t) => {
        const target = fixture(t);
        const values = [target.request, target.database, target.output];
        // Preserve existing evidence bytes and prove a rejected selection cannot open a writer.
        fs.writeFileSync(target.database, 'Synthetic existing evidence sentinel.\n');
        const args = qualityFlags.flatMap((flag, index) =>
            mask & (1 << index) ? ['--' + flag, values[index]] : [],
        );
        const result = rejectedWithoutEffects(target, args, /must be selected together/i);
        for (const flag of qualityFlags) assert.match(result.stderr, new RegExp(flag));
        assert.equal(fs.existsSync(target.output), false);
    });
}

const malformedRequests = [
    ['malformed JSON', () => '{"collection":'],
    ['duplicate JSON field', () => '{"collection":"demo","collection":"other"}'],
    ['oversized request', () => ' '.repeat(16_385)],
    [
        'unknown request field',
        () => JSON.stringify({ ...invalidRequest(), assurance: 'caller_assertion' }),
    ],
    [
        'invalid collection slug',
        () => JSON.stringify({ ...invalidRequest(), collection: '../demo' }),
    ],
    [
        'reserved scaffold selection',
        () => {
            const request = invalidRequest();
            request.skill = 'generated-scaffold';
            request.source.package_path = '.agents/skills/generated-scaffold';
            return JSON.stringify(request);
        },
    ],
    [
        'package path outside canonical selection',
        () => {
            const request = invalidRequest();
            request.source.package_path = '../example-skill';
            return JSON.stringify(request);
        },
    ],
    [
        'malformed package digest',
        () => {
            const request = invalidRequest();
            request.source.package_sha256 = 'not-a-digest';
            return JSON.stringify(request);
        },
    ],
];

for (const [name, content] of malformedRequests) {
    test('all three selections reject ' + name + ' before official setup', (t) => {
        const target = fixture(t);
        fs.writeFileSync(target.request, content());
        rejectedWithoutEffects(target, allOptions(target));
        assert.equal(fs.existsSync(target.database), false);
        assert.equal(fs.existsSync(target.output), false);
    });
}

for (const kind of ['missing', 'directory', 'symbolic-link', 'hard-link']) {
    test(
        'all three selections reject an unsafe request file: ' + kind,
        { skip: process.platform === 'win32' && kind === 'symbolic-link' },
        (t) => {
            const target = fixture(t);
            const unsafe = path.join(target.root, 'unsafe-request');
            if (kind === 'directory') fs.mkdirSync(unsafe);
            if (kind === 'symbolic-link') fs.symlinkSync(target.request, unsafe);
            if (kind === 'hard-link') fs.linkSync(target.request, unsafe);
            rejectedWithoutEffects(target, allOptions(target, unsafe));
            assert.equal(fs.existsSync(target.database), false);
            assert.equal(fs.existsSync(target.output), false);
        },
    );
}

for (const observed of [false, true]) {
    test(
        'command output boundary and ordinary aggregate exit use only fake services: ' +
            (observed ? 'quality opt-in' : 'default'),
        async (t) => {
            const { default: OfficialSkillsValidateCommand } =
                await import('../../../src/command/repo/OfficialSkillsValidateCommand.ts');
            const { SkillQualityService } =
                await import('../../../src/service/SkillQualityService.ts');
            const { OfficialValidationService } =
                await import('../../../src/service/OfficialValidationService.ts');
            const target = fixture(t);
            const before = snapshot(target.root);
            const command = Object.create(OfficialSkillsValidateCommand.prototype);
            const stdout = [];
            const stderr = [];
            const flags = observed
                ? {
                      project: target.project,
                      'quality-request': target.request,
                      'quality-db': target.database,
                      'quality-output': target.output,
                  }
                : { project: target.project };
            const results = [
                { name: 'example-skill', passed: true, diagnostic: '' },
                {
                    name: 'generated-scaffold',
                    passed: false,
                    diagnostic: 'Synthetic conformance rejection.',
                },
            ];
            const observation = {
                artifact: { result: 'pass' },
                retained: { locator: 'official-quality.json', sha256: 'c'.repeat(64) },
                quality: { recorded: true },
            };
            let observedCalls = 0;
            let defaultCalls = 0;
            t.mock.method(command, 'parse', async () => ({ flags }));
            t.mock.method(command, 'log', (message) => stdout.push(message));
            t.mock.method(command, 'logToStderr', (message) => stderr.push(message));
            t.mock.method(command, 'warn', (message) => stderr.push(message));
            t.mock.method(command, 'exit', (code) => {
                throw Object.assign(new Error('Synthetic command exit'), { exitCode: code });
            });
            t.mock.method(
                SkillQualityService.prototype,
                'observeOfficialFile',
                async (root, file, database, output) => {
                    observedCalls++;
                    assert.equal(root, target.project);
                    assert.equal(file, target.request);
                    assert.equal(database, target.database);
                    assert.equal(output, target.output);
                    return { results, official_failed: false, observation };
                },
            );
            t.mock.method(OfficialValidationService.prototype, 'validateOfficial', (root) => {
                defaultCalls++;
                assert.equal(root, target.project);
                return results;
            });
            await assert.rejects(command.run(), (error) => error.exitCode === 1);
            assert.equal(observedCalls, observed ? 1 : 0);
            assert.equal(defaultCalls, observed ? 0 : 1);
            if (observed) {
                assert.equal(stdout.length, 1);
                assert.deepEqual(JSON.parse(stdout[0]), observation);
                assert.ok(stderr.includes('PASS example-skill'));
                assert.ok(stderr.includes('FAIL generated-scaffold'));
            } else {
                assert.deepEqual(stdout, ['PASS example-skill', 'FAIL generated-scaffold']);
                assert.equal(stderr.includes('PASS example-skill'), false);
            }
            assert.ok(stderr.includes('Synthetic conformance rejection.'));
            assert.deepEqual(snapshot(target.root), before);
            assert.equal(fs.existsSync(target.sentinel), false);
        },
    );
}
