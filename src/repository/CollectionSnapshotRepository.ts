// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { strictJson } from '../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';
import { CollectionRemediationValidator } from '../validator/CollectionRemediationValidator.ts';
import type { CatalogPreimage } from './CollectionMaintenanceRepository.ts';

const helper = fileURLToPath(
    new URL('../../.agents/skills/skills-snapshot/scripts/skills_snapshot.mjs', import.meta.url),
);
export type SnapshotRunner = (arguments_: string[]) => unknown;
export type CollectionRecovery = {
    snapshot: string;
    state: { schema_version: 1; exists: boolean; mode: number | null; sha256: string | null };
};

/** Captures only catalog preimages through the package-owned snapshot implementation. */
export class CollectionSnapshotRepository {
    private readonly runner: SnapshotRunner;
    private readonly validator = new CollectionRemediationValidator();

    constructor(runner?: SnapshotRunner) {
        this.runner =
            runner ??
            ((arguments_) => {
                try {
                    return strictJson(
                        execFileSync(process.execPath, [helper, ...arguments_], {
                            encoding: null,
                            timeout: 10_000,
                            maxBuffer: 1_048_576,
                            stdio: ['ignore', 'pipe', 'pipe'],
                            env: {
                                PATH: dirname(process.execPath),
                                NODE_DISABLE_COMPILE_CACHE: '1',
                                NODE_NO_WARNINGS: '1',
                            },
                        }),
                    );
                } catch {
                    throw new Error(
                        'Snapshot helper failed; no unverified recovery artifact is accepted.',
                    );
                }
            });
    }

    prepare(before: CatalogPreimage, store: string, collection: string): CollectionRecovery {
        const selected = this.externalStore(store, collection);
        const temporary = fs.realpathSync.native(
            fs.mkdtempSync(join(tmpdir(), 'i9-catalog-preimage-')),
        );
        try {
            const source = join(temporary, 'preimage');
            fs.mkdirSync(source, { mode: 0o700 });
            const state: CollectionRecovery['state'] = {
                schema_version: 1,
                exists: before.bytes !== null,
                mode: before.mode,
                sha256: before.bytes ? this.validator.digest(before.bytes) : null,
            };
            fs.writeFileSync(join(source, 'state.json'), this.validator.encode(state), {
                flag: 'wx',
                mode: 0o600,
            });
            if (before.bytes !== null)
                fs.writeFileSync(join(source, 'skills-catalog.json'), before.bytes, {
                    flag: 'wx',
                    mode: before.mode!,
                });
            // umask must not silently weaken the evidence about original permission bits.
            if (before.bytes !== null)
                fs.chmodSync(join(source, 'skills-catalog.json'), before.mode!);
            const name = `catalog-${randomUUID()}`;
            const snapshot = join(selected, name);
            const created = this.runner([
                'create',
                '--source',
                source,
                '--store',
                selected,
                '--scope',
                'collection',
                '--name',
                name,
            ]) as { ok?: boolean; snapshot?: string };
            if (created?.ok !== true || created.snapshot !== snapshot)
                throw new Error('Snapshot creation did not confirm the selected recovery path.');
            const recovery = { snapshot, state };
            this.recover(recovery);
            return recovery;
        } finally {
            fs.rmSync(temporary, { recursive: true, force: true });
        }
    }

    recover(recovery: CollectionRecovery): CatalogPreimage {
        const verified = this.runner(['verify', '--snapshot', recovery.snapshot]) as {
            ok?: boolean;
        };
        if (verified?.ok !== true) throw new Error('Snapshot verification failed before recovery.');
        const temporary = fs.realpathSync.native(
            fs.mkdtempSync(join(tmpdir(), 'i9-catalog-recovery-')),
        );
        try {
            const target = join(temporary, 'restored');
            const restored = this.runner([
                'restore',
                '--snapshot',
                recovery.snapshot,
                '--target',
                target,
                '--scope',
                'collection',
            ]) as {
                ok?: boolean;
                source_content_tree_hash?: string;
                restored_content_tree_hash?: string;
            };
            if (
                restored?.ok !== true ||
                !restored.source_content_tree_hash ||
                restored.source_content_tree_hash !== restored.restored_content_tree_hash
            )
                throw new Error('Snapshot restoration did not prove matching content.');
            const root = new SafeRoot(target);
            try {
                const state = strictJson(root.readBytes('state.json', 1024));
                if (JSON.stringify(state) !== JSON.stringify(recovery.state))
                    throw new Error('Snapshot state does not match the selected preimage.');
                const expectedNames = recovery.state.exists
                    ? ['skills-catalog.json', 'state.json']
                    : ['state.json'];
                if (JSON.stringify(fs.readdirSync(target).sort()) !== JSON.stringify(expectedNames))
                    throw new Error('Snapshot contains unexpected recovery paths.');
                if (!recovery.state.exists) return { bytes: null, mode: null };
                const bytes = root.readBytes('skills-catalog.json', 1_048_576);
                const mode = root.info('skills-catalog.json')!.mode & 0o777;
                if (
                    this.validator.digest(bytes) !== recovery.state.sha256 ||
                    mode !== recovery.state.mode
                )
                    throw new Error('Snapshot bytes or modes do not match the selected preimage.');
                return { bytes, mode };
            } finally {
                root.close();
            }
        } finally {
            fs.rmSync(temporary, { recursive: true, force: true });
        }
    }

    record(recovery: CollectionRecovery, receipt: unknown): void {
        const root = new SafeRoot(recovery.snapshot);
        try {
            fs.writeFileSync(
                join(root.path, 'maintenance-result.json'),
                this.validator.encode(receipt),
                { flag: 'wx', mode: 0o600 },
            );
            root.assertStable();
        } finally {
            root.close();
        }
    }

    private externalStore(store: string, collection: string): string {
        if (
            typeof store !== 'string' ||
            !isAbsolute(store) ||
            !store.isWellFormed() ||
            /[\x00-\x1f\x7f]/u.test(store)
        )
            throw new Error('Apply requires an absolute external snapshot store.');
        const selected = resolve(store);
        const protectedRoot = fs.realpathSync.native(collection);
        const contains = (parent: string, child: string) => {
            const path = relative(parent, child);
            return (
                path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
            );
        };
        if (
            contains(protectedRoot, selected) ||
            contains(selected, protectedRoot) ||
            /(?:^|[\\/])\.system(?:[\\/]|$)/u.test(selected) ||
            /[\\/]\.(?:agents|codex|claude)[\\/]skills(?:[\\/]|$)/u.test(selected)
        )
            throw new Error(
                'Snapshot store must be outside the collection and skill-discovery directories.',
            );
        const protectedInfo = fs.statSync(protectedRoot);
        let current = parse(selected).root;
        for (const part of selected.slice(current.length).split(sep).filter(Boolean)) {
            current = join(current, part);
            let info;
            try {
                info = fs.lstatSync(current);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
                throw error;
            }
            if (!info.isDirectory() || info.isSymbolicLink())
                throw new Error('Snapshot store ancestors must be real directories.');
            const canonical = fs.realpathSync.native(current);
            if (
                contains(protectedRoot, canonical) ||
                (info.dev === protectedInfo.dev && info.ino === protectedInfo.ino)
            )
                throw new Error('Snapshot store aliases the selected collection.');
        }
        return selected;
    }
}
