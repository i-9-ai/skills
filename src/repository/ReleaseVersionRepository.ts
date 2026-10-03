// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { strictJson } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';
import { ReleaseVersionValidator } from '../validator/ReleaseVersionValidator.ts';
import { ReleaseReferenceRepository } from './ReleaseReferenceRepository.ts';
import type { ReleaseReferenceControl } from './ReleaseReferenceRepository.ts';
import { ReleaseReferenceValidator } from '../validator/ReleaseReferenceValidator.ts';
import type { ReleaseReferenceReceipt } from '../validator/ReleaseReferenceValidator.ts';
import type {
    ReleaseDocuments,
    ReleaseDocument,
    ReleaseExpectation,
} from '../validator/ReleaseVersionValidator.ts';

type VersionRunner = (root: string, environment: NodeJS.ProcessEnv) => void;

/** Owns bounded release files and explicit local Changesets/Git subprocesses. */
export class ReleaseVersionRepository {
    static readonly referenceFile = '.changeset/github-references.json';
    static readonly pluginFiles = [
        '.codex-plugin/plugin.json',
        '.claude-plugin/plugin.json',
        '.github/plugin/plugin.json',
    ];
    static readonly documentFiles = [
        'package.json',
        'package-lock.json',
        ...ReleaseVersionRepository.pluginFiles,
    ];
    private readonly validator = new ReleaseVersionValidator();
    readonly root: string;
    private readonly runner?: VersionRunner;

    constructor(root: string, runner?: VersionRunner) {
        this.root = root;
        this.runner = runner;
    }

    read(file: string): string {
        const safe = new SafeRoot(this.root);
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(safe.readBytes(file, 1048576));
        } finally {
            safe.close();
        }
    }

    json(file: string): ReleaseDocument {
        return this.validator.document(strictJson(Buffer.from(this.read(file))));
    }

    documents(read = (file: string) => this.json(file)): ReleaseDocuments {
        return {
            package: read('package.json'),
            lock: read('package-lock.json'),
            plugins: Object.fromEntries(
                ReleaseVersionRepository.pluginFiles.map((file) => [file, read(file)]),
            ),
        };
    }

    pending(): string[] {
        const safe = new SafeRoot(this.root);
        try {
            if (!safe.info('.changeset')?.isDirectory())
                throw new Error('Changesets state must be a directory.');
            for (const state of ['.changeset/pre.json', '.changeset/pre']) {
                if (safe.inspect(state, { allowMissingLeaf: true }).info)
                    throw new Error('Explicit prerelease-state preparation is not supported.');
            }
        } finally {
            safe.close();
        }
        const names = readdirSync(join(this.root, '.changeset'))
            .filter((name) => this.validator.isNote(name))
            .sort();
        if (names.length > 1024 || names.some((name) => !/^[A-Za-z0-9._-]+\.md$/u.test(name)))
            throw new Error('Changeset note names or count exceed the supported release input.');
        return names.map((name) => `.changeset/${name}`);
    }

    snapshot(notes: string[]): Map<string, string | undefined> {
        const safe = new SafeRoot(this.root);
        try {
            return new Map(
                [
                    ...ReleaseVersionRepository.documentFiles,
                    'CHANGELOG.md',
                    ReleaseVersionRepository.referenceFile,
                    ...notes,
                ].map((file) => [
                    file,
                    safe.inspect(file, { allowMissingLeaf: true }).info
                        ? this.read(file)
                        : undefined,
                ]),
            );
        } finally {
            safe.close();
        }
    }

    restore(snapshot: Map<string, string | undefined>): void {
        for (const [file, content] of snapshot) {
            if (content === undefined) {
                rmSync(join(this.root, file), { force: true });
                continue;
            }
            writeFileSync(join(this.root, file), content);
        }
    }

    writeDocuments(documents: ReleaseDocuments): void {
        const values = {
            'package.json': documents.package,
            'package-lock.json': documents.lock,
            ...documents.plugins,
        };
        for (const [file, value] of Object.entries(values))
            writeFileSync(join(this.root, file), JSON.stringify(value, null, 2) + '\n');
    }

    normalizeChangelog(previous?: string): void {
        const generated = this.read('CHANGELOG.md');
        writeFileSync(
            join(this.root, 'CHANGELOG.md'),
            this.canonicalChangelog(generated, previous),
        );
    }

    recordReferences(config: ReleaseDocument): ReleaseReferenceControl | undefined {
        const generator = this.validator.generator(config);
        if (generator.module !== '@changesets/changelog-github') return undefined;
        if (
            this.git(['status', '--porcelain', '--untracked-files=no']).trim() ||
            this.git(['status', '--porcelain', '--untracked-files=all', '--', '.changeset']).trim()
        )
            throw new Error(
                'GitHub reference preparation requires committed notes and a clean tracked checkout.',
            );
        const base = this.git(['rev-parse', 'HEAD']).trim();
        return {
            mode: 'record',
            receipt: new ReleaseReferenceValidator().seal(
                {
                    schema_version: 1,
                    base,
                    generator: generator.module,
                    generator_version: '1.0.1',
                    repo: generator.repo,
                },
                [],
            ),
        };
    }

    writeReferences(receipt: ReleaseReferenceReceipt): void {
        const valid = new ReleaseReferenceValidator().receipt(receipt);
        const safe = new SafeRoot(this.root);
        try {
            safe.inspect(ReleaseVersionRepository.referenceFile, { allowMissingLeaf: true });
            const content = JSON.stringify(valid, null, 2) + '\n';
            if (Buffer.byteLength(content) > ReleaseReferenceValidator.maximumBytes)
                throw new Error(
                    'GitHub release reference evidence exceeds the supported byte limit.',
                );
            writeFileSync(join(this.root, ReleaseVersionRepository.referenceFile), content);
        } finally {
            safe.close();
        }
    }

    runVersion(
        root = this.root,
        environment = process.env,
        references?: ReleaseReferenceControl,
    ): ReleaseReferenceReceipt | undefined {
        let cli: string;
        try {
            cli = createRequire(import.meta.url).resolve('@changesets/cli/bin.js');
            if (references) {
                const require = createRequire(import.meta.url);
                const generator = require.resolve('@changesets/changelog-github');
                let selected = generator;
                try {
                    selected = createRequire(join(root, '.changeset/config.json')).resolve(
                        '@changesets/changelog-github',
                    );
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error;
                }
                if (realpathSync(selected) !== realpathSync(generator))
                    throw new Error(
                        'The selected project shadows the owned pinned GitHub changelog generator.',
                    );
                for (const file of [
                    require.resolve('@changesets/changelog-github/package.json'),
                    createRequire(generator).resolve('@changesets/get-github-info/package.json'),
                ]) {
                    const metadata = JSON.parse(readFileSync(file, 'utf8'));
                    if (metadata.version !== '1.0.1')
                        throw new Error('Unexpected GitHub reference dependency version.');
                }
            }
        } catch {
            throw new Error(
                'Version preparation requires the pinned development dependencies (including GitHub generator 1.0.1 when selected). Run npm ci in the tooling checkout.',
            );
        }

        // Match Changesets' own discovery: a selected child can otherwise resolve
        // to an ancestor workspace and mutate packages outside our snapshot.
        const { getPackagesSync } = createRequire(cli)('@manypkg/get-packages');
        const discovered = getPackagesSync(root);
        if (
            discovered.tool.type !== 'root' ||
            realpathSync(discovered.rootDir) !== realpathSync(root)
        )
            throw new Error(
                'Release preparation requires an independent single-package root, not a nested workspace.',
            );

        const temporary = references
            ? mkdtempSync(join(tmpdir(), 'i9-release-references-'))
            : undefined;
        try {
            const referenceRepository = temporary
                ? new ReleaseReferenceRepository(temporary)
                : undefined;
            if (references) referenceRepository!.writeControl(references);
            const selectedEnvironment =
                references?.mode === 'replay'
                    ? Object.fromEntries(
                          Object.entries(environment).filter(
                              ([name]) =>
                                  [
                                      'PATH',
                                      'SystemRoot',
                                      'TMPDIR',
                                      'TMP',
                                      'TEMP',
                                      'LANG',
                                      'LC_ALL',
                                  ].includes(name) || name.startsWith('GIT_'),
                          ),
                      )
                    : environment;
            const versionEnvironment: NodeJS.ProcessEnv = {
                ...selectedEnvironment,
                CI: 'true',
                NODE_OPTIONS: '',
                GIT_ALLOW_PROTOCOL: '',
                GIT_NO_LAZY_FETCH: '1',
                GIT_NO_REPLACE_OBJECTS: '1',
                GIT_TERMINAL_PROMPT: '0',
            };
            const arguments_ = [cli, 'version'];
            if (references) {
                Object.assign(versionEnvironment, {
                    I9_RELEASE_REFERENCE_CONTROL: join(temporary!, 'control.json'),
                    GITHUB_SERVER_URL: 'https://github.com',
                    GITHUB_GRAPHQL_URL: 'https://api.github.com/graphql',
                    GITHUB_REPOSITORY: references.receipt.repo,
                    GITHUB_TOKEN:
                        references.mode === 'replay'
                            ? 'offline-release-reference-replay'
                            : environment.GITHUB_TOKEN,
                });
                if (references.mode === 'replay')
                    Object.assign(versionEnvironment, {
                        HOME: temporary,
                        XDG_CONFIG_HOME: temporary,
                    });
                const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
                arguments_.unshift(
                    '--import',
                    new URL(`../transport/ReleaseReferenceRunner${extension}`, import.meta.url)
                        .href,
                );
            }
            if (this.runner) this.runner(root, versionEnvironment);
            else
                execFileSync(process.execPath, arguments_, {
                    cwd: root,
                    env: versionEnvironment,
                    timeout: 30000,
                    maxBuffer: 1048576,
                    stdio: 'pipe',
                });
            return referenceRepository?.result();
        } finally {
            if (temporary) rmSync(temporary, { recursive: true, force: true });
        }
    }

    baseDocuments(base: string): ReleaseDocuments {
        this.assertBase(base);
        return this.documents((file) =>
            this.validator.document(strictJson(Buffer.from(this.git(['show', `${base}:${file}`])))),
        );
    }

    verifyChangedFiles(base: string, notes: string[]): void {
        this.assertBase(base);
        if (this.git(['status', '--porcelain', '--untracked-files=no']).trim())
            throw new Error('Prepared-release verification requires a clean tracked checkout.');
        const expected = new Set([
            ...ReleaseVersionRepository.documentFiles,
            'CHANGELOG.md',
            ...notes,
        ]);
        const config = this.validator.document(
            strictJson(Buffer.from(this.git(['show', `${base}:.changeset/config.json`]))),
        );
        if (this.validator.generator(config).module === '@changesets/changelog-github')
            expected.add(ReleaseVersionRepository.referenceFile);
        const rows = this.git(['diff', '--name-status', '--no-renames', base, 'HEAD', '--', '.'])
            .trim()
            .split('\n');
        for (const row of rows) {
            const [status, file] = row.split('\t');
            const allowedStatus = notes.includes(file)
                ? status === 'D'
                : status === 'M' ||
                  ((file === 'CHANGELOG.md' || file === ReleaseVersionRepository.referenceFile) &&
                      status === 'A');
            if (!expected.delete(file) || !allowedStatus)
                throw new Error('Prepared release contains unrelated or missing artifact changes.');
        }
        if (expected.size || !notes.length || this.pending().length)
            throw new Error(
                'Prepared release must consume every pending base note and update all version artifacts.',
            );
    }

    baseNotes(base: string): string[] {
        this.assertBase(base);
        return this.git(['ls-tree', '-r', '--name-only', base, '--', '.changeset'])
            .trim()
            .split('\n')
            .filter(
                (file) =>
                    /^\.changeset\/[A-Za-z0-9._-]+\.md$/u.test(file) &&
                    this.validator.isNote(file.slice('.changeset/'.length)),
            );
    }

    committedChangelog(): string {
        // Validate the selected file before comparing Git bytes, which are not
        // affected by the consumer's clean-checkout newline conversion.
        this.read('CHANGELOG.md');
        return this.git(['show', 'HEAD:CHANGELOG.md']);
    }

    expectedRelease(base: string, pkg: ReleaseDocument, notes: string[]): ReleaseExpectation {
        this.assertBase(base);
        if (this.git(['rev-parse', '--is-shallow-repository']).trim() !== 'false')
            throw new Error('Release verification requires complete local Git history.');

        const config = this.validator.document(
            strictJson(Buffer.from(this.git(['show', `${base}:.changeset/config.json`]))),
        );
        this.validator.configuration(pkg, config);
        const generator = this.validator.generator(config);
        let references: ReleaseReferenceControl | undefined;
        if (generator.module === '@changesets/changelog-github') {
            // Safety-check the worktree file, but only committed bytes are evidence.
            this.read(ReleaseVersionRepository.referenceFile);
            const receipt = new ReleaseReferenceValidator().receipt(
                strictJson(
                    Buffer.from(
                        this.git(['show', `HEAD:${ReleaseVersionRepository.referenceFile}`]),
                    ),
                ),
            );
            if (receipt.base !== base || receipt.repo !== generator.repo)
                throw new Error(
                    'GitHub release reference evidence does not match the immutable release base and repository.',
                );
            references = { mode: 'replay', receipt };
        }
        const temporary = mkdtempSync(join(tmpdir(), 'i9-release-intent-'));
        try {
            const environment = this.prepareHistoryView(temporary, base);
            mkdirSync(join(temporary, '.changeset'));
            writeFileSync(
                join(temporary, 'package.json'),
                JSON.stringify({ name: pkg.name, version: pkg.version, private: pkg.private }),
            );
            writeFileSync(
                join(temporary, '.changeset/config.json'),
                JSON.stringify({
                    ...config,
                    changelog:
                        generator.module === '@changesets/cli/changelog'
                            ? createRequire(import.meta.url).resolve(generator.module)
                            : [
                                  createRequire(import.meta.url).resolve(generator.module),
                                  { repo: generator.repo },
                              ],
                }),
            );
            for (const file of notes)
                writeFileSync(join(temporary, file), this.git(['show', `${base}:${file}`]));
            const previous = this.git(['ls-tree', '--name-only', base, '--', 'CHANGELOG.md']).trim()
                ? this.git(['show', `${base}:CHANGELOG.md`])
                : undefined;
            if (previous !== undefined) writeFileSync(join(temporary, 'CHANGELOG.md'), previous);

            this.runVersion(temporary, environment, references);
            return {
                version: this.validator.version(
                    this.validator.document(
                        strictJson(readFileSync(join(temporary, 'package.json'))),
                    ),
                ),
                changelog: this.canonicalChangelog(
                    readFileSync(join(temporary, 'CHANGELOG.md'), 'utf8'),
                    previous,
                ),
            };
        } finally {
            rmSync(temporary, { recursive: true, force: true });
        }
    }

    private canonicalChangelog(generated: string, previous?: string): string {
        const historyStart = previous?.match(/^#{1,6}\s+\d+\.\d+/mu)?.index;
        const preamble = previous?.slice(0, historyStart ?? previous.length) ?? '';
        const history = historyStart === undefined ? '' : previous!.slice(historyStart);
        if (!generated.startsWith(preamble) || !generated.endsWith(history))
            throw new Error('Changesets must preserve existing changelog bytes verbatim.');

        // Changesets indents blank lines in multiline list entries. Remove only
        // those new blank-line spaces; retain preamble, hard breaks, code and history.
        const entries = generated.slice(preamble.length, generated.length - history.length);
        return preamble + entries.replace(/^[\t ]+(?=\r?$)/gmu, '') + history;
    }

    /** Give Changesets the base history without sharing refs, config, index or working files. */
    private prepareHistoryView(temporary: string, base: string): NodeJS.ProcessEnv {
        const environment: NodeJS.ProcessEnv = Object.fromEntries(
            Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
        );
        Object.assign(environment, {
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_CONFIG_SYSTEM: '/dev/null',
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_ALLOW_PROTOCOL: '',
            GIT_NO_LAZY_FETCH: '1',
            GIT_NO_REPLACE_OBJECTS: '1',
            GIT_TERMINAL_PROMPT: '0',
        });
        const objects = realpathSync(
            resolve(this.root, this.git(['rev-parse', '--git-path', 'objects']).trim()),
        );
        if (/[\r\n]/u.test(objects))
            throw new Error('Git object storage path cannot contain line separators.');

        this.git(
            ['init', '--quiet', '--template=', '--initial-branch=release-verification'],
            temporary,
            environment,
        );
        writeFileSync(join(temporary, '.git/objects/info/alternates'), `${objects}\n`);
        writeFileSync(join(temporary, '.git/HEAD'), `${base}\n`);
        return environment;
    }

    private assertBase(base: string): void {
        if (!/^[a-f0-9]{40}$/u.test(base))
            throw new Error('Release base must be a full Git commit SHA.');
        if (this.git(['rev-parse', '--show-toplevel']).trim() !== realpathSync(this.root))
            throw new Error('Select the repository root for release verification.');
    }

    private git(args: string[], cwd = this.root, environment = process.env): string {
        return execFileSync('git', args, {
            cwd,
            env: {
                ...environment,
                GIT_CONFIG_GLOBAL: '/dev/null',
                GIT_CONFIG_SYSTEM: '/dev/null',
                GIT_CONFIG_NOSYSTEM: '1',
                GIT_ALLOW_PROTOCOL: '',
                GIT_NO_LAZY_FETCH: '1',
                GIT_NO_REPLACE_OBJECTS: '1',
                GIT_TERMINAL_PROMPT: '0',
            },
            encoding: 'utf8',
            timeout: 10000,
            maxBuffer: 1048576,
            stdio: 'pipe',
        });
    }
}
