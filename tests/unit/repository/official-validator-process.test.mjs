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
