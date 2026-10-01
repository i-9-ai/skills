// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { SafeRoot } from '../../.agents/skills/skill-authoring/scripts/lib/filesystem.mjs';
import { strictJson } from '../../.agents/skills/skills-catalog/scripts/catalog_tools.mjs';
import { InstalledCollectionConfiguration } from '../config/InstalledCollectionConfiguration.ts';
import { ReleaseVersionValidator } from '../validator/ReleaseVersionValidator.ts';
import { SkillCatalogQueryValidator } from '../validator/SkillCatalogQueryValidator.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';
import { CollectionCatalogRepository } from './CollectionCatalogRepository.ts';
import type { CollectionCatalogEntry } from './CollectionCatalogRepository.ts';
import { BuildSourceReceiptRepository } from './BuildSourceReceiptRepository.ts';
import type { InstalledSourceProvenance } from './BuildSourceReceiptRepository.ts';

export type InstalledCollectionProvenance = InstalledSourceProvenance & {
    collection: 'i9-skills';
    package_name: '@i-9.ai/skills';
    package_version: string;
    repository: 'https://github.com/i-9-ai/skills';
    catalog_sha256: string;
};
export type InstalledSkillCatalog = {
    provenance: InstalledCollectionProvenance;
    skills: CollectionCatalogEntry[];
};

const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** Reads the canonical installed collection without scripts, traversal or state writes. */
export class InstalledSkillRepository {
    private readonly configuration: InstalledCollectionConfiguration;
    private readonly catalogs: CollectionCatalogRepository;

    constructor(
        configuration = new InstalledCollectionConfiguration(),
        catalogs = new CollectionCatalogRepository(),
    ) {
        this.configuration = configuration;
        this.catalogs = catalogs;
    }

    catalog(): InstalledSkillCatalog {
        return this.withCatalog((_root, catalog) => catalog);
    }

    read(skill: string, resource = 'SKILL.md') {
        const query = new SkillCatalogQueryValidator().read({ skill, resource });
        return this.withCatalog((root, catalog) => {
            const selected = catalog.skills.find((entry) => entry.name === query.skill);
            if (!selected) throw new SkillOperationError('resource_unavailable');

            try {
                const bytes = root.readBytes(`${selected.path}/${query.resource}`, 65_536);
                // Preserve a leading BOM so returned text and byte provenance agree.
                const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
                    bytes,
                );
                return {
                    provenance: catalog.provenance,
                    skill: selected.name,
                    resource: query.resource,
                    media_type: 'text/markdown' as const,
                    byte_length: bytes.length,
                    content_sha256: digest(bytes),
                    content,
                };
            } catch {
                throw new SkillOperationError('resource_unavailable');
            }
        });
    }

    private withCatalog<T>(read: (root: SafeRoot, catalog: InstalledSkillCatalog) => T): T {
        let root: SafeRoot | undefined;
        try {
            root = new SafeRoot(this.configuration.root());
            const version = this.packageVersion(root);
            const checked = this.catalogs.read({ collection: root.path, layout: 'repository' });
            if (
                checked.value.skills.some((entry) => entry.path !== `.agents/skills/${entry.name}`)
            ) {
                throw new SkillOperationError('catalog_unavailable');
            }

            return read(root, {
                skills: checked.value.skills,
                provenance: {
                    collection: 'i9-skills',
                    package_name: '@i-9.ai/skills',
                    package_version: version,
                    repository: 'https://github.com/i-9-ai/skills',
                    catalog_sha256: digest(checked.bytes),
                    ...new BuildSourceReceiptRepository(this.configuration).read(
                        version,
                        digest(checked.bytes),
                    ),
                },
            });
        } catch (error) {
            if (error instanceof SkillOperationError) throw error;
            throw new SkillOperationError('catalog_unavailable');
        } finally {
            root?.close();
        }
    }

    private packageVersion(root: SafeRoot): string {
        const versions = new ReleaseVersionValidator();
        const manifest = versions.document(strictJson(root.readBytes('package.json', 65_536)));
        const repository = versions.document(manifest.repository);
        if (
            manifest.name !== '@i-9.ai/skills' ||
            typeof repository.url !== 'string' ||
            ![
                'git+https://github.com/i-9-ai/skills.git',
                'https://github.com/i-9-ai/skills.git',
                'https://github.com/i-9-ai/skills',
            ].includes(repository.url)
        ) {
            throw new SkillOperationError('catalog_unavailable');
        }
        const version = versions.version(manifest);
        if (version.length > 128 || version.trim() !== version) {
            throw new SkillOperationError('catalog_unavailable');
        }
        return version;
    }
}
