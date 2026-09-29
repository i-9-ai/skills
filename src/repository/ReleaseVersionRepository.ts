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
import type {
    ReleaseDocuments,
    ReleaseDocument,
    ReleaseExpectation,
} from '../validator/ReleaseVersionValidator.ts';

type VersionRunner = (root: string) => void;

/** Owns bounded release files and explicit local Changesets/Git subprocesses. */
export class ReleaseVersionRepository {
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
                [...ReleaseVersionRepository.documentFiles, 'CHANGELOG.md', ...notes].map(
                    (file) => [
                        file,
                        safe.inspect(file, { allowMissingLeaf: true }).info
                            ? this.read(file)
                            : undefined,
                    ],
                ),
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

    runVersion(root = this.root, environment = process.env): void {
        if (this.runner) {
            this.runner(root);
            return;
        }
        let cli: string;
        try {
            cli = createRequire(import.meta.url).resolve('@changesets/cli/bin.js');
        } catch {
            throw new Error(
                'Version preparation requires the pinned development dependencies. Run npm ci in the tooling checkout.',
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

        execFileSync(process.execPath, [cli, 'version'], {
            cwd: root,
            env: {
                ...environment,
                CI: 'true',
                GIT_ALLOW_PROTOCOL: '',
                GIT_NO_LAZY_FETCH: '1',
                GIT_NO_REPLACE_OBJECTS: '1',
                GIT_TERMINAL_PROMPT: '0',
            },
            timeout: 30000,
            maxBuffer: 1048576,
            stdio: 'pipe',
        });
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
        const rows = this.git(['diff', '--name-status', '--no-renames', base, 'HEAD', '--', '.'])
            .trim()
            .split('\n');
        for (const row of rows) {
            const [status, file] = row.split('\t');
            const allowedStatus = notes.includes(file)
                ? status === 'D'
                : status === 'M' || (file === 'CHANGELOG.md' && status === 'A');
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

    expectedRelease(base: string, pkg: ReleaseDocument, notes: string[]): ReleaseExpectation {
        this.assertBase(base);
        if (this.git(['rev-parse', '--is-shallow-repository']).trim() !== 'false')
            throw new Error('Release verification requires complete local Git history.');

        const config = this.validator.document(
            strictJson(Buffer.from(this.git(['show', `${base}:.changeset/config.json`]))),
        );
        this.validator.configuration(pkg, config);
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
                    changelog: createRequire(import.meta.url).resolve('@changesets/cli/changelog'),
                }),
            );
            for (const file of notes)
                writeFileSync(join(temporary, file), this.git(['show', `${base}:${file}`]));
            if (this.git(['ls-tree', '--name-only', base, '--', 'CHANGELOG.md']).trim()) {
                writeFileSync(
                    join(temporary, 'CHANGELOG.md'),
                    this.git(['show', `${base}:CHANGELOG.md`]),
                );
            }

            this.runVersion(temporary, environment);
            return {
                version: this.validator.version(
                    this.validator.document(
                        strictJson(readFileSync(join(temporary, 'package.json'))),
                    ),
                ),
                changelog: readFileSync(join(temporary, 'CHANGELOG.md'), 'utf8'),
            };
        } finally {
            rmSync(temporary, { recursive: true, force: true });
        }
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
