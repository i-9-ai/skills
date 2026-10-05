// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {
    existsSync,
    mkdtempSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    rmSync,
    symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { OfficialValidator } from '../../../src/validator/OfficialValidator.ts';
import { OfficialValidatorProcessRepository } from '../../../src/repository/OfficialValidatorProcessRepository.ts';

const config = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'))
    .config.officialSkillValidator;

function fixture(t, names = ['second-skill', 'first-skill']) {
    const root = mkdtempSync(join(tmpdir(), 'official-skill-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const container = join(root, '.agents', 'skills');
    mkdirSync(container, { recursive: true });
    for (const name of names) {
        mkdirSync(join(container, name));
        writeFileSync(join(container, name, 'SKILL.md'), 'Synthetic invocation fixture.\n');
    }
    return { root, container };
}

test('derives the official source and hash-locked phases from package.json only', (t) => {
    const { root } = fixture(t);
    writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ config: { officialSkillValidator: config } }),
    );
    const requirements = new OfficialValidator().officialRequirements(
        new OfficialValidatorProcessRepository().readOfficialConfiguration(root),
    );
    assert.equal(requirements.version, config.version);
    assert.deepEqual(requirements.method, {
        name: 'skills-ref',
        version: config.version,
        revision: config.source.slice(-40),
        source_sha256: config.sha256,
    });
    assert.ok(requirements.phases[1].content.includes(`${config.source}#subdirectory=skills-ref`));
    assert.ok(requirements.phases[1].content.includes(config.sha256));
    assert.equal(requirements.phases[0].content.trim().split('\n').length, config.wheels.length);
    for (const wheel of config.wheels)
        assert.ok(requirements.phases[0].content.includes(wheel.sha256));
});

test('official validator configuration rejects duplicate manifest fields', (t) => {
    const { root } = fixture(t);
    writeFileSync(
        join(root, 'package.json'),
        '{"config":{},"config":{"officialSkillValidator":{}}}',
    );
    assert.throws(
        () => new OfficialValidatorProcessRepository().readOfficialConfiguration(root),
        /duplicate JSON field/,
    );
});

test('validates every canonical package using argument arrays and aggregates failures', (t) => {
    const { root, container } = fixture(t);
    const calls = [];
    const results = new OfficialValidatorProcessRepository().runOfficialValidator(
        root,
        new OfficialValidatorProcessRepository().canonicalSkills(root),
        config.version,
        (command, args, options) => {
            calls.push({ command, args, options });
            if (args[0] === '--version')
                return { status: 0, stdout: `skills-ref, version ${config.version}\n` };
            return { status: args[1].endsWith('second-skill') ? 1 : 0, stderr: 'fixture result' };
        },
    );
    assert.deepEqual(
        results.map(({ name, passed }) => ({ name, passed })),
        [
            { name: 'first-skill', passed: true },
            { name: 'second-skill', passed: false },
            { name: 'generated-scaffold', passed: true },
        ],
    );
    assert.equal(calls.length, 4);
    assert.equal(calls[0].command, join(root, '.work', 'validation-env', 'bin', 'skills-ref'));
    assert.deepEqual(calls[1].args, ['validate', join(container, 'first-skill')]);
    assert.equal(calls[1].options.shell, false);
    assert.equal(calls[1].options.timeout, 30_000);
    assert.equal(
        existsSync(calls[3].args[1]),
        false,
        'generated trial is removed after validation',
    );
});

test('a generated scaffold rejection is reported and its temporary package is removed', (t) => {
    const { root } = fixture(t, ['one-skill']);
    let trial;
    const result = new OfficialValidatorProcessRepository().runOfficialValidator(
        root,
        new OfficialValidatorProcessRepository().canonicalSkills(root),
        config.version,
        (_command, args) => {
            if (args[0] === '--version')
                return { status: 0, stdout: `skills-ref, version ${config.version}` };
            if (!args[1].endsWith('official-scaffold-trial')) return { status: 0 };
            trial = args[1];
            assert.match(
                readFileSync(join(trial, 'SKILL.md'), 'utf8'),
                /name: official-scaffold-trial/,
            );
            assert.ok(existsSync(join(trial, 'LICENSE')));
            return { status: 1, stderr: 'Synthetic scaffold rejection.' };
        },
    );
    assert.deepEqual(result.at(-1), {
        name: 'generated-scaffold',
        passed: false,
        diagnostic: 'Synthetic scaffold rejection.',
    });
    assert.equal(existsSync(trial), false);
});

test('missing official executable or wrong version is a failure, never a silent skip', (t) => {
    const { root } = fixture(t, ['one-skill']);
    assert.throws(
        () =>
            new OfficialValidatorProcessRepository().runOfficialValidator(
                root,
                new OfficialValidatorProcessRepository().canonicalSkills(root),
                config.version,
                () => ({ status: null, error: new Error('ENOENT') }),
            ),
        /unavailable/,
    );
    assert.throws(
        () =>
            new OfficialValidatorProcessRepository().runOfficialValidator(
                root,
                new OfficialValidatorProcessRepository().canonicalSkills(root),
                config.version,
                () => ({ status: 0, stdout: 'skills-ref, version 99.0.0' }),
            ),
        /version/,
    );
});

test('does not discover aliases or scratch as additional skills', (t) => {
    const { root } = fixture(t, ['one-skill']);
    mkdirSync(join(root, '.github'));
    symlinkSync('../.agents/skills', join(root, '.github', 'skills'));
    mkdirSync(join(root, '.work', 'extra-skill'), { recursive: true });
    writeFileSync(join(root, '.work', 'extra-skill', 'SKILL.md'), 'scratch\n');
    assert.equal(new OfficialValidatorProcessRepository().canonicalSkills(root).length, 1);
});

test('rejects canonical symlinks, empty collections, and shell-like directory names', (t) => {
    const { root, container } = fixture(t, []);
    assert.throws(
        () => new OfficialValidatorProcessRepository().canonicalSkills(root),
        /No canonical/,
    );
    symlinkSync(root, join(container, 'unsafe-skill'));
    assert.throws(() => new OfficialValidatorProcessRepository().canonicalSkills(root), /symlink/);
    const malicious = fixture(t, ['bad;echo-unsafe']);
    assert.throws(
        () => new OfficialValidatorProcessRepository().canonicalSkills(malicious.root),
        /Invalid/,
    );
    const newline = fixture(t, ['one-skill\n']);
    assert.throws(
        () => new OfficialValidatorProcessRepository().canonicalSkills(newline.root),
        /Invalid/,
    );
});

test('installs in ordered hash-checked phases and removes temporary files', (t) => {
    const { root } = fixture(t);
    const calls = [];
    new OfficialValidatorProcessRepository().installOfficialValidator(
        root,
        new OfficialValidator().officialRequirements(config),
        (command, args, options) => {
            calls.push({
                command,
                args,
                options,
                content: args.includes('-r') ? readFileSync(args.at(-1), 'utf8') : null,
            });
            return { status: 0 };
        },
    );
    assert.equal(calls.length, 3);
    assert.equal(calls[0].command, join(root, '.work', 'validation-env', 'bin', 'python'));
    assert.equal(calls[0].args[0], '-I');
    assert.match(calls[0].args[2], /sys.prefix != sys.base_prefix/);
    assert.doesNotMatch(calls[1].content, /skills-ref @/);
    assert.match(calls[2].content, /skills-ref @/);
    assert.ok(calls[1].args.includes('--only-binary=:all:'));
    assert.ok(calls[2].args.includes('--no-build-isolation'));
    assert.ok(calls[2].args.includes('--no-deps'));
    for (const call of calls.slice(1)) {
        assert.deepEqual(call.args.slice(0, 3), ['-I', '-m', 'pip']);
        assert.ok(call.args.includes('--require-hashes'));
        assert.equal(call.options.shell, false);
        assert.equal(existsSync(call.args.at(-1)), false);
    }
});

test('failed bootstrap stops source installation and still cleans up', (t) => {
    const { root } = fixture(t);
    let calls = 0;
    let temporaryFile;
    assert.throws(
        () =>
            new OfficialValidatorProcessRepository().installOfficialValidator(
                root,
                new OfficialValidator().officialRequirements(config),
                (_command, args) => {
                    calls += 1;
                    if (calls === 1) return { status: 0 };
                    temporaryFile = args.at(-1);
                    return { status: 1 };
                },
            ),
        /setup failed/,
    );
    assert.equal(calls, 2);
    assert.equal(existsSync(temporaryFile), false);
});

test('a non-venv interpreter stops before installation', (t) => {
    const { root } = fixture(t);
    let calls = 0;
    assert.throws(
        () =>
            new OfficialValidatorProcessRepository().installOfficialValidator(
                root,
                new OfficialValidator().officialRequirements(config),
                () => {
                    calls += 1;
                    return { status: 1 };
                },
            ),
        /setup failed/,
    );
    assert.equal(calls, 1);
});

test('canonical observations surround actual calls after exact version verification', (t) => {
    const { root } = fixture(t);
    const repository = new OfficialValidatorProcessRepository();
    const packages = repository.canonicalSkills(root);
    const events = [];
    const observations = [];
    let scaffold;
    const results = repository.runOfficialValidator(
        root,
        packages,
        config.version,
        (_command, args, options) => {
            assert.equal(options.shell, false);
            assert.equal(options.timeout, 30_000);
            assert.equal(options.maxBuffer, 1_048_576);
            assert.equal(options.encoding, 'utf8');
            if (args[0] === '--version') {
                events.push('version-process');
                return { status: 0, stdout: 'skills-ref, version ' + config.version + '\n' };
            }
            const name = packages.find((skill) => skill.path === args[1])?.name;
            events.push('validate:' + (name ?? 'scaffold'));
            if (!name) scaffold = args[1];
            return { status: name === 'second-skill' ? 1 : 0, stdout: 'ordinary output' };
        },
        {
            onVersion(observation) {
                assert.deepEqual(observation, {
                    state: 'verified',
                    observed_version: config.version,
                    process: { status: 'completed', exit_code: 0, signal: null },
                });
                assert.ok(Object.isFrozen(observation.process));
                events.push('version-observed');
            },
            beforeValidate(skill) {
                assert.ok(Object.isFrozen(skill));
                assert.throws(() => {
                    skill.path = '/redirected';
                }, TypeError);
                events.push('before:' + skill.name);
            },
            afterValidate(skill, process) {
                events.push('after:' + skill.name);
                observations.push({ name: skill.name, process });
                assert.deepEqual(Object.keys(process).sort(), ['exit_code', 'signal', 'status']);
                assert.ok(Object.isFrozen(process));
            },
        },
    );
    assert.deepEqual(events, [
        'version-process',
        'version-observed',
        'before:first-skill',
        'validate:first-skill',
        'after:first-skill',
        'before:second-skill',
        'validate:second-skill',
        'after:second-skill',
        'validate:scaffold',
    ]);
    assert.deepEqual(
        observations.map((entry) => entry.process),
        [
            { status: 'completed', exit_code: 0, signal: null },
            { status: 'completed', exit_code: 1, signal: null },
        ],
    );
    assert.deepEqual(
        results.map(({ name, passed }) => ({ name, passed })),
        [
            { name: 'first-skill', passed: true },
            { name: 'second-skill', passed: false },
            { name: 'generated-scaffold', passed: true },
        ],
    );
    assert.deepEqual(Object.keys(results[0]).sort(), ['diagnostic', 'name', 'passed']);
    assert.equal(existsSync(scaffold), false);
});

test('sanitized process classifications cannot promote failures to conformance passes', async (t) => {
    const raw = 'sensitive fixture detail ' + 'x'.repeat(24);
    const error = (code) => Object.assign(new Error(raw), { code, path: raw });
    const cases = [
        ['success', { status: 0 }, { status: 'completed', exit_code: 0, signal: null }, true],
        [
            'conformance rejection',
            { status: 2 },
            { status: 'completed', exit_code: 2, signal: null },
            false,
        ],
        [
            'timeout',
            { status: null, error: error('ETIMEDOUT'), signal: 'SIGTERM' },
            { status: 'timeout', exit_code: null, signal: 'SIGTERM' },
            false,
        ],
        [
            'missing executable',
            { status: null, error: error('ENOENT') },
            { status: 'unavailable', exit_code: null, signal: null },
            false,
        ],
        [
            'unavailable normalizes invalid residual data',
            { status: 0, error: error('EACCES'), signal: 'SIGTERM' },
            { status: 'unavailable', exit_code: null, signal: null },
            false,
        ],
        [
            'aborted',
            { status: null, error: error('ABORT_ERR') },
            { status: 'interrupted', exit_code: null, signal: null },
            false,
        ],
        [
            'signaled despite zero',
            { status: 0, signal: 'SIGINT' },
            { status: 'interrupted', exit_code: 0, signal: 'SIGINT' },
            false,
        ],
        [
            'unknown signal',
            { status: null, signal: raw },
            { status: 'interrupted', exit_code: null, signal: 'other' },
            false,
        ],
        [
            'buffer error despite zero',
            { status: 0, error: error('ENOBUFS'), signal: 'SIGTERM' },
            { status: 'execution_error', exit_code: 0, signal: 'SIGTERM' },
            false,
        ],
        [
            'unknown error',
            { status: null, error: error('UNKNOWN') },
            { status: 'execution_error', exit_code: null, signal: null },
            false,
        ],
        [
            'no process result',
            { status: null },
            { status: 'execution_error', exit_code: null, signal: null },
            false,
        ],
        [
            'invalid status',
            { status: -1 },
            { status: 'execution_error', exit_code: null, signal: null },
            false,
        ],
    ];
    for (const [name, result, expected, passed] of cases) {
        await t.test(name, (child) => {
            const { root } = fixture(child, ['one-skill']);
            const repository = new OfficialValidatorProcessRepository();
            let observed;
            const results = repository.runOfficialValidator(
                root,
                repository.canonicalSkills(root),
                config.version,
                (_command, args) =>
                    args[0] === '--version'
                        ? { status: 0, stdout: 'skills-ref, version ' + config.version }
                        : { ...result, stdout: raw, stderr: raw },
                {
                    afterValidate: (_skill, process) => {
                        observed = process;
                    },
                },
            );
            assert.deepEqual(observed, expected);
            assert.equal(results[0].passed, passed);
            assert.equal(JSON.stringify(observed).includes(raw), false);
        });
    }
});

test('version failures remain distinct and never reach canonical observations', async (t) => {
    const cases = [
        [
            'wrong version',
            { status: 0, stdout: 'skills-ref, version 99.0.0' },
            'version_mismatch',
            '99.0.0',
        ],
        [
            'malformed output',
            { status: 0, stdout: 'untrusted/path\nunexpected detail' },
            'version_mismatch',
            null,
        ],
        ['nonzero version process', { status: 1, stdout: '' }, 'version_unavailable', null],
        [
            'timeout',
            {
                status: null,
                error: Object.assign(new Error('private detail'), { code: 'ETIMEDOUT' }),
            },
            'version_unavailable',
            null,
        ],
    ];
    for (const [name, result, state, version] of cases) {
        await t.test(name, (child) => {
            const { root } = fixture(child, ['one-skill']);
            const repository = new OfficialValidatorProcessRepository();
            let calls = 0;
            let observation;
            assert.throws(
                () =>
                    repository.runOfficialValidator(
                        root,
                        repository.canonicalSkills(root),
                        config.version,
                        () => {
                            calls++;
                            return result;
                        },
                        {
                            onVersion(value) {
                                observation = value;
                                throw new Error('observer failed');
                            },
                            beforeValidate() {
                                assert.fail('must stop before validation');
                            },
                            afterValidate() {
                                assert.fail('must not invent a process');
                            },
                        },
                    ),
                /Official validator unavailable or version does not match/,
            );
            assert.equal(calls, 1);
            assert.equal(observation.state, state);
            assert.equal(observation.observed_version, version);
            assert.equal(JSON.stringify(observation).includes('untrusted/path'), false);
            assert.equal(JSON.stringify(observation).includes('private detail'), false);
        });
    }
});

test('a thrown version execution failure is sanitized and preserves the ordinary error', (t) => {
    const { root } = fixture(t, ['one-skill']);
    const repository = new OfficialValidatorProcessRepository();
    let observed;
    assert.throws(
        () =>
            repository.runOfficialValidator(
                root,
                repository.canonicalSkills(root),
                config.version,
                () => {
                    throw Object.assign(new Error('private path'), { code: 'ENOENT' });
                },
                {
                    onVersion(value) {
                        observed = value;
                    },
                    beforeValidate() {
                        assert.fail('must not run');
                    },
                },
            ),
        /Official validator unavailable or version does not match/,
    );
    assert.deepEqual(observed, {
        state: 'version_unavailable',
        observed_version: null,
        process: { status: 'unavailable', exit_code: null, signal: null },
    });
});

test('observer exceptions stop subsequent processes and cannot return a successful result', (t) => {
    const { root } = fixture(t);
    const repository = new OfficialValidatorProcessRepository();
    for (const position of ['onVersion', 'beforeValidate', 'afterValidate']) {
        const calls = [];
        const failure = new Error('observation storage failed');
        assert.throws(
            () =>
                repository.runOfficialValidator(
                    root,
                    repository.canonicalSkills(root),
                    config.version,
                    (_command, args) => {
                        calls.push(args);
                        return args[0] === '--version'
                            ? { status: 0, stdout: 'skills-ref, version ' + config.version }
                            : { status: 0 };
                    },
                    {
                        [position]() {
                            throw failure;
                        },
                    },
                ),
            (error) => error === failure,
        );
        assert.equal(calls.length, position === 'afterValidate' ? 2 : 1);
    }
});

test('a thrown canonical process failure is observed once and still aborts the ordinary call', (t) => {
    const { root } = fixture(t);
    const repository = new OfficialValidatorProcessRepository();
    const failure = Object.assign(new Error('private executor detail'), { code: 'ENOBUFS' });
    const events = [];
    assert.throws(
        () =>
            repository.runOfficialValidator(
                root,
                repository.canonicalSkills(root),
                config.version,
                (_command, args) => {
                    if (args[0] === '--version')
                        return { status: 0, stdout: 'skills-ref, version ' + config.version };
                    events.push('execute');
                    throw failure;
                },
                {
                    beforeValidate() {
                        events.push('before');
                    },
                    afterValidate(_skill, process) {
                        events.push('after');
                        assert.deepEqual(process, {
                            status: 'execution_error',
                            exit_code: null,
                            signal: null,
                        });
                    },
                },
            ),
        (error) => error === failure,
    );
    assert.deepEqual(events, ['before', 'execute', 'after']);
});
