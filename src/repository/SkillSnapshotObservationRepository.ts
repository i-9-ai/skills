// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import {
    strictJson,
    relativeParts,
} from '../../.agents/skills/skill-authoring/scripts/lib/contracts.mjs';
import {
    storeFor,
    validateTree,
} from '../../.agents/skills/skills-snapshot/scripts/snapshot_objects.mjs';
import { SkillBumpReportError } from '../validator/SkillBumpReportError.ts';
import {
    MAX_OBSERVATION_BYTES,
    MAX_OBSERVATION_ENTRIES,
    MAX_OBSERVATION_CONTENT_BYTES,
    SkillBumpReportValidator,
} from '../validator/SkillBumpReportValidator.ts';
import type {
    ObservationEntry,
    ObservationSubject,
} from '../validator/SkillBumpReportValidator.ts';

type SnapshotEntry = ObservationEntry & { target?: string };
type SnapshotTree = { root_mode: number; tree_hash: string; entries: SnapshotEntry[] };
type SnapshotManifest = {
    schema_version: number;
    selection: { scope: string; package?: string };
    storage: { layout: string };
    content: SnapshotTree;
    preimages: Array<{ content: SnapshotTree }>;
};
export type SnapshotObservationRunner = (snapshot: string) => unknown;
const helper = fileURLToPath(
    new URL('../../.agents/skills/skills-snapshot/scripts/skills_snapshot.mjs', import.meta.url),
);

/** Imports verified snapshot content without consulting receipts or restoring files. */
export class SkillSnapshotObservationRepository {
    private readonly runner: SnapshotObservationRunner;

    constructor(runner?: SnapshotObservationRunner) {
        this.runner =
            runner ??
            ((snapshot) =>
                strictJson(
                    execFileSync(process.execPath, [helper, 'verify', '--snapshot', snapshot], {
                        timeout: 10_000,
                        maxBuffer: 1_048_576,
                        stdio: ['ignore', 'pipe', 'pipe'],
                        env: {
                            PATH: dirname(process.execPath),
                            NODE_DISABLE_COMPILE_CACHE: '1',
                            NODE_NO_WARNINGS: '1',
                        },
                    }),
                ));
    }

    observe(snapshot: string, subject: ObservationSubject) {
        let root: SafeRoot | undefined, store: SafeRoot | undefined;
        try {
            root = new SafeRoot(snapshot);
            const bytes = root.readBytes('manifest.json', MAX_OBSERVATION_BYTES);
            const manifest = strictJson(bytes) as SnapshotManifest;
            this.validateSelection(manifest, subject);
            store = new SafeRoot(storeFor(root.path));
            const identities = this.preflight(manifest, store);
            const verified = this.runner(root.path) as {
                ok?: boolean;
                tree_hash?: string;
                scope?: string;
                package?: string | null;
            };
            if (
                !verified ||
                verified.ok !== true ||
                verified.tree_hash !== manifest.content.tree_hash ||
                verified.scope !== manifest.selection.scope ||
                verified.package !== (manifest.selection.package ?? null)
            )
                this.unavailable();
            if (!root.readBytes('manifest.json', MAX_OBSERVATION_BYTES).equals(bytes))
                this.unavailable();
            for (const [path, original] of identities) {
                const current = store.info(path);
                if (
                    !current ||
                    current.dev !== original.dev ||
                    current.ino !== original.ino ||
                    current.size !== original.size ||
                    current.mtimeMs !== original.mtimeMs ||
                    current.ctimeMs !== original.ctimeMs
                )
                    this.unavailable();
            }
            return {
                inventory: this.inventory(manifest),
                snapshot_tree_sha256: manifest.content.tree_hash,
            };
        } catch {
            return this.unavailable();
        } finally {
            root?.close();
            store?.close();
        }
    }

    private validateSelection(manifest: SnapshotManifest, subject: ObservationSubject): void {
        if (
            !manifest ||
            manifest.schema_version !== 2 ||
            manifest.storage?.layout !== 'shared-sha256-v1' ||
            !Array.isArray(manifest.preimages) ||
            manifest.preimages.length > MAX_OBSERVATION_ENTRIES
        )
            this.unavailable();
        const selection = manifest.selection;
        if (!selection || !['package', 'collection'].includes(selection.scope)) this.unavailable();
        if (selection.scope === 'package') {
            relativeParts(selection.package);
            if (
                Object.keys(selection).some((key) => !['scope', 'package'].includes(key)) ||
                subject.scope !== 'skill' ||
                posix.basename(selection.package!) !== subject.skill
            )
                this.unavailable();
        } else if (
            Object.keys(selection).some((key) => key !== 'scope') ||
            subject.scope !== 'collection'
        )
            this.unavailable();
    }

    private preflight(manifest: SnapshotManifest, store: SafeRoot) {
        const identities = new Map<string, NonNullable<ReturnType<SafeRoot['info']>>>();
        let entries = 0,
            bytes = 0;
        for (const tree of [manifest.content, ...manifest.preimages.map((item) => item.content)]) {
            validateTree(tree);
            entries += tree.entries.length;
            if (entries > MAX_OBSERVATION_ENTRIES) this.unavailable();
            for (const entry of tree.entries) {
                if (entry.type === 'directory') continue;
                const hash = entry.type === 'file' ? entry.sha256 : entry.target_sha256;
                const path = `.objects/sha256/${hash}`;
                const info = store.info(path);
                if (
                    !info ||
                    !info.isFile() ||
                    info.size > MAX_OBSERVATION_CONTENT_BYTES ||
                    (entry.type === 'file' && info.size !== entry.size)
                )
                    this.unavailable();
                bytes += info.size;
                if (bytes > MAX_OBSERVATION_CONTENT_BYTES) this.unavailable();
                identities.set(path, info);
            }
        }
        return identities;
    }

    private inventory(manifest: SnapshotManifest) {
        const prefix = manifest.selection.package;
        let rootMode = manifest.content.root_mode;
        let selected = manifest.content.entries;
        if (prefix) {
            const root = selected.find((entry) => entry.path === prefix);
            if (!root || root.type !== 'directory') this.unavailable();
            rootMode = root.mode;
            for (const entry of selected) {
                const ancestor = prefix.startsWith(`${entry.path}/`) || entry.path === prefix;
                if (ancestor ? entry.type !== 'directory' : !entry.path.startsWith(`${prefix}/`))
                    this.unavailable();
            }
            selected = selected
                .filter((entry) => entry.path.startsWith(`${prefix}/`))
                .map((entry) => ({ ...entry, path: entry.path.slice(prefix.length + 1) }));
        }
        const entries = selected.map((entry) => {
            const base = { path: entry.path, type: entry.type, mode: entry.mode };
            if (entry.type === 'file') return { ...base, size: entry.size, sha256: entry.sha256 };
            if (entry.type === 'symlink')
                return {
                    ...base,
                    target_sha256: entry.target_sha256,
                    target_is_absolute: entry.target_is_absolute,
                };
            return base;
        });
        return new SkillBumpReportValidator().inventory({ root_mode: rootMode, entries });
    }
    private unavailable(): never {
        throw new SkillBumpReportError('snapshot_unavailable');
    }
}
