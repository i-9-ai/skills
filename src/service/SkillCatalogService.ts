// SPDX-License-Identifier: Apache-2.0
import { InstalledSkillRepository } from '../repository/InstalledSkillRepository.ts';
import { SkillCatalogQueryValidator } from '../validator/SkillCatalogQueryValidator.ts';
import { AvailableSkillsService } from './AvailableSkillsService.ts';

/** Serves installed metadata and Markdown through the same CLI/MCP contracts. */
export class SkillCatalogService {
    private readonly repository: InstalledSkillRepository;
    private readonly validator = new SkillCatalogQueryValidator();

    constructor(repository = new InstalledSkillRepository()) {
        this.repository = repository;
    }

    search(value: unknown = {}) {
        const input = this.validator.search(value);
        const catalog = this.repository.catalog();
        const query = input.query.toLowerCase();
        const matches = catalog.skills.filter((skill) =>
            [skill.name, skill.description, ...skill.tags].join(' ').toLowerCase().includes(query),
        );
        const skills = matches.slice(input.offset, input.offset + input.limit);
        const end = input.offset + skills.length;

        return {
            provenance: catalog.provenance,
            ...input,
            total: matches.length,
            next_offset: end < matches.length ? end : null,
            skills,
        };
    }

    read(value: unknown) {
        const input = this.validator.read(value);
        return this.repository.read(input.skill, input.resource);
    }

    overview(value: unknown = {}) {
        const input = this.validator.overview(value);
        const catalog = this.repository.catalog();
        const overview = new AvailableSkillsService().renderOverview(
            {
                skills: catalog.skills.map((skill) => ({
                    name: skill.name,
                    description: skill.description,
                    canonicalPath: skill.path,
                    sources: ['bundled'],
                })),
                warnings: [],
                sources: ['bundled'],
            },
            input.max_entries,
            4096,
        );
        return { provenance: catalog.provenance, overview };
    }
}
