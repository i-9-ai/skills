// SPDX-License-Identifier: Apache-2.0
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';
import { createHash } from 'node:crypto';
import {
    constants,
    closeSync,
    fstatSync,
    lstatSync,
    openSync,
    readSync,
    realpathSync,
    writeFileSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export interface NativePilotProjectionReceipt {
    path: string;
    bytes: number;
    sha256: string;
    kind: 'native-log' | 'process' | 'inventory' | 'state' | 'confinement' | 'retention';
}
export interface NativePilotExportEntry {
    path: string;
    kind: 'file' | 'directory' | 'symlink';
    bytes: number;
    sha256: string | null;
    target: string | null;
    base64: string | null;
}
export const projectionDigest = (value: string | Uint8Array) =>
    createHash('sha256').update(value).digest('hex');
export const projectionObject = (value: unknown, fields?: string[]): Record<string, any> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('projection_object');
    if (
        fields &&
        (Object.keys(value).some((key) => !fields.includes(key)) ||
            fields.some((key) => !Object.hasOwn(value, key)))
    )
        throw new Error('projection_closed_fields');
    return value as Record<string, any>;
};
export const projectionPath = (path: unknown): path is string =>
    typeof path === 'string' &&
    path.length <= 4096 &&
    !isAbsolute(path) &&
    path !== '' &&
    !/[\\\x00-\x1f\x7f]/.test(path) &&
    path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
const identity = (value: Stats) =>
    `${value.dev}:${value.ino}:${value.size}:${value.mtimeMs}:${value.ctimeMs}:${value.nlink}`;

/** Reads inert retained bytes only. It never imports observer code or opens native state storage. */
export class NativePilotObservationEvidenceRepository {
    readonly root: string;
    constructor(root: string) {
        if (
            !isAbsolute(root) ||
            resolve(root) !== root ||
            realpathSync(root) !== root ||
            !lstatSync(root).isDirectory()
        )
            throw new Error('projection_evidence_root');
        this.root = root;
    }

    read(
        receipt: Pick<NativePilotProjectionReceipt, 'path' | 'bytes' | 'sha256'>,
        limit: number = NativePilotConfiguration.retention.encoded_bytes,
    ): Buffer {
        if (
            !projectionPath(receipt.path) ||
            !Number.isSafeInteger(receipt.bytes) ||
            receipt.bytes < 0 ||
            receipt.bytes > limit ||
            !/^[a-f0-9]{64}$/.test(receipt.sha256)
        )
            throw new Error('projection_receipt');
        const path = join(this.root, receipt.path);
        if (realpathSync(dirname(path)) !== dirname(path))
            throw new Error('projection_linked_parent');
        const before = lstatSync(path);
        if (!before.isFile() || before.nlink !== 1 || before.size !== receipt.bytes)
            throw new Error('projection_ordinary_file');
        const handle = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            if (identity(before) !== identity(fstatSync(handle)))
                throw new Error('projection_changed');
            const chunks: Buffer[] = [];
            let bytes = 0;
            for (;;) {
                const chunk = Buffer.alloc(Math.min(65_536, limit + 1 - bytes));
                const count = readSync(handle, chunk, 0, chunk.length, null);
                if (!count) break;
                bytes += count;
                if (bytes > limit) throw new Error('projection_read_bound');
                chunks.push(chunk.subarray(0, count));
            }
            const data = Buffer.concat(chunks, bytes);
            if (
                bytes !== receipt.bytes ||
                projectionDigest(data) !== receipt.sha256 ||
                identity(before) !== identity(fstatSync(handle)) ||
                identity(before) !== identity(lstatSync(path))
            )
                throw new Error('projection_changed');
            return data;
        } finally {
            closeSync(handle);
        }
    }

    selectedJson(
        preparedRoot: string,
        key: 'source_a' | 'source_b',
        path: 'skills-catalog.json' | 'hooks/codex.json',
        inventory: {
            entries: Array<{ path: string; kind: string; bytes: number; sha256: string | null }>;
        },
    ) {
        const entry = inventory.entries.find((row) => row.path === path && row.kind === 'file');
        if (!entry || !entry.sha256) throw new Error('projection_selected_source_file');
        const selected = new NativePilotObservationEvidenceRepository(
            join(preparedRoot, 'input', key),
        );
        return selected.json({ path, bytes: entry.bytes, sha256: entry.sha256 }, 1_048_576);
    }

    json(receipt: Pick<NativePilotProjectionReceipt, 'path' | 'bytes' | 'sha256'>, limit?: number) {
        return JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(this.read(receipt, limit)),
        );
    }

    export(value: unknown, selection: unknown) {
        const item = projectionObject(value, [
            'schema_version',
            'operation',
            'nonce',
            'selection',
            'audit',
            'roots',
        ]);
        if (
            item.schema_version !== 1 ||
            item.operation !== 'export' ||
            JSON.stringify(item.selection) !== JSON.stringify(selection) ||
            !/^[a-f0-9]{32}$/.test(item.nonce) ||
            !Array.isArray(item.roots) ||
            item.roots.length !== 4
        )
            throw new Error('projection_export_identity');
        const roots = new Map<string, Map<string, NativePilotExportEntry>>();
        const allowed = new Map([
            ['home', NativePilotConfiguration.accountHome],
            ['state', '/pilot/state'],
            ['work', '/pilot/work'],
            ['native-output', '/pilot/native-output'],
        ]);
        let bytes = 0;
        let entries = 0;
        for (const raw of item.roots) {
            const root = projectionObject(raw, ['name', 'path', 'entries']);
            if (
                roots.has(root.name) ||
                allowed.get(root.name) !== root.path ||
                !Array.isArray(root.entries)
            )
                throw new Error('projection_export_root');
            const files = new Map<string, NativePilotExportEntry>();
            const claudeAliases: NativePilotExportEntry[] = [];
            for (const rawEntry of root.entries) {
                const entry = projectionObject(rawEntry, [
                    'path',
                    'kind',
                    'bytes',
                    'sha256',
                    'target',
                    'base64',
                ]) as unknown as NativePilotExportEntry;
                if (
                    ++entries > 40_000 ||
                    !projectionPath(entry.path) ||
                    files.has(entry.path) ||
                    !Number.isSafeInteger(entry.bytes) ||
                    entry.bytes < 0
                )
                    throw new Error('projection_export_entry');
                if (entry.kind === 'file') {
                    const data = this.decode(entry);
                    bytes += data.length;
                } else if (entry.kind === 'directory') {
                    if (
                        entry.bytes !== 0 ||
                        entry.sha256 !== null ||
                        entry.base64 !== null ||
                        entry.target !== null
                    )
                        throw new Error('projection_export_directory');
                } else if (entry.kind === 'symlink') {
                    // Inert data from the selected Codex Linux version-call captures.
                    // This narrow exception never resolves or materializes the target.
                    const codexRuntimeAlias =
                        item.selection?.host === 'codex' &&
                        root.name === 'home' &&
                        /^\.codex\/tmp\/arg0\/codex-arg0[A-Za-z0-9]{6}\/(?:apply_patch|applypatch|codex-execve-wrapper|codex-linux-sandbox)$/.test(
                            entry.path,
                        ) &&
                        entry.target === '/pilot/runtime-bin/codex';
                    const claudeDebugAlias =
                        item.selection?.host === 'claude' &&
                        root.name === 'native-output' &&
                        entry.path === 'latest' &&
                        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
                            item.selection.run_id,
                        ) &&
                        [1, 2].includes(item.selection.repetition) &&
                        ['observe-a', 'observe-b', 'observe-restored-a'].some(
                            (phase) =>
                                entry.target ===
                                `/pilot/native-output/${item.selection.run_id}-${item.selection.repetition}-${phase}.claude.debug.log`,
                        );
                    if (
                        typeof entry.target !== 'string' ||
                        (isAbsolute(entry.target) && !codexRuntimeAlias && !claudeDebugAlias) ||
                        /[\\\x00-\x1f\x7f]/.test(entry.target) ||
                        entry.base64 !== null ||
                        Buffer.byteLength(entry.target) !== entry.bytes ||
                        projectionDigest(entry.target) !== entry.sha256
                    )
                        throw new Error('projection_export_alias');
                    if (claudeDebugAlias) claudeAliases.push(entry);
                } else throw new Error('projection_export_kind');
                if (bytes > NativePilotConfiguration.retention.raw_bytes)
                    throw new Error('projection_export_bytes');
                files.set(entry.path, entry);
            }
            // This is inert retained link text, never a filesystem resolution.
            // Validate the whole map first so target ordering supplies no authority.
            for (const alias of claudeAliases) {
                const target = files.get(alias.target!.slice(root.path.length + 1));
                if (target?.kind !== 'file') throw new Error('projection_export_alias');
                this.decode(target);
            }
            roots.set(root.name, files);
        }
        return {
            roots,
            audit: projectionObject(item.audit),
            nonce: item.nonce as string,
        };
    }

    decode(entry: NativePilotExportEntry): Buffer {
        if (
            entry.kind !== 'file' ||
            entry.target !== null ||
            typeof entry.base64 !== 'string' ||
            entry.bytes > NativePilotConfiguration.retention.file_bytes ||
            entry.base64.length !== 4 * Math.ceil(entry.bytes / 3) ||
            !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '')
        )
            throw new Error('projection_export_file');
        const bytes = Buffer.from(entry.base64, 'base64');
        if (
            bytes.length !== entry.bytes ||
            bytes.toString('base64') !== entry.base64 ||
            projectionDigest(bytes) !== entry.sha256
        )
            throw new Error('projection_export_file_hash');
        return bytes;
    }

    retain(
        prefix: string,
        index: number,
        bytes: Uint8Array,
        kind: NativePilotProjectionReceipt['kind'],
    ): NativePilotProjectionReceipt {
        if (
            !/^[a-f0-9-]{36}-(codex|claude)-[12]-[a-z]+(?:-[a-z]+)*$/.test(prefix) ||
            !Number.isSafeInteger(index) ||
            index < 0 ||
            index > 127 ||
            bytes.length > NativePilotConfiguration.limits.file_bytes
        )
            throw new Error('projection_retention_selection');
        const path = `${prefix}-${String(index).padStart(3, '0')}.evidence`;
        writeFileSync(join(this.root, path), bytes, { flag: 'wx', mode: 0o600 });
        const receipt = {
            path,
            bytes: bytes.length,
            sha256: projectionDigest(bytes),
            kind,
        };
        this.read(receipt, NativePilotConfiguration.limits.file_bytes);
        return receipt;
    }
}
