// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import {
    closeSync,
    constants,
    copyFileSync,
    fstatSync,
    lstatSync,
    mkdirSync,
    openSync,
    readSync,
    readdirSync,
    readlinkSync,
    realpathSync,
    symlinkSync,
    chmodSync,
    writeFileSync,
} from 'node:fs';
import type { BigIntStats } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';
import type { NativePilotExecutableTreePin } from '../config/NativePilotConfiguration.ts';
import { relativePilotPath } from '../validator/NativePilotContractValidator.ts';

export interface NativePilotEntry {
    path: string;
    kind: 'file' | 'directory' | 'symlink';
    bytes: number;
    sha256: string | null;
    executable: boolean;
    target: string | null;
}

export interface NativePilotInventory {
    tree_sha256: string;
    bytes: number;
    entries: NativePilotEntry[];
}

export const pilotDigest = (data: string | Buffer) =>
    createHash('sha256').update(data).digest('hex');

/** Bounded local bytes only; source revisions remain separately supplied assertions. */
export class NativePilotInventoryRepository {
    verifyRunningExport(
        source: string,
        expectedSha: string,
        runningRoot: string,
        entrypoint: string,
    ) {
        const selected = this.tree(source);
        const directory = NativePilotConfiguration.runtime_directory;
        const extension = NativePilotConfiguration.runtime_extension;
        const required = new Set([
            entrypoint,
            `${directory}/migration/NativePilotBaselineMigration.${extension}`,
            `${directory}/validator/SkillOperationError.${extension}`,
            'package.json',
        ]);
        if (NativePilotConfiguration.runtime_layout === 'compiled-js')
            required.add('dist/source-receipt.json');
        for (const layer of ['config', 'repository', 'service', 'validator', 'transport']) {
            const path = this.canonicalDirectory(join(runningRoot, directory, layer));
            for (const name of readdirSync(path))
                if (new RegExp(`^NativePilot[A-Za-z]+\\.${extension}$`).test(name))
                    required.add(`${directory}/${layer}/${name}`);
        }
        if (
            selected.tree_sha256 !== expectedSha ||
            [...required].some(
                (path) =>
                    !selected.entries.some((entry) => entry.path === path && entry.kind === 'file'),
            )
        )
            throw new Error(
                'The selected driver must include the exact running operator and its complete bundled closure.',
            );
        for (const entry of selected.entries) {
            const path = join(runningRoot, entry.path);
            this.canonicalDirectory(dirname(path));
            if (entry.kind === 'file') {
                const actual = this.file(path);
                if (
                    actual.sha256 !== entry.sha256 ||
                    actual.bytes !== entry.bytes ||
                    actual.executable !== entry.executable
                )
                    throw new Error('Running driver bytes differ from the selected export.');
            } else if (entry.kind === 'directory') this.canonicalDirectory(path);
            else if (!lstatSync(path).isSymbolicLink() || readlinkSync(path) !== entry.target)
                throw new Error('Running driver alias differs from the selected export.');
        }
        return selected;
    }

    verifyPrivateReview(pin: NativePilotExecutableTreePin, scope: 'driver' | 'observer') {
        if (!('origin' in pin) || pin.origin !== 'reviewed-private-tree') return null;
        if (
            realpathSync(pin.review_path) !== pin.review_path ||
            this.file(pin.review_path, 1_048_576).sha256 !== pin.review_sha256
        )
            throw new Error(`${scope}: selected private review receipt bytes differ.`);
        const receipt = this.readJson(pin.review_path) as Record<string, unknown>;
        if (
            !receipt ||
            receipt.schema_version !== 1 ||
            receipt.kind !== 'independent-private-source-review' ||
            receipt.scope !== scope ||
            receipt.tree_sha256 !== pin.tree_sha256 ||
            receipt.result !== 'no-actionable-findings' ||
            typeof receipt.report_path !== 'string' ||
            !isAbsolute(receipt.report_path) ||
            resolve(receipt.report_path) !== receipt.report_path ||
            realpathSync(receipt.report_path) !== receipt.report_path ||
            typeof receipt.report_sha256 !== 'string' ||
            this.file(receipt.report_path, 1_048_576).sha256 !== receipt.report_sha256
        )
            throw new Error(
                `${scope}: review receipt does not bind an unchanged retained report and selected private tree.`,
            );
        return { receipt, report_path: receipt.report_path };
    }

    canonicalDirectory(path: string) {
        if (
            !isAbsolute(path) ||
            resolve(path) !== path ||
            realpathSync(path) !== path ||
            !lstatSync(path).isDirectory()
        ) {
            throw new Error('Expected a canonical existing directory without linked parents.');
        }
        return path;
    }

    contains(root: string, path: string) {
        const part = relative(root, path);
        return part !== '' && part !== '..' && !part.startsWith('../') && !isAbsolute(part);
    }

    file(path: string, limit: number = NativePilotConfiguration.limits.file_bytes) {
        const before = lstatSync(path);
        if (!before.isFile() || before.nlink !== 1 || before.size > limit) {
            throw new Error('Expected a bounded ordinary file without hardlinks.');
        }
        const handle = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            const initial = fstatSync(handle);
            if (initial.ino !== before.ino || initial.dev !== before.dev)
                throw new Error('File changed while opening.');
            const hash = createHash('sha256');
            const buffer = Buffer.alloc(65_536);
            let bytes = 0;
            for (;;) {
                const count = readSync(handle, buffer);
                if (!count) break;
                bytes += count;
                if (bytes > limit) throw new Error('File exceeded its read bound.');
                hash.update(buffer.subarray(0, count));
            }
            const after = fstatSync(handle);
            const current = lstatSync(path);
            if (
                bytes !== initial.size ||
                initial.size !== after.size ||
                initial.mtimeMs !== after.mtimeMs ||
                initial.ctimeMs !== after.ctimeMs ||
                after.ino !== current.ino ||
                after.dev !== current.dev ||
                current.nlink !== 1 ||
                current.mtimeMs !== after.mtimeMs ||
                current.ctimeMs !== after.ctimeMs
            ) {
                throw new Error('File changed during inventory.');
            }
            return { bytes, sha256: hash.digest('hex'), executable: Boolean(initial.mode & 0o111) };
        } finally {
            closeSync(handle);
        }
    }

    tree(path: string): NativePilotInventory {
        const root = this.canonicalDirectory(path);
        const entries: NativePilotEntry[] = [];
        let bytes = 0;
        const walk = (directory: string) => {
            const before = lstatSync(directory);
            const names = readdirSync(directory).sort();
            for (const name of names) {
                const selected = join(directory, name);
                const part = relative(root, selected);
                if (!relativePilotPath(part) || name === '.git' || name === 'node_modules') {
                    throw new Error(
                        'Source inputs must be clean exports without Git storage or installed dependencies.',
                    );
                }
                if (entries.length >= NativePilotConfiguration.limits.tree_files)
                    throw new Error('Tree entry bound exceeded.');
                const stat = lstatSync(selected);
                if (stat.isDirectory()) {
                    entries.push({
                        path: part,
                        kind: 'directory',
                        bytes: 0,
                        sha256: null,
                        executable: false,
                        target: null,
                    });
                    walk(selected);
                } else if (stat.isFile()) {
                    const file = this.file(selected);
                    bytes += file.bytes;
                    if (bytes > NativePilotConfiguration.limits.tree_bytes)
                        throw new Error('Tree byte bound exceeded.');
                    entries.push({ path: part, kind: 'file', ...file, target: null });
                } else if (stat.isSymbolicLink()) {
                    const target = readlinkSync(selected);
                    if (
                        isAbsolute(target) ||
                        /[\\\x00-\x1f\x7f]/.test(target) ||
                        !this.contains(root, resolve(dirname(selected), target)) ||
                        !this.contains(root, realpathSync(selected))
                    ) {
                        throw new Error('Only relative internal non-cyclic aliases are permitted.');
                    }
                    entries.push({
                        path: part,
                        kind: 'symlink',
                        bytes: Buffer.byteLength(target),
                        sha256: pilotDigest(target),
                        executable: false,
                        target,
                    });
                } else throw new Error('Unsupported filesystem entry.');
            }
            const after = lstatSync(directory);
            if (
                before.ino !== after.ino ||
                before.mtimeMs !== after.mtimeMs ||
                before.ctimeMs !== after.ctimeMs ||
                JSON.stringify(names) !== JSON.stringify(readdirSync(directory).sort())
            )
                throw new Error('Directory changed during inventory.');
        };
        walk(root);
        entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
        return { tree_sha256: pilotDigest(JSON.stringify(entries)), bytes, entries };
    }

    copyTree(source: string, destination: string, expected: NativePilotInventory) {
        if (this.tree(source).tree_sha256 !== expected.tree_sha256)
            throw new Error('Input changed before copying.');
        mkdirSync(destination, { mode: 0o700 });
        for (const entry of expected.entries) {
            const target = join(destination, entry.path);
            if (entry.kind === 'directory') mkdirSync(target, { mode: 0o700 });
            if (entry.kind === 'file') {
                copyFileSync(join(source, entry.path), target, constants.COPYFILE_EXCL);
                chmodSync(target, entry.executable ? 0o700 : 0o600);
            }
            if (entry.kind === 'symlink') symlinkSync(entry.target!, target);
        }
        if (
            this.tree(destination).tree_sha256 !== expected.tree_sha256 ||
            this.tree(source).tree_sha256 !== expected.tree_sha256
        )
            throw new Error('Copy or input inventory mismatch.');
    }

    readJson(path: string): unknown {
        return this.jsonFile(path, 1_048_576);
    }

    readLoadedInventoryJson(path: string, expected: { bytes: number; sha256: string }): unknown {
        const limit = NativePilotConfiguration.limits.loaded_inventory_bytes;
        if (
            !expected ||
            !Number.isSafeInteger(expected.bytes) ||
            expected.bytes < 0 ||
            expected.bytes > limit ||
            typeof expected.sha256 !== 'string' ||
            expected.sha256.length !== 64 ||
            !/^[a-f0-9]{64}$/.test(expected.sha256)
        )
            throw new Error('Loaded inventory requires its bounded verified evidence receipt.');
        this.canonicalDirectory(dirname(path));
        return this.jsonFile(path, limit, expected);
    }

    private sameJsonFile(before: BigIntStats, after: BigIntStats): boolean {
        return (
            before.isFile() &&
            after.isFile() &&
            before.nlink === 1n &&
            after.nlink === 1n &&
            before.ino === after.ino &&
            before.dev === after.dev &&
            before.size === after.size &&
            before.mode === after.mode &&
            before.mtimeNs === after.mtimeNs &&
            before.ctimeNs === after.ctimeNs
        );
    }

    private jsonFile(
        path: string,
        limit: number,
        expected?: { bytes: number; sha256: string },
    ): unknown {
        const selected = lstatSync(path, { bigint: true });
        const observed = this.file(path, limit);
        if (expected && (observed.bytes !== expected.bytes || observed.sha256 !== expected.sha256))
            throw new Error('Loaded inventory bytes differ from their verified evidence receipt.');
        const handle = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        let data: Buffer;
        try {
            const initial = fstatSync(handle, { bigint: true });
            if (!this.sameJsonFile(selected, initial) || initial.size !== BigInt(observed.bytes))
                throw new Error('JSON input changed while opening.');
            data = Buffer.alloc(observed.bytes);
            let offset = 0;
            while (offset < data.length) {
                const count = readSync(
                    handle,
                    data,
                    offset,
                    Math.min(65_536, data.length - offset),
                    null,
                );
                if (!count) break;
                offset += count;
            }
            const tail = Buffer.alloc(1);
            const extra = readSync(handle, tail, 0, 1, null);
            const after = fstatSync(handle, { bigint: true });
            const current = lstatSync(path, { bigint: true });
            if (
                offset !== observed.bytes ||
                extra !== 0 ||
                !this.sameJsonFile(initial, after) ||
                !this.sameJsonFile(after, current) ||
                pilotDigest(data) !== observed.sha256
            )
                throw new Error('JSON input changed while reading.');
        } finally {
            closeSync(handle);
        }
        return JSON.parse(data.toString('utf8'));
    }

    writeJson(path: string, value: unknown) {
        const content = `${JSON.stringify(value, null, 2)}\n`;
        writeFileSync(path, content, { flag: 'wx', mode: 0o600 });
        return { sha256: pilotDigest(content), bytes: Buffer.byteLength(content) };
    }
}
