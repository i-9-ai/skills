// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, constants, opendirSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { strictJson } from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';
import { InstalledCollectionConfiguration } from '../config/InstalledCollectionConfiguration.ts';
import { ReleaseVersionValidator } from '../validator/ReleaseVersionValidator.ts';
import { BuildSourceReceiptValidator } from '../validator/BuildSourceReceiptValidator.ts';
import type {
    BuildSourceReceipt,
    SourceUnavailableReason,
} from '../validator/BuildSourceReceiptValidator.ts';

export type InstalledSourceProvenance = {
    source_ref: string | null;
    resolved_git_sha: string | null;
    source_provenance: {
        status: 'asserted' | 'unavailable';
        build_verification: 'verified' | 'unavailable';
        integrity: 'verified' | 'unavailable';
        reason: SourceUnavailableReason | 'missing_receipt' | 'invalid_receipt' | null;
        receipt_sha256: string | null;
    };
};

const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** Captures owned build-time Git evidence; installed reads never invoke Git. */
export class BuildSourceReceiptRepository {
    private readonly configuration: InstalledCollectionConfiguration;
    private readonly validator = new BuildSourceReceiptValidator();

    constructor(configuration = new InstalledCollectionConfiguration()) {
        this.configuration = configuration;
    }

    capture(): BuildSourceReceipt {
        const root = new SafeRoot(this.configuration.root());
        try {
            const manifest = strictJson(root.readBytes('package.json', 65_536));
            const versions = new ReleaseVersionValidator();
            const packageVersion = versions.version(versions.document(manifest));
            const repository = versions.document(manifest.repository);
            if (
                manifest.name !== '@i-9.ai/skills' ||
                ![
                    'git+https://github.com/i-9-ai/skills.git',
                    'https://github.com/i-9-ai/skills.git',
                    'https://github.com/i-9-ai/skills',
                ].includes(String(repository.url))
            )
                throw new Error('Invalid package source identity.');
            let source = this.gitSource(root);
            let files = source.status === 'verified' ? this.inventory(root) : [];
            if (
                source.status === 'verified' &&
                JSON.stringify(this.gitSource(root)) !== JSON.stringify(source)
            ) {
                source = { status: 'unavailable', reason: 'dirty_source' };
                files = [];
            }
            const receipt = this.validator.receipt({
                schema_version: 1,
                package_name: '@i-9.ai/skills',
                package_version: packageVersion,
                repository: 'https://github.com/i-9-ai/skills',
                source,
                files,
            });
            if (!root.info('dist')?.isDirectory())
                throw new Error('Compiled package output is unavailable.');
            const snapshot = root.inspect(BuildSourceReceiptValidator.file, {
                allowMissingLeaf: true,
            });
            if (snapshot.info && !snapshot.info.isFile())
                throw new Error('Invalid package source receipt output.');
            const bytes = Buffer.from(JSON.stringify(receipt, null, 2) + '\n');
            if (bytes.length > BuildSourceReceiptValidator.receiptBytes)
                throw new Error('Package source receipt exceeds its bound.');
            root.verifySnapshot(snapshot);
            const descriptor = openSync(
                snapshot.absolute,
                constants.O_WRONLY |
                    constants.O_CREAT |
                    constants.O_TRUNC |
                    constants.O_NOFOLLOW |
                    constants.O_NONBLOCK,
                0o644,
            );
            try {
                writeFileSync(descriptor, bytes);
            } finally {
                closeSync(descriptor);
            }
            return receipt;
        } finally {
            root.close();
        }
    }

    read(packageVersion: string, catalogSha256: string): InstalledSourceProvenance {
        let root: SafeRoot | undefined;
        try {
            root = new SafeRoot(this.configuration.root());
            if (
                !root.inspect('dist', { allowMissingLeaf: true }).info ||
                !root.inspect(BuildSourceReceiptValidator.file, { allowMissingLeaf: true }).info
            )
                return this.unavailable('missing_receipt');
            const bytes = root.readBytes(
                BuildSourceReceiptValidator.file,
                BuildSourceReceiptValidator.receiptBytes,
            );
            const receipt = this.validator.receipt(strictJson(bytes));
            if (receipt.package_version !== packageVersion)
                return this.unavailable('invalid_receipt');
            if (receipt.source.status === 'unavailable')
                return this.unavailable(receipt.source.reason, digest(bytes));
            const observed = this.inventory(root);
            if (
                JSON.stringify(observed) !== JSON.stringify(receipt.files) ||
                receipt.files.find((file) => file.path === 'skills-catalog.json')?.sha256 !==
                    catalogSha256
            )
                return this.unavailable('invalid_receipt');
            return {
                source_ref: receipt.source.git_sha,
                resolved_git_sha: receipt.source.git_sha,
                source_provenance: {
                    status: 'asserted',
                    build_verification: 'verified',
                    integrity: 'verified',
                    reason: null,
                    receipt_sha256: digest(bytes),
                },
            };
        } catch {
            return this.unavailable('invalid_receipt');
        } finally {
            root?.close();
        }
    }

    private inventory(root: SafeRoot): BuildSourceReceipt['files'] {
        const paths: string[] = [];
        let entries = 0;
        const visit = (path: string, depth: number): void => {
            if (depth > 24) throw new Error('Package source inventory exceeds its bound.');
            const snapshot = root.inspect(path);
            if (!snapshot.info?.isDirectory())
                throw new Error('Invalid package source inventory directory.');
            const directory = opendirSync(snapshot.absolute);
            try {
                let entry;
                while ((entry = directory.readSync()) !== null) {
                    if (++entries > BuildSourceReceiptValidator.files * 2)
                        throw new Error('Package source inventory exceeds its bound.');
                    const relative = `${path}/${entry.name}`;
                    if (relative === BuildSourceReceiptValidator.file) continue;
                    const inspected = root.inspect(relative);
                    if (inspected.info?.isDirectory()) visit(relative, depth + 1);
                    else if (this.validator.allowed(relative)) paths.push(relative);
                    if (paths.length > BuildSourceReceiptValidator.files)
                        throw new Error('Package source inventory exceeds its bound.');
                }
                root.verifySnapshot(snapshot);
            } finally {
                directory.closeSync();
            }
        };
        for (const path of BuildSourceReceiptValidator.rootFiles)
            if (root.inspect(path, { allowMissingLeaf: true }).info) paths.push(path);
        for (const path of ['dist', '.agents/skills', 'docs']) {
            // Only inspect named distribution scopes, never the caller's other files.
            const parent = path === '.agents/skills' ? '.agents' : path;
            if (!root.inspect(parent, { allowMissingLeaf: true }).info) continue;
            if (root.inspect(path, { allowMissingLeaf: true }).info) visit(path, 1);
        }
        let total = 0;
        return paths.sort().map((path) => {
            const bytes = root.readBytes(path, BuildSourceReceiptValidator.fileBytes);
            total += bytes.length;
            if (total > BuildSourceReceiptValidator.totalBytes)
                throw new Error('Package source inventory exceeds its bound.');
            return { path, byte_length: bytes.length, sha256: digest(bytes) };
        });
    }

    private gitSource(root: SafeRoot): BuildSourceReceipt['source'] {
        const unavailable = (reason: SourceUnavailableReason): BuildSourceReceipt['source'] => ({
            status: 'unavailable',
            reason,
        });
        try {
            if (!root.inspect('.git', { allowMissingLeaf: true }).info)
                return unavailable('not_git_source');
            if (realpathSync(this.git(root, ['rev-parse', '--show-toplevel']).trim()) !== root.path)
                return unavailable('not_git_source');
            const origin = this.git(root, ['remote', 'get-url', 'origin']).trim();
            if (
                ![
                    'https://github.com/i-9-ai/skills.git',
                    'https://github.com/i-9-ai/skills',
                    'git@github.com:i-9-ai/skills.git',
                ].includes(origin)
            )
                return unavailable('unverified_repository');
            if (this.git(root, ['status', '--porcelain=v1', '--untracked-files=all']).trim())
                return unavailable('dirty_source');
            const gitSha = this.git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
            if (!/^[a-f0-9]{40}$/u.test(gitSha)) return unavailable('git_unavailable');
            return { status: 'verified', git_sha: gitSha, verification: 'clean_git_checkout' };
        } catch {
            return unavailable('git_unavailable');
        }
    }

    private git(root: SafeRoot, args: string[]): string {
        const environment: NodeJS.ProcessEnv = Object.fromEntries(
            Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
        );
        return execFileSync(
            'git',
            ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...args],
            {
                cwd: root.path,
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
                timeout: 10_000,
                maxBuffer: 1_048_576,
                stdio: 'pipe',
            },
        );
    }

    private unavailable(
        reason: InstalledSourceProvenance['source_provenance']['reason'],
        receiptSha256: string | null = null,
    ): InstalledSourceProvenance {
        return {
            source_ref: null,
            resolved_git_sha: null,
            source_provenance: {
                status: 'unavailable',
                build_verification: 'unavailable',
                integrity: 'unavailable',
                reason,
                receipt_sha256: receiptSha256,
            },
        };
    }
}
