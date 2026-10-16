// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { SkillPanelConfiguration } from '../config/SkillPanelConfiguration.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';
import { YamlFrontmatterValidator } from '../validator/YamlFrontmatterValidator.ts';
import { PortableFrontmatterValidator } from '../validator/PortableFrontmatterValidator.ts';
import { SkillDiscoveryRepository } from './SkillDiscoveryRepository.ts';

/** Live metadata and read-only global entrypoints; never retains candidates or opens state. */
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
        if (this.configuration.globalCollection) {
            try {
                const global = realpathSync(this.configuration.globalCollection);
                this.assertWritableTargets(
                    realpathSync(this.configuration.collection),
                    join(
                        realpathSync(dirname(this.configuration.state)),
                        basename(this.configuration.state),
                    ),
                );
                sources.push({
                    directory: global,
                    label: 'global',
                    followPackageLinks: true,
                    maxDepth: 8,
                });
            } catch {
                warnings.push(
                    'global: collection unavailable or overlapping; coverage is incomplete.',
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
        const unique = new Map(
            [...selected.skills, ...global.skills].map((entry) => [entry.canonicalPath, entry]),
        );
        // The selected collection retains its existing mutation interface even if
        // a reference alias names the same physical package. References grant no writes.
        for (const entry of selected.skills) unique.set(entry.canonicalPath, entry);
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
                    read_only: source === 'global',
                    canonicalPath: entry.canonicalPath,
                };
            });
        return { skills, warnings: [...warnings, ...discovery.warnings] };
    }

    inspect(reference: string) {
        const entry = this.read().skills.find((item) => item.skill === reference && item.read_only);
        if (!entry) throw new SkillOperationError('invalid_input');
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

    /** Called before state creation or mutation, including direct repository callers. */
    assertWritableTargets(collection: string, state: string): void {
        if (!this.configuration.globalCollection) return;
        const global = realpathSync(this.configuration.globalCollection);
        if (global === sep || global.split(sep).includes('.system')) {
            throw new Error('Select an ordinary global reference root.');
        }
        this.configuration.assertSeparate(global, collection);
        this.configuration.assertSeparate(global, state);
        const references = new SkillDiscoveryRepository().read([
            { directory: global, label: 'global' },
        ]);
        for (const entry of references.skills) {
            // A global alias does not revoke the caller's existing selected-copy
            // authority. Every other reference, including external links, stays read-only.
            const selectedPackage =
                entry.canonicalPath === collection ||
                entry.canonicalPath.startsWith(collection + sep);
            if (selectedPackage) continue;
            this.configuration.assertSeparate(entry.canonicalPath, collection);
            this.configuration.assertSeparate(entry.canonicalPath, state);
        }
    }
}
