// SPDX-License-Identifier: Apache-2.0
import { isDeepStrictEqual } from 'node:util';
import { isAbsolute } from 'node:path';
import { NativePilotConfiguration } from '../config/NativePilotConfiguration.ts';
import type { NativePilotInventory } from '../repository/NativePilotInventoryRepository.ts';
import { pilotDigest } from '../repository/NativePilotInventoryRepository.ts';
import type { NativePilotObservation } from './NativePilotObservationValidator.ts';
import { closedObject, relativePilotPath } from './NativePilotContractValidator.ts';

const digest = (value: unknown): value is string =>
    typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Reconciles closed retained inventories; provenance qualifiers remain explicit limits. */
export class NativePilotLoadedInventoryValidator {
    private inventory(raw: unknown): NativePilotInventory {
        const value = closedObject(raw, ['tree_sha256', 'bytes', 'entries'], 'loaded inventory');
        if (
            !digest(value.tree_sha256) ||
            !Number.isSafeInteger(value.bytes) ||
            Number(value.bytes) < 0 ||
            Number(value.bytes) > NativePilotConfiguration.limits.tree_bytes ||
            !Array.isArray(value.entries) ||
            value.entries.length > NativePilotConfiguration.limits.tree_files
        )
            throw new Error('loaded_inventory_bound');
        let previous = '';
        let bytes = 0;
        for (const rawEntry of value.entries) {
            const entry = closedObject(
                rawEntry,
                ['path', 'kind', 'bytes', 'sha256', 'executable', 'target'],
                'loaded inventory entry',
            );
            if (
                !relativePilotPath(entry.path) ||
                entry.path <= previous ||
                !Number.isSafeInteger(entry.bytes) ||
                Number(entry.bytes) < 0 ||
                typeof entry.executable !== 'boolean'
            )
                throw new Error('loaded_inventory_entry');
            switch (entry.kind) {
                case 'file':
                    if (
                        !digest(entry.sha256) ||
                        entry.target !== null ||
                        Number(entry.bytes) > NativePilotConfiguration.limits.file_bytes
                    )
                        throw new Error('loaded_inventory_file');

                    bytes += Number(entry.bytes);
                    break;

                case 'directory':
                    if (
                        entry.bytes !== 0 ||
                        entry.sha256 !== null ||
                        entry.target !== null ||
                        entry.executable
                    )
                        throw new Error('loaded_inventory_directory');
                    break;

                case 'symlink':
                    if (
                        typeof entry.target !== 'string' ||
                        isAbsolute(entry.target) ||
                        /[\\\x00-\x1f\x7f]/.test(entry.target) ||
                        entry.executable ||
                        Buffer.byteLength(entry.target) !== entry.bytes ||
                        pilotDigest(entry.target) !== entry.sha256
                    )
                        throw new Error('loaded_inventory_alias');
                    break;

                default:
                    throw new Error('loaded_inventory_kind');
            }

            previous = entry.path;
        }
        if (
            bytes !== value.bytes ||
            pilotDigest(JSON.stringify(value.entries)) !== value.tree_sha256
        )
            throw new Error('loaded_inventory_identity');
        return value as unknown as NativePilotInventory;
    }

    private matching(raw: unknown, expected: NativePilotInventory) {
        const value = this.inventory(raw);
        if (!isDeepStrictEqual(value, expected))
            throw new Error('Complete loaded inventory differs from selected bytes.');
        return value;
    }

    private installed(
        host: 'codex' | 'claude',
        expected: NativePilotInventory,
        loaded: NonNullable<NativePilotObservation['loaded']>,
    ) {
        const allowed = new Map([
            ['.claude/skills', '../.agents/skills'],
            ['.github/skills', '../.agents/skills'],
            ['CLAUDE.md', 'AGENTS.md'],
            ['GEMINI.md', 'AGENTS.md'],
        ]);
        if (
            loaded.source_tree_sha256 !== expected.tree_sha256 ||
            !Array.isArray(loaded.transformations) ||
            loaded.transformations.length > 4
        )
            throw new Error('loaded_selected_source');
        const omitted = new Set<string>();
        for (const raw of loaded.transformations) {
            const alias = closedObject(raw, ['kind', 'path', 'target'], 'loaded transformation');
            const original = expected.entries.find((entry) => entry.path === alias.path);
            if (
                host !== 'codex' ||
                alias.kind !== 'omitted-repository-alias' ||
                typeof alias.path !== 'string' ||
                omitted.has(alias.path) ||
                allowed.get(alias.path) !== alias.target ||
                original?.kind !== 'symlink' ||
                original.target !== alias.target
            )
                throw new Error('loaded_transformation');
            omitted.add(alias.path);
        }
        const entries = expected.entries.filter((entry) => !omitted.has(entry.path));
        // Inventory bytes sum ordinary file bytes only, so omitted aliases do not subtract bytes.
        const installed = {
            tree_sha256: pilotDigest(JSON.stringify(entries)),
            bytes: expected.bytes,
            entries,
        };
        if (loaded.installed_tree_sha256 !== installed.tree_sha256)
            throw new Error('loaded_installed_source');
        return installed;
    }

    private snapshot(raw: unknown, pin: 'a' | 'b', expected: NativePilotInventory) {
        const value = closedObject(
            raw,
            [
                'schema_version',
                'pin',
                'source_root',
                'selected_inventory',
                'actual_inventory',
                'plugin_manifest',
                'mcp_manifest',
                'hook_manifest',
            ],
            'Claude loaded source snapshot',
        );
        if (
            value.schema_version !== 1 ||
            value.pin !== pin ||
            value.source_root !== '/pilot/source'
        )
            throw new Error('loaded_claude_snapshot_source');
        this.matching(value.selected_inventory, expected);
        this.matching(value.actual_inventory, expected);
        for (const [key, path] of [
            ['plugin_manifest', '.claude-plugin/plugin.json'],
            ['mcp_manifest', 'mcp/claude.json'],
            ['hook_manifest', 'hooks/claude.json'],
        ]) {
            const receipt = closedObject(
                value[key],
                ['bytes', 'sha256', 'base64'],
                'Claude loaded manifest',
            );
            if (
                !Number.isSafeInteger(receipt.bytes) ||
                Number(receipt.bytes) < 0 ||
                Number(receipt.bytes) > 1_048_576 ||
                !digest(receipt.sha256) ||
                typeof receipt.base64 !== 'string' ||
                receipt.base64.length !== 4 * Math.ceil(Number(receipt.bytes) / 3)
            )
                throw new Error('loaded_claude_manifest_bound');
            const bytes = Buffer.from(receipt.base64, 'base64');
            const entry = expected.entries.find(
                (entry) => entry.path === path && entry.kind === 'file',
            );
            if (
                bytes.toString('base64') !== receipt.base64 ||
                bytes.length !== receipt.bytes ||
                pilotDigest(bytes) !== receipt.sha256 ||
                !entry ||
                entry.bytes !== receipt.bytes ||
                entry.sha256 !== receipt.sha256
            )
                throw new Error('loaded_claude_manifest_identity');
        }
        return value;
    }

    validate(
        raw: unknown,
        host: 'codex' | 'claude',
        pin: 'a' | 'b',
        source: NativePilotInventory,
        loaded: NonNullable<NativePilotObservation['loaded']>,
    ) {
        if (!['codex', 'claude'].includes(host) || !['a', 'b'].includes(pin))
            throw new Error('loaded_host_or_pin');
        const expected = this.inventory(source);
        const installed = this.installed(host, expected, loaded);
        if (
            raw &&
            typeof raw === 'object' &&
            !Array.isArray(raw) &&
            Object.hasOwn(raw, 'tree_sha256')
        )
            return this.matching(raw, installed);
        if (host === 'codex') {
            const value = closedObject(
                raw,
                [
                    'schema_version',
                    'source_tree_sha256',
                    'installed',
                    'transformations',
                    'independent_worker_fields',
                    'executable_bits',
                ],
                'Codex loaded inventory',
            );
            if (
                value.schema_version !== 1 ||
                value.source_tree_sha256 !== expected.tree_sha256 ||
                !isDeepStrictEqual(value.transformations, loaded.transformations) ||
                !isDeepStrictEqual(value.independent_worker_fields, [
                    'path',
                    'kind',
                    'bytes',
                    'sha256',
                    'target',
                ]) ||
                value.executable_bits !== 'native-adapter-inventory-only'
            )
                throw new Error('loaded_codex_provenance');
            return this.matching(value.installed, installed);
        }
        const value = closedObject(
            raw,
            [
                'schema_version',
                'source_root',
                'source_tree_sha256',
                'source_before',
                'source_after',
                'independent_worker_source',
                'native_cache_scope',
            ],
            'Claude loaded inventory',
        );
        if (
            value.schema_version !== 1 ||
            value.source_root !== '/pilot/source' ||
            value.source_tree_sha256 !== expected.tree_sha256 ||
            value.native_cache_scope !== 'selected-manifest-and-registration-only' ||
            !Array.isArray(value.independent_worker_source) ||
            value.independent_worker_source.length !== 2
        )
            throw new Error('loaded_claude_provenance');
        const before = this.snapshot(value.source_before, pin, expected);
        const after = this.snapshot(value.source_after, pin, expected);
        if (!isDeepStrictEqual(before, after)) throw new Error('loaded_claude_source_changed');
        for (const worker of value.independent_worker_source) this.matching(worker, expected);
        return this.matching(before.actual_inventory, installed);
    }
}
