// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { lstatSync, opendirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { SkillPanelConfiguration } from '../config/SkillPanelConfiguration.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';
import { YamlFrontmatterValidator } from '../validator/YamlFrontmatterValidator.ts';
import { PortableFrontmatterValidator } from '../validator/PortableFrontmatterValidator.ts';
import { SkillDiscoveryRepository, type SkillSummary } from './SkillDiscoveryRepository.ts';
import { SkillPanelPackageRepository } from './SkillPanelPackageRepository.ts';

/** Live metadata and bounded global edit eligibility; never retains candidates or opens state. */
export class SkillPanelCatalogRepository {
    private readonly configuration: SkillPanelConfiguration;

    constructor(configuration: SkillPanelConfiguration) {
        this.configuration = configuration;
    }

    read() {
        const sources = [
            {
                directory: this.configuration.collection,
                label: 'selected',
                followPackageLinks: false,
                maxDepth: 0,
            },
        ];
        const warnings: string[] = [];
        let globalBoundaryAvailable = true;
        if (this.configuration.globalCollection) {
            try {
                sources.push({
                    directory: this.globalRoot(),
                    label: 'global',
                    followPackageLinks: true,
                    maxDepth: 8,
                });
            } catch {
                warnings.push('global: collection unavailable; coverage is incomplete.');
            }
            try {
                this.assertWritableTargets(this.configuration.collection, this.configuration.state);
            } catch {
                globalBoundaryAvailable = false;
                warnings.push(
                    'global: write boundary unavailable or overlapping; writes are disabled.',
                );
            }
        }
        const selected = new SkillDiscoveryRepository(new PortableFrontmatterValidator()).read(
            sources.slice(0, 1),
        );
        const global =
            sources.length > 1
                ? new SkillDiscoveryRepository().read(sources.slice(1))
                : { skills: [], warnings: [] };
        const unique = new Map<string, SkillSummary>();
        // The selected collection retains its existing mutation interface even if
        // a reference alias names the same physical package. References grant no writes.
        for (const entry of [...selected.skills, ...global.skills]) {
            try {
                const canonicalPath = realpathSync.native(entry.canonicalPath);
                if (canonicalPath.split(sep).includes('.system')) continue;
                if (!unique.has(canonicalPath) || entry.sources.includes('selected')) {
                    unique.set(canonicalPath, { ...entry, canonicalPath });
                }
            } catch {
                warnings.push(
                    `${entry.sources[0]}: changed package skipped; coverage is incomplete.`,
                );
            }
        }
        const discovery = {
            skills: [...unique.values()].sort(
                (left, right) =>
                    left.name.localeCompare(right.name, 'en') ||
                    left.canonicalPath.localeCompare(right.canonicalPath, 'en'),
            ),
            warnings: [...selected.warnings, ...global.warnings],
        };
        if (discovery.skills.length > 1024)
            warnings.push('Combined catalog limit reached; coverage is incomplete.');
        const skills = discovery.skills
            .slice(0, 1024)
            .filter(
                (entry) =>
                    !entry.sources.includes('selected') ||
                    basename(entry.canonicalPath) === entry.name,
            )
            .map((entry) => {
                const source = entry.sources.includes('selected') ? 'selected' : 'global';
                const readOnlyReason =
                    source === 'global'
                        ? this.readOnlyReason(entry, globalBoundaryAvailable)
                        : null;
                return {
                    skill:
                        source === 'selected'
                            ? entry.name
                            : 'global:' +
                              createHash('sha256').update(entry.canonicalPath).digest('hex'),
                    name: entry.name,
                    description:
                        [...entry.description].slice(0, 256).join('') +
                        ([...entry.description].length > 256 ? '…' : ''),
                    source,
                    read_only: readOnlyReason !== null,
                    read_only_reason: readOnlyReason,
                    canonicalPath: entry.canonicalPath,
                };
            });
        return { skills, warnings: [...warnings, ...discovery.warnings] };
    }

    inspect(reference: string) {
        const entry = this.read().skills.find(
            (item) => item.skill === reference && item.source === 'global',
        );
        if (!entry) throw new SkillOperationError('invalid_input');
        if (!entry.read_only) {
            const target = this.confinedTarget(entry.canonicalPath, entry.name);
            return {
                ...new SkillPanelPackageRepository().inspect(target.path),
                skill: entry.skill,
                name: entry.name,
                source: 'global',
                read_only: false,
                read_only_reason: null,
                inspection_scope: 'Complete package',
            };
        }
        const root = new SafeRoot(entry.canonicalPath);
        try {
            const bytes = root.readBytes('SKILL.md', 131_072);
            const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
            const metadata = new YamlFrontmatterValidator().parse(
                text.replace(/^\uFEFF/u, ''),
            ) as Record<string, unknown>;
            if (metadata?.name !== entry.name) throw new SkillOperationError('invalid_input');
            return {
                skill: entry.skill,
                name: entry.name,
                source: 'global',
                read_only: true,
                read_only_reason: entry.read_only_reason,
                text,
                description: entry.description,
                sha256: createHash('sha256').update(bytes).digest('hex'),
                package_sha256: null,
                files: 1,
                bytes: bytes.length,
                inspection_scope: 'SKILL.md only',
            };
        } finally {
            root.close();
        }
    }

    /** Resolve a source-qualified target afresh; the opt-in is checked again for writes. */
    target(reference: string, write = false) {
        const entry = this.read().skills.find(
            (item) => item.skill === reference && item.source === 'global',
        );
        if (!entry || (write && entry.read_only)) throw new SkillOperationError('invalid_input');
        const target = this.confinedTarget(entry.canonicalPath, entry.name);
        new SkillPanelPackageRepository().inspect(target.path);
        return { ...target, skill: entry.skill, name: entry.name };
    }

    private readOnlyReason(entry: SkillSummary, boundaryAvailable: boolean): string | null {
        if (!this.configuration.globalWrite) return 'Global editing is not enabled.';
        if (!boundaryAvailable)
            return 'Global filesystem boundary coverage is incomplete; writes are disabled.';
        try {
            const target = this.confinedTarget(entry.canonicalPath, entry.name);
            new SkillPanelPackageRepository().inspect(target.path);
            return null;
        } catch {
            return 'This package is external, linked, unsafe, oversized, or unsupported for full-package editing; SKILL.md inspection remains read only.';
        }
    }

    private confinedTarget(path: string, name: string) {
        const root = this.globalRoot();
        const part = relative(root, path);
        if (
            !part ||
            isAbsolute(part) ||
            part === '..' ||
            part.startsWith(`..${sep}`) ||
            part.split(sep).some((component) => component.startsWith('.')) ||
            basename(path) !== name
        )
            throw new SkillOperationError('invalid_input');
        const directory = new SafeRoot(root);
        try {
            const selected = directory.inspect(part.split(sep).join('/'));
            if (!selected.info?.isDirectory()) throw new SkillOperationError('invalid_input');
            directory.verifySnapshot(selected);
            const info = lstatSync(root);
            return {
                root,
                path: selected.absolute,
                relative: part.split(sep).join('/'),
                global_collection_sha256: createHash('sha256')
                    .update(
                        JSON.stringify({
                            configured: this.configuration.globalCollection,
                            physical: root,
                            dev: info.dev,
                            ino: info.ino,
                        }),
                    )
                    .digest('hex'),
            };
        } finally {
            directory.close();
        }
    }

    /** Called before state creation or mutation, including direct repository callers. */
    assertWritableTargets(collection: string, state: string): void {
        if (!this.configuration.globalCollection) return;
        const global = this.globalRoot();
        collection = this.physicalTarget(collection);
        state = this.physicalTarget(state);
        this.configuration.assertSeparate(global, collection);
        this.configuration.assertSeparate(global, state);

        // Metadata validity cannot authorize writes. Inspect filesystem reference
        // boundaries independently, and refuse writes when coverage is incomplete.
        const pending = [{ directory: global, depth: 0 }];
        const visited = new Set<string>();
        let entries = 0;
        while (pending.length > 0) {
            const item = pending.pop()!;
            if (visited.has(item.directory)) continue;
            if (item.depth > 32) throw new Error('Reference boundary depth limit reached.');
            visited.add(item.directory);
            const directory = opendirSync(item.directory);
            try {
                let entry;
                while ((entry = directory.readSync()) !== null) {
                    if (++entries > 16_384) throw new Error('Reference boundary limit reached.');
                    if (entry.name.startsWith('.')) continue;
                    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
                    const target = realpathSync.native(join(item.directory, entry.name));
                    if (!lstatSync(target).isDirectory()) continue;

                    // Aliases do not revoke explicitly selected private-copy authority.
                    if (target === collection || target.startsWith(collection + sep)) continue;
                    this.configuration.assertSeparate(target, collection);
                    this.configuration.assertSeparate(target, state);

                    // Discovery follows package links, never linked namespaces. Protect
                    // the entire external target without crawling another repository.
                    if (entry.isSymbolicLink()) continue;
                    pending.push({ directory: target, depth: item.depth + 1 });
                }
            } finally {
                directory.closeSync();
            }
        }
    }

    private globalRoot(): string {
        const selected = lstatSync(this.configuration.globalCollection!);
        if (!selected.isDirectory() || selected.isSymbolicLink())
            throw new Error('Select an ordinary global reference root.');
        const root = realpathSync.native(this.configuration.globalCollection!);
        if (root === sep || root.split(sep).includes('.system') || !lstatSync(root).isDirectory()) {
            throw new Error('Select an ordinary global reference root.');
        }
        return root;
    }

    private physicalTarget(path: string): string {
        try {
            return realpathSync.native(path);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            return join(realpathSync.native(dirname(path)), basename(path));
        }
    }
}
