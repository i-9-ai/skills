// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    existsSync,
    linkSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readlinkSync,
    readdirSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';
import { ReleaseVersionRepository } from '../../../src/repository/ReleaseVersionRepository.ts';
import { ReleaseVersionService } from '../../../src/service/ReleaseVersionService.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const pluginFiles = [
    '.codex-plugin/plugin.json',
    '.claude-plugin/plugin.json',
    '.github/plugin/plugin.json',
];
const noteFile = '.changeset/synthetic-feature.md';
const note = '---\n"@example/release-fixture": minor\n---\n\nAdd a synthetic reviewable command.\n';

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

function fixture(t, { version = '1.2.3', pending = true, changelog } = {}) {
    const temporary = mkdtempSync(join(tmpdir(), 'i9-release-test-'));
    const root = join(temporary, 'project');
    const home = join(temporary, 'home');
    mkdirSync(root);
    mkdirSync(home);
    t.after(() => rmSync(temporary, { recursive: true, force: true }));

    const pkg = {
        name: '@example/release-fixture',
        version,
        private: true,
        license: 'Apache-2.0',
        description: 'Synthetic release fixture.',
        scripts: { test: 'node --test' },
        dependencies: { 'example-dependency': '2.3.4' },
    };
    writeJson(root, 'package.json', pkg);
    writeJson(root, 'package-lock.json', {
        name: pkg.name,
        version,
        lockfileVersion: 3,
        requires: true,
        packages: {
            '': { name: pkg.name, version, license: pkg.license, dependencies: pkg.dependencies },
            'node_modules/example-dependency': { version: '2.3.4', license: 'MIT' },
        },
    });
    for (const [index, file] of pluginFiles.entries()) {
        writeJson(root, file, {
            name: `synthetic-plugin-${index}`,
            version,
            description: 'Preserve this host-specific metadata.',
            skills: './.agents/skills/',
            metadata: { host: index },
        });
    }
    writeJson(root, '.changeset/config.json', {
        changelog: '@changesets/cli/changelog',
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
    if (pending) write(root, noteFile, note);
    if (changelog !== undefined) write(root, 'CHANGELOG.md', changelog);

    // Child Git/Changesets processes must not consult the user's home or Git settings.
    const environment = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
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
    return { root, temporary, environment };
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
                return [path.slice(root.length + 1), readFileSync(path, 'utf8')];
            })
            .sort(([left], [right]) => left.localeCompare(right)),
    );
}

function entry(root, file) {
    const path = join(root, file);
    try {
        const info = lstatSync(path);
        if (info.isSymbolicLink()) return { type: 'link', target: readlinkSync(path) };
        if (info.isDirectory()) return { type: 'directory' };
        return { type: 'file', content: readFileSync(path, 'utf8') };
    } catch (error) {
        if (error.code === 'ENOENT') return { type: 'missing' };
        throw error;
    }
}

function ignoredDocumentation(target) {
    rmSync(join(target.root, '.changeset/README.md'));
    const ignored = {};
    for (const name of ['rEaDmE.md', '.hidden-note.md', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md']) {
        const file = `.changeset/${name}`;
        ignored[file] = `# ${name}\n\nDocumentation without Changesets frontmatter.\n`;
        write(target.root, file, ignored[file]);
    }
    return ignored;
}

function cli(target, command, extra = []) {
    return spawnSync(
        process.execPath,
        [join(repository, 'bin/index.mjs'), 'repo', command, '--project', target.root, ...extra],
        {
            cwd: target.root,
            env: target.environment,
            encoding: 'utf8',
            timeout: 30000,
        },
    );
}

function successful(result) {
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    return JSON.parse(result.stdout);
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
    assert.equal(result.status, 0, result.stderr || String(result.error));
    return result.stdout.trim();
}

function commit(target, message) {
    git(target, ['add', '--all']);
    git(target, ['commit', '--quiet', '--no-gpg-sign', '-m', message]);
    return git(target, ['rev-parse', 'HEAD']);
}

function preparedFixture(t) {
    const target = fixture(t);
    git(target, ['init', '--quiet', '--initial-branch=main']);
    const base = commit(target, 'Record synthetic release intent');
    successful(cli(target, 'prepare-version'));
    commit(target, 'Prepare synthetic version');
    return { ...target, base };
}

function historicalPreparedFixture(t) {
    const history =
        '# @example/release-fixture\n\n## 1.2.3\n\n### Patch Changes\n\n- Preserve the existing runtime contract.\n\n## 1.2.2\n\n### Patch Changes\n\n- Retain the original diagnostics.\n';
    const target = fixture(t, { changelog: history });
    write(
        target.root,
        noteFile,
        '---\n"@example/release-fixture": minor\n---\n\nIntroduce `repo compare` for release review.\n\nPreserve **Markdown** and [usage guidance](https://example.test/usage).\n\n- Verify inputs.\n- Keep existing behavior.\n\n```sh\nexample repo compare --base "$BASE"\n```\n',
    );
    git(target, ['init', '--quiet', '--initial-branch=main']);
    const originalNoteCommit = commit(target, 'Introduce a release note and prior history');
    write(
        target.root,
        noteFile,
        readFileSync(join(target.root, noteFile), 'utf8') +
            '\nExplain a refinement recorded after the note was introduced.\n',
    );
    write(
        target.root,
        '.changeset/synthetic-fix.md',
        '---\n"@example/release-fixture": patch\n---\n\nRetain patch diagnostics for existing commands.\n\nInclude the actionable recovery procedure.\n',
    );
    const base = commit(target, 'Record multiple release notes and previous history');
    assert.deepEqual(successful(cli(target, 'prepare-version')), {
        version: '1.3.0',
        changed: true,
        notes: 2,
    });
    commit(target, 'Prepare a release with complete Markdown notes');
    const changelog = readFileSync(join(target.root, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /Introduce `repo compare` for release review\./u);
    assert.match(changelog, /Retain patch diagnostics for existing commands\./u);
    assert.ok(changelog.includes(history.slice(history.indexOf('## 1.2.3'))));
    return { ...target, base, history, changelog, originalNoteCommit };
}

function setVersion(target, version) {
    const pkg = json(target.root, 'package.json');
    writeJson(target.root, 'package.json', { ...pkg, version });
    const lock = json(target.root, 'package-lock.json');
    lock.version = version;
    lock.packages[''].version = version;
    writeJson(target.root, 'package-lock.json', lock);
    for (const file of pluginFiles) {
        writeJson(target.root, file, { ...json(target.root, file), version });
    }
}

function workflow() {
    return parse(
        readFileSync(join(repository, '.github/workflows/release-preparation.yml'), 'utf8'),
    );
}

function workflowFixture(t, options) {
    const target = fixture(t, options);
    const pkg = json(target.root, 'package.json');
    pkg.scripts['changeset:status'] = 'changeset status';
    writeJson(target.root, 'package.json', pkg);
    write(target.root, '.gitignore', '/node_modules\n/src\n/.agents\n');
    for (const name of ['node_modules', 'src', '.agents']) {
        symlinkSync(join(repository, name), join(target.root, name), 'dir');
    }
    write(target.temporary, 'user.npmrc', '');
    write(target.temporary, 'global.npmrc', '');
    Object.assign(target.environment, {
        npm_config_userconfig: join(target.temporary, 'user.npmrc'),
        npm_config_globalconfig: join(target.temporary, 'global.npmrc'),
        npm_config_cache: join(target.temporary, 'npm-cache'),
        npm_config_update_notifier: 'false',
        npm_config_audit: 'false',
        npm_config_fund: 'false',
    });
    git(target, ['init', '--quiet', '--initial-branch=main']);
    commit(target, 'Record synthetic workflow inputs');
    return target;
}

function workflowStep(target, id) {
    const step = workflow().jobs['prepare-version'].steps.find((candidate) => candidate.id === id);
    assert.ok(step?.run, `the workflow must expose the ${id} selection step`);
    const output = join(target.temporary, `${id}-output`);
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', step.run], {
        cwd: target.root,
        env: { ...target.environment, GITHUB_OUTPUT: output, RUNNER_TEMP: target.temporary },
        encoding: 'utf8',
        timeout: 30000,
    });
    const outputs = existsSync(output)
        ? Object.fromEntries(
              readFileSync(output, 'utf8')
                  .trim()
                  .split('\n')
                  .map((line) => line.split('=')),
          )
        : {};
    return { ...result, outputs };
}

test('release CLI generates a changelog and aligned versions while preserving metadata', (t) => {
    const target = fixture(t);
    const before = new ReleaseVersionRepository(target.root).documents();
    assert.deepEqual(successful(cli(target, 'prepare-version')), {
        version: '1.3.0',
        changed: true,
        notes: 1,
    });

    const after = new ReleaseVersionRepository(target.root).documents();
    const expected = structuredClone(before);
    expected.package.version = '1.3.0';
    expected.lock.version = '1.3.0';
    expected.lock.packages[''].version = '1.3.0';
    for (const plugin of Object.values(expected.plugins)) plugin.version = '1.3.0';
    assert.deepEqual(after, expected);
    assert.equal(existsSync(join(target.root, noteFile)), false);
    const changelog = readFileSync(join(target.root, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /^## 1\.3\.0$/mu);
    assert.match(changelog, /Add a synthetic reviewable command\./u);
    assert.deepEqual(successful(cli(target, 'verify-release')), {
        version: '1.3.0',
        aligned: true,
        prepared: false,
    });

    const generated = files(target.root);
    assert.deepEqual(successful(cli(target, 'prepare-version')), {
        version: '1.3.0',
        changed: false,
        notes: 0,
    });
    assert.deepEqual(files(target.root), generated, 'repeat preparation changes no bytes');
});

test('release preparation follows Changesets prerelease promotion instead of inventing a bump', (t) => {
    const target = fixture(t, { version: '0.1.0-rc.1' });
    assert.equal(successful(cli(target, 'prepare-version')).version, '0.1.0');
    assert.equal(successful(cli(target, 'verify-release')).version, '0.1.0');
});

test('multiline release entries pass whitespace checks while preserving code and historical hard breaks', (t) => {
    const history = '# Previous releases\n\n## 1.2.3\n\n- Keep historical spacing.  \n  \n';
    const target = fixture(t, { changelog: history });
    write(
        target.root,
        noteFile,
        '---\n"@example/release-fixture": minor\n---\n\nAdd a command.\nExplain its input.\n\n```sh\n    example --help\n```\n',
    );
    git(target, ['init', '--quiet', '--initial-branch=main']);
    const base = commit(target, 'Record multiline release intent');
    successful(cli(target, 'prepare-version'));
    const changelog = readFileSync(join(target.root, 'CHANGELOG.md'), 'utf8');
    const historicalBytes = history.slice(history.indexOf('## 1.2.3'));
    assert.ok(changelog.endsWith(historicalBytes));
    const entries = changelog.slice(0, changelog.length - historicalBytes.length);
    assert.doesNotMatch(entries, /^[\t ]+$/mu);
    assert.match(changelog, /Keep historical spacing\. {2}\n/u);
    assert.match(entries, /^ {6}example --help$/mu);
    assert.equal(git(target, ['diff', '--check', base]), '');
    commit(target, 'Prepare canonical multiline release');
    assert.equal(successful(cli(target, 'verify-release', ['--base', base])).prepared, true);
});

test('a clean no-note preparation succeeds without invoking the version runner', (t) => {
    const target = fixture(t, { pending: false });
    const before = files(target.root);
    const service = new ReleaseVersionService(
        new ReleaseVersionRepository(target.root, () => assert.fail('no runner for a no-op')),
    );
    assert.deepEqual(service.prepare(), { version: '1.2.3', changed: false, notes: 0 });
    assert.deepEqual(files(target.root), before);
});

test('an empty Changeset is consumed without inventing a version or changelog', (t) => {
    const target = fixture(t);
    write(target.root, noteFile, '---\n---\n\nNo package release is required.\n');
    const before = files(target.root);

    assert.deepEqual(successful(cli(target, 'prepare-version')), {
        version: '1.2.3',
        changed: true,
        notes: 1,
    });
    delete before[noteFile];
    assert.deepEqual(files(target.root), before, 'only the explicitly empty note is consumed');
    assert.equal(existsSync(join(target.root, 'CHANGELOG.md')), false);
    assert.deepEqual(successful(cli(target, 'prepare-version')), {
        version: '1.2.3',
        changed: false,
        notes: 0,
    });
});

const invalidPreparation = [
    ['workspaces', 'package.json', { workspaces: [] }, /one root package/u],
    ['missing formatter policy', '.changeset/config.json', { format: undefined }, /format/iu],
    ['automatic formatter discovery', '.changeset/config.json', { format: 'auto' }, /format/iu],
    [
        'external formatter command',
        '.changeset/config.json',
        { format: 'npx prettier --write' },
        /format/iu,
    ],
    [
        'automatic commits',
        '.changeset/config.json',
        { commit: true },
        /disabled automatic commits/u,
    ],
    [
        'custom commit hook',
        '.changeset/config.json',
        { commit: './custom-hook.js' },
        /disabled automatic commits/u,
    ],
    [
        'custom changelog hook',
        '.changeset/config.json',
        { changelog: './custom-hook.js' },
        /standard Changesets changelog/u,
    ],
    ['misaligned package lock', 'package-lock.json', { version: '1.2.2' }, /versions must agree/u],
];
for (const [label, file, changes, message] of invalidPreparation) {
    test(`release preparation rejects ${label} before executing or writing`, (t) => {
        const target = fixture(t);
        writeJson(target.root, file, { ...json(target.root, file), ...changes });
        const before = files(target.root);
        const service = new ReleaseVersionService(
            new ReleaseVersionRepository(target.root, () =>
                assert.fail('invalid input reached runner'),
            ),
        );
        assert.throws(() => service.prepare(), message);
        assert.deepEqual(files(target.root), before);
    });
}

test('release preparation rejects explicit prerelease state before executing or writing', (t) => {
    const target = fixture(t);
    writeJson(target.root, '.changeset/pre.json', { mode: 'pre', tag: 'next' });
    const before = files(target.root);
    const service = new ReleaseVersionService(
        new ReleaseVersionRepository(target.root, () =>
            assert.fail('prerelease state reached runner'),
        ),
    );
    assert.throws(() => service.prepare(), /prerelease-state/u);
    assert.deepEqual(files(target.root), before);
});

const legacyPreState = {
    mode: 'pre',
    tag: 'next',
    initialVersions: { '@example/release-fixture': '1.2.3' },
    changesets: ['synthetic-feature'],
};
const unsupportedPreStates = [
    [
        'ordinary pre directory',
        (target) => write(target.root, '.changeset/pre/historical.md', note),
    ],
    [
        'ordinary pre file',
        (target) => write(target.root, '.changeset/pre', 'Unexpected state file.\n'),
    ],
    [
        'linked pre directory',
        (target, outside) => symlinkSync(outside, join(target.root, '.changeset/pre'), 'dir'),
    ],
    [
        'dangling pre link',
        (target, outside) =>
            symlinkSync(
                join(outside, 'missing-directory'),
                join(target.root, '.changeset/pre'),
                'dir',
            ),
    ],
    ['legacy pre.json', (target) => writeJson(target.root, '.changeset/pre.json', legacyPreState)],
    ['legacy pre.json directory', (target) => mkdirSync(join(target.root, '.changeset/pre.json'))],
    [
        'linked legacy pre.json',
        (target, outside) =>
            symlinkSync(join(outside, 'pre.json'), join(target.root, '.changeset/pre.json')),
    ],
    [
        'hard-linked legacy pre.json',
        (target, outside) =>
            linkSync(join(outside, 'pre.json'), join(target.root, '.changeset/pre.json')),
    ],
    [
        'dangling legacy pre.json',
        (target, outside) =>
            symlinkSync(join(outside, 'missing.json'), join(target.root, '.changeset/pre.json')),
    ],
    [
        'legacy state with linked prerelease storage',
        (target, outside) => {
            writeJson(target.root, '.changeset/pre.json', legacyPreState);
            symlinkSync(outside, join(target.root, '.changeset/pre'), 'dir');
        },
    ],
];
for (const [label, configure] of unsupportedPreStates) {
    for (const consumer of ['CLI', 'workflow']) {
        test(`${consumer} rejects ${label} before Changesets can mutate owned or external state`, (t) => {
            const target = consumer === 'CLI' ? fixture(t) : workflowFixture(t);
            write(target.root, noteFile, note.replace(': minor', ': patch'));
            const outside = join(target.temporary, 'outside');
            write(outside, 'synthetic-feature.md', note.replace(': minor', ': major'));
            write(outside, 'sentinel.txt', 'The external directory is not release state.\n');
            writeJson(outside, 'pre.json', legacyPreState);
            configure(target, outside);
            const before = files(target.root);
            const external = files(outside);
            const state = ['.changeset/pre', '.changeset/pre.json'].map((file) => [
                file,
                entry(target.root, file),
            ]);

            const result =
                consumer === 'CLI' ? cli(target, 'prepare-version') : workflowStep(target, 'notes');
            assert.notEqual(result.status, 0, result.stdout);
            assert.match(result.stderr, /prerelease|symlink|hard-linked/iu);
            if (consumer === 'workflow') assert.notEqual(result.outputs.pending, 'true');
            assert.deepEqual(
                files(target.root),
                before,
                'owned files must retain their exact bytes',
            );
            assert.deepEqual(
                files(outside),
                external,
                'external notes must not be moved, deleted or overwritten',
            );
            for (const [file, original] of state)
                assert.deepEqual(entry(target.root, file), original);
        });
    }
}

test('release preparation rejects a package discovered inside an ancestor npm workspace', (t) => {
    const target = fixture(t);
    writeJson(target.temporary, 'package.json', {
        name: 'synthetic-parent',
        version: '1.0.0',
        private: true,
        workspaces: ['project'],
    });
    // Manypkg identifies npm workspaces by both their manifest and lockfile.
    writeJson(target.temporary, 'package-lock.json', {
        name: 'synthetic-parent',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {},
    });
    const parents = ['package.json', 'package-lock.json'].map((file) => [
        file,
        readFileSync(join(target.temporary, file), 'utf8'),
    ]);
    const before = files(target.root);
    const result = cli(target, 'prepare-version');
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /independent single-package root/u);
    for (const [file, content] of parents) {
        assert.equal(readFileSync(join(target.temporary, file), 'utf8'), content);
    }
    assert.deepEqual(
        files(target.root),
        before,
        'neither ancestor nor selected package is changed',
    );
});

for (const [label, file, hardLink] of [
    ['manifest symlink', 'package.json', false],
    ['plugin hard link', pluginFiles[0], true],
    ['configuration symlink', '.changeset/config.json', false],
    ['note symlink', noteFile, false],
    ['changelog symlink', 'CHANGELOG.md', false],
]) {
    test(`release preparation rejects a ${label} without touching its target`, (t) => {
        const target = fixture(t, { changelog: '# Existing release history\n' });
        const destination = join(target.temporary, 'outside-file');
        const original = readFileSync(join(target.root, file), 'utf8');
        writeFileSync(destination, original);
        rmSync(join(target.root, file));
        if (hardLink) linkSync(destination, join(target.root, file));
        else symlinkSync(destination, join(target.root, file));

        const service = new ReleaseVersionService(
            new ReleaseVersionRepository(target.root, () =>
                assert.fail('linked input reached runner'),
            ),
        );
        assert.throws(() => service.prepare(), /(?:symlink|hard-linked).*forbidden/u);
        assert.equal(readFileSync(destination, 'utf8'), original);
    });
}

for (const existing of [
    undefined,
    '# Existing release history\n\n## 1.2.3\n\nKeep this entry.\n',
]) {
    test(`failed release preparation restores ${existing === undefined ? 'absent' : 'existing'} changelog and all mutated artifacts`, (t) => {
        const target = fixture(t, { changelog: existing });
        const before = files(target.root);
        const service = new ReleaseVersionService(
            new ReleaseVersionRepository(target.root, (root) => {
                assert.equal(root, target.root);
                setVersion(target, '9.9.9');
                rmSync(join(root, noteFile));
                write(root, 'CHANGELOG.md', '# Incomplete generated output\n');
                throw new Error('Synthetic version failure');
            }),
        );
        assert.throws(() => service.prepare(), /Synthetic version failure/u);
        assert.deepEqual(files(target.root), before, 'rollback restores the exact original bytes');
    });
}

test('prepared release verification recomputes intent from a real Git base without changing files', (t) => {
    const target = preparedFixture(t);
    const before = files(target.root);
    assert.deepEqual(successful(cli(target, 'verify-release', ['--base', target.base])), {
        version: '1.3.0',
        aligned: true,
        prepared: true,
        base: target.base,
        consumedNotes: 1,
    });
    assert.deepEqual(files(target.root), before);
    assert.equal(git(target, ['status', '--porcelain']), '');
});

test('prepared changelog verification accepts complete Markdown notes and preserves previous history on repeated read-only verification', (t) => {
    const target = historicalPreparedFixture(t);
    const before = files(target.root);
    const head = git(target, ['rev-parse', 'HEAD']);
    assert.match(target.changelog, /Preserve \*\*Markdown\*\*/u);
    assert.match(target.changelog, /```sh\n\s+example repo compare --base "\$BASE"\n\s+```/u);
    assert.ok(target.changelog.includes(target.originalNoteCommit.slice(0, 7)));
    assert.ok(target.changelog.includes(target.base.slice(0, 7)));
    assert.match(
        target.changelog,
        /Explain a refinement recorded after the note was introduced\./u,
    );
    assert.ok(target.changelog.endsWith(target.history.slice(target.history.indexOf('## 1.2.3'))));

    for (let attempt = 0; attempt < 2; attempt += 1) {
        assert.deepEqual(successful(cli(target, 'verify-release', ['--base', target.base])), {
            version: '1.3.0',
            aligned: true,
            prepared: true,
            base: target.base,
            consumedNotes: 2,
        });
        assert.deepEqual(files(target.root), before);
        assert.equal(git(target, ['status', '--porcelain']), '');
        assert.equal(git(target, ['rev-parse', 'HEAD']), head);
    }
});

test('prepared changelog verification rejects shallow source history without fetching or changing files', (t) => {
    const target = historicalPreparedFixture(t);
    write(target.root, '.git/shallow', target.base + '\n');
    assert.equal(git(target, ['rev-parse', '--is-shallow-repository']), 'true');
    assert.equal(git(target, ['remote']), '', 'the fixture has no remote to fetch');
    const before = files(target.root);
    const shallow = readFileSync(join(target.root, '.git/shallow'), 'utf8');

    const result = cli(target, 'verify-release', ['--base', target.base]);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /shallow|complete local Git history/iu);
    assert.deepEqual(files(target.root), before);
    assert.equal(readFileSync(join(target.root, '.git/shallow'), 'utf8'), shallow);
});

const invalidPreparedChangelogs = [
    [
        'noncanonical generated blank-line whitespace',
        ({ changelog }) => changelog.replace('\n\n', '\n  \n'),
    ],
    [
        'removed prior history',
        ({ changelog }) => changelog.slice(0, changelog.indexOf('\n## 1.2.3\n')).trimEnd() + '\n',
    ],
    [
        'deleted patch note entry',
        ({ changelog }) =>
            changelog.slice(0, changelog.indexOf('\n### Patch Changes\n')) +
            changelog.slice(changelog.indexOf('\n## 1.2.3\n')),
    ],
    [
        'rewritten release text',
        ({ changelog }) =>
            changelog.replace(
                'Introduce `repo compare` for release review.',
                'Introduce an undocumented deployment capability.',
            ),
    ],
    [
        'rewritten release commit attribution',
        ({ changelog, originalNoteCommit, base }) =>
            changelog.replace(originalNoteCommit.slice(0, 7), base.slice(0, 7)),
    ],
    [
        'all generated entries removed while preserving prior history',
        ({ history }) =>
            '# @example/release-fixture\n\n## 1.3.0\n\n' +
            history.slice(history.indexOf('## 1.2.3')),
    ],
    ['fabricated heading-only changelog', () => '# @example/release-fixture\n\n## 1.3.0\n'],
];
for (const [label, mutate] of invalidPreparedChangelogs) {
    test(`prepared changelog verification rejects ${label}`, (t) => {
        const target = historicalPreparedFixture(t);
        const invalid = mutate(target);
        assert.notEqual(invalid, target.changelog, 'the fixture must alter the generated output');
        assert.match(invalid, /^## 1\.3\.0$/mu, 'the expected heading alone is insufficient');
        write(target.root, 'CHANGELOG.md', invalid);
        commit(target, 'Record an invalid prepared changelog');
        const before = files(target.root);
        const result = cli(target, 'verify-release', ['--base', target.base]);
        assert.notEqual(result.status, 0, result.stdout);
        assert.match(result.stderr, /changelog/iu);
        assert.deepEqual(files(target.root), before);
        assert.equal(git(target, ['status', '--porcelain']), '');
    });
}

test('release preparation and full-base verification preserve Changesets-ignored documentation', (t) => {
    const target = fixture(t);
    const ignored = ignoredDocumentation(target);
    git(target, ['init', '--quiet', '--initial-branch=main']);
    const base = commit(target, 'Record release intent with non-note documentation');

    assert.deepEqual(successful(cli(target, 'prepare-version')), {
        version: '1.3.0',
        changed: true,
        notes: 1,
    });
    for (const [file, content] of Object.entries(ignored)) {
        assert.equal(readFileSync(join(target.root, file), 'utf8'), content);
    }
    commit(target, 'Prepare version without consuming documentation');
    const verified = successful(cli(target, 'verify-release', ['--base', base]));
    assert.equal(verified.prepared, true);
    assert.equal(verified.consumedNotes, 1);
    assert.equal(git(target, ['status', '--porcelain']), '');
});

test('prepared changelog verification accepts Git-clean checkout newline conversion', (t) => {
    const target = preparedFixture(t);
    git(target, ['config', 'core.autocrlf', 'true']);
    const generated = readFileSync(join(target.root, 'CHANGELOG.md'), 'utf8');
    write(target.root, 'CHANGELOG.md', generated.replace(/\r?\n/gu, '\r\n'));
    git(target, ['add', 'CHANGELOG.md']);
    assert.equal(git(target, ['status', '--porcelain']), '');
    assert.match(git(target, ['ls-files', '--eol', 'CHANGELOG.md']), /i\/lf\s+w\/crlf/u);
    const before = files(target.root);

    assert.equal(successful(cli(target, 'verify-release', ['--base', target.base])).prepared, true);
    assert.deepEqual(files(target.root), before);
    assert.equal(git(target, ['status', '--porcelain']), '');
});

const invalidRelease = [
    [
        'unrelated implementation changes',
        (target) => write(target.root, 'implementation.ts', 'export const behavior = 2;\n'),
        /unrelated or missing artifact/u,
    ],
    [
        'manifest script changes',
        (target) => {
            const pkg = json(target.root, 'package.json');
            pkg.scripts.test = 'node unexpected-command.js';
            writeJson(target.root, 'package.json', pkg);
        },
        /beyond version metadata/u,
    ],
    [
        'dependency changes',
        (target) => {
            const pkg = json(target.root, 'package.json');
            pkg.dependencies['example-dependency'] = '3.0.0';
            writeJson(target.root, 'package.json', pkg);
            const lock = json(target.root, 'package-lock.json');
            lock.packages[''].dependencies = pkg.dependencies;
            lock.packages['node_modules/example-dependency'].version = '3.0.0';
            writeJson(target.root, 'package-lock.json', lock);
        },
        /beyond version metadata/u,
    ],
    [
        'fabricated version bump',
        (target) => {
            setVersion(target, '9.9.9');
            write(target.root, 'CHANGELOG.md', '# Release history\n\n## 9.9.9\n');
        },
        /does not match the base Changesets release intent/u,
    ],
    [
        'unconsumed base note',
        (target) => write(target.root, noteFile, note),
        /consume every pending base note/u,
    ],
    [
        'missing exact changelog heading',
        (target) => write(target.root, 'CHANGELOG.md', '# Release history\n\n## v1.3.0\n'),
        /exact version heading/u,
    ],
];
for (const [label, mutate, message] of invalidRelease) {
    test(`prepared release verification rejects ${label}`, (t) => {
        const target = preparedFixture(t);
        mutate(target);
        commit(target, 'Record invalid synthetic release');
        const before = files(target.root);
        const result = cli(target, 'verify-release', ['--base', target.base]);
        assert.notEqual(result.status, 0, result.stdout);
        assert.match(result.stderr, message);
        assert.deepEqual(files(target.root), before);
    });
}

test('prepared release verification rejects a dirty tracked checkout', (t) => {
    const target = preparedFixture(t);
    write(target.root, 'implementation.ts', 'export const behavior = 3;\n');
    const result = cli(target, 'verify-release', ['--base', target.base]);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /clean tracked checkout/u);
});

test('release verification requires a full immutable base commit identity', (t) => {
    const target = fixture(t);
    for (const base of ['main', 'HEAD~1', 'abc1234', '-option']) {
        const result = cli(target, 'verify-release', [`--base=${base}`]);
        assert.notEqual(result.status, 0, result.stdout);
        assert.match(result.stderr, /full Git commit SHA/u);
    }
});

test('version workflow only creates draft PRs from an explicitly selected default-branch run', () => {
    const definition = workflow();
    assert.deepEqual(Object.keys(definition.on), ['workflow_dispatch']);
    assert.deepEqual(definition.permissions, { contents: 'write', 'pull-requests': 'write' });
    assert.equal(definition.concurrency['cancel-in-progress'], false);
    const job = definition.jobs['prepare-version'];
    assert.match(job.if, /github\.ref.*github\.event\.repository\.default_branch/u);
    assert.equal(
        job.steps.find((step) => step.id === 'plan').if,
        "steps.notes.outputs.pending == 'true'",
    );
    const changesets = job.steps.filter((step) => step.uses?.startsWith('changesets/action'));
    assert.equal(changesets.length, 1, 'no combined version/publish or registry-selection action');
    assert.match(changesets[0].uses, /^changesets\/action\/version@[a-f0-9]{40}$/u);
    assert.equal(changesets[0].if, "steps.plan.outputs.version == 'true'");
    assert.equal(changesets[0].with['pr-draft'], 'always');
    assert.equal(changesets[0].with.script, 'npm run release:prepare');
    assert.doesNotMatch(
        job.steps.map((step) => step.run ?? '').join('\n'),
        /npm publish|gh release|git tag/u,
    );
});

for (const [label, content, expectedPending, expectedVersion] of [
    ['no notes', undefined, 'false', undefined],
    ['empty note', '---\n---\n\nNo package release is required.\n', 'true', 'false'],
    ['minor release note', note, 'true', 'true'],
]) {
    test(`version workflow selects correctly for ${label} using the actual local Changesets plan`, (t) => {
        const target = workflowFixture(t, { pending: content !== undefined });
        if (content !== undefined) {
            write(target.root, noteFile, content);
            if (content !== note) commit(target, 'Update synthetic note intent');
        }
        const before = files(target.root);
        const selected = workflowStep(target, 'notes');
        assert.equal(selected.status, 0, selected.stderr);
        assert.equal(selected.outputs.pending, expectedPending);
        if (expectedVersion !== undefined) {
            const plan = workflowStep(target, 'plan');
            assert.equal(plan.status, 0, plan.stderr || plan.stdout);
            assert.equal(plan.outputs.version, expectedVersion);
        }
        assert.deepEqual(
            files(target.root),
            before,
            'selection does not consume notes or write versions',
        );
    });
}

test('version workflow rejects malformed release intent before opening a PR', (t) => {
    const target = workflowFixture(t);
    write(
        target.root,
        noteFile,
        '---\n"@example/release-fixture": impossible\n---\n\nReject this intent.\n',
    );
    commit(target, 'Record malformed synthetic intent');
    const selected = workflowStep(target, 'notes');
    assert.equal(selected.status, 0, selected.stderr);
    assert.equal(selected.outputs.pending, 'true');
    const plan = workflowStep(target, 'plan');
    assert.notEqual(plan.status, 0, plan.stdout);
    assert.notEqual(plan.outputs.version, 'true');
});

test('version workflow rejects linked notes before invoking the release planner', (t) => {
    const target = workflowFixture(t);
    const destination = join(target.temporary, 'outside-note');
    writeFileSync(destination, note);
    rmSync(join(target.root, noteFile));
    symlinkSync(destination, join(target.root, noteFile));
    const selected = workflowStep(target, 'notes');
    assert.notEqual(selected.status, 0, selected.stdout);
    assert.match(selected.stderr, /symlink is forbidden/u);
    assert.notEqual(selected.outputs.pending, 'true');
    assert.equal(readFileSync(destination, 'utf8'), note);
});

test('version workflow leaves ignored documentation intact and skips it as release intent', (t) => {
    const target = workflowFixture(t, { pending: false });
    const ignored = ignoredDocumentation(target);
    commit(target, 'Record non-note documentation');
    const selected = workflowStep(target, 'notes');
    assert.equal(selected.status, 0, selected.stderr);
    assert.equal(selected.outputs.pending, 'false');
    for (const [file, content] of Object.entries(ignored)) {
        assert.equal(readFileSync(join(target.root, file), 'utf8'), content);
    }
    assert.equal(git(target, ['status', '--porcelain']), '');
});
